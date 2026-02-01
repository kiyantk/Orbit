import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowUp,
  faHardDrive,
  faKeyboard,
  faPhotoFilm,
  faTableCells,
  faToolbox,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import FolderList from "./FolderList";
import HeicPopup from "./HeicPopup";

const SettingsView = ({
  currentSettings,
  applySettings,
  folderStatuses,
  checkStatusses,
  newTab
}) => {
  const [selectedTab, setSelectedTab] = useState("User");
  const [settings, setSettings] = useState(currentSettings);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState("");
  const [missingHeicFiles, setMissingHeicFiles] = useState([]);
  const [showHeicPopup, setShowHeicPopup] = useState(false);
  const [showChecksPopup, setShowChecksPopup] = useState(false);

  const [storageUsage, setStorageUsage] = useState({
    app: 0,
    index: 0,
    thumbnails: 0,
    total: 1,
  });

  // Get storage used in bytes
  const getUsageData = async () => {
    await window.electron.ipcRenderer
      .invoke("get-storage-usage")
      .then((data) => {
        if (data) {
          setStorageUsage({
            app: data.appStorageUsed,
            index: data.dbSize,
            thumbnails: data.thumbSize
          });
        }
      });
  };

  const startIndex = async (folders) => {
    if (folders.length === 0) {
      setIndexingStatus("Please select at least one folder to index");
      return;
    }

    setIsIndexing(true);
    // setIndexingStatus("Indexing files...");
    
    try {
      // Index the selected folders
      const result = await window.electron.ipcRenderer.invoke("index-files", folders);
      
      if (result.success) {
        setIndexingStatus("Files indexed successfully!");
        setIndexingStatus(null);
        setIsIndexing(false);
      } else {
        setIndexingStatus(`Error: ${result.error}`);
        setIsIndexing(false);
      }
    } catch (error) {
      console.error("Error indexing files:", error);
      setIndexingStatus("Error occurred during indexing");
      setIsIndexing(false);
    }
  };

  useEffect(() => {
    // Load settings when component mounts
    window.electron.ipcRenderer
      .invoke("get-settings")
      .then((loadedSettings) => {
        if (loadedSettings) {
          setSettings(loadedSettings);
        }
      });
  }, []);

  useEffect(() => {
    if(newTab) {
      setSelectedTab(newTab)
    }
  }, [newTab]);

  // Set local settings
  const handleCheckboxChange = (key) => (event) => {
    setSettings((prev) => ({
      ...prev,
      [key]: event.target.checked,
    }));
  };

  const handleUsernameChange = (event) => {
    const newValue = event.target.value;
    if (newValue === "") {
      setSettings((prev) => ({ ...prev, username: "" }));
      return;
    }

    if (
      newValue.length > 32 ||
      /\s{2,}/.test(newValue) ||
      !/^[a-zA-Z0-9 _-]+$/.test(newValue) ||
      /^\s|\s$/.test(newValue)
    ) {
      return;
    }

    setSettings((prev) => ({ ...prev, username: newValue }));
  };

  const handleBirthDateChange = (event) => {
    const newValue = event.target.value;
    setSettings((prev) => ({ ...prev, birthDate: newValue }));
  };

  const handleDefaultSortChange = (event) => {
    const newValue = event.target.value;
    setSettings((prev) => ({ ...prev, defaultSort: newValue }));
  };

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings.indexedFolders]);

  const removeFolder = async (folderPath) => {
    // 1. Update state + config
    setSettings((prev) => ({
      ...prev,
      indexedFolders: prev.indexedFolders.filter((folder) => folder !== folderPath),
    }));

    try {
      // 2. Tell Electron to clean DB + thumbnails
      const response = await window.electron.ipcRenderer.invoke(
        "remove-folder-data",
        folderPath
      );
      if (!response.success) {
        console.error("Failed to remove folder data:", response.error);
      }
    } catch (err) {
      console.error("Error removing folder:", err);
    }
  };

  const handleRemoveAll = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to remove ALL indexed folders and their data? This cannot be undone."
    );

    if (!confirmed) return;

    for (const folder of settings.indexedFolders) {
      try {
        const response = await window.electron.ipcRenderer.invoke(
          "remove-folder-data",
          folder
        );
        if (!response.success) {
          console.error("Failed to remove folder data:", response.error);
        }
      } catch (err) {
        console.error("Error removing folder:", err);
      }
    }
    setSettings((prev) => ({ ...prev, indexedFolders: [] }));
  };


  // Save settings
  const saveSettings = async () => {
    applySettings(settings); // Apply local changes
    try {
      const response = await window.electron.ipcRenderer.invoke(
        "save-settings",
        settings
      );
      if (!response.success) {
        console.error("Failed to save settings:", response.error);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  // Define tab icons
  const tabIcons = {
    User: faUser,
    Media: faPhotoFilm,
    Explorer: faTableCells,
    Storage: faHardDrive,
    Controls: faKeyboard,
    App: faToolbox,
  };

  // Open app location in File Explorer
  const openAppLocation = () => {
    window.electron.ipcRenderer.invoke("open-orbit-location");
  };

const fixThumbnails = async () => {
  setIndexingStatus("Fixing thumbnails...");
  setIsIndexing(true);
  const result = await window.electron.ipcRenderer.invoke("fix-thumbnails");
  
  if (result.success) {
    setIndexingStatus(result.message);
    setTimeout(() => setIndexingStatus(null), 5000); // nullify after 2 seconds
  } else {
    setIndexingStatus(`Error: ${result.error}`);
  }

  setIsIndexing(false);
};

const fixIDs = async () => {
  setIndexingStatus("Fixing media IDs...");
  setIsIndexing(true);
  const result = await window.electron.ipcRenderer.invoke("fix-media-ids");
  
  if (result.success) {
    setIndexingStatus(result.message);
    setTimeout(() => setIndexingStatus(null), 5000); // nullify after 2 seconds
  } else {
    setIndexingStatus(`Error: ${result.error}`);
  }

  setIsIndexing(false);
};

useEffect(() => {
  const checkHeicThumbnails = async () => {
    const result = await window.electron.ipcRenderer.invoke("fetch-heic-missing-thumbnails");
    if (result.success) setMissingHeicFiles(result.files);
  };

  checkHeicThumbnails();
}, [settings.indexedFolders]);


  // Convert bytes to human-readable
  function formatBytes(a, b = 2) {
    if (!+a) return "0 Bytes";
    const c = 0 > b ? 0 : b,
      d = Math.floor(Math.log(a) / Math.log(1024));
    return `${parseFloat((a / Math.pow(1024, d)).toFixed(c))} ${
      ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"][d]
    }`;
  }

  // Normalize folder paths for duplicate checks
  function normalizePath(path) {
    if (!path) return "";
    let normalized = path.trim();

    // Remove trailing slashes/backslashes
    normalized = normalized.replace(/[\\\/]+$/, "");

    // Windows is case-insensitive
    if (navigator.platform.startsWith("Win")) {
      normalized = normalized.toLowerCase();
    }

    return normalized;
  }

  // Select folders
  const selectFolders = async () => {
    try {
      const folders = await window.electron.ipcRenderer.invoke("select-folders");
      if (folders.length > 0) {
        setSettings(prev => {
          const existing = prev.indexedFolders.map(normalizePath);
          const uniqueNewFolders = folders.filter(
            (f) => !existing.includes(normalizePath(f))
          );
          // if (uniqueNewFolders.length === 0) {
          //   setIndexingStatus(null);
          //   return prev;
          // }
          startIndex(folders);
          return {
            ...prev,
            indexedFolders: [...prev.indexedFolders, ...uniqueNewFolders],
          };
        });
      }
    } catch (error) {
      console.error("Error selecting folders:", error);
    }
  };

  useEffect(() => {
    const handleProgress = (data) => {
      if (typeof data === 'object' && data !== null) {
        // New format with progress data
        const { filename, processed, total, percentage } = data;

        if (total > 0) {
          setIndexingStatus(`Indexing: ${processed}/${total} files (${percentage}%)`);
        } else {
          setIndexingStatus(filename ? `Indexing: ${filename}` : "Indexing files...");
        }
      } else {
        // Old format - just filename string
        const filename = data || "";
        setIndexingStatus(filename ? `Indexing: ${filename}` : "Indexing files...");
      }
    };

    window.electron.ipcRenderer.on("indexing-progress", handleProgress);

    return () => {
      window.electron.ipcRenderer.removeListener("indexing-progress", handleProgress);
    };
  }, []);

  return (
      <div className="settings-view">
        <div className="settings-main">
          <div className="settings-list">
            <h2>Settings</h2>
            <ul>
              {["User", "Media", "Explorer", "Storage", "Controls", "App"].map(
                (tab) => (
                  <li
                    key={tab}
                    className={`settings-list-item ${
                      selectedTab === tab ? "settings-list-active" : ""
                    }`}
                    onClick={() => setSelectedTab(tab)}
                  >
                    <FontAwesomeIcon icon={tabIcons[tab]} />
                    <span>{tab}</span>
                  </li>
                )
              )}
            </ul>
          </div>

          <div className="settings-content">
            {selectedTab === "User" && (
              <div>
                <div className="settings-content-item settings-content-item-noalign">
                  <span>Username:</span>
                  <input
                    className="settings-content-input"
                    type="text"
                    value={settings.username}
                    onChange={handleUsernameChange}
                  />
                </div>
                <div className="settings-content-item settings-content-item-noalign">
                  <span>Birth Date:</span>
                  <input
                    className="settings-content-input"
                    type="date"
                    style={{ colorScheme: "dark" }}
                    value={settings.birthDate}
                    onChange={handleBirthDateChange}
                  />
                </div>
              </div>
            )}
            {selectedTab === "Explorer" && (
              <div>
                <div className="settings-content-item">
                  <input
                    type="checkbox"
                    checked={settings?.adjustHeicColors}
                    onChange={handleCheckboxChange('adjustHeicColors')}
                  />
                  <span>Adjust HEIC Colors</span>
                </div>
                <div className="settings-content-item">
                  <span>Default Sort:</span>
                  <select
                    value={settings?.defaultSort}
                    onChange={(e) => handleDefaultSortChange(e)}
                    className="settings-itemstyle-select"
                  >
                    <option value="id">ID (Default)</option>
                    <option value="name">Name</option>
                    <option value="create_date">Date Taken</option>
                    <option value="created">Date Created</option>
                    <option value="size">File Size</option>
                    <option value="random">Random</option>
                  </select>
                </div>
              </div>
            )}
            {selectedTab === "Media" && (
              <div>
                <div>
                  <h3>Indexed Sources</h3>
                  <FolderList folders={settings.indexedFolders} onRemoveFolder={removeFolder} folderStatuses={folderStatuses} />
                </div>
                <div>
                  <button 
                    className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                    onClick={selectFolders}
                    disabled={isIndexing}
                  >
                    Add Source
                  </button>
                  <button
                    className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                    onClick={handleRemoveAll}
                    disabled={isIndexing || settings.indexedFolders.length === 0}
                  >
                    Remove All
                  </button>
                  <button
                    className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                    onClick={() => setShowChecksPopup(true)}
                    disabled={isIndexing || settings.indexedFolders.length === 0}
                  >
                    Tools
                  </button>
                  {missingHeicFiles.length > 0 && (
                    <button
                      className="welcome-popup-select-folders-btn"
                      onClick={() => setShowHeicPopup(true)}
                    >
                      Generate HEIC Thumbnails
                    </button>
                  )}
                  {indexingStatus && (
                    <div className="welcome-popup-status">
                      <span>{indexingStatus}</span><br></br><span>Don't close the app</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {selectedTab === "Storage" && (
              <div>
                <div className="settings-content-item">
                  <span>Storage Usage:</span>
                  <button
                    className="settings-normal-button"
                    onClick={() => getUsageData()}
                  >
                    Fetch Usage
                  </button>
                  {storageUsage.app !== 0 && (
                  <div className="storage-bar-container">
                    <div className="storage-legend">
                      <span className="storage-legend-text">
                        <div className="storage-legend-app"></div>App Total:{" "}
                        {storageUsage.app > 0
                          ? formatBytes(storageUsage.app)
                          : "0 Bytes"}
                      </span>
                      <span className="storage-legend-text">
                        <div className="storage-legend-index"></div>Indexed files:{" "}
                        {storageUsage.index > 0
                          ? formatBytes(storageUsage.index)
                          : "0 Bytes"}
                      </span>
                      <span className="storage-legend-text">
                        <div className="storage-legend-thumbs"></div>Thumbnails:{" "}
                        {storageUsage.thumbnails > 0
                          ? formatBytes(storageUsage.thumbnails)
                          : "0 Bytes"}
                      </span>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            )}
            {selectedTab === "Controls" && (
              <div>
                <h3>Explorer</h3>
                <div className="settings-content-item">
                  <span>
                    Show preview:</span>{" "}
                    <span className="settings-shortcut-key">Left Mouse Button</span>
                </div>
                <div className="settings-content-item">
                  <span>
                    Open fullscreen:</span>{" "}
                    <span className="settings-shortcut-key">Double Left Mouse Button</span>
                </div>
                <div className="settings-content-item">
                  <span>
                    Open in default viewer:</span>{" "}
                    <span className="settings-shortcut-key">CTRL</span> + <span className="settings-shortcut-key">Left Mouse Button</span>
                </div>
                <div className="settings-content-item">
                  <span>
                    Navigate:</span>{" "}
                    <span className="settings-shortcut-key">SCROLL</span> or <span className="settings-shortcut-key"><FontAwesomeIcon icon={faArrowLeft} />{" "}<FontAwesomeIcon icon={faArrowUp} />{" "}<FontAwesomeIcon icon={faArrowDown} />{" "}<FontAwesomeIcon icon={faArrowRight} /></span>
                </div>
                <div className="settings-content-item">
                  <span>
                    Scale grid:</span>{" "}
                    <span className="settings-shortcut-key">CTRL</span> + <span className="settings-shortcut-key">SCROLL</span>
                </div>
                <div className="settings-content-item">
                  <span>
                    Assign last used tag to selected item:</span>{" "}
                    <span className="settings-shortcut-key">T</span>
                </div>
              </div>
            )}
            {selectedTab === "App" && (
              <div>
                <div className="settings-content-item">
                  <img width="50" src={process.env.PUBLIC_URL + "/logo-v2-orbit-bright-white-shadow-small.png"} />
                  <span>Orbit 1.1.0</span>
                </div>
                <div className="settings-content-item">
                  <span>App Location:</span>
                  <button
                    className="settings-normal-button"
                    onClick={openAppLocation}
                  >
                    Open in File Explorer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {showHeicPopup && (
          <HeicPopup
            missingFiles={missingHeicFiles}
            onClose={() => setShowHeicPopup(false)}
          />
        )}
        {showChecksPopup && (
          <div className="welcome-popup-overlay">
            <div className="welcome-popup">
              <h2>Maintenance Actions</h2>
              <p>Select which maintenance task to run:</p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
                <button className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin" 
                  onClick={() => startIndex(settings.indexedFolders)}>Reindex All</button>
                <button className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin" 
                  onClick={checkStatusses}>Check Status</button>
                <button className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                  onClick={fixIDs}>Fix IDs</button>
                <button className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                  onClick={fixThumbnails}>Fix Thumbnails</button>
              </div>
              <div className="settings-bottom-bar" style={{ height: "70px"}}>
                <button className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin" onClick={() => setShowChecksPopup(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};

export default SettingsView;
