import React, { useState, useEffect, useCallback  } from "react";
import MenuBar from "./components/MenuBar";
import BottomBar from "./components/BottomBar";
import SideBar from "./components/SideBar";
import WelcomePopup from "./components/WelcomePopup";
import SettingsView from "./components/SettingsView";
import "./App.css";
import ExplorerView from "./components/ExplorerView";
import PreviewPanel from "./components/PreviewPanel";

const App = () => {
    const [settings, setSettings] = useState(null);
    const [showWelcomePopup, setShowWelcomePopup] = useState(false);
    const [activeView, setActiveView] = useState(null);
    const [folderStatuses, setFolderStatuses] = useState({}); // { "C:/path": true/false }
    const [selectedSettingsTab, setSelectedSettingsTab] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isMuted, setIsMuted] = useState(true); // session-wide mute state
    const [forceFullscreen, setForceFullscreen] = useState(false);
    const [explorerScale, setExplorerScale] = useState(1);

    useEffect(() => {
    // Load settings from Electron (preload.js)
    window.electron.ipcRenderer
      .invoke("get-settings")
      .then(async (loadedSettings) => {
        if (loadedSettings) {
          setSettings(loadedSettings);
        }
      });
  }, []);

  const checkFolderStatuses = useCallback(async () => {
    if (!settings?.indexedFolders?.length) return;

    try {
      const statuses = await window.electron.ipcRenderer.invoke(
        "check-folders",
        settings.indexedFolders
      );
      // Expecting { "C:/path": true, "D:/external": false }
      setFolderStatuses(statuses);
    } catch (error) {
      console.error("Error checking folder statuses:", error);
    }
  }, [settings]);

  // Run check every minute
  useEffect(() => {
    if (!settings) return;
    checkFolderStatuses(); // Initial run

    const interval = setInterval(checkFolderStatuses, 60 * 1000);
    return () => clearInterval(interval);
  }, [settings, checkFolderStatuses]);

  // Run check when switching views
  useEffect(() => {
    if (settings) {
      checkFolderStatuses();
    }
  }, [activeView, settings, checkFolderStatuses]);

    // Check if user has seen Welcome Popup on mount & check username
    useEffect(() => {
      if (settings && settings.welcomePopupSeen === false) {
        setShowWelcomePopup(true);
      } else if(activeView === null) {
        setActiveView('explore')
      }
    }, [settings]);

    const applyWelcomeData = async (welcomeData) => {
        const newConfig = { ...settings };
        newConfig.welcomePopupSeen = true;
        newConfig.username = null;
        newConfig.indexedFolders = welcomeData.selectedFolders || [];
        setSettings(newConfig);
        try {
          const response = await window.electron.ipcRenderer.invoke(
            "save-settings",
            newConfig
          );
          if (!response.success) {
            console.error("Failed to save settings:", response.error);
          }
        } catch (error) {
          console.error("Error saving settings:", error);
        }
        setShowWelcomePopup(false);
        setActiveView('explore');
    };

    const setNewActiveView = (view) => {
      setActiveView(view)
    }

    // Apply new settings from Settings popup
    const applySettings = (newSettings) => {
      setSettings(newSettings); // Update state
    };

    // Apply new settings from Settings popup
    const openMediaSettings = () => {
      setActiveView('settings');
      setSelectedSettingsTab('Media');
    };

    const handleExplorerSelect = (item, type) => {
      setSelectedItem(item);

      if (type === "double") {
        setForceFullscreen(true); // tell PreviewPanel to open fullscreen
      } else {
        setForceFullscreen(false);
      }
    };

    const handleExplorerScale = (newScale) => {
      setExplorerScale(newScale)
    }

  return (
    <div className="App">
      <div className="App-main">
        <MenuBar
        />
        <SideBar activeView={activeView} activeViewChanged={setNewActiveView} />
        <div className="content">
          {activeView === "settings" && (
            <SettingsView
              currentSettings={settings} // Pass current settings
              applySettings={applySettings} // Pass function to apply new settings
              folderStatuses={folderStatuses}
              checkStatusses={checkFolderStatuses}
              newTab={selectedSettingsTab}
            />
          )}
          {activeView === "explore" && (
            <div className="explorer-container">
              <ExplorerView
                currentSettings={settings} // Pass current settings
                folderStatuses={folderStatuses}
                openSettings={openMediaSettings}
                onSelect={handleExplorerSelect}
                onScale={handleExplorerScale}
              />
              <div className="border-l overflow-y-auto bg-gray-50">
                {selectedItem ? (
                  <PreviewPanel
                    item={selectedItem}
                    isMuted={isMuted}
                    setIsMuted={setIsMuted}
                    forceFullscreen={forceFullscreen}
                    setForceFullscreen={setForceFullscreen}
                  />
                ) : (
                  <div className="preview-center-text p-4 text-gray-400">Select a file to preview</div>
                )}
              </div>
            </div>
          )}
        </div>
        <div>
          {showWelcomePopup && (
            <WelcomePopup
              submitWelcomePopup={applyWelcomeData} // Pass function to apply new settings
            />
          )}
        </div>
        <BottomBar
          explorerScale={explorerScale}
        />
      </div>
    </div>
  );
};

export default App;
