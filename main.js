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
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;

// On startup:
app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 400,
    icon: path.join(__dirname, "./public/logo512.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
    titleBarStyle: "hidden",
    backgroundColor: "#15131a",
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
  const serverPort = 3001;

  // Serve files from any path on disk
  appServer.get("/files/*", (req, res) => {
    const filePath = decodeURIComponent(req.path.replace("/files/", ""));
    if (!fs.existsSync(filePath)) {
      console.error("File not found:", filePath);
      res.status(404).send("Not found");
      return;
    }
    res.sendFile(filePath);
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
};

// Database
let db;
const dbPath = path.join(dataDir, "orbit-index.db");

function initDatabase() {
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      thumbnail_path TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      indexed_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);
}

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
ipcMain.handle("fetch-files", async (event, { offset = 0, limit = 200 } = {}) => {
  try {
    initDatabase();
    // Use an index-friendly ORDER BY (id) - adjust if you want different ordering (e.g. by modified)
    const stmt = db.prepare(`
      SELECT id, filename, thumbnail_path, path, width, height, file_type, size, latitude, longitude, device_model, created, altitude, create_date, folder_path
      FROM files
      ORDER BY id
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(limit, offset);
    return { success: true, rows };
  } catch (err) {
    console.error("fetch-files error:", err);
    return { success: false, error: err.message, rows: [] };
  }
});

// Indexing
ipcMain.handle("index-files", async (event, folders) => {
  try {
    initDatabase();

    for (const folder of folders) {
      const existing = db.prepare("SELECT * FROM folders WHERE path = ?").get(folder);
      if (!existing) {
        db.prepare("INSERT OR IGNORE INTO folders (path) VALUES (?)").run(folder);
        
        // Count total files for progress tracking
        const totalFiles = countTotalFiles(folder);
        let processedFiles = 0;
        
        // Send initial progress with total files
        if (mainWindow) {
          mainWindow.webContents.send("indexing-progress", {
            filename: "",
            processed: 0,
            total: totalFiles,
            percentage: 0
          });
        }
        
        await indexFilesRecursively(folder, folder, totalFiles, (processed) => {
          processedFiles = processed;
          const percentage = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;
          
          if (mainWindow) {
            mainWindow.webContents.send("indexing-progress", {
              filename: "",
              processed: processedFiles,
              total: totalFiles,
              percentage: percentage
            });
          }
        });
      }
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
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".heic", ".webp"];
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
    }

    // Altitude
    if (exifData.GPSAltitude) metadata.altitude = exifData.GPSAltitude;
    
    // Create date (choose DateTimeOriginal if available)
    const dateStr = exifData.DateTimeOriginal || exifData.CreateDate;
    if (dateStr) metadata.create_date = Math.floor(new Date(dateStr).getTime() / 1000);
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

// Count total files for progress tracking
function countTotalFiles(folderPath) {
  let total = 0;
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      total += countTotalFiles(path.join(folderPath, entry.name));
    } else if (entry.isFile()) {
      total++;
    }
  }
  
  return total;
}

async function indexFilesRecursively(folderPath, rootFolder, totalFiles, progressCallback) {
  let processedFiles = 0;
  
  const updateProgress = () => {
    processedFiles++;
    if (progressCallback) {
      progressCallback(processedFiles);
    }
  };
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  // Separate directories and files
  const dirs = [];
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) dirs.push(entry.name);
    else if (entry.isFile()) files.push(entry.name);
  }

  // Recurse into directories first
  for (const dirName of dirs) {
    await indexFilesRecursively(path.join(folderPath, dirName), rootFolder, totalFiles, progressCallback);
  }

  const limitMetadata = pLimit(METADATA_CONCURRENCY);
  const limitThumb = pLimit(THUMBNAIL_CONCURRENCY);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO files 
    (filename, path, size, created, modified, extension, folder_path,
     file_type, device_model, camera_make, camera_model, width, height,
     orientation, latitude, longitude, altitude, create_date, thumbnail_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let batchRows = [];

    for (const fileName of files) {
    const fullPath = path.join(folderPath, fileName);
    if (mainWindow) {
      mainWindow.webContents.send("indexing-progress", {
        filename: fileName,
        processed: processedFiles,
        total: totalFiles,
        percentage: totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0
      });
    }

    const stats = fs.statSync(fullPath);

    // Skip already indexed files
    const exists = db.prepare("SELECT id FROM files WHERE path = ?").get(fullPath);
    if (exists) continue;

    // Extract metadata with limited concurrency
    const metadata = await limitMetadata(() => extractMetadata(fullPath));

    batchRows.push({
      fileName,
      fullPath,
      stats,
      metadata
    });

    // When batch is full, insert transactionally
    if (batchRows.length >= BATCH_SIZE) {
      await insertBatch(batchRows, insertStmt, rootFolder, limitThumb);
      batchRows = [];
    }
    
    updateProgress();
  }

  // Insert any remaining files
  if (batchRows.length > 0) {
    await insertBatch(batchRows, insertStmt, rootFolder, limitThumb);
    processedFiles += batchRows.length;
    updateProgress();
  }
}

// Helper function for batch insert + thumbnail generation
async function insertBatch(rows, insertStmt, rootFolder, limitThumb) {
  // Transactional insert
  const insertMany = db.transaction((batch) => {
    for (const row of batch) {
      const info = insertStmt.run(
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
        null
      );
      row.id = info.lastInsertRowid;
    }
  });

  insertMany(rows);

  // Generate thumbnails in parallel with limited concurrency
  const thumbPromises = rows
  .filter(r => ["image", "video"].includes(r.metadata.file_type))
  .map(r => limitThumb(async () => {
    const thumbPath = await generateThumbnail(r.fullPath, r.id);
    if (thumbPath) {
      db.prepare(`UPDATE files SET thumbnail_path = ? WHERE id = ?`).run(thumbPath, r.id);
    }
  }));


  await Promise.all(thumbPromises);
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

// Properly shut down exiftool on exit
app.on("before-quit", async () => {
  await exiftool.end();
});
