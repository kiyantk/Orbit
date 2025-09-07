import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDisplay,
  faHardDrive,
  faImages,
  faKeyboard,
  faPencil,
  faToolbox,
  faTriangleExclamation,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import FolderList from "./FolderList";

const SettingsView = ({
  currentSettings,
  applySettings,
  folderStatuses,
  checkStatusses
}) => {
  const [selectedTab, setSelectedTab] = useState("User");
  const [settings, setSettings] = useState(currentSettings);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState("");
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [currentFile, setCurrentFile] = useState("");

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
          console.log(data)
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

  // Set local settings
  const handleCheckboxChange = (event) => {
    setSettings((prev) => ({
      ...prev,
      userSettings: {
        ...prev.userSettings,
        autoSave: event.target.checked,
      },
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

useEffect(() => {
  if (settings?.username !== undefined) {
    saveSettings(settings);
  }
}, [settings.username]);

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
    Media: faImages,
    Storage: faHardDrive,
    Shortcuts: faKeyboard,
    App: faToolbox,
  };

  // Open app location in File Explorer
  const openAppLocation = () => {
    window.electron.ipcRenderer.invoke("open-orbit-location");
  };

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
          if (uniqueNewFolders.length === 0) {
            setIndexingStatus(null);
            return prev;
          }
          startIndex(uniqueNewFolders);
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
      const filename = data || "";
      setCurrentFile(filename);
      setIndexingStatus(filename ? `Indexing: ${filename}` : "Indexing files...");
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
              {["User", "Media", "Storage", "Shortcuts", "App"].map(
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
              </div>
            )}
            {selectedTab === "Media" && (
              <div>
                <div>
                  <span>Indexed Folders</span>
                  <FolderList folders={settings.indexedFolders} onRemoveFolder={removeFolder} folderStatuses={folderStatuses} />
                </div>
                <div>
                  <button 
                    className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                    onClick={selectFolders}
                    disabled={isIndexing}
                  >
                    Add Folders
                  </button>
                  <button
                    className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                    onClick={() => startIndex(settings.indexedFolders)}
                    disabled={isIndexing || settings.indexedFolders.length === 0}
                  >
                    Reindex All
                  </button>
                  <button
                    className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                    onClick={async () => {
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
                    }}
                    disabled={isIndexing || settings.indexedFolders.length === 0}
                  >
                    Remove All
                  </button>
                  <button 
                    className="welcome-popup-select-folders-btn welcome-popup-select-folders-btn-margin"
                    onClick={checkStatusses}
                    disabled={isIndexing}
                  >
                    Check Status
                  </button>
                  {indexingStatus && (
                    <div className="welcome-popup-status">
                      <span>{indexingStatus}</span>
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
                </div>
              </div>
            )}
            {selectedTab === "Shortcuts" && (
              <div>
                <div className="settings-content-item">
                  <span>
                    Save opened note:{" "}
                    <span className="settings-shortcut-key">CTRL</span> +{" "}
                    <span className="settings-shortcut-key">S</span>
                  </span>
                </div>
                <div className="settings-content-item">
                  <span>
                    Refresh: <span className="settings-shortcut-key">CTRL</span>{" "}
                    + <span className="settings-shortcut-key">R</span>
                  </span>
                </div>
                <div className="settings-content-item">
                  <span>
                    New Note:{" "}
                    <span className="settings-shortcut-key">CTRL</span> +{" "}
                    <span className="settings-shortcut-key">T</span>
                  </span>
                </div>
                <div className="settings-content-item">
                  <span>
                    Close Note:{" "}
                    <span className="settings-shortcut-key">CTRL</span> +{" "}
                    <span className="settings-shortcut-key">W</span>
                  </span>
                </div>
              </div>
            )}
            {selectedTab === "App" && (
              <div>
                <div className="settings-content-item">
                  <span>Orbit 1.0.0</span>
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
      </div>
  );
};

export default SettingsView;
