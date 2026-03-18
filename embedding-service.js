/**
 * embedding-service.js
 */

const path     = require("path");
const fs       = require("fs");
const { fork } = require("child_process");

let sharp      = null;
let heicDecode = null;

function lazyLoadImageLibs() {
  if (!sharp)      sharp      = require("sharp");
  if (!heicDecode) heicDecode = require("heic-decode");
}

const INTER_FILE_DELAY_MS     = 400;
const ERROR_BACKOFF_THRESHOLD = 5;
const ERROR_BACKOFF_MS        = 30_000;
const RECHECK_INTERVAL_MS     = 60_000;
const CHILD_RESTART_DELAY_MS  = 8_000;

const NEEDS_CONVERSION = new Set([".heic", ".heif", ".tif", ".tiff"]);

class EmbeddingService {
  constructor(db, dataDir, getMainWindow) {
    this.db            = db;
    this.dataDir       = dataDir;
    this.getMainWindow = getMainWindow;

    this._child      = null;
    this._paused     = false;
    this._stopped    = false;
    this._running    = false;
    this._loopTimer  = null;

    this._pipelineReady = false;
    this._initError     = null;

    // ── Pending slots ──────────────────────────────────────────────────────
    // One slot for the background image loop, one slot for user text queries.
    // They are completely independent so a search never blocks (or is blocked
    // by) the background embed loop.
    this._imagePending = null;  // { resolve, reject }
    this._textPending  = null;  // { resolve, reject } — only one at a time

    this._consecutiveErrors = 0;
    this._skippedIds        = new Set();

    this.total = 0;
    this.done  = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  start() {
    if (this._running || this._stopped) return;
    this._ensureTable();
    this._spawnChild();
  }

  pause()  { this._paused = true; }
  resume() {
    if (this._paused) {
      this._paused = false;
      this._scheduleLoop(100);
    }
  }

  stop() {
    this._stopped = true;
    this._paused  = false;
    clearTimeout(this._loopTimer);
    this._running = false;
    if (this._child) {
      try { this._child.send({ type: "stop" }); } catch {}
      setTimeout(() => { try { this._child.kill(); } catch {} }, 1000);
      this._child = null;
    }
    this._imagePending?.reject(new Error("stopped"));
    this._imagePending = null;
    this._textPending?.reject(new Error("stopped"));
    this._textPending = null;
  }

  getStatus() {
    this._refreshCounts();
    return {
      modelReady: this._pipelineReady,
      initError:  this._initError,
      total:      this.total,
      done:       this.done,
      paused:     this._paused,
      stopped:    this._stopped,
      percentage: this.total > 0 ? Math.round((this.done / this.total) * 100) : 0,
    };
  }

  // ── Text embedding — independent of the image loop ─────────────────────────
  // Queues one text request at a time. If a previous text request is still
  // in flight it is replaced (the caller always wants the latest query).

  embedText(text) {
    return new Promise((resolve, reject) => {
      if (!this._child || !this._pipelineReady) {
        return reject(new Error("pipeline not ready"));
      }

      // If a previous text request is pending, cancel it (stale query)
      if (this._textPending) {
        this._textPending.reject(new Error("superseded"));
        this._textPending = null;
      }

      this._textPending = { resolve, reject };
      this._child.send({ type: "embedText", text });
    });
  }

  // ── SQLite table ─────────────────────────────────────────────────────────────

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        file_id    INTEGER PRIMARY KEY,
        embedding  BLOB NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
  }

  // ── Child process ────────────────────────────────────────────────────────────

  _spawnChild() {
    const scriptPath = path.join(__dirname, "embedding-process.js");
    if (!fs.existsSync(scriptPath)) {
      this._initError = "embedding-process.js not found next to main.js";
      this._emitProgress();
      return;
    }

    this._child = fork(scriptPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    this._child.stdout?.on("data", d => process.stdout.write(`[embed] ${d}`));
    this._child.stderr?.on("data", d => process.stderr.write(`[embed] ${d}`));
    this._child.on("message", (msg) => this._handleMessage(msg));
    this._child.on("exit", (code, signal) => {
      if (this._stopped) return;
      console.warn(`[EmbeddingService] child exited (code=${code}, signal=${signal}), scheduling restart...`);
      this._pipelineReady = false;
      this._child = null;
      // Reject any in-flight promises so callers don't hang forever
      this._imagePending?.reject(new Error("child exited"));
      this._imagePending = null;
      this._textPending?.reject(new Error("child exited"));
      this._textPending = null;
      // Restart after the existing delay constant
      setTimeout(() => {
        if (!this._stopped) this._spawnChild();
      }, CHILD_RESTART_DELAY_MS);
    });
    this._child.on("error", (err) => {
      console.error("[EmbeddingService] child process error:", err);
      // The 'exit' event will fire after this and handle the restart
    });

    // In dev:       <project>/models
    // In prod:      <resources>/models  (copied there by extraResources)
    const { app } = require("electron");
    const modelCacheDir = app.isPackaged
      ? path.join(process.resourcesPath, "models")
      : path.join(__dirname, "models");

    this._child.send({
      type:     "init",
      cacheDir: modelCacheDir,
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {

      case "ready":
        this._pipelineReady = true;
        this._initError     = null;
        this._emitProgress();
        this._scheduleLoop(500);
        break;

      case "initError":
        this._pipelineReady = false;
        this._initError     = msg.error;
        this._emitProgress();
        break;

      // ── Image result ───────────────────────────────────────────────────────
      case "embedResult": {
        const buffer = Buffer.from(new Float32Array(msg.embedding).buffer);
        try {
          this.db.prepare(
            `INSERT OR REPLACE INTO embeddings (file_id, embedding) VALUES (?, ?)`
          ).run(msg.fileId, buffer);
          this._consecutiveErrors = 0;
          this.done++;
        } catch (err) {
          console.error("[EmbeddingService] DB write error:", err);
        }
        this._emitProgress();
        const ip = this._imagePending;
        this._imagePending = null;
        ip?.resolve();
        break;
      }

      case "embedError": {
        console.warn("[EmbeddingService] embed error for file", msg.fileId, ":", msg.error);
        this._skippedIds.add(msg.fileId);
        // Do NOT increment _consecutiveErrors here. This file is permanently
        // skipped, so it cannot recur and doesn't indicate a systemic problem.
        this._emitProgress();
        const ip = this._imagePending;
        this._imagePending = null;
        ip?.resolve();
        break;
      }

      // ── Text result ────────────────────────────────────────────────────────
      case "textResult": {
        const tp = this._textPending;
        this._textPending = null;
        tp?.resolve(msg.embedding);
        break;
      }

      case "textError": {
        const tp = this._textPending;
        this._textPending = null;
        tp?.reject(new Error(msg.error));
        break;
      }
    }
  }

  // ── Processing loop ──────────────────────────────────────────────────────────

  _scheduleLoop(delayMs = INTER_FILE_DELAY_MS) {
    clearTimeout(this._loopTimer);
    if (this._stopped) return;
    this._running   = true;
    this._loopTimer = setTimeout(() => this._loop(), delayMs);
  }

  async _loop() {
    if (this._stopped || this._paused) { this._running = false; return; }
    if (!this._pipelineReady)          { this._running = false; return; }
 
    // Backoff only triggers for conversion failures (not child embed errors).
    // After waiting, reset the counter so the next batch gets a fresh start.
    if (this._consecutiveErrors >= ERROR_BACKOFF_THRESHOLD) {
      console.warn(`[EmbeddingService] ${this._consecutiveErrors} consecutive conversion errors, backing off ${ERROR_BACKOFF_MS}ms`);
      this._consecutiveErrors = 0;
      this._scheduleLoop(ERROR_BACKOFF_MS);
      return;
    }
 
    const file = this._getNextFile();
    if (!file) {
      this._refreshCounts();
      this._emitProgress();
      this._running   = false;
      this._loopTimer = setTimeout(() => { this._running = true; this._loop(); }, RECHECK_INTERVAL_MS);
      return;
    }
 
    const ext = path.extname(file.path).toLowerCase();
    if (NEEDS_CONVERSION.has(ext)) {
      const imageBuffer = await this._convertToJpegBuffer(file);
      if (!imageBuffer) {
        // Conversion failed — skip permanently, count as a conversion error
        this._skippedIds.add(file.id);
        this._consecutiveErrors++;
        this._scheduleLoop(INTER_FILE_DELAY_MS);
        return;
      }
      // Conversion succeeded — send buffer, reset conversion error streak
      this._consecutiveErrors = 0;
      await new Promise((resolve) => {
        this._imagePending = { resolve, reject: resolve };
        this._child.send({
          type: "embed",
          fileId: file.id,
          filePath: file.path,
          imageBuffer: imageBuffer.toString("base64"),
        });
      });
    } else {
      // Normal image — send path directly, no conversion error tracking needed
      await new Promise((resolve) => {
        this._imagePending = { resolve, reject: resolve };
        this._child.send({ type: "embed", fileId: file.id, filePath: file.path });
      });
    }
 
    this._scheduleLoop(INTER_FILE_DELAY_MS);
  }

  // ── HEIC / TIFF → JPEG ────────────────────────────────────────────────────

  async _convertToJpegBuffer(file) {
    const ext = path.extname(file.path).toLowerCase();
    try {
      lazyLoadImageLibs();
      if (ext === ".heic" || ext === ".heif") {
        const inputBuffer = fs.readFileSync(file.path);
        const heicImage   = await heicDecode({ buffer: inputBuffer });
        return await sharp(heicImage.data, {
          raw: { width: heicImage.width, height: heicImage.height, channels: 4 },
        })
          .resize(512, 512, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      }
      if (ext === ".tif" || ext === ".tiff") {
        return await sharp(file.path)
          .resize(512, 512, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      }
    } catch (err) {
      console.warn(`[EmbeddingService] conversion failed for ${file.path}:`, err.message);
    }
    return null;
  }

  // ── DB helpers ────────────────────────────────────────────────────────────────

  _getNextFile() {
    const skipped    = [...this._skippedIds];
    const excludeSQL = skipped.length ? `AND f.id NOT IN (${skipped.join(",")})` : "";
    return this.db.prepare(`
      SELECT f.id, f.path
      FROM   files f
      LEFT   JOIN embeddings e ON f.id = e.file_id
      WHERE  f.file_type = 'image'
        AND  e.file_id IS NULL
        ${excludeSQL}
      LIMIT 1
    `).get() ?? null;
  }

  _refreshCounts() {
    try {
      this.total = this.db.prepare(`SELECT COUNT(*) AS c FROM files WHERE file_type = 'image'`).get()?.c ?? 0;
      this.done  = this.db.prepare(`SELECT COUNT(*) AS c FROM embeddings`).get()?.c ?? 0;
    } catch {}
  }

  _emitProgress() {
    const win = this.getMainWindow();
    if (!win || win.isDestroyed()) return;
    this._refreshCounts();
    win.webContents.send("embedding-progress", {
      modelReady: this._pipelineReady,
      initError:  this._initError,
      total:      this.total,
      done:       this.done,
      paused:     this._paused,
      percentage: this.total > 0 ? Math.round((this.done / this.total) * 100) : 0,
    });
  }
}

module.exports = EmbeddingService;