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
      <button className="menubar-minimize-btn" onClick={minimizeOrbit}><FontAwesomeIcon icon={faWindowMinimize}/></button>
      <button className="menubar-close-btn" onClick={closeOrbit}><FontAwesomeIcon icon={faXmark}/></button>
    </div>
  );
};

export default MenuBar;
