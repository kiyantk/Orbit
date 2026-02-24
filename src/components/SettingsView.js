// SettingsView.jsx
import React, { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown, faArrowLeft, faArrowRight, faArrowUp,
  faHardDrive, faKeyboard, faPanorama, faPhotoFilm,
  faTableCells, faToolbox, faUser,
} from "@fortawesome/free-solid-svg-icons";
import FolderList from "./FolderList";
import HeicPopup from "./HeicPopup";

const TABS = ["User", "Media", "Explorer", "Memories", "Storage", "Controls", "App"];

const TAB_ICONS = {
  User: faUser,
  Media: faPhotoFilm,
  Explorer: faTableCells,
  Memories: faPanorama,
  Storage: faHardDrive,
  Controls: faKeyboard,
  App: faToolbox,
};

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function normalizePath(path) {
  if (!path) return "";
  let p = path.trim().replace(/[/\\]+$/, "");
  if (navigator.platform.startsWith("Win")) p = p.toLowerCase();
  return p;
}

export function resolvePathWithDriveMap(filePath, driveLetterMap) {
  if (!filePath || !driveLetterMap || Object.keys(driveLetterMap).length === 0) return filePath;
  for (const [originalFolder, customLetter] of Object.entries(driveLetterMap)) {
    const originalDrive = originalFolder.match(/^([A-Za-z]:)/)?.[1]?.toUpperCase();
    if (!originalDrive || !customLetter) continue;
    const normalizedCustom = customLetter.replace(/:?$/, ":").toUpperCase();
    if (filePath.toUpperCase().startsWith(originalDrive)) {
      return normalizedCustom + filePath.slice(originalDrive.length);
    }
  }
  return filePath;
}

const ShortcutKey = ({ children }) => (
  <span className="settings-shortcut-key">{children}</span>
);

const SettingsRow = ({ children }) => (
  <div className="settings-content-item">{children}</div>
);

// ─── Confirm Popup ────────────────────────────────────────────────────────────
const ConfirmPopup = ({ message, subMessage, onConfirm, onCancel }) => (
  <div className="welcome-popup-overlay">
          <div className="confirm-popup" style={{ maxWidth: 420 }}>
            <div className="welcome-popup-top">
              <div className="welcome-popup-inline">
                <h2>Remove source(s)</h2>
              </div>
            </div>

            <div className="welcome-popup-content">
              <span style={{ color: "#ccc" }}>
                {message}
                <br /><br />
                <strong>{subMessage}</strong>
              </span>
            </div>

            <div className="settings-bottom-bar" style={{ gap: 8 }}>
              <button
                className="settings-cancel-btn"
                style={{ backgroundColor: "#2d2a35" }}
                onClick={onCancel}
              >
                No
              </button>

              <button
                className="settings-save-btn"
                style={{ backgroundColor: "#ff6b6b" }}
                onClick={onConfirm}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
const SettingsView = ({
  currentSettings,
  applySettings,
  folderStatuses,
  checkStatusses,
  newTab,
  enterRemoveMode,
}) => {
  const [selectedTab, setSelectedTab] = useState("User");
  const [settings, setSettings] = useState({ driveLetterMap: {}, ...currentSettings });
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState(null);
  const [missingHeicFiles, setMissingHeicFiles] = useState([]);
  const [showHeicPopup, setShowHeicPopup] = useState(false);
  const [showToolsPopup, setShowToolsPopup] = useState(false);
  const [isFetchingUsage, setIsFetchingUsage] = useState(false);
  const [storageUsage, setStorageUsage] = useState({ app: 0, index: 0, thumbnails: 0 });

  // confirmPopup: null | { message, subMessage, onConfirm }
  const [confirmPopup, setConfirmPopup] = useState(null);

  const ipc = useCallback(
    (channel, ...args) => window.electron.ipcRenderer.invoke(channel, ...args),
    []
  );

  const saveSettings = useCallback(
    async (next) => {
      applySettings(next);
      try {
        const res = await ipc("save-settings", next);
        if (!res.success) console.error("Failed to save settings:", res.error);
      } catch (err) {
        console.error("Error saving settings:", err);
      }
    },
    [applySettings, ipc]
  );

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleCheckbox = (key) => (e) => updateSettings({ [key]: e.target.checked });
  const handleSelect = (key) => (e) => updateSettings({ [key]: e.target.value });

  const handleUsernameChange = (e) => {
    const v = e.target.value;
    if (
      v !== "" &&
      (v.length > 32 || /\s{2,}/.test(v) || !/^[a-zA-Z0-9 _-]+$/.test(v) || /^\s|\s$/.test(v))
    ) return;
    updateSettings({ username: v });
  };

  const handleSetDriveLetter = useCallback((folder, customLetter) => {
    setSettings((prev) => {
      const next = { ...(prev.driveLetterMap || {}) };
      if (customLetter === null || customLetter === undefined) {
        delete next[folder];
      } else {
        next[folder] = customLetter;
      }
      return { ...prev, driveLetterMap: next };
    });
  }, []);

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    ipc("get-settings").then((loaded) => {
      if (loaded) setSettings({ driveLetterMap: {}, ...loaded });
    });
    new Image().src = `${process.env.PUBLIC_URL}/logo-v2-orbit-bright-white-shadow-small.png`;
  }, [ipc]);

  useEffect(() => {
    if (newTab) setSelectedTab(newTab);
  }, [newTab]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ipc("fetch-heic-missing-thumbnails").then((res) => {
      if (res.success) setMissingHeicFiles(res.files);
    });
  }, [settings.indexedFolders, ipc]);

  useEffect(() => {
    const handleProgress = (data) => {
      if (data && typeof data === "object") {
        const { filename, processed, total, percentage } = data;
        setIndexingStatus(
          total > 0
            ? `Indexing: ${processed}/${total} files (${percentage}%)`
            : filename ? `Indexing: ${filename}` : "Indexing files..."
        );
      } else {
        setIndexingStatus(data ? `Indexing: ${data}` : "Indexing files...");
      }
    };
    window.electron.ipcRenderer.on("indexing-progress", handleProgress);
    return () => window.electron.ipcRenderer.removeListener("indexing-progress", handleProgress);
  }, []);

  // ─── Folder actions ──────────────────────────────────────────────────────────

  const startIndex = async (folders) => {
    if (!folders.length) { setIndexingStatus("Please select at least one folder to index"); return; }
    setIsIndexing(true);
    setShowToolsPopup(false);
    try {
      const result = await ipc("index-files", folders);
      setIndexingStatus(result.success ? null : `Error: ${result.error}`);
    } catch (err) {
      console.error("Error indexing files:", err);
      setIndexingStatus("Error occurred during indexing");
    }
    setIsIndexing(false);
  };

  const selectFolders = async () => {
    try {
      const folders = await ipc("select-folders");
      if (!folders.length) return;
      setSettings((prev) => {
        const existing = prev.indexedFolders.map(normalizePath);
        const unique = folders.filter((f) => !existing.includes(normalizePath(f)));
        startIndex(folders);
        return { ...prev, indexedFolders: [...prev.indexedFolders, ...unique] };
      });
    } catch (err) {
      console.error("Error selecting folders:", err);
    }
  };

  const doRemoveFolder = async (folderPath) => {
    setSettings((prev) => {
      const nextMap = { ...(prev.driveLetterMap || {}) };
      delete nextMap[folderPath];
      return {
        ...prev,
        indexedFolders: prev.indexedFolders.filter((f) => f !== folderPath),
        driveLetterMap: nextMap,
      };
    });
    try {
      const res = await ipc("remove-folder-data", folderPath);
      if (!res.success) console.error("Failed to remove folder data:", res.error);
    } catch (err) {
      console.error("Error removing folder:", err);
    }
  };

  const removeFolder = (folderPath) => {
    setConfirmPopup({
      message: `Remove this source?`,
      subMessage: folderPath,
      onConfirm: () => {
        setConfirmPopup(null);
        doRemoveFolder(folderPath);
      },
    });
  };

  const doRemoveAll = async () => {
    for (const folder of settings.indexedFolders) {
      try {
        const res = await ipc("remove-folder-data", folder);
        if (!res.success) console.error("Failed to remove folder data:", res.error);
      } catch (err) {
        console.error("Error removing folder:", err);
      }
    }
    updateSettings({ indexedFolders: [], driveLetterMap: {} });
  };

  const handleRemoveAll = () => {
    setConfirmPopup({
      message: "Remove ALL indexed sources?",
      subMessage: "This will delete all index data and thumbnails. This cannot be undone.",
      onConfirm: () => {
        setConfirmPopup(null);
        doRemoveAll();
      },
    });
  };

  // ─── Tool actions ────────────────────────────────────────────────────────────

  const runTool = useCallback(
    async (channel, label) => {
      setIndexingStatus(`${label}...`);
      setIsIndexing(true);
      setShowToolsPopup(false);
      try {
        const result = await ipc(channel);
        setIndexingStatus(result.success ? result.message : `Error: ${result.error}`);
        if (result.success) setTimeout(() => setIndexingStatus(null), 5000);
      } catch (err) {
        setIndexingStatus(`Error: ${err.message}`);
      }
      setIsIndexing(false);
    },
    [ipc]
  );

  const fixThumbnails = () => runTool("fix-thumbnails", "Fixing thumbnails");
  const fixIDs = () => runTool("fix-media-ids", "Fixing media IDs");
  const cleanupThumbnails = () => runTool("cleanup-thumbnails", "Scanning for orphaned thumbnails");

  const getUsageData = async () => {
    setIsFetchingUsage(true);
    try {
      const data = await ipc("get-storage-usage");
      if (data) setStorageUsage({ app: data.appStorageUsed, index: data.dbSize, thumbnails: data.thumbSize });
    } finally {
      setIsFetchingUsage(false);
    }
  };

  const openAppLocation = () => ipc("open-orbit-location");
  const openDataLocation = () => ipc("open-data-location");
  const toggleFullscreen = () => ipc("toggle-fullscreen");

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="settings-view">
      <div className="settings-main">

        <div className="settings-list">
          <h2>Settings</h2>
          <ul>
            {TABS.map((tab) => (
              <li
                key={tab}
                className={`settings-list-item ${selectedTab === tab ? "settings-list-active" : ""}`}
                onClick={() => setSelectedTab(tab)}
              >
                <FontAwesomeIcon icon={TAB_ICONS[tab]} />
                <span>{tab}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="settings-content">

          {selectedTab === "User" && (
            <div>
              <SettingsRow>
                <span>Username:</span>
                <input className="settings-content-input" type="text" value={settings.username} onChange={handleUsernameChange} />
              </SettingsRow>
              <SettingsRow>
                <span>Birth Date:</span>
                <input className="settings-content-input" type="date" style={{ colorScheme: "dark" }} value={settings.birthDate} onChange={handleSelect("birthDate")} />
              </SettingsRow>
            </div>
          )}

          {selectedTab === "Explorer" && (
            <div>
              <SettingsRow>
                <input type="checkbox" checked={!!settings.adjustHeicColors} onChange={handleCheckbox("adjustHeicColors")} />
                <span>Adjust HEIC Colors</span>
                <span className="settings-hint">Recommended. Improves color accuracy for HEIC photos.</span>
              </SettingsRow>
              <SettingsRow>
                <input type="checkbox" checked={!!settings.preloadHeic} onChange={handleCheckbox("preloadHeic")} />
                <span>Preload HEIC on hover</span>
                <span className="settings-hint">Experimental. Can significantly reduce loading times for HEIC files by decoding them in the background while hovering.</span>
              </SettingsRow>
              <SettingsRow>
                <span>Default sort:</span>
                <select value={settings.defaultSort} onChange={handleSelect("defaultSort")} className="settings-itemstyle-select">
                  <option value="media_id">ID (default)</option>
                  <option value="name">Name</option>
                  <option value="create_date">Date Taken</option>
                  <option value="created">Date Created</option>
                  <option value="size">File Size</option>
                  <option value="random">Random</option>
                </select>
              </SettingsRow>
              <SettingsRow>
                <span>Item text:</span>
                <select value={settings.itemText} onChange={handleSelect("itemText")} className="settings-itemstyle-select">
                  <option value="filename">Filename (default)</option>
                  <option value="datetime">Date</option>
                  <option value="none">None</option>
                </select>
              </SettingsRow>
              <SettingsRow>
                <input type="checkbox" checked={!!settings.noGutters} onChange={handleCheckbox("noGutters")} />
                <span>No gutters</span>
              </SettingsRow>
            </div>
          )}

          {selectedTab === "Memories" && (
            <div>
              <SettingsRow>
                <span>Open memories in:</span>
                <select value={settings.openMemoriesIn} onChange={handleSelect("openMemoriesIn")} className="settings-itemstyle-select">
                  <option value="explorer">Explorer (default)</option>
                  <option value="shuffle">Shuffle</option>
                  <option value="map">Map</option>
                </select>
              </SettingsRow>
            </div>
          )}

          {selectedTab === "Media" && (
            <div>
              <h3>Indexed Sources</h3>
              <FolderList
                folders={settings.indexedFolders}
                onRemoveFolder={removeFolder}
                folderStatuses={folderStatuses}
                driveLetterMap={settings.driveLetterMap || {}}
                onSetDriveLetter={handleSetDriveLetter}
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="welcome-popup-select-folders-btn" onClick={selectFolders} disabled={isIndexing}>Add Source</button>
                <button className="welcome-popup-select-folders-btn" onClick={handleRemoveAll} disabled={isIndexing || (settings && !settings.indexedFolders.length)}>Remove All</button>
                <button className="welcome-popup-select-folders-btn" onClick={() => setShowToolsPopup(true)} disabled={isIndexing || (settings && !settings.indexedFolders.length)}>Tools</button>
                {missingHeicFiles.length > 0 && (
                  <button className="welcome-popup-select-folders-btn" onClick={() => setShowHeicPopup(true)} disabled={isIndexing}>
                    Generate HEIC Thumbnails
                  </button>
                )}
              </div>
              {indexingStatus && (
                <div className="welcome-popup-status">
                  <span>{indexingStatus}</span><br /><span>Don't close the app</span>
                </div>
              )}
            </div>
          )}

          {selectedTab === "Storage" && (
            <div>
              <SettingsRow>
                <span>Storage Usage:</span>
                <button
                  className="settings-normal-button"
                  onClick={getUsageData}
                  disabled={isFetchingUsage}
                  style={isFetchingUsage ? { opacity: 0.5, cursor: "not-allowed" } : {}}
                >
                  {isFetchingUsage ? "Loading..." : "Fetch Usage"}
                </button>
              </SettingsRow>
              {storageUsage.app !== 0 && (
                <div className="storage-bar-container">
                  <div className="storage-legend">
                    {[
                      { cls: "storage-legend-app", label: "App Total", val: storageUsage.app },
                      { cls: "storage-legend-index", label: "Database", val: storageUsage.index },
                      { cls: "storage-legend-thumbs", label: "Thumbnails", val: storageUsage.thumbnails },
                    ].map(({ cls, label, val }) => (
                      <span key={label} className="storage-legend-text">
                        <div className={cls} />{label}: {val > 0 ? formatBytes(val) : "0 Bytes"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTab === "Controls" && (
            <div>
              <h3>General</h3>
              <SettingsRow>
                <span>Quick minimize:</span>
                <ShortcutKey>~</ShortcutKey> or <ShortcutKey>`</ShortcutKey>
              </SettingsRow>
              <br />
              <h3>Explorer</h3>
              {[
                { label: "Show preview:", keys: [<ShortcutKey key="lmb">Left Mouse Button</ShortcutKey>] },
                { label: "Open fullscreen:", keys: [<ShortcutKey key="dlmb">Double Left Mouse Button</ShortcutKey>] },
                {
                  label: "Open in default viewer:",
                  keys: [<ShortcutKey key="ctrl">CTRL</ShortcutKey>, " + ", <ShortcutKey key="lmb2">Left Mouse Button</ShortcutKey>],
                },
                {
                  label: "Navigate:",
                  keys: [
                    <ShortcutKey key="scroll">SCROLL</ShortcutKey>, " or ",
                    <ShortcutKey key="arrows">
                      <FontAwesomeIcon icon={faArrowLeft} />{" "}
                      <FontAwesomeIcon icon={faArrowUp} />{" "}
                      <FontAwesomeIcon icon={faArrowDown} />{" "}
                      <FontAwesomeIcon icon={faArrowRight} />
                    </ShortcutKey>,
                  ],
                },
                {
                  label: "Scale grid:",
                  keys: [<ShortcutKey key="ctrl">CTRL</ShortcutKey>, " + ", <ShortcutKey key="scroll">SCROLL</ShortcutKey>],
                },
                { label: "Assign last used tag to selected item:", keys: [<ShortcutKey key="t">T</ShortcutKey>] },
              ].map(({ label, keys }) => (
                <SettingsRow key={label}>
                  <span>{label}</span> {keys}
                </SettingsRow>
              ))}
            </div>
          )}

          {selectedTab === "App" && (
            <div>
              <SettingsRow>
                <img width="50" src={`${process.env.PUBLIC_URL}/logo-v2-orbit-bright-white-shadow-small.png`} alt="Orbit logo" />
                <span>Orbit 1.1.0</span>
              </SettingsRow>
              <SettingsRow>
                <span>App Location:</span>
                <button className="settings-normal-button" onClick={openAppLocation}>Open in File Explorer</button>
              </SettingsRow>
              <SettingsRow>
                <span>Data Location:</span>
                <button className="settings-normal-button" onClick={openDataLocation}>Open in File Explorer</button>
              </SettingsRow>
              <SettingsRow>
                <span>Window:</span>
                <button className="settings-normal-button" onClick={toggleFullscreen}>Toggle Fullscreen</button>
              </SettingsRow>
            </div>
          )}

        </div>
      </div>

      {/* ── Popups ── */}
      {showHeicPopup && (
        <HeicPopup missingFiles={missingHeicFiles} onClose={() => setShowHeicPopup(false)} />
      )}

      {showToolsPopup && (
        <div className="welcome-popup-overlay">
          <div className="welcome-popup">
            <h2>Tools</h2>
            <p>Select which tool to run:</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 10, padding: "0 10px" }}>
              {[
                { label: "Reindex All", action: () => startIndex(settings.indexedFolders) },
                { label: "Check Status", action: () => { setShowToolsPopup(false); checkStatusses(); } },
                { label: "Fix IDs", action: fixIDs },
                { label: "Fix Thumbnails", action: fixThumbnails },
                { label: "Cleanup Thumbnails", action: cleanupThumbnails },
                { label: "Remove Mode", action: () => { setShowToolsPopup(false); enterRemoveMode(); } },
              ].map(({ label, action }) => (
                <button key={label} className="welcome-popup-select-folders-btn" onClick={action}>{label}</button>
              ))}
            </div>
            <div className="settings-bottom-bar" style={{ height: 70 }}>
              <button className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin" onClick={() => setShowToolsPopup(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPopup && (
        <ConfirmPopup
          message={confirmPopup.message}
          subMessage={confirmPopup.subMessage}
          onConfirm={confirmPopup.onConfirm}
          onCancel={() => setConfirmPopup(null)}
        />
      )}
    </div>
  );
};

export default SettingsView;