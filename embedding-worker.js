// embedding-worker.js
const { workerData, parentPort } = require("worker_threads");
const Database = require("better-sqlite3");
const path = require("path");
const EmbeddingService = require("./embedding-service");

const db = new Database(workerData.dbPath);
const service = new EmbeddingService(db, workerData.dataDir, () => null);

// Override _emitProgress to use postMessage instead of webContents.send
service._emitProgress = function() {
  const now = Date.now();
  if (this._lastEmit && now - this._lastEmit < 1000) return;
  this._lastEmit = now;
  this._refreshCounts();
  parentPort.postMessage({
    type: "embedding-progress",
    payload: {
      modelReady: this._pipelineReady,
      initError:  this._initError,
      total:      this.total,
      done:       this.done,
      paused:     this._paused,
      percentage: this.total > 0 ? Math.round((this.done / this.total) * 100) : 0,
    }
  });
};

parentPort.on("message", (msg) => {
  if (msg.type === "pause")  service.pause();
  if (msg.type === "resume") service.resume();
  if (msg.type === "stop")   service.stop();
  if (msg.type === "embedText") {
    service.embedText(msg.text)
      .then(embedding => parentPort.postMessage({ type: "textResult", embedding, reqId: msg.reqId }))
      .catch(err     => parentPort.postMessage({ type: "textError",  error: err.message, reqId: msg.reqId }));
  }
  if (msg.type === "getStatus") {
    parentPort.postMessage({ type: "status", payload: service.getStatus() });
  }
  if (msg.type === "search") {
    const { query, topK = 200, threshold = 0.20, reqId } = msg;
    service.embedText(query)
      .then(textVecArray => {
        const textRaw  = new Float32Array(textVecArray);
        const textNorm = Math.sqrt(textRaw.reduce((s, v) => s + v * v, 0)) || 1;
        const textVec  = textRaw.map(v => v / textNorm);
      
        const rows = service._getEmbeddingCache();
        const scored = rows.map(row => {
          const imgRaw  = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
          const imgNorm = Math.sqrt(imgRaw.reduce((s, v) => s + v * v, 0)) || 1;
          let dot = 0;
          for (let i = 0; i < textVec.length; i++) dot += textVec[i] * (imgRaw[i] / imgNorm);
          return { fileId: row.file_id, score: dot };
        });
    
        scored.sort((a, b) => b.score - a.score);
        const filtered = scored.filter(r => r.score >= threshold).slice(0, topK);
    
        parentPort.postMessage({
          type: "searchResult",
          reqId,
          results: filtered.map(r => r.fileId),
          scores:  Object.fromEntries(filtered.map(r => [r.fileId, r.score])),
        });
      })
      .catch(err => parentPort.postMessage({ type: "searchError", reqId, error: err.message }));
  }
});

service.start(workerData.modelCacheDir);