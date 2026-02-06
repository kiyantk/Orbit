import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartSimple,
  faFilter,
  faGear,
  faMagnifyingGlass,
  faMap,
  faPhotoFilm,
  faShuffle,
  faSliders,
  faSort,
  faTag,
  faTags,
} from "@fortawesome/free-solid-svg-icons";

const SideBar = ({
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
      <button className={`side-bar-btn ${activeView === "explore" ? "side-bar-active" : ""}`} onClick={() => switchView("explore")}>
        <FontAwesomeIcon icon={faPhotoFilm}/>
        <span className="tooltip">Explore</span>
      </button>
      <button className={`side-bar-btn ${activeView === "map" ? "side-bar-active" : ""}`} onClick={() => switchView("map")}>
        <FontAwesomeIcon icon={faMap}/>
        <span className="tooltip">Map</span>
        </button>
      <button className={`side-bar-btn ${activeView === "stats" ? "side-bar-active" : ""}`} onClick={() => switchView("stats")}>
        <FontAwesomeIcon icon={faChartSimple}/>
        <span className="tooltip">Stats</span>
        </button>
      <button className={`side-bar-btn ${activeView === "tags" ? "side-bar-active" : ""}`} onClick={() => switchView("tags")}>
        <FontAwesomeIcon icon={faTags}/>
        <span className="tooltip">Tags</span>
        </button>
      <button className={`side-bar-btn ${activeView === "shuffle" ? "side-bar-active" : ""}`} onClick={() => switchView("shuffle")}>
        <FontAwesomeIcon icon={faShuffle}/>
        <span className="tooltip">Shuffle</span>
        </button>
      <button className={`side-bar-btn ${activeView === "settings" ? "side-bar-active" : ""}`} onClick={() => switchView("settings")}>
        <FontAwesomeIcon icon={faGear}/>
        <span className="tooltip">Settings</span>
        </button>
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
      {activeView === "shuffle" && (
        <div className="side-bar-bottom">
          <button className={actionPanelType === "shuffle-filter" ? 'side-bar-active' : '' } onClick={() => openActionPanel("shuffle-filter")}>
            <FontAwesomeIcon icon={faFilter}/>
          </button>
          <button className={actionPanelType === "shuffle-settings" ? 'side-bar-active' : '' } onClick={() => openActionPanel("shuffle-settings")}>
            <FontAwesomeIcon icon={faSliders}/>
          </button>
        </div>
      )}
    </div>
  );
};

export default SideBar;
