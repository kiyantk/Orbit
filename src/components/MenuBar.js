import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsLeftRightToLine,
  faBook,
  faClipboard,
  faCog,
  faDownload,
  faFileImport,
  faListUl,
  faRectangleXmark,
  faRedo,
  faTrash,
  faUndo,
  faUpRightAndDownLeftFromCenter,
  faXmark
} from "@fortawesome/free-solid-svg-icons";

const MenuBar = ({
  onSettingsChange,
  toggleLeftPanel,
  exportNoteThruCtx,
  presetFile,
  deleteAllNotes,
  toggleFullscreen,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState(0);
  const [dropdownType, setDropdownType] = useState(null);
  const [settings, setSettings] = useState({
    userSettings: { autoSave: true }, // Default settings
  });
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        toggleDropdown(); // Call the onClose function when clicking outside
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Load settings from Electron (preload.js)
    window.electron.ipcRenderer
      .invoke("get-settings")
      .then((loadedSettings) => {
        if (loadedSettings) {
          setSettings(loadedSettings);
        }
      });
  }, []);

  // Toggle dropdown
  const toggleDropdown = (event, type) => {
    setDropdownType(type);
    if (event !== undefined) {
      setDropdownPosition(event.target.offsetLeft);
    }

    setIsDropdownOpen((prev) => !prev);
  };

  // Close the app
  const closeOrbit = () => {
    window.close();
  };

  const goTo = (destination) => {
    switch (destination) {
      case "docs":
        window.open("https://docs.kiy.li/orbit", "_blank");
        break;
      case "changelog":
        window.open("https://kiyantk.nl/dev/orbit/changelog/", "_blank");
        break;
    }
  };

  return (
    <div className="menu-bar">
      <img className="menubar-icon" src={process.env.PUBLIC_URL + "/logo-v1-orbit-bright-white-shadow-small.png"} alt="Logo" />
      <p className="menubar-app-name">Orbit</p>
      {/* <button onClick={(e) => toggleDropdown(e, "file")}>File</button>
      <button onClick={(e) => toggleDropdown(e, "edit")}>Edit</button>
      <button onClick={(e) => toggleDropdown(e, "view")}>View</button>
      <button onClick={(e) => toggleDropdown(e, "help")}>Help</button> */}
      <button className="menubar-close-btn" onClick={closeOrbit}><FontAwesomeIcon icon={faXmark}/></button>
      {/* {(isDropdownOpen && dropdownType === "file") && (
        <div className="menubar-dropdown-overlay">
          <div
            ref={menuRef}
            className={`dropdown-menu`}
            style={{ left: dropdownPosition }}
          >
            <button onClick={closeOrbit}>
              <span>Exit</span>
            </button>
          </div>
        </div>
      )}
      {isDropdownOpen && dropdownType === "edit" && (
        <div className="menubar-dropdown-overlay">
          <div
            ref={menuRef}
            className={`dropdown-menu ${
              settings?.userSettings.showMenubarIcons
                ? "dropdown-menu-with-icons"
                : ""
            } `}
            style={{ left: dropdownPosition }}
          >
          </div>
        </div>
      )}
      {isDropdownOpen && dropdownType === "view" && (
        <div className="menubar-dropdown-overlay">
          <div
            ref={menuRef}
            className={`dropdown-menu ${
              settings?.userSettings.showMenubarIcons
                ? "dropdown-menu-with-icons"
                : ""
            } `}
            style={{ left: dropdownPosition }}
          >
            <button onClick={toggleLeftPanel}>
              <FontAwesomeIcon
                icon={faArrowsLeftRightToLine}
                style={{
                  display: settings?.userSettings.showMenubarIcons
                    ? "initial"
                    : "none",
                }}
              />
              <span>Toggle Left Panel</span>
            </button>
            <button onClick={toggleFullscreen}>
              <FontAwesomeIcon
                icon={faUpRightAndDownLeftFromCenter}
                style={{
                  display: settings?.userSettings.showMenubarIcons
                    ? "initial"
                    : "none",
                }}
              />
              <span>Toggle Fullscreen</span>
            </button>
          </div>
        </div>
      )}
      {isDropdownOpen && dropdownType === "help" && (
        <div className="menubar-dropdown-overlay">
          <div
            ref={menuRef}
            className={`dropdown-menu ${
              settings?.userSettings.showMenubarIcons
                ? "dropdown-menu-with-icons"
                : ""
            } `}
            style={{ left: dropdownPosition }}
          >
            <button onClick={() => goTo("docs")}>
              <FontAwesomeIcon
                icon={faBook}
                style={{
                  display: settings?.userSettings.showMenubarIcons
                    ? "initial"
                    : "none",
                }}
              />
              <span>Documentation</span>
            </button>
            <button onClick={() => goTo("changelog")}>
              <FontAwesomeIcon
                icon={faListUl}
                style={{
                  display: settings?.userSettings.showMenubarIcons
                    ? "initial"
                    : "none",
                }}
              />
              <span>Changelog</span>
            </button>
          </div> */}
        {/* </div>
      )} */}
    </div>
  );
};

export default MenuBar;
