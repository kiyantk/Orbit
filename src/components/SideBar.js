import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartSimple,
  faFilter,
  faGear,
  faMagnifyingGlass,
  faMap,
  faPhotoFilm,
  faSort,
} from "@fortawesome/free-solid-svg-icons";

const SideBar = ({
  onSettingsChange,
  activeView,
  activeViewChanged,
  openActionPanel,
  actionPanelType
}) => {
  const switchView = (type) => {
    activeViewChanged(type);
  };

  return (
    <div className="side-bar">
      <button className={activeView === "explore" ? 'side-bar-active' : '' } onClick={(e) => switchView("explore")}><FontAwesomeIcon icon={faPhotoFilm}/></button>
      <button className={activeView === "map" ? 'side-bar-active' : '' } onClick={(e) => switchView("map")}><FontAwesomeIcon icon={faMap}/></button>
      <button className={activeView === "stats" ? 'side-bar-active' : '' } onClick={(e) => switchView("stats")}><FontAwesomeIcon icon={faChartSimple}/></button>
      <button className={activeView === "settings" ? 'side-bar-active' : '' } onClick={(e) => switchView("settings")}><FontAwesomeIcon icon={faGear}/></button>
      {activeView === "explore" && (
        <div className="side-bar-bottom">
          <button className={actionPanelType === "sort" ? 'side-bar-active' : '' } onClick={() => openActionPanel("sort")}>
            <FontAwesomeIcon icon={faSort}/> 
          </button>
          <button className={actionPanelType === "filter" ? 'side-bar-active' : '' } onClick={() => openActionPanel("filter")}>
            <FontAwesomeIcon icon={faFilter}/>
          </button>
          <button className={actionPanelType === "search" ? 'side-bar-active' : '' } onClick={() => openActionPanel("search")}>
            <FontAwesomeIcon icon={faMagnifyingGlass}/>
          </button>
        </div>
      )}
    </div>
  );
};

export default SideBar;
