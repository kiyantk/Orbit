// ExplorerView.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { FixedSizeGrid as Grid } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";
import "./ExplorerView.css"; // optional, add styles you like
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faVideo } from "@fortawesome/free-solid-svg-icons";

const BASE_COLUMN_WIDTH = 130; 
const BASE_ROW_HEIGHT = 130;
const GUTTER = 10;
const PAGE_SIZE = 200; // fetch 200 items per page

const ExplorerView = ({ currentSettings, folderStatuses, openSettings, onSelect, onScale, filters }) => {
  const [settings, setSettings] = useState(currentSettings);
  const [totalCount, setTotalCount] = useState(null);
  const [items, setItems] = useState({}); // map index -> item
  const loadingPages = useRef(new Set());
  const [scale, setScale] = useState(1); // 1 = 100%, 2 = 200%, etc.
  const [selectedItem, setSelectedItem] = useState(null);

  // Listen for ctrl+scroll
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault(); // stop browser zoom
        setScale((prev) => {
          const next = prev + (e.deltaY < 0 ? 0.1 : -0.1);
          const clamped = Math.min(3, Math.max(0.5, next));
          onScale(clamped.toFixed(2));
          return clamped;
        });
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    // Load settings on mount (you already do this elsewhere but keep for safety)
    window.electron.ipcRenderer.invoke("get-settings").then((loadedSettings) => {
      if (loadedSettings) setSettings(loadedSettings);
    });

    // Get total count
    window.electron.ipcRenderer.invoke("get-indexed-files-count").then((count) => {
      setTotalCount(Number(count || 0));
    });
  }, [currentSettings]);

  // Helper: fetch a page containing the given index
  const fetchPageForIndex = useCallback(
    async (index) => {
      const pageIndex = Math.floor(index / PAGE_SIZE);
      if (loadingPages.current.has(pageIndex)) return;
      loadingPages.current.add(pageIndex);

      const offset = pageIndex * PAGE_SIZE;
      try {
        const res = await window.electron.ipcRenderer.invoke("fetch-files", {
          offset,
          limit: PAGE_SIZE,
          filters: filters || {},
        });
        loadingPages.current.delete(pageIndex);

        if (!res || !res.success) return;

        // Map returned rows into items map
        setItems((prev) => {
          const copy = { ...prev };
          res.rows.forEach((row, i) => {
            const idx = offset + i;
            copy[idx] = row;
          });
          return copy;
        });
      } catch (err) {
        loadingPages.current.delete(pageIndex);
        console.error("fetchPage error", err);
      }
    },
    [filters]
  );

  // is item loaded
  const isItemLoaded = (index) => !!items[index];

  // react-window-infinite-loader required functions
  const loadMoreItems = useCallback(
    (startIndex, stopIndex) => {
      // fetch all pages that the start..stop range intersects
      const promises = [];
      const startPage = Math.floor(startIndex / PAGE_SIZE);
      const endPage = Math.floor(stopIndex / PAGE_SIZE);
      for (let p = startPage; p <= endPage; p++) {
        promises.push(fetchPageForIndex(p * PAGE_SIZE));
      }
      return Promise.all(promises);
    },
    [fetchPageForIndex]
  );

  // compute number of columns based on container width
  const gridRef = useRef(null);
  const nodeRef = useRef(null);

const containerRef = useCallback((node) => {
  nodeRef.current = node;
  if (node) setContainerWidth(node.offsetWidth - 30);
}, []);

// Add this function
const fetchTotalCount = useCallback(async () => {
  try {
    const count = await window.electron.ipcRenderer.invoke("get-filtered-files-count", { filters });
    setTotalCount(Number(count || 0));
  } catch (err) {
    console.error("fetchTotalCount error", err);
  }
}, [filters]);


// Add this useEffect inside ExplorerView.jsx
useEffect(() => {
  // Reset items and loaded pages
  setItems({});
  loadingPages.current.clear();
  setTotalCount(null);

  // Fetch total count first, then first page
  fetchTotalCount().then(() => {
    fetchPageForIndex(0);
  });
}, [filters, fetchPageForIndex, fetchTotalCount]);


  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const updateWidth = () => {
      if (nodeRef.current) {
        setContainerWidth(nodeRef.current.offsetWidth - 30);
      }
    };

    updateWidth(); // initial measurement
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);
  
  const handleSelect = (item, type) => {
    onSelect(item, type)
    setSelectedItem(item)
  }

  const handleClick = (e, item) => {
    if (!folderStatuses[item.folder_path]) return;

    if (e.ctrlKey) {
      // Shift + click -> open in default photo viewer
      window.electron.ipcRenderer.invoke("open-in-default-viewer", item.path);
    } else {
      // Regular single click -> open preview
      handleSelect(item, "single");
    }
  };

  const columnWidth = BASE_COLUMN_WIDTH * scale;
  const rowHeight = BASE_ROW_HEIGHT * scale;
  const columnCount = Math.max(1, Math.floor(containerWidth / (columnWidth + GUTTER)));
  const rowCount = totalCount ? Math.ceil(totalCount / columnCount) : 0;

    useEffect(() => {
  const handleKeyDown = (e) => {
    if (!selectedItem) return;

    const currentIndex = Object.keys(items).find(
      (k) => items[k]?.id === selectedItem.id
    );
    if (currentIndex == null) return;
    const idx = Number(currentIndex);

    let nextIndex = idx;
    if (e.key === "ArrowRight") {
      nextIndex = idx + 1;
    } else if (e.key === "ArrowLeft") {
      nextIndex = idx - 1;
    } else if (e.key === "ArrowDown") {
      nextIndex = idx + columnCount;
    } else if (e.key === "ArrowUp") {
      nextIndex = idx - columnCount;
    } else {
      return;
    }

    e.preventDefault();
    if (nextIndex < 0 || nextIndex >= totalCount) return;

    const nextItem = items[nextIndex];
    if (nextItem) {
      setSelectedItem(nextItem);
      onSelect(nextItem, "single");
    }

    // ensure it scrolls into view
    const rowIndex = Math.floor(nextIndex / columnCount);
    const colIndex = nextIndex % columnCount;
    gridRef.current?.scrollToItem({
      rowIndex,
      columnIndex: colIndex,
      align: "smart",
    });
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [selectedItem, items, columnCount, totalCount, onSelect]);

  function formatTimestamp(timestamp) {
      if(!timestamp) return ''
      // Convert seconds to milliseconds
      const date = new Date(timestamp * 1000);

      // Pad function to add leading zeros
      const pad = (n) => n.toString().padStart(2, '0');

      const day = pad(date.getDate());
      const month = pad(date.getMonth() + 1); // Months are 0-indexed
      const year = date.getFullYear();

      const hours = pad(date.getHours());
      const minutes = pad(date.getMinutes());
      const seconds = pad(date.getSeconds());

      return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  }

  // render each cell
  const Cell = ({ columnIndex, rowIndex, style }) => {
  const index = rowIndex * columnCount + columnIndex;
  if (!totalCount || index >= totalCount) return null;

  const item = items[index];

  if (!item) {
    return (
      <div style={{ ...style, padding: 8 }}>
        <div
          className="thumb-skeleton"
          style={{ width: "100%", height: rowHeight - 16, borderRadius: 6 }}
        />
      </div>
    );
  }

  const folderAvailable = folderStatuses[item.folder_path];

  const thumbSrc = item.thumbnail_path ? `orbit://thumbs/${item.id}_thumb.jpg` : null;

  return (
    <div style={{ ...style, padding: 8, boxSizing: "border-box", textAlign: "center", cursor: "pointer" }} 
      className={(selectedItem && item.id === selectedItem.id ? 'thumb-selected' : 'thumb-item')}
      onClick={(e) => folderAvailable && handleClick(e, item)}
      onDoubleClick={() => folderAvailable && handleSelect(item, "double")}>
      <div
        className="thumb-card"
        title={`${item.filename}\n${formatTimestamp(item.create_date) || formatTimestamp(item.created) || ""}`}
        style={{ width: "100%", height: rowHeight - 36 }} // leave space for filename
      >
        {thumbSrc ? (
          <img
            alt={item.filename}
            src={thumbSrc}
            style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 6 }}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = ""; // optional fallback
            }}
            draggable={false}
          />
        ) : (
          <div className="thumb-no-image">No preview</div>
        )}
        { item.file_type === "video" && (
          <div className="thumb-video-indicator"><FontAwesomeIcon icon={faVideo} /></div>
        ) }

        {/* Overlay warning if folder unavailable */}
        {!folderAvailable && (
          <div
            className="thumb-video-unavailable"
          >
            Unavailable
          </div>
        )}
      </div>
      {/* Filename under the thumbnail */}
      <div
        className="thumb-filename"
        title={item.filename}
        style={{
          marginTop: 4,
          fontSize: 12,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {item.filename}
      </div>
    </div>
  );
};


  // If we know there are no files, show settings hint
  if (totalCount === 0) {
    return (
      <div className="explorer-view empty" style={{ padding: 40 }}>
        <h2>No indexed files</h2>
        <br></br>
        <p>
          You don't have any indexed photos or videos yet.<br></br><br></br>Please add at least one folder with images or
          videos in <strong>Settings <FontAwesomeIcon className="explorer-arrow-right" icon={faArrowRight} /> Media</strong> to see them here.
        </p>
        <br></br>
        <button className="welcome-popup-select-folders-btn" onClick={openSettings}>Open Settings</button>
      </div>
    );
  }

  if (totalCount === null) {
    return <div style={{ padding: 20 }}>Loading…</div>;
  }

  // Height of grid: compute available viewport height (or give a fixed height)
  // We'll fill remaining height; for simplicity, use 100% height of container
  const gridHeight = Math.max(400, window.innerHeight - 160);

  return (
    <div className="explorer-view" ref={containerRef} style={{ height: "100%", width: "100%" }}>
      <div className="explorer-main" style={{ height: "100%", padding: 12 }}>
        <InfiniteLoader
          isItemLoaded={(index) => isItemLoaded(index)}
          itemCount={totalCount}
          loadMoreItems={loadMoreItems}
          threshold={columnCount * 4} // prefetch a few rows
        >
          {({ onItemsRendered, ref }) => (
            <Grid
              key={`${filters ? JSON.stringify(filters) : "nofilter"}-${scale}-${totalCount}`}
              ref={(grid) => {
                ref(grid);
                gridRef.current = grid;
              }}
              columnCount={columnCount}
              columnWidth={columnWidth + GUTTER}
              height={gridHeight}
              rowCount={rowCount}
              rowHeight={rowHeight}
              width={containerWidth}
              onItemsRendered={({ visibleRowStartIndex, visibleRowStopIndex, visibleColumnStartIndex, visibleColumnStopIndex }) => {
                // translate Grid visible indices into linear indices for InfiniteLoader
                const startIndex = visibleRowStartIndex * columnCount + visibleColumnStartIndex;
                const stopIndex = visibleRowStopIndex * columnCount + visibleColumnStopIndex;
                onItemsRendered({ overscanStartIndex: startIndex, overscanStopIndex: stopIndex, visibleStartIndex: startIndex, visibleStopIndex: stopIndex });
              }}
            >
              {Cell}
            </Grid>
          )}
        </InfiniteLoader>
      </div>
    </div>
  );
};

export default ExplorerView;
