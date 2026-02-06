const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  shell,
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { exiftool } = require("exiftool-vendored");
const sharp = require("sharp");
const { protocol } = require("electron");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const lookup = require("coordinate_to_country");
const fsPromises = fs.promises;
const heicDecode = require("heic-decode");


if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;
let splash;

// On startup:
app.whenReady().then(() => {
  // Splash screen
  splash = new BrowserWindow({
    width: 400,
    height: 400,
    icon: path.join(__dirname, "./public/logo512.png"),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
  });
  splash.loadFile(path.join(__dirname, "public/splash.html"));
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 788,
    minHeight: 708,
    icon: path.join(__dirname, "./public/logo512.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
    titleBarStyle: "hidden",
    backgroundColor: "#15131a",
  });

  mainWindow.once("ready-to-show", () => {
    splash.close();
    mainWindow.show();
  });

  app.on("browser-window-focus", () => {
    globalShortcut.register("CommandOrControl+Shift+I", () => {
      if (mainWindow) mainWindow.webContents.toggleDevTools();
    });
  });

  app.on("browser-window-blur", () => globalShortcut.unregisterAll());

  mainWindow.removeMenu();
  mainWindow.maximize();
  mainWindow.on("closed", () => (mainWindow = null));

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    event.preventDefault();
    mainWindow.webContents.send("check-unsaved-changes");
  });

  app.on("ready", () => {
    process.chdir(path.dirname(app.getPath("exe")));
  });

  // Serve thumbnails via a custom scheme: orbit://thumbs/<filename>
  protocol.handle("orbit", async (request) => {
    try {
      const url = new URL(request.url);
      // orbit://thumbs/<filename>
      const pathname = url.pathname.replace(/^\/+/, ""); // strip leading slashes
      const filePath = path.join(dataDir, "thumbnails", pathname);

      return new Response(fs.readFileSync(filePath), {
        headers: {
          "Content-Type": "image/jpeg", // you can use mime.getType(filePath) if you want
        },
      });
    } catch (err) {
      console.error("orbit protocol error:", err);
      return new Response("Not Found", { status: 404 });
    }
  });

  const express = require("express");
  const appServer = express();
  const serverPort = 54055;

  // Serve files from any path on disk
appServer.get("/files/*", async (req, res) => {
  const filePath = decodeURIComponent(req.path.replace("/files/", ""));

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === ".heic") {
      // 1. Read the HEIC file into a buffer
      const inputBuffer = fs.readFileSync(filePath);
    
      // 2. Decode HEIC into raw RGBA pixels
      const heicImage = await heicDecode({ buffer: inputBuffer });
    
      // 3. Convert raw RGBA to JPEG using sharp
      const outputBuffer = await sharp(heicImage.data, {
        raw: {
          width: heicImage.width,
          height: heicImage.height,
          channels: 4, // RGBA
        },
      })
        .jpeg({ quality: 80 })
        .toBuffer();
    
      // 4. Send the JPEG response
      res.type("jpeg").send(outputBuffer);
    } else if (ext === ".tif" || ext === ".tiff") {
      const outputBuffer = await sharp(filePath)
        .jpeg({ quality: 80 })
        .toBuffer();
      res.type("jpeg").send(outputBuffer);

    } else if (ext === ".avi" || ext === ".wmv") {
      res.type("mp4");

      ffmpeg(filePath)
        .outputFormat("mp4")
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions([
          "-preset ultrafast",
          "-crf 28",
          "-movflags frag_keyframe+empty_moov" // makes streamable MP4
        ])
        .on("error", err => {
          console.error("ffmpeg error:", err);
          if (!res.headersSent) res.status(500).send("Video conversion failed");
          else res.end();
        })
        .pipe(res, { end: true });
    } else {
      // Default: just serve file
      res.sendFile(filePath);
    }
  } catch (err) {
    console.error(`Failed to convert ${ext} file:`, err);
    res.status(500).send("Conversion failed");
  }
});

  appServer.listen(serverPort, () => {
    console.log(`Local file server running on http://localhost:${serverPort}`);
  });


  mainWindow.loadURL("http://localhost:3000");
});

// Data directory
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Config
const configPath = path.join(dataDir, "config.json");
const defaultConfig = {
  welcomePopupSeen: false,
  username: null,
  indexedFolders: [],
  birthDate: null,
  adjustHeicColors: true,
  defaultSort: "media_id"
};

// Database
let db;
const dbPath = path.join(dataDir, "orbit-index.db");

function initDatabase() {
  if(!db) {
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id INTEGER UNIQUE,
      filename TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      size INTEGER,
      created INTEGER,
      modified INTEGER,
      extension TEXT,
      folder_path TEXT NOT NULL,
      indexed_at INTEGER DEFAULT (strftime('%s', 'now')),
      file_type TEXT,
      device_model TEXT,
      camera_make TEXT,
      camera_model TEXT,
      width INTEGER,
      height INTEGER,
      orientation INTEGER,
      latitude REAL,
      longitude REAL,
      altitude REAL,
      create_date INTEGER,
      thumbnail_path TEXT,
      lens_model TEXT,
      iso INTEGER,
      software TEXT,
      offset_time_original TEXT,
      megapixels REAL,
      exposure_time TEXT,
      color_space TEXT,
      flash TEXT,
      aperture REAL,
      focal_length REAL,
      focal_length_35mm REAL,
      country TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      indexed_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      media_ids TEXT DEFAULT '[]',
      last_used INTEGER
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_create_date ON files(create_date);
    CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename);
    CREATE INDEX IF NOT EXISTS idx_files_size ON files(size);
    CREATE INDEX IF NOT EXISTS idx_files_created ON files(created);
  `);      
  }
}

ipcMain.handle("fix-media-ids", async () => {
  try {
    initDatabase();

    db.transaction(() => {
      // Step 1: move existing media_id out of the way
      db.prepare(`
        UPDATE files
        SET media_id = -id
      `).run();

      // Step 2: reassign correctly ordered media_ids
      const rows = db.prepare(`
        SELECT id
        FROM files
        ORDER BY
          COALESCE(create_date, MIN(created, modified)) ASC,
          id ASC
      `).all();

      let counter = 1;
      for (const row of rows) {
        db.prepare(
          "UPDATE files SET media_id = ? WHERE id = ?"
        ).run(counter, row.id);
        counter++;
      }
    })();

    return { success: true, message: "media_id column fixed successfully." };
  } catch (err) {
    console.error("Error fixing media_id:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("tags:get-all", async () => {
  try {
    initDatabase();

    const rows = db
      .prepare("SELECT * FROM tags ORDER BY last_used DESC")
      .all();

    return rows.map((row) => ({
      ...row,
      media_ids: JSON.parse(row.media_ids || "[]"),
    }));
  } catch (err) {
    console.error("tags:get-all error:", err);
    return [];
  }
});

ipcMain.handle("tags:save", async (event, tag) => {
  initDatabase();

  if (tag.id) {
    db.prepare(`
      UPDATE tags SET name = ?, description = ?, color = ?, media_ids = ?
      WHERE id = ?
    `).run(tag.name, tag.description, tag.color, JSON.stringify(tag.media_ids || []), tag.id);

    return { success: true, updated: true };
  } else {
    const info = db.prepare(`
      INSERT INTO tags (name, description, color, media_ids)
      VALUES (?, ?, ?, ?)
    `).run(tag.name, tag.description, tag.color, JSON.stringify(tag.media_ids || []));
    return { success: true, id: info.lastInsertRowid };
  }
});

ipcMain.handle("tags:delete", async (event, id) => {
  initDatabase();
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
  return { success: true };
});


// Config handlers
ipcMain.handle("get-settings", async () => {
  if (!fs.existsSync(configPath))
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf8");

  return JSON.parse(fs.readFileSync(configPath, "utf8"));
});

ipcMain.handle("save-settings", async (event, settings) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), "utf8");
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});


ipcMain.handle("open-orbit-location", () => {
  let appPath = app.getAppPath();

  // In production, go two levels up to reach the app root
  if (app.isPackaged) {
    appPath = path.join(appPath, "..", "..");
  }

  shell.openPath(appPath);
});

ipcMain.handle('open-in-default-viewer', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (err) {
    console.error("Failed to open file:", err);
    return { success: false, error: err.message };
  }
});

// Folder selection
ipcMain.handle("select-folders", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "multiSelections"],
    title: "Select folders to index",
  });
  return result.canceled ? [] : result.filePaths;
});

// Fetch paginated files for the UI
// Args: { offset: number, limit: number }
// Returns: array of rows [{ id, filename, thumbnail_path, path, width, height, file_type }]
ipcMain.handle("fetch-files", async (event, { offset = 0, limit = 200, filters = {}, settings = {} }) => {
  try {
    initDatabase();

    let whereClauses = [];
    const params = [];

    if (filters.dateFrom) {
      const d = new Date(filters.dateFrom);
      d.setHours(0, 0, 0, 0); // midnight local
      whereClauses.push("create_date >= ?");
      params.push(Math.floor(d.getTime() / 1000));
    }
    if (filters.dateTo) {
      const d = new Date(filters.dateTo);
      d.setHours(23, 59, 59, 999); // end of day
      whereClauses.push("create_date <= ?");
      params.push(Math.floor(d.getTime() / 1000));
    }
    if (filters.dateExact) {
      const start = new Date(filters.dateExact);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.dateExact);
      end.setHours(23, 59, 59, 999);
      whereClauses.push("create_date >= ? AND create_date <= ?");
      params.push(Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000));
    }
    if (filters.device) {
      whereClauses.push("device_model = ?");
      params.push(filters.device);
    }
    if (filters.folder) {
      whereClauses.push("folder_path = ?");
      params.push(filters.folder);
    }
    if (filters.filetype) {
      whereClauses.push("extension = ?");
      params.push(filters.filetype);
    }
    if (filters.mediaType) {
      whereClauses.push("file_type = ?");
      params.push(filters.mediaType);
    }
    if (filters.country) {
      whereClauses.push("country = ?");
      params.push(filters.country);
    }
    if (filters.tag && !filters.addMode) {
      // Join files with tags where media_ids contains the file's media_id
      whereClauses.push(`
        id IN (
          SELECT value
          FROM tags, json_each(tags.media_ids)
          WHERE tags.name = ?
        )
      `);
      params.push(filters.tag);
    }


    // --- search ---
    if (filters.searchBy && filters.searchTerm) {
      if (filters.searchBy === "media_id") {
        whereClauses.push("media_id = ?");
        params.push(filters.searchTerm);
      } else if (filters.searchBy === "name") {
        whereClauses.push("filename LIKE ?");
        params.push(`%${filters.searchTerm}%`);
      }
    }

    // --- sorting ---
    let orderSQL = "";
    if (filters.sortBy === "random") {
      orderSQL = "ORDER BY RANDOM()";
    } else {
      const validSorts = ["media_id", "filename", "create_date", "created", "size"];
      const safeSortBy = validSorts.includes(filters.sortBy) ? filters.sortBy : (settings && settings.defaultSort ? settings.defaultSort : "media_id");
      const safeSortOrder = filters.sortOrder ? filters.sortOrder.toUpperCase() : "DESC";
      orderSQL = `ORDER BY ${safeSortBy} ${safeSortOrder}`;
    }

    const whereSQL = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM files ${whereSQL}`);
    const totalCount = countStmt.get(...params).count;
    
    const stmt = db.prepare(`
      SELECT *
      FROM files
      ${whereSQL}
      ${orderSQL}
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(...params, limit, offset);

    return { success: true, rows, totalCount };
  } catch (err) {
    console.error("fetch-files error:", err);
    return { success: false, error: err.message, rows: [], totalCount: 0 };
  }
});

// Load the mapped JSON once on startup
const countriesPath = path.join(__dirname, 'countries_mapped.json');
const countriesMap = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));

ipcMain.handle('get-country-name', async (event, isoCode) => {
  if (!isoCode) return null;

  // Normalize code to uppercase
  const code = isoCode.toUpperCase();

  // Lookup in the mapped JSON
  return countriesMap[code] || null;
});


ipcMain.handle("get-filtered-files-count", async (event, { filters }) => {
  try {
    initDatabase();

    let query = "SELECT COUNT(*) as count FROM files";
    const conditions = [];
    const params = [];

    if (filters) {
      if (filters.dateFrom) {
        const d = new Date(filters.dateFrom);
        d.setHours(0, 0, 0, 0); // midnight local
        conditions.push("create_date >= ?");
        params.push(Math.floor(d.getTime() / 1000));
      }
      if (filters.dateTo) {
        const d = new Date(filters.dateTo);
        d.setHours(23, 59, 59, 999); // end of day
        conditions.push("create_date <= ?");
        params.push(Math.floor(d.getTime() / 1000));
      }
      if (filters.dateExact) {
        const start = new Date(filters.dateExact);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.dateExact);
        end.setHours(23, 59, 59, 999);
        conditions.push("create_date >= ? AND create_date <= ?");
        params.push(Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000));
      }
      if (filters.device) {
        conditions.push("device_model = ?");
        params.push(filters.device);
      }
      if (filters.filetype) {
        conditions.push("extension = ?");
        params.push(filters.filetype);
      }
      if (filters.folder) {
        conditions.push("folder_path = ?");
        params.push(filters.folder);
      }
      if (filters.mediaType) {
        conditions.push("file_type = ?");
        params.push(filters.mediaType);
      }
      if (filters.country) {
        conditions.push("country = ?");
        params.push(filters.country);
      }
      if (filters.tag && !filters.addMode) {
        conditions.push(`
          id IN (
            SELECT value
            FROM tags, json_each(tags.media_ids)
            WHERE tags.name = ?
          )
        `);
        params.push(filters.tag);
      }
      if (filters.searchBy && filters.searchTerm) {
        if (filters.searchBy === "media_id") {
          conditions.push("media_id = ?");
          params.push(filters.searchTerm);
        } else if (filters.searchBy === "name") {
          conditions.push("filename LIKE ?");
          params.push(`%${filters.searchTerm}%`);
        }
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const result = db.prepare(query).get(params);

    return result?.count || 0;
  } catch (err) {
    console.error("get-filtered-files-count error", err);
    return 0;
  }
});

ipcMain.handle("tag-selected-items", async (event, { tagId, mediaIds }) => {
  try {
    initDatabase();

    if (!tagId || !Array.isArray(mediaIds)) {
      throw new Error("Invalid parameters: tagId and mediaIds are required.");
    }

    // Fetch the existing media_ids for the tag
    const tagRow = db.prepare("SELECT media_ids FROM tags WHERE id = ?").get(tagId);
    if (!tagRow) throw new Error(`Tag with id ${tagId} not found`);

    let existingIds = [];
    try {
      existingIds = JSON.parse(tagRow.media_ids || "[]");
    } catch {
      existingIds = [];
    }

    // Merge and deduplicate IDs
    const updatedIds = Array.from(new Set([...existingIds, ...mediaIds]));

    // Update the tag + set last_used timestamp
    const now = Date.now();
    db.prepare("UPDATE tags SET media_ids = ?, last_used = ? WHERE id = ?")
      .run(JSON.stringify(updatedIds), now, tagId);

    return { success: true, updatedIds };
  } catch (err) {
    console.error("save-selected-items error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("tag:add-item", async (event, { tagId, mediaId }) => {
  try {
    initDatabase();

    const tagRow = db.prepare("SELECT media_ids FROM tags WHERE id = ?").get(tagId);
    if (!tagRow) throw new Error(`Tag ${tagId} not found`);

    const ids = JSON.parse(tagRow.media_ids || "[]");
    if (!ids.includes(mediaId)) ids.push(mediaId);

    const now = Date.now();
    db.prepare("UPDATE tags SET media_ids = ?, last_used = ? WHERE id = ?")
      .run(JSON.stringify(ids), now, tagId);

    return { success: true, ids };
  } catch (err) {
    console.error("tag:add-item error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("tag:remove-item", async (event, { tagId, mediaId }) => {
  try {
    initDatabase();

    const tagRow = db.prepare("SELECT media_ids FROM tags WHERE id = ?").get(tagId);
    if (!tagRow) throw new Error(`Tag ${tagId} not found`);

    const ids = JSON.parse(tagRow.media_ids || "[]").filter((id) => id !== mediaId);

    const now = Date.now();
    db.prepare("UPDATE tags SET media_ids = ?, last_used = ? WHERE id = ?")
      .run(JSON.stringify(ids), now, tagId);

    return { success: true, ids };
  } catch (err) {
    console.error("tag:remove-item error:", err);
    return { success: false, error: err.message };
  }
});

// Indexing
// ipcMain.handle("index-files", async (event, folders) => {
//   try {
//     initDatabase();

//     for (const folder of folders) {
//       const existing = db.prepare("SELECT * FROM folders WHERE path = ?").get(folder);
//       if (!existing) {
//         db.prepare("INSERT OR IGNORE INTO folders (path) VALUES (?)").run(folder);
        
//         // Count total files for progress tracking
//         const totalFiles = countTotalFiles(folder);
//         let processedFiles = 0;
        
//         // Send initial progress with total files
//         if (mainWindow) {
//           mainWindow.webContents.send("indexing-progress", {
//             filename: "",
//             processed: 0,
//             total: totalFiles,
//             percentage: 0
//           });
//         }
        
//         await indexFilesRecursively(folder, folder, totalFiles, (processed) => {
//           processedFiles = processed;
//           const percentage = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;
          
//           if (mainWindow) {
//             mainWindow.webContents.send("indexing-progress", {
//               filename: "",
//               processed: processedFiles,
//               total: totalFiles,
//               percentage: percentage
//             });
//           }
//         });
//       }
//     }

//     return { success: true, message: "Files indexed successfully" };
//   } catch (err) {
//     console.error(err);
//     return { success: false, error: err.message };
//   }
// });

ipcMain.handle("index-files", async (event, folders) => {
  try {
    initDatabase();

    for (const folder of folders) {
        // Load existing files for this folder
        const existingPaths = loadIndexedPaths();

        db.prepare("INSERT OR IGNORE INTO folders (path) VALUES (?)").run(folder);

        // Count total files once for progress tracking
        const totalFiles = countTotalFiles(folder, existingPaths);
        let processedFiles = 0;

        // Send initial progress
        if (mainWindow) {
          mainWindow.webContents.send("indexing-progress", {
            filename: "",
            processed: 0,
            total: totalFiles,
            percentage: 0,
          });
        }

        // New async call style
        await indexFilesRecursively(folder, existingPaths, (processed) => {
          processedFiles = processed;
          const percentage =
            totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;

          if (mainWindow) {
            mainWindow.webContents.send("indexing-progress", {
              filename: "",
              processed: processedFiles,
              total: totalFiles,
              percentage,
            });
          }
        });
    }

    return { success: true, message: "Files indexed successfully" };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});


// Thumbnail generation using sharp
// async function generateThumbnail(filePath, id) {
//   const ext = path.extname(filePath).toLowerCase();
//   const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".heic", ".webp"];
//   if (!imageExtensions.includes(ext)) return null;

//   try {
//     const thumbnailsDir = path.join(dataDir, "thumbnails");
//     if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });

//     // Use ID for unique filename
//     const thumbnailFilename = `${id}_thumb.jpg`;
//     const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);

//     await sharp(filePath, { failOnError: false })
//       .rotate()
//       .resize(200, 200, { fit: "inside", withoutEnlargement: true })
//       .jpeg({ quality: 80 })
//       .toFile(thumbnailPath);

//     return thumbnailPath;
//   } catch (err) {
//     console.error(`Error generating thumbnail for ${filePath}:`, err.message);
//     return null;
//   }
// }

async function generateThumbnail(filePath, id) {
  const ext = path.extname(filePath).toLowerCase();
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp"];
  const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv"];

  const thumbnailsDir = path.join(dataDir, "thumbnails");
  if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });

  const thumbnailFilename = `${id}_thumb.jpg`;
  const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);

  try {
    if (imageExtensions.includes(ext)) {
      // --- Image thumbnails ---
      await sharp(filePath, { failOnError: false })
        .rotate()
        .resize(200, 200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      return thumbnailPath;
    } else if (videoExtensions.includes(ext)) {
      // --- Video thumbnails ---
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .on("end", resolve)
          .on("error", reject)
          .screenshots({
            timestamps: ["10%"], // capture a frame ~10% into the video
            filename: thumbnailFilename,
            folder: thumbnailsDir,
            size: "200x?"
          });
      });

      return thumbnailPath;
    } else {
      return null; // unsupported file type
    }
  } catch (err) {
    console.error(`Error generating thumbnail for ${filePath}:`, err.message);
    return null;
  }
}

ipcMain.handle("minimize-app", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.minimize();
});

ipcMain.handle("fetch-heic-missing-thumbnails", async () => {
  initDatabase();
  const rows = db.prepare(`
    SELECT id, path FROM files WHERE extension = '.heic' AND thumbnail_path IS NULL
  `).all();
  return { success: true, files: rows };
});

ipcMain.handle("cleanup-heic-temp", async () => {
  try {
    const thumbsPath = path.join(dataDir, "thumbs");
    const jsonPath = path.join(dataDir, "heic_missing.json");
    const scriptPath = path.join(dataDir, "generate_heic_thumbs.py");

    if (fs.existsSync(thumbsPath)) {
      fs.rmSync(thumbsPath, { recursive: true, force: true });
    }
    if (fs.existsSync(jsonPath)) {
      fs.unlinkSync(jsonPath);
    }
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }

    return { success: true };
  } catch (err) {
    console.error("Failed cleanup:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("generate-heic-script", async (event, files) => {
    const thumbsPath = path.join(dataDir, "thumbs");
    const tempJsonPath = path.join(dataDir, "heic_missing.json");
    const tempScriptPath = path.join(dataDir, "generate_heic_thumbs.py");

    // 🧹 cleanup old files first
    [thumbsPath, tempJsonPath, tempScriptPath].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    });
  const jsonPath = path.join(dataDir, "heic_missing.json");
  fs.writeFileSync(jsonPath, JSON.stringify(files, null, 2));

  const pythonScriptPath = path.join(dataDir, "generate_heic_thumbs.py");
fs.writeFileSync(pythonScriptPath, `
import json
import os
from PIL import Image
import pillow_heif
from concurrent.futures import ProcessPoolExecutor, as_completed

# Register HEIC plugin
pillow_heif.register_heif_opener()

def generate_thumbnail(entry, thumbs_dir):
    file_id = entry["id"]
    file_path = entry["path"]
    try:
        img = Image.open(file_path)  # Pillow handles HEIC directly
        img.thumbnail((200, 200))
        out_path = os.path.join(thumbs_dir, f"{file_id}_thumb.jpg")
        img.save(out_path, "JPEG", quality=80)
        return f"Generated thumbnail for {file_path}"
    except Exception as e:
        return f"Failed: {file_path} -> {e}"

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_file = os.path.join(script_dir, "heic_missing.json")
    with open(json_file, "r") as f:
        data = json.load(f)

    thumbs_dir = os.path.join(os.getcwd(), "thumbs")
    os.makedirs(thumbs_dir, exist_ok=True)

    # Use half the available cores by default (but at least 1)
    cpu_count = os.cpu_count() or 4
    max_workers = max(1, cpu_count // 2)
    print(f"Using {max_workers} parallel workers...")

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(generate_thumbnail, entry, thumbs_dir) for entry in data]
        for future in as_completed(futures):
            print(future.result())

    print("Done!")

if __name__ == "__main__":
    main()
`);


  shell.showItemInFolder(pythonScriptPath); // highlight file in Explorer
  shell.showItemInFolder(jsonPath);

  return { success: true, message: "Python script and JSON ready!" };
});


// Metadata extraction using exiftool
async function extractMetadata(filePath) {
  const metadata = {
    file_type: null,
    device_model: null,
    camera_make: null,
    camera_model: null,
    width: null,
    height: null,
    orientation: null,
    latitude: null,
    longitude: null,
    altitude: null,
    create_date: null,
    lens_model: null,
    iso: null,
    software: null,
    offset_time_original: null,
    megapixels: null,
    exposure_time: null,
    color_space: null,
    flash: null,
    aperture: null,
    focal_length: null,
    focal_length_35mm: null,
    country: null
  };

  const ext = path.extname(filePath).toLowerCase();
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".tiff",
    ".tif",
    ".heic",
    ".webp",
  ];
  const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv"];

  if (imageExtensions.includes(ext)) metadata.file_type = "image";
  else if (videoExtensions.includes(ext)) metadata.file_type = "video";
  else metadata.file_type = "other";

  try {
    const exifData = await exiftool.read(filePath);
    if (!exifData) return metadata;

    metadata.camera_make = exifData.Make || null;
    metadata.camera_model = exifData.Model || null;
    metadata.device_model = exifData.Model || null;

    metadata.width = exifData.ImageWidth || exifData.ExifImageWidth || null;
    metadata.height = exifData.ImageHeight || exifData.ExifImageHeight || null;
    metadata.orientation = exifData.Orientation || null;

    if (exifData.GPSLatitude && exifData.GPSLongitude) {
      metadata.latitude = exifData.GPSLatitude;
      metadata.longitude = exifData.GPSLongitude;
      metadata.country = lookup(exifData.GPSLatitude, exifData.GPSLongitude, true)
    }

    // Altitude
    if (exifData.GPSAltitude) metadata.altitude = exifData.GPSAltitude;
    
    // Create date (choose DateTimeOriginal if available)
    const dateStr = exifData.DateTimeOriginal || exifData.CreateDate;
    if (dateStr) metadata.create_date = Math.floor(new Date(dateStr).getTime() / 1000);

    metadata.lens_model = exifData.LensModel || exifData.Lens || null;
    metadata.iso = exifData.ISO || null;
    metadata.software = exifData.Software || null;
    metadata.offset_time_original = exifData.OffsetTimeOriginal || null;
    metadata.megapixels = (exifData.ExifImageWidth && exifData.ExifImageHeight)
      ? (exifData.ExifImageWidth * exifData.ExifImageHeight) / 1_000_000
      : null;
    metadata.exposure_time = exifData.ExposureTime || null;
    metadata.color_space = exifData.ColorSpace || null;
    metadata.flash = exifData.Flash || null;
    metadata.aperture = exifData.FNumber || null;
    metadata.focal_length = exifData.FocalLength || null;
    metadata.focal_length_35mm = exifData.FocalLengthIn35mmFormat || null;
  } catch (err) {
    console.log(`No EXIF data for ${filePath}: ${err.message}`);
  }

  return metadata;
}

const pLimit = require("p-limit");
const os = require("os");
const cpuCount = os.cpus().length;
const METADATA_CONCURRENCY = Math.max(1, Math.floor(cpuCount / 2));  // 1 task per 2 cores
const THUMBNAIL_CONCURRENCY = Math.max(1, Math.floor(cpuCount / 3)); // 1 task per 3 cores
const BATCH_SIZE = 1000;             // insert batch size
const dbWriteLimit = pLimit(1)

// Count total files for progress tracking
function countTotalFiles(folderPath, existingPaths = new Set()) {
  let total = 0;
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);

    if (entry.isDirectory()) {
      total += countTotalFiles(fullPath, existingPaths);
    } else if (entry.isFile()) {
      if (!existingPaths.has(fullPath)) {  // Only count files not yet indexed
        total++;
      }
    }
  }

  return total;
}

// async function indexFilesRecursively(folderPath, rootFolder, totalFiles, progressCallback) {
//   let processedFiles = 0;
  
//   const updateProgress = () => {
//     processedFiles++;
//     if (progressCallback) {
//       progressCallback(processedFiles);
//     }
//   };
//   const entries = fs.readdirSync(folderPath, { withFileTypes: true });

//   // Separate directories and files
//   const dirs = [];
//   const files = [];
//   for (const entry of entries) {
//     if (entry.isDirectory()) dirs.push(entry.name);
//     else if (entry.isFile()) files.push(entry.name);
//   }

//   // Recurse into directories first
//   for (const dirName of dirs) {
//     await indexFilesRecursively(path.join(folderPath, dirName), rootFolder, totalFiles, progressCallback);
//   }

//   const limitMetadata = pLimit(METADATA_CONCURRENCY);
//   const limitThumb = pLimit(THUMBNAIL_CONCURRENCY);

//   const insertStmt = db.prepare(`
//     INSERT OR REPLACE INTO files 
//     (filename, path, size, created, modified, extension, folder_path,
//      file_type, device_model, camera_make, camera_model, width, height,
//      orientation, latitude, longitude, altitude, create_date, thumbnail_path,
//      lens_model, iso, software, offset_time_original, megapixels,
//      exposure_time, color_space, flash, aperture, focal_length, focal_length_35mm, country)
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//   `);

//   let batchRows = [];

//     for (const fileName of files) {
//     const fullPath = path.join(folderPath, fileName);
//     if (mainWindow) {
//       mainWindow.webContents.send("indexing-progress", {
//         filename: fileName,
//         processed: processedFiles,
//         total: totalFiles,
//         percentage: totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0
//       });
//     }

//     const stats = fs.statSync(fullPath);

//     // Skip already indexed files
//     const exists = db.prepare("SELECT id FROM files WHERE path = ?").get(fullPath);
//     if (exists) continue;

//     // Extract metadata with limited concurrency
//     const metadata = await limitMetadata(() => extractMetadata(fullPath));

//     batchRows.push({
//       fileName,
//       fullPath,
//       stats,
//       metadata
//     });

//     // When batch is full, insert transactionally
//     if (batchRows.length >= BATCH_SIZE) {
//       await insertBatch(batchRows, insertStmt, rootFolder, limitThumb);
//       batchRows = [];
//     }
    
//     updateProgress();
//   }

//   // Insert any remaining files
//   if (batchRows.length > 0) {
//     await insertBatch(batchRows, insertStmt, rootFolder, limitThumb);
//     processedFiles += batchRows.length;
//     updateProgress();
//   }
// }

// Async generator for walking directories
async function* walkDir(dir) {
  const dirHandle = await fsPromises.opendir(dir);
  for await (const entry of dirHandle) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(res);
    } else if (entry.isFile()) {
      yield res;
    }
  }
}

// function getNextMediaId() {
//   const row = db.prepare("SELECT MAX(media_id) as max FROM files").get();
//   return (row?.max || 0) + 1;
// }

// ipcMain.handle("add-media-id", async () => {
//   try {
//     initDatabase();

//     db.transaction(() => {
//       // 1. Add column if not exists
//       db.prepare(`ALTER TABLE files ADD COLUMN media_id INTEGER`).run();

//       // 2. Fill it with sequential IDs without gaps
//       const rows = db.prepare("SELECT id FROM files ORDER BY id").all();

//       let counter = 1;
//       for (const row of rows) {
//         db.prepare("UPDATE files SET media_id = ? WHERE id = ?").run(counter, row.id);
//         counter++;
//       }

//       // 3. Add a unique index to keep it clean
//       db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_files_media_id ON files(media_id)").run();
//     })();

//     return { success: true, message: "media_id column added and populated successfully." };
//   } catch (err) {
//     console.error("Error adding media_id:", err);
//     return { success: false, error: err.message };
//   }
// });

// Preload all existing file paths into a Set
function loadIndexedPaths() {
  const rows = db.prepare("SELECT path FROM files").all();
  return new Set(rows.map(r => r.path));
}

// Main indexing function
async function indexFilesRecursively(rootFolder, existingPaths, progressCallback) {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO files 
    (media_id, filename, path, size, created, modified, extension, folder_path,
     file_type, device_model, camera_make, camera_model, width, height,
     orientation, latitude, longitude, altitude, create_date, thumbnail_path,
     lens_model, iso, software, offset_time_original, megapixels,
     exposure_time, color_space, flash, aperture, focal_length, focal_length_35mm, country)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const limitMetadata = pLimit(METADATA_CONCURRENCY);
  const limitThumb = pLimit(THUMBNAIL_CONCURRENCY);

  let batchRows = [];
  let processed = 0;
  let lastUpdate = Date.now();

  for await (const filePath of walkDir(rootFolder)) {
    if (existingPaths.has(filePath)) {
      continue; // already indexed
    }

    const stats = await fsPromises.stat(filePath);
    const fileName = path.basename(filePath);

    const metadata = await limitMetadata(() => extractMetadata(filePath));

    batchRows.push({ fileName, fullPath: filePath, stats, metadata });

    if (batchRows.length >= BATCH_SIZE) {
      await insertBatch(batchRows, insertStmt, rootFolder, limitThumb);
      batchRows = [];
    }

    processed++;

    // Throttle IPC progress updates (max 1 every 100ms)
    const now = Date.now();
    if (now - lastUpdate > 100) {
      progressCallback?.(processed);
      lastUpdate = now;
    }
  }

  if (batchRows.length > 0) {
    await insertBatch(batchRows, insertStmt, rootFolder, limitThumb);
    // processed += batchRows.length;
    progressCallback?.(processed);
  }
}

ipcMain.handle("fetch-options", async (event, {birthDate = null}) => {
  try {
    initDatabase();

    const devices = db.prepare("SELECT DISTINCT device_model FROM files WHERE device_model IS NOT NULL").all().map(r => r.device_model);
    const folders = db.prepare("SELECT DISTINCT folder_path FROM files WHERE folder_path IS NOT NULL").all().map(r => r.folder_path);
    const filetypes = db.prepare("SELECT DISTINCT extension FROM files WHERE extension IS NOT NULL").all().map(r => r.extension);
    const mediaTypes = db.prepare("SELECT DISTINCT file_type FROM files WHERE file_type IS NOT NULL").all().map(r => r.file_type);
    const countries = db.prepare("SELECT DISTINCT country FROM files WHERE country IS NOT NULL").all().map(r => r.country);
    const tags = db.prepare(`
      SELECT *
      FROM tags 
      WHERE media_ids IS NOT NULL
    `).all().map(r => r.name);

    const dateRange = db.prepare("SELECT MIN(create_date) as min, MAX(create_date) as max FROM files WHERE create_date IS NOT NULL").get();

    let minDate = "";
    let maxDate = "";
    let years = [];

    if (dateRange?.min && dateRange?.max) {
      minDate = new Date(dateRange.min * 1000).toISOString().split("T")[0];
      maxDate = new Date(dateRange.max * 1000).toISOString().split("T")[0];

      const startYear = new Date(minDate).getFullYear();
      const endYear = new Date(maxDate).getFullYear();
      years = Array.from({ length: endYear - startYear + 1 }, (_, i) => endYear - i);
    }

    let ages = [];

    if (dateRange?.min && dateRange?.max && birthDate) {
      const minAge = ageOnDate(birthDate, dateRange.min);
      const maxAge = ageOnDate(birthDate, dateRange.max);
    
      ages = Array.from(
        { length: maxAge - minAge + 1 },
        (_, i) => minAge + i
      );
    }

    return { devices, folders, filetypes, mediaTypes, countries, minDate, maxDate, years, tags, ages };
  } catch (err) {
    console.error("fetch-options error", err);
    return { devices: [], folders: [], filetypes: [], mediaTypes: [], countries: [], minDate: "", maxDate: "", years: [], tags: [] };
  }
});

function ageOnDate(birthDate, epochSeconds) {
  const birth = new Date(birthDate);
  const date = new Date(epochSeconds * 1000);

  let age = date.getFullYear() - birth.getFullYear();
  const m = date.getMonth() - birth.getMonth();
  const d = date.getDate() - birth.getDate();

  if (m < 0 || (m === 0 && d < 0)) age--;
  return age;
}


ipcMain.handle("fix-thumbnails", async () => {
  try {
    const limitThumb = pLimit(THUMBNAIL_CONCURRENCY);

    // Find all rows without thumbnails
    const rows = db.prepare("SELECT id, path, folder_path FROM files WHERE thumbnail_path IS NULL").all();

    if (rows.length === 0) {
      return { success: true, message: "No missing thumbnails found." };
    }

    for (const row of rows) {
      try {
        const thumbPath = await limitThumb(() => generateThumbnail(row.path, row.id));

        if (thumbPath) {
          db.prepare("UPDATE files SET thumbnail_path = ? WHERE id = ?").run(thumbPath, row.id);
        }
      } catch (err) {
        console.error(`Failed to generate thumbnail for ${row.path}:`, err);
      }
    }

    return { success: true, message: `Thumbnails fixed for ${rows.length} files.` };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

// Helper function for batch insert + thumbnail generation
async function insertBatch(rows, insertStmt, rootFolder, limitThumb) {
  // Transactional insert
  await dbWriteLimit(async () => {
  const insertMany = db.transaction((batch) => {
    let nextMediaId = (db.prepare("SELECT MAX(media_id) as max FROM files").get()?.max || 0) + 1;
    for (const row of batch) {
      try {
        row.metadata.country = Array.isArray(row.metadata.country)
          ? row.metadata.country.join(", ")
          : row.metadata.country ?? null;

        const info = insertStmt.run(
          nextMediaId++,
          row.fileName,
          row.fullPath,
          row.stats.size,
          Math.floor(row.stats.birthtimeMs / 1000),
          Math.floor(row.stats.mtimeMs / 1000),
          path.extname(row.fileName).toLowerCase(),
          rootFolder,
          row.metadata.file_type,
          row.metadata.device_model,
          row.metadata.camera_make,
          row.metadata.camera_model,
          row.metadata.width,
          row.metadata.height,
          row.metadata.orientation,
          row.metadata.latitude,
          row.metadata.longitude,
          row.metadata.altitude,
          row.metadata.create_date,
          null, // thumbnail path updated later
          row.metadata.lens_model,
          row.metadata.iso,
          row.metadata.software,
          row.metadata.offset_time_original,
          row.metadata.megapixels,
          row.metadata.exposure_time,
          row.metadata.color_space,
          row.metadata.flash,
          row.metadata.aperture,
          row.metadata.focal_length,
          row.metadata.focal_length_35mm,
          row.metadata.country
        );
        row.id = info.lastInsertRowid;
      } catch (err) {
          console.error("Error inserting row:", {
            row: row,
            error: err.message
          });
          throw err; // rethrow so transaction fails
        }
    }
  });

  // Inserts are serialized
  insertMany(rows);
});

  // Generate thumbnails concurrently
  const thumbsToUpdate = [];
  await Promise.all(
    rows
      .filter(r => ["image", "video"].includes(r.metadata.file_type))
      .map(r => limitThumb(async () => {
        const thumbPath = await generateThumbnail(r.fullPath, r.id);
        if (thumbPath) {
          thumbsToUpdate.push({ id: r.id, thumbPath });
        }
      }))
  );

  if (thumbsToUpdate.length > 0) {
    // Prepare once, reuse in a single transaction
    await dbWriteLimit(() => {
      const updateStmt = db.prepare(`UPDATE files SET thumbnail_path = ? WHERE id = ?`);
      const updateMany = db.transaction((updates) => {
        for (const u of updates) {
          updateStmt.run(u.thumbPath, u.id);
        }
      });
      updateMany(thumbsToUpdate);
    });
  }
}

ipcMain.handle("check-folders", async (event, folders) => {
  const results = {};
  for (const folder of folders) {
    try {
      results[folder] = fs.existsSync(folder);
    } catch {
      results[folder] = false;
    }
  }
  return results;
});

ipcMain.handle("remove-folder-data", async (event, folderPath) => {
  try {
    initDatabase();

    // Get all thumbnails linked to this folder
    const thumbnails = db.prepare(
      "SELECT thumbnail_path FROM files WHERE folder_path = ?"
    ).all(folderPath);

    // Delete thumbnails from disk
    for (const { thumbnail_path } of thumbnails) {
      if (thumbnail_path && fs.existsSync(thumbnail_path)) {
        try {
          fs.unlinkSync(thumbnail_path);
        } catch (err) {
          console.warn("Failed to delete thumbnail:", thumbnail_path, err.message);
        }
      }
    }

    // Delete files from DB
    db.prepare("DELETE FROM files WHERE folder_path = ?").run(folderPath);

    // Delete folder record
    db.prepare("DELETE FROM folders WHERE path = ?").run(folderPath);

    return { success: true };
  } catch (err) {
    console.error("Error removing folder data:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("remove-item-from-index", async (event, id) => {
  try {
    initDatabase();

    if (!id) {
      throw new Error("No ID provided");
    }

    // 1. Remove item from DB
    db.prepare("DELETE FROM files WHERE id = ?").run(id);

    // 2. Remove thumbnail from disk
    const thumbnailPath = path.join(
      dataDir,
      "thumbnails",
      `${id}_thumb.jpg`
    );

    if (fs.existsSync(thumbnailPath)) {
      try {
        fs.unlinkSync(thumbnailPath);
      } catch (err) {
        console.warn(
          "Failed to delete thumbnail:",
          thumbnailPath,
          err.message
        );
      }
    }

    event.sender.send("item-removed", { id });

    return { success: true };
  } catch (err) {
    console.error("Error removing item from index:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("apply-heic-thumbnails", async (event, heicFiles) => {
  try {
    const thumbnailsDir = path.join(dataDir, "thumbnails"); // folder where user will copy thumbnails
    const stmt = db.prepare("UPDATE files SET thumbnail_path = ? WHERE id = ?");
    for (const file of heicFiles) {
      // Construct the expected thumbnail filename
      const thumbnailFileName = `${file.id}_thumb.jpg`;
      const thumbnailFullPath = path.join(thumbnailsDir, thumbnailFileName);

      // Only update DB if the thumbnail exists
      if (!fs.existsSync(thumbnailFullPath)) continue;

      // Update database
      stmt.run(thumbnailFullPath, file.id);
    }

    return { success: true, message: "Database updated with thumbnail paths." };
  } catch (err) {
    console.error("Error updating thumbnail paths:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-storage-usage", async () => {
  try {
    const appDataPath = path.join(__dirname); // App root folder
    const dbPath = path.join(dataDir, "orbit-index.db");
    const thumbsPath = path.join(dataDir, "thumbnails");

    let dbSize = 0;
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      dbSize = stats.size; // Size in bytes
    }

    // Calculate total storage used by the app itself
    const getDirectorySize = (dirPath) => {
      let totalSize = 0;
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          totalSize += getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
      return totalSize;
    };

    const appStorageUsed = getDirectorySize(appDataPath);
    const thumbSize = getDirectorySize(thumbsPath);

    return {
      appStorageUsed, // Total space used by the app (bytes)
      dbSize, // Space used by `orbit-index.db` (bytes)
      thumbSize,
    };
  } catch (error) {
    console.error("Error getting storage usage:", error);
    return { appStorageUsed: 0, dbSize: 0, thumbSize: 0 };
  }
});

// Indexed files count
ipcMain.handle("get-indexed-files-count", async () => {
  try {
    initDatabase();
    const result = db.prepare("SELECT COUNT(*) as count FROM files").get();
    return result.count;
  } catch (err) {
    console.error(err);
    return 0;
  }
});

// Thumbnail generation placeholder
ipcMain.handle("generate-thumbnails", async () => {
  try {
    initDatabase();
    return { success: true, message: "Thumbnail generation started" };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-index-of-item', async (event, { itemId }) => {
  try {
    if (!db) return null;

    // Use media_id for a stable, deterministic descending sort (newest first)
    const stmt = db.prepare(`
      SELECT COUNT(*) as idx
      FROM files
      WHERE media_id > ?
    `);

    const row = stmt.get(itemId);
    if (!row) return null;

    return row.idx; // 0-based index
  } catch (err) {
    console.error('get-index-of-item error:', err);
    return null;
  }
});

// Properly shut down exiftool on exit
app.on("before-quit", async () => {
  await exiftool.end();
});
