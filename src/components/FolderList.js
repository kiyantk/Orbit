import { faCircle, faCircleCheck, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";


const FolderList = ({ folders, isDisabled, onRemoveFolder, folderStatuses }) => {
  return (
    <div className="welcome-popup-selected-folders">
      <span className="welcome-popup-folders-label">Selected folders:</span>
      {folders.length > 0 ? (
        folders.map((folder, index) => {
          const isAvailable = folderStatuses?.[folder];
          return (
            <div key={index} className="welcome-popup-folder-item">
              <span className="welcome-popup-folder-status">
                {isAvailable === true && (
                  // <CheckCircle className="text-green-500 w-4 h-4 mr-2" />
                  <span style={{ color: "#03c503", marginRight: "6px" }} title="Folder available"><FontAwesomeIcon icon={faCircleCheck}/></span>
                )}
                {isAvailable === false && (
                  // <XCircle className="text-red-500 w-4 h-4 mr-2" />
                  <span style={{ color: "#d75858", marginRight: "6px" }} title="Folder unavailable"><FontAwesomeIcon icon={faCircleXmark}/></span>
                )}
                {isAvailable === undefined && (
                  <span style={{ marginRight: "6px" }}><FontAwesomeIcon icon={faCircle}/></span> // neutral placeholder
                )}
              </span>

              <span className="welcome-popup-folder-path">{folder}</span>

              <button
                className="welcome-popup-remove-folder"
                onClick={() => onRemoveFolder(folder)}
                disabled={isDisabled}
              >
                ×
              </button>
            </div>
          );
        })
      ) : (
        <span>No folders selected</span>
      )}
    </div>
  );
};

export default FolderList;
