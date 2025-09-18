import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWindowMinimize,
  faXmark
} from "@fortawesome/free-solid-svg-icons";

const MenuBar = () => {
  // Close the app
  const closeOrbit = () => {
    window.close();
  };

  const minimizeOrbit = () => {
    window.electron.ipcRenderer.invoke("minimize-app");
  }

  return (
    <div className="menu-bar">
      <img className="menubar-icon" src={process.env.PUBLIC_URL + "/favicon.ico"} alt="Logo" />
      <p className="menubar-app-name">Orbit</p>
      {/* <button onClick={(e) => toggleDropdown(e, "file")}>File</button>
      <button onClick={(e) => toggleDropdown(e, "edit")}>Edit</button>
      <button onClick={(e) => toggleDropdown(e, "view")}>View</button>
      <button onClick={(e) => toggleDropdown(e, "help")}>Help</button> */}
      <button className="menubar-minimize-btn" onClick={minimizeOrbit}><FontAwesomeIcon icon={faWindowMinimize}/></button>
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
