import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

const ContextMenu = ({ x, y, item, onClose, revealFromContextMenu }) => {
  const menuRef = useRef(null);
  const [showTags, setShowTags] = useState(false);
  const [tags, setTags] = useState([]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Load tags when submenu opens
  useEffect(() => {
    if (showTags) {
      window.electron.ipcRenderer.invoke("tags:get-all").then((res) => {
        setTags(res || []);
      });
    }
  }, [showTags]);

  const getContrastColor = (hex) => {
    if (!hex) return "#000";
    const c = hex.substring(1);
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 150 ? "#000" : "#fff";
  };

  // Toggle tag assignment for current item
  const handleTagToggle = async (tag) => {
    const isTagged = Array.isArray(tag.media_ids)
      ? tag.media_ids.includes(item.id)
      : false;

    if (isTagged) {
      // Untag
      await window.electron.ipcRenderer.invoke("tag:remove-item", {
        tagId: tag.id,
        mediaId: item.id,
      });
      setTags((prev) =>
        prev.map((t) =>
          t.id === tag.id
            ? { ...t, media_ids: t.media_ids.filter((id) => id !== item.id) }
            : t
        )
      );
    } else {
      // Tag
      await window.electron.ipcRenderer.invoke("tag:add-item", {
        tagId: tag.id,
        mediaId: item.id,
      });
      setTags((prev) =>
        prev.map((t) =>
          t.id === tag.id
            ? { ...t, media_ids: [...(t.media_ids || []), item.id] }
            : t
        )
      );
    }
  };

  const revealFromCtx = () => {
    revealFromContextMenu(item);
    onClose();
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: y,
        left: x,
        height: "fit-content",
        backgroundColor: "#1c1a22",
        color: "white",
        border: "1px solid #3a3645",
        borderRadius: 6,
        zIndex: 2000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        display: "flex",
        userSelect: "none",
      }}
      onMouseLeave={() => setShowTags(false)}
    >
      {/* Main context menu */}
      <div
        style={{
          minWidth: 150,
          padding: "6px 0px 24px 0px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "6px 12px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
          className="context-menu-item"
          onMouseEnter={() => setShowTags(false)}
          onClick={() => revealFromCtx()}
        >
          Reveal in all <FontAwesomeIcon style={{ float: "right",  }} icon={faArrowRight} />
        </div>
        <div
          style={{
            padding: "6px 12px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            textAlign: "left",
            backgroundColor: showTags ? "#2d2a35" : "transparent",
          }}
          className="context-menu-item"
          onMouseEnter={() => setShowTags(true)}
        >
          Add Tag <FontAwesomeIcon style={{ float: "right" }} icon={faArrowRight} />
        </div>
        <span style={{position: "absolute",bottom: "4px", left: "8px",color:"gray", fontSize: "10px", marginTop: "5px"}}>{ item.filename }</span>
      </div>

      {/* Tag submenu */}
      {showTags && (
        <div
          style={{
            minWidth: 200,
            maxHeight: 200,
            overflowY: "auto",
            backgroundColor: "#2d2a35",
            borderLeft: "1px solid #3a3645",
            padding: "6px 0",
          }}
        >
          {tags.length === 0 && (
            <div style={{ padding: "6px 12px", opacity: 0.6 }}>
              No tags found
            </div>
          )}
          {tags.map((tag) => {
            const isTagged = Array.isArray(tag.media_ids)
              ? tag.media_ids.includes(item.id)
              : false;

            return (
              <label
                key={tag.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 12px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={isTagged}
                  onChange={() => handleTagToggle(tag)}
                />
                <span
                  className="tag-pill"
                  style={{
                    backgroundColor: tag.color || "#555",
                    color: getContrastColor(tag.color),
                    marginRight: 4,
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  {tag.name}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ContextMenu;
