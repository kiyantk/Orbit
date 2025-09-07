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

let mainWindow;

// On startup:
app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 400,
    icon: path.join(__dirname, "./public/logo512-enhanced.png"),
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

// Indexing
ipcMain.handle("index-files", async (event, folders) => {
  try {
    initDatabase();

    for (const folder of folders) {
      const existing = db.prepare("SELECT * FROM folders WHERE path = ?").get(folder);
      if (!existing) {
        db.prepare("INSERT OR IGNORE INTO folders (path) VALUES (?)").run(folder);
        await indexFilesRecursively(folder, folder);
      }
    }

    return { success: true, message: "Files indexed successfully" };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
});

// Thumbnail generation using sharp
async function generateThumbnail(filePath, id) {
  const ext = path.extname(filePath).toLowerCase();
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".heic", ".webp"];
  if (!imageExtensions.includes(ext)) return null;

  try {
    const thumbnailsDir = path.join(dataDir, "thumbnails");
    if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });

    // Use ID for unique filename
    const thumbnailFilename = `${id}_thumb.jpg`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);

    await sharp(filePath)
      .resize(200, 200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    return thumbnailPath;
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
  } catch (err) {
    console.log(`No EXIF data for ${filePath}: ${err.message}`);
  }

  return metadata;
}

// Recursive indexing
async function indexFilesRecursively(folderPath, rootFolder) {
  const files = fs.readdirSync(folderPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(folderPath, file.name);
    if (file.isDirectory()) {
      await indexFilesRecursively(fullPath, rootFolder);
    } else if (file.isFile()) {
      if (mainWindow) {
        mainWindow.webContents.send("indexing-progress", file.name);
      }

      const stats = fs.statSync(fullPath);
      const metadata = await extractMetadata(fullPath);

      // 1️⃣ Insert file first to get the ID
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO files 
        (filename, path, size, created, modified, extension, folder_path,
         file_type, device_model, camera_make, camera_model, width, height,
         orientation, latitude, longitude, thumbnail_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = insertStmt.run(
        file.name,
        fullPath,
        stats.size,
        Math.floor(stats.birthtimeMs / 1000),
        Math.floor(stats.mtimeMs / 1000),
        path.extname(file.name).toLowerCase(),
        rootFolder,
        metadata.file_type,
        metadata.device_model,
        metadata.camera_make,
        metadata.camera_model,
        metadata.width,
        metadata.height,
        metadata.orientation,
        metadata.latitude,
        metadata.longitude,
        null
      );

      // 2️⃣ Generate thumbnail using the new ID
      let thumbnailPath = null;
      if (metadata.file_type === "image") {
        const id = info.lastInsertRowid;
        thumbnailPath = await generateThumbnail(fullPath, id);

        // 3️⃣ Update the row with the thumbnail path
        db.prepare(`UPDATE files SET thumbnail_path = ? WHERE id = ?`)
          .run(thumbnailPath, id);
      }
    }
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
