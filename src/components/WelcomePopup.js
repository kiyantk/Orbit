import React, { useState, useEffect } from "react";
import FolderList from "./FolderList";

const WelcomePopup = ({ submitWelcomePopup }) => {
  const [welcomePopupContent, setWelcomePopupContent] = useState({
    username: null,
    selectedFolders: []
  });
  const [indexingStatus, setIndexingStatus] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);
  const [currentFile, setCurrentFile] = useState("");

  // Select folders
  const selectFolders = async () => {
    try {
      const folders = await window.electron.ipcRenderer.invoke("select-folders");
      if (folders.length > 0) {
        setWelcomePopupContent((prev) => {
          const existing = prev.selectedFolders.map(normalizePath);
          const uniqueNewFolders = folders.filter(
            (f) => !existing.includes(normalizePath(f))
          );
          if (uniqueNewFolders.length === 0) {
            setIndexingStatus("No new folders were added (duplicates ignored).");
            return prev;
          }
          return {
            ...prev,
            selectedFolders: [...prev.selectedFolders, ...uniqueNewFolders],
          };
        });
      }
    } catch (error) {
      console.error("Error selecting folders:", error);
    }
  };

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

  // Remove folder from selection
  const removeFolder = (folderPath) => {
    setWelcomePopupContent(prev => ({
      ...prev,
      selectedFolders: prev.selectedFolders.filter(folder => folder !== folderPath)
    }));
  };

  // Submit welcome form and index files
  const saveSettings = async () => {
    if (welcomePopupContent.selectedFolders.length === 0) {
      setIndexingStatus("Please select at least one folder to index");
      return;
    }

    setIsIndexing(true);
    // setIndexingStatus("Indexing files...");
    
    try {
      // Index the selected folders
      const result = await window.electron.ipcRenderer.invoke("index-files", welcomePopupContent.selectedFolders);
      
      if (result.success) {
        setIndexingStatus("Files indexed successfully!");
        
        // Get the count of indexed files
        const fileCount = await window.electron.ipcRenderer.invoke("get-indexed-files-count");
        setIndexingStatus(`Indexed ${fileCount} files successfully!`);
        
        // Submit the welcome data (including folders)
        submitWelcomePopup(welcomePopupContent);
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




  // Update stored edit version due to username change
  const handleUsernameInputChange = (event) => {
    setWelcomePopupContent(prev => ({
      ...prev,
      username: event.target.value
    }));
  };

  return (
    <div className="welcome-popup-overlay">
      <div className="welcome-popup">
        <div className="welcome-popup-top">
          <div className="welcome-popup-inline">
            <img className="welcome-popup-icon" src={process.env.PUBLIC_URL + "/logo-v1-orbit-bright-white-shadow-small.png"} alt="Logo" />
            <h2>Orbit</h2>
          </div>
        </div>
        <div className="welcome-popup-content">
          <div className="editnote-popup-item">
            <span className="welcome-popup-folders-explaining">
              Select one or more folders to index. Orbit will scan these folders.<br></br>
              The index will be stored locally on your device.
            </span>
            {/* <span>Folders to Index</span> */}
            <div className="welcome-popup-folders-container">
              <button 
                className="welcome-popup-select-folders-btn"
                onClick={selectFolders}
                disabled={isIndexing}
              >
                Select Folders
              </button>
              
              {welcomePopupContent.selectedFolders.length > 0 && (
                <FolderList folders={welcomePopupContent.selectedFolders} onRemoveFolder={removeFolder} />
              )}
            </div>
          </div>
          
          {indexingStatus && (
  <div className="welcome-popup-status">
    <span>{indexingStatus}</span><br></br><span>Don't close the app</span>
  </div>
)}

        </div>
        <div className="settings-bottom-bar">
          <button 
            className="settings-save-btn" 
            onClick={saveSettings}
            disabled={isIndexing || welcomePopupContent.selectedFolders.length === 0}
          >
            {isIndexing ? "Indexing..." : "Proceed & Index Files"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomePopup;
