import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowsLeftRightToLine,
  faBook,
  faClipboard,
  faCog,
  faDownload,
  faFileImport,
  faGear,
  faListUl,
  faMap,
  faPhotoFilm,
  faRectangleXmark,
  faRedo,
  faTrash,
  faUndo,
  faUpRightAndDownLeftFromCenter,
  faXmark
} from "@fortawesome/free-solid-svg-icons";

const SideBar = ({
  onSettingsChange,
  activeView,
  activeViewChanged
}) => {
  const switchView = (type) => {
    activeViewChanged(type);
  };

  return (
    <div className="side-bar">
      <button className={activeView === "explore" ? 'side-bar-active' : '' } onClick={(e) => switchView("explore")}><FontAwesomeIcon icon={faPhotoFilm}/></button>
      <button className={activeView === "map" ? 'side-bar-active' : '' } onClick={(e) => switchView("map")}><FontAwesomeIcon icon={faMap}/></button>
      <button className={activeView === "settings" ? 'side-bar-active' : '' } onClick={(e) => switchView("settings")}><FontAwesomeIcon icon={faGear}/></button>
    </div>
  );
};

export default SideBar;
