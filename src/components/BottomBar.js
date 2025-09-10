import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRotate,
  faToggleOn,
  faCheck,
  faToggleOff,
  faQuestion,
  faStarOfLife,
  faPhotoFilm,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";

const BottomBar = ({ explorerScale }) => {

  const [photoCount, setPhotoCount] = useState(0);
// Fetch photo count
  useEffect(() => {
    const fetchPhotoCount = async () => {
      try {
        if (window.electron.ipcRenderer) {
          const count = await window.electron.ipcRenderer.invoke("get-indexed-files-count");
          setPhotoCount(count);
        }
      } catch (err) {
        console.error("Failed to fetch photo count:", err);
      }
    };

    fetchPhotoCount();

    // Optional: refresh count every 10s
    const interval = setInterval(fetchPhotoCount, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bottom-bar">
      <div className="bottom-bar-left">
        <div className="bottom-bar-media-counter"><FontAwesomeIcon icon={faPhotoFilm} /><span>{photoCount}</span></div>
      </div>

      <div className="bottom-bar-right">
        { Number(explorerScale) !== 1 ? (
          <div className="bottom-bar-scale-counter">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <span>{Number(explorerScale * 100).toFixed(0) + '%'}</span>
          </div>
        ) : ('') }
      </div>
    </div>
  );
};

export default BottomBar;
