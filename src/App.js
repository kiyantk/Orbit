import React, { useState, useEffect, useCallback  } from "react";
import MenuBar from "./components/MenuBar";
import BottomBar from "./components/BottomBar";
import SideBar from "./components/SideBar";
import WelcomePopup from "./components/WelcomePopup";
import SettingsView from "./components/SettingsView";
import "./App.css";
import ExplorerView from "./components/ExplorerView";
import PreviewPanel from "./components/PreviewPanel";
import ActionPanel from "./components/ActionPanel";
import StatsView from "./components/StatsView";
import MapView from "./components/MapView";
import TagsView from "./components/TagsView";
import ShuffleView from "./components/ShuffleView";
import MemoriesView from "./components/MemoriesView";

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
  const [actionPanelType, setActionPanelType] = useState(null);
  const [filters, setFilters] = useState(null);
  const [filteredCount, setFilteredCount] = useState(null)
  const [shuffleFilters, setShuffleFilters] = useState({});
  const [mapFilters, setMapFilters] = useState({});
  const [shuffleSettings, setShuffleSettings] = useState({ shuffleInterval: 8, hideInfo: false, smoothTransition: false });
  const [explorerScroll, setExplorerScroll] = useState(0);
  const [previewPanelKey, setPreviewPanelKey] = useState(0);
  const [actionPanelKey, setActionPanelKey] = useState(0);
  const [mapViewType, setMapViewType] = useState("cluster");
  const [memoryMode, setMemoryMode] = useState(null);
  const [showTagPopup, setShowTagPopup] = useState({value: false, type: ""});
  const [explorerMode, setExplorerMode] = useState({enabled: false, value: null, type: "", existing: null});

  const handleActionPanelApply = (data) => {
    if (actionPanelType === "filter" || actionPanelType === "sort" || actionPanelType === "search") {
      setFilters(data);
    } else if (actionPanelType === "shuffle-filter") {
      setShuffleFilters(data);
    } else if (actionPanelType === "shuffle-settings") {
      setShuffleSettings(prev => ({ ...prev, ...data }));
    } else if (actionPanelType === "map-filter") {
      setMapFilters(data);
    }
  };

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

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input / textarea
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // ~ or `
      if (e.code === "Backquote") {
        e.preventDefault();
        window.electron.ipcRenderer.send("quick-minimize");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setActionPanelType(null)
  }, [activeView]);

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
      setMapViewType("cluster")
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

    const handleTagAssign = () => {
      setPreviewPanelKey(previewPanelKey + 1)
    }

    const handleExplorerScale = (newScale) => {
      setExplorerScale(newScale)
    }

    const handleActionPanelClick = (type) => {
      if(actionPanelType === null || actionPanelType !== type) {
        setActionPanelType(type)
      } else {
        setActionPanelType(null)
      }
    }

    const disableAddMode = () => {
      setFilters({});
    }

    const resetFilters = () => {
      setFilters({});
      setActionPanelKey(actionPanelKey + 1)
    }

    const handleItemDeleted = () => {
      setActionPanelKey(actionPanelKey + 1)
    }

  return (
    <div className="App">
      <div className="App-main">
        <MenuBar
        />
        <SideBar activeView={activeView} 
          activeViewChanged={setNewActiveView} 
          openActionPanel={handleActionPanelClick} 
          actionPanelType={actionPanelType}
          mapViewType={mapViewType}
          switchMapViewType={setMapViewType}
          switchMemoryMode={setMemoryMode}
          memoryMode={memoryMode}
          setShowTagPopup={setShowTagPopup}
          showTagPopup={showTagPopup}
        />
        <div className="content">
          {activeView === "settings" && (
            <SettingsView
              currentSettings={settings} // Pass current settings
              applySettings={applySettings} // Pass function to apply new settings
              folderStatuses={folderStatuses}
              checkStatusses={checkFolderStatuses}
              newTab={selectedSettingsTab}
              enterRemoveMode={() => {
                setExplorerMode({enabled: true, value: null, type: "remove"})
                setActiveView("explore");
              }}
            />
          )}
          {activeView === "stats" && (
            <StatsView birthDate={settings.birthDate} />
          )}
          {activeView === "map" && (
            <MapView mapViewType={mapViewType} filters={mapFilters} />
          )}
          {activeView === "tags" && (
            <TagsView
              onViewTag={(tag) => {
                setFilters({ tag: tag.name });
                setActiveView("explore");
              }}
              onAddMedia={(tag) => {
                setExplorerMode({ enabled: true, value: tag.id, type: "tag", existing: tag.media_ids || [] })
                // setFilters({ tagId: tag.id, addMode: true });
                setActiveView("explore");
              }} 
              showPopup={showTagPopup}
              setShowPopup={setShowTagPopup}
            />
          )}
          {activeView === "shuffle" && (
            <ShuffleView filters={shuffleFilters} interval={shuffleSettings.shuffleInterval * 1000} hideMetadata={shuffleSettings.hideInfo}
              smoothTransition={shuffleSettings.smoothTransition} />
          )}
          {activeView === "memories" && (
            <MemoriesView switchMemoryMode={setMemoryMode} memoryMode={memoryMode}
              onViewMemory={(ids) => {
                if(!settings) {
                  setFilters({ ids });
                  setActiveView("explore");
                }
                switch(settings.openMemoriesIn) {
                  case 'explorer':
                    setFilters({ ids });
                    setActiveView("explore");
                    break
                  case 'shuffle':
                    setShuffleFilters({ ids });
                    setActiveView("shuffle");
                    break
                  case 'map':
                    setMapFilters({ ids });
                    setActiveView("map");
                    break
                  default:
                    setFilters({ ids });
                    setActiveView("explore");
                    break
                }
              }}
              onAddMedia={(memory) => {
                setExplorerMode({ enabled: true, value: memory.id, type: "memory", existing: memory.existing || [] })
                setActiveView("explore");
              }}
            />
          )}
          {activeView === "explore" && (
            <div className="explorer-container">
              <ExplorerView
                currentSettings={settings} // Pass current settings
                folderStatuses={folderStatuses}
                openSettings={openMediaSettings}
                onSelect={handleExplorerSelect}
                onTagAssign={handleTagAssign}
                onScale={handleExplorerScale}
                filters={filters}
                filteredCountUpdated={setFilteredCount}
                disableAddMode={disableAddMode}
                scrollPosition={explorerScroll}
                setScrollPosition={setExplorerScroll}
                actionPanelType={actionPanelType}
                resetFilters={resetFilters}
                itemDeleted={handleItemDeleted}
                explorerMode={explorerMode}
                setExplorerMode={setExplorerMode}
                explorerScale={explorerScale}
              />
              <div className="border-l overflow-y-auto bg-gray-50">
                {selectedItem ? (
                  <PreviewPanel
                    item={selectedItem}
                    isMuted={isMuted}
                    setIsMuted={setIsMuted}
                    forceFullscreen={forceFullscreen}
                    setForceFullscreen={setForceFullscreen}
                    birthDate={settings.birthDate}
                    currentSettings={settings}
                    panelKey={previewPanelKey}
                  />
                ) : (
                  <div className="preview-center-text p-4 text-gray-400">Select a file to preview</div>
                )}
              </div>
            </div>
          )}
        </div>
        {(activeView === "explore" || activeView === "shuffle" || activeView === "map") && (
          <ActionPanel settings={settings} type={actionPanelType} activeView={activeView} activeFilters={filters} activeShuffleFilters={shuffleFilters} activeMapFilters={mapFilters} activeShuffleSettings={shuffleSettings} onApply={handleActionPanelApply} actionPanelKey={actionPanelKey}/>
        )}
        <div>
          {showWelcomePopup && (
            <WelcomePopup
              submitWelcomePopup={applyWelcomeData} // Pass function to apply new settings
            />
          )}
        </div>
        <BottomBar
          explorerScale={explorerScale}
          filteredCount={filteredCount}
          activeView={activeView}
        />
      </div>
    </div>
  );
};

export default App;
