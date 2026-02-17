// ExplorerView.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { FixedSizeGrid as Grid } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";
import "./ExplorerView.css"; // optional, add styles you like
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faVideo, faXmark } from "@fortawesome/free-solid-svg-icons";
import ContextMenu from "./ContextMenu";
import { SnackbarProvider, enqueueSnackbar } from "notistack";

const BASE_COLUMN_WIDTH = 130; 
const BASE_ROW_HEIGHT = 130;
const GUTTER = 10;
const PAGE_SIZE = 200; // fetch 200 items per page
const FIRST_PAGE_SIZE = 200; // smaller batch for fast first render

const ExplorerView = ({ currentSettings, folderStatuses, openSettings, onSelect, onTagAssign, onScale, filters, filteredCountUpdated,
  scrollPosition, setScrollPosition, actionPanelType, resetFilters, itemDeleted, explorerMode, setExplorerMode, explorerScale }) => {
  const [totalCount, setTotalCount] = useState(null);
  const loadingPages = useRef(new Set());
  const [scale, setScale] = useState(Number(explorerScale) || 1); // 1 = 100%, 2 = 200%, etc.
  const [selectedItem, setSelectedItem] = useState(null);
  const itemsRef = useRef({});
  const idToIndex = useRef(new Map());
  const [, forceUpdate] = useState(0); // trigger re-render when itemsRef changes
  const [addModeSelected, setAddModeSelected] = useState(new Set());
  const [removeModeSelected, setRemoveModeSelected] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [tags, setTags] = useState([]);
  const [itemToReveal, setItemToReveal] = useState(null);
  const anchorIndexRef = useRef(0);
  const isRestoringScrollRef = useRef(false);
  const [noGutters, setNoGutters] = useState(false);

  // --- Fetch pages into refs ---
  const addItems = (rows, offset) => {
    rows.forEach((row, i) => {
      const idx = offset + i;
      itemsRef.current[idx] = row;
      idToIndex.current.set(row.id, idx);
    });
    forceUpdate(x => x + 1);
  };

  const handleAddModeClick = (item) => {
  setAddModeSelected((prev) => {
    const newSet = new Set(prev);
    if (newSet.has(item.id)) {
      newSet.delete(item.id);
    } else {
      newSet.add(item.id);
    }
    return newSet;
  });
};

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
    // window.electron.ipcRenderer.invoke("get-settings").then((loadedSettings) => {
    //   if (loadedSettings) setSettings(loadedSettings);
    // });

    // Get total count
    window.electron.ipcRenderer.invoke("get-indexed-files-count").then((count) => {
      setTotalCount(Number(count || 0));
    });
    if(currentSettings) setNoGutters(currentSettings.noGutters)
  }, [currentSettings]);

  // Helper: fetch a page containing the given index
  // const fetchPageForIndex = useCallback(
  //   async (index) => {
  //     const pageIndex = Math.floor(index / PAGE_SIZE);
  //     if (loadingPages.current.has(pageIndex)) return;
  //     loadingPages.current.add(pageIndex);

  //     const offset = pageIndex * PAGE_SIZE;
  //     try {
  //       const res = await window.electron.ipcRenderer.invoke("fetch-files", {
  //         offset,
  //         limit: PAGE_SIZE,
  //         filters: filters || {},
  //       });
  //       loadingPages.current.delete(pageIndex);

  //       if (!res || !res.success) return;

  //       // Map returned rows into items map
  //       setItems((prev) => {
  //         const copy = { ...prev };
  //         res.rows.forEach((row, i) => {
  //           const idx = offset + i;
  //           copy[idx] = row;
  //         });
  //         return copy;
  //       });
  //     } catch (err) {
  //       loadingPages.current.delete(pageIndex);
  //       console.error("fetchPage error", err);
  //     }
  //   },
  //   [filters]
  // );

  const fetchPageForIndex = useCallback(async (index, isFirst = false) => {
    const pageIndex = Math.floor(index / PAGE_SIZE);
    if (loadingPages.current.has(pageIndex)) return;
    loadingPages.current.add(pageIndex);

    const offset = isFirst ? 0 : pageIndex * PAGE_SIZE;
    const limit = isFirst ? FIRST_PAGE_SIZE : PAGE_SIZE;
    try {
      const res = await window.electron.ipcRenderer.invoke("fetch-files", {
        offset,
        limit,
        filters: filters || {},
        settings: currentSettings || {}
      });
      loadingPages.current.delete(pageIndex);

      if (!res || !res.success) return;
      addItems(res.rows, offset);
    } catch (err) {
      loadingPages.current.delete(pageIndex);
      console.error("fetchPage error", err);
    }
  }, [filters, currentSettings]);

  // is item loaded
  const isItemLoaded = (index) => !!itemsRef.current[index];

  const fetchAllIds = useCallback(async () => {
    const res = await window.electron.ipcRenderer.invoke("fetch-files", {
      offset: 0,
      limit: totalCount,
      filters: filters || {},
      settings: currentSettings || {},
      idsOnly: true, // <-- flag so backend can do a lightweight SELECT id only
    });
    return res?.rows?.map(r => r.id) ?? [];
  }, [filters, currentSettings, totalCount]);

  // react-window-infinite-loader required functions
  // const loadMoreItems = useCallback(
  //   (startIndex, stopIndex) => {
  //     // fetch all pages that the start..stop range intersects
  //     const promises = [];
  //     const startPage = Math.floor(startIndex / PAGE_SIZE);
  //     const endPage = Math.floor(stopIndex / PAGE_SIZE);
  //     for (let p = startPage; p <= endPage; p++) {
  //       promises.push(fetchPageForIndex(p * PAGE_SIZE));
  //     }
  //     return Promise.all(promises);
  //   },
  //   [fetchPageForIndex]
  // );

    // Debounced loader to avoid burst calls
  const loadMoreTimeout = useRef();
  const loadMoreItems = useCallback((startIndex, stopIndex) => {
    if (loadMoreTimeout.current) clearTimeout(loadMoreTimeout.current);
    return new Promise(resolve => {
      loadMoreTimeout.current = setTimeout(() => {
        const promises = [];
        const startPage = Math.floor(startIndex / PAGE_SIZE);
        const endPage = Math.floor(stopIndex / PAGE_SIZE);
        for (let p = startPage; p <= endPage; p++) {
          promises.push(fetchPageForIndex(p * PAGE_SIZE));
        }
        Promise.all(promises).then(resolve);
      }, 50); // small debounce
    });
  }, [fetchPageForIndex]);

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
    filteredCountUpdated(Number(count) || null)
  } catch (err) {
    console.error("fetchTotalCount error", err);
  }
}, [filters]);

// Add this useEffect inside ExplorerView.jsx
useEffect(() => {
  // Reset items and loaded pages
  itemsRef.current = {};       // 🔑 clear old refs
  idToIndex.current = new Map(); // 🔑 clear index map
  loadingPages.current.clear();
  setTotalCount(null);

  // Fetch total count first, then first page
  // fetchTotalCount().then(() => {
  //   fetchPageForIndex(0, true);
  // });
  fetchTotalCount();        // updates when ready
  fetchPageForIndex(0, true); // shows first items ASAP
}, [filters, fetchPageForIndex, fetchTotalCount]);

useEffect(() => {
  setScrollPosition(0)
}, [filters]);

useEffect(() => {
const handleItemRemoved = ({ id }) => {
  const index = idToIndex.current.get(id);
  if (index != null) {
    // Remove the item
    delete itemsRef.current[index];
    idToIndex.current.delete(id);

    // Decrement totalCount to reflect removal
    setTotalCount((prev) => (prev ? prev - 1 : prev));

    // Rebuild idToIndex mapping for remaining items
    const newIdToIndex = new Map();
    Object.entries(itemsRef.current).forEach(([idx, item]) => {
      newIdToIndex.set(item.id, Number(idx));
    });
    idToIndex.current = newIdToIndex;

    // Clear selection if needed
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }

    itemDeleted();
  }
};

  window.electron.ipcRenderer.on("item-removed", handleItemRemoved);

  return () => {
    window.electron.ipcRenderer.removeListener("item-removed", handleItemRemoved);
  };
}, [
  fetchTotalCount,
  fetchPageForIndex,
  selectedItem
]);


  function formatLocalDateString(str) {
    if (!str) return '';
    // str is "2024-12-31 23:59:25"
    const [datePart, timePart] = str.split(' ');
    if (!datePart) return '';
    const [year, month, day] = datePart.split('-');
    return `${day}-${month}-${year}${timePart ? ' ' + timePart : ''}`;
  }


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

const getTags = async () => {
  const res = await window.electron.ipcRenderer.invoke("tags:get-all");
  const freshTags = res || [];
  setTags(freshTags);
  return freshTags; // <-- return the data so callers can use it immediately
};

const getItemName = (item) => {
  if (!currentSettings || !currentSettings.itemText) {
    return item.filename
  }

  switch (currentSettings.itemText) {
    case 'filename':
      return item.filename

    case 'datetime': {
      if (item.create_date_local) {
        return formatLocalDateString(item.create_date_local)
      }

      if (item.create_date) {
        return formatTimestamp(item.create_date)
      }

      if (item.created || item.modified) {
        const earliest = Math.min(
          ...( [item.created, item.modified].filter(Boolean) )
        )
        return formatTimestamp(earliest)
      }

      return
    }

    case 'none':
      return

    default:
      return item.filename
  }
}

const tagCurrentlySelected = async (item) => {
  const freshTags = await getTags(); // Make getTags return tags
  const tag = freshTags?.[0];
  if (!tag) return;

  const isTagged = Array.isArray(tag.media_ids)
    ? tag.media_ids.includes(item.id)
    : false;

  if (isTagged) {
    await window.electron.ipcRenderer.invoke("tag:remove-item", {
      tagId: tag.id,
      mediaId: item.id,
    });
    enqueueSnackbar(`Removed tag '${tag.name}' from selected item`);
  } else {
    await window.electron.ipcRenderer.invoke("tag:add-item", {
      tagId: tag.id,
      mediaId: item.id,
    });
    enqueueSnackbar(`Added tag '${tag.name}' to selected item`);
  }

  // Refresh after mutation
  await getTags();

  onTagAssign(item);
};

  const columnWidth = BASE_COLUMN_WIDTH * scale;
  const rowHeight = BASE_ROW_HEIGHT * scale;
  const columnCount = Math.max(1, Math.floor(containerWidth / (columnWidth + (noGutters ? 0 : GUTTER))));
  const rowCount = totalCount ? Math.ceil(totalCount / columnCount) : 0;

  // --- Keyboard navigation (use idToIndex map) ---
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (actionPanelType) return;
      if ((e.key === "A" || e.key === "a") && e.ctrlKey) {
        const isAddMode = explorerMode?.enabled && (explorerMode.type === "tag" || explorerMode.type === "memory");
        if (!isAddMode) return;

        e.preventDefault();

        if (addModeSelected.size === totalCount) {
          setAddModeSelected(new Set());
        } else {
          const ids = await fetchAllIds();
          setAddModeSelected(new Set(ids));
        }
        return;
      }

      if (!selectedItem) return;
      const idx = idToIndex.current.get(selectedItem.id);
      if (idx == null) return;
      if(e.key === "T" || e.key === "t") {
        tagCurrentlySelected(itemsRef.current[idx])
      }
      let nextIndex = idx;
      if (e.key === "ArrowRight") nextIndex = idx + 1;
      else if (e.key === "ArrowLeft") nextIndex = idx - 1;
      else if (e.key === "ArrowDown") nextIndex = idx + columnCount;
      else if (e.key === "ArrowUp") nextIndex = idx - columnCount;
      else return;

      e.preventDefault();
      if (nextIndex < 0 || nextIndex >= totalCount) return;

      const nextItem = itemsRef.current[nextIndex];
      if (nextItem) {
        setSelectedItem(nextItem);
        onSelect(nextItem, "single");
      }

      const rowIndex = Math.floor(nextIndex / columnCount);
      const colIndex = nextIndex % columnCount;
      gridRef.current?.scrollToItem({ rowIndex, columnIndex: colIndex, align: "smart" });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedItem, totalCount, explorerMode, fetchAllIds, onSelect]);

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

  // Restore scroll when mounting
useEffect(() => {
  setTimeout(() => {
    scrollToLatest()
  }, 100);
}, []);

const scrollToLatest = () => {
  if (gridRef.current && scrollPosition) {
    gridRef.current.scrollTo({ scrollTop: scrollPosition });
  }
}

const handleScroll = ({ scrollTop, scrollUpdateWasRequested }) => {
  if (scrollUpdateWasRequested || isRestoringScrollRef.current) return;

  const firstVisibleRow = Math.floor(scrollTop / rowHeight);
  const index = firstVisibleRow * columnCount;

  anchorIndexRef.current = Math.max(0, index);

  if (scrollTop !== 0) {
    setScrollPosition(scrollTop);
  }
};

  // render each cell
  const Cell = React.memo(({ columnIndex, rowIndex, style }) => {
  const index = rowIndex * columnCount + columnIndex;
  if (!totalCount || index >= totalCount) return null;

  const item = itemsRef.current[index];

  if (!item) {
    return (
      <div style={{ ...style, padding: noGutters ? 0 : 8 }}>
        <div
          className="thumb-skeleton"
          style={{ height: rowHeight - 16, borderRadius: noGutters ? 0 : 6 }}
        />
      </div>
    );
  }

  const folderAvailable = folderStatuses[item.folder_path] ?? true;

  const thumbSrc = item.thumbnail_path ? `orbit://thumbs/${item.id}_thumb.jpg` : null;

  return (
    <div style={{ ...style, padding: noGutters ? 0 : 8 }} 
      className={`thumb-cell ${noGutters && currentSettings && currentSettings.itemText === "none" ? 'thumb-no-gutter' : ''} ${
        explorerMode && explorerMode.enabled && (explorerMode.type === "tag" || explorerMode.type === "memory") && addModeSelected.has(item.id)
          ? "thumb-selected-addmode"          // highlighted in Add Mode
          : explorerMode && explorerMode.enabled && (explorerMode.type === "remove") && removeModeSelected.has(item.id)
          ? "thumb-selected-removemode"       // highlighted in Remove Mode
          : selectedItem && item.id === selectedItem.id
          ? "thumb-selected"                  // normal selected
          : "thumb-item"                      // default thumbnail
      }`}
      onClick={(e) => {
        if (!folderAvailable) return;

        if (explorerMode && explorerMode.enabled && (explorerMode.type === "tag" || explorerMode.type === "memory")) {
          handleAddModeClick(item);
        } else if (explorerMode && explorerMode.enabled && (explorerMode.type === "remove")) {
          handleRemoveModeClick(item);
        } else {
          handleClick(e, item);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, item });
      }}
      onDoubleClick={() => folderAvailable && handleSelect(item, "double")}>
      <div
        className="thumb-card"
        title={`${item.filename}\n${formatLocalDateString(item.create_date_local) || formatTimestamp(item.create_date) || formatTimestamp(item.created) || ""}`}
        style={{ width: "100%", height: scale === 0.5 || (noGutters && currentSettings && currentSettings.itemText === "none") ? '100%' : rowHeight - 36, borderRadius: noGutters ? 0 : 6 }} // leave space for filename
      >
        {thumbSrc ? (
          <img
            alt={item.filename}
            src={thumbSrc}
            className="thumb-img"
            style={{ objectFit: noGutters ? "cover" : "contain", borderRadius: noGutters ? 0 : 6 }}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = ""; // optional fallback
            }}
            draggable={false}
          />
        ) : (
          <div className="thumb-no-image">No preview</div>
        )}
        { item.file_type === "video" && scale > 0.6 && (
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
        className={`thumb-filename ${!folderAvailable ? 'thumb-filename-unavailable' : ''} ${scale === 0.5 || (currentSettings && currentSettings.itemText === "none") ? 'thumb-hidden' : ''}`}
        title={getItemName(item)}
        style={{
          marginTop: 4,
          fontSize: 12,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {getItemName(item)}
      </div>
    </div>
  );
});

  useEffect(() => {
    if (!gridRef || !gridRef.current || totalCount == null) return;

    const index = Math.min(anchorIndexRef.current, totalCount - 1);
    const rowIndex = Math.floor(index / columnCount);
    const columnIndex = index % columnCount;

    isRestoringScrollRef.current = true;

    requestAnimationFrame(() => {
      if (!gridRef.current) return; // <-- check again

      gridRef.current.scrollToItem({
        rowIndex,
        columnIndex,
        align: "start",
      });

      requestAnimationFrame(() => {
        isRestoringScrollRef.current = false;
      });
    });
  }, [scale, rowHeight, columnCount, totalCount]);

  const revealFromContextMenu = async (item) => {
    // 1️⃣ Reset filters to "All"
    resetFilters();
    setItemToReveal(item);
  };
  
  useEffect(() => {
    if (!itemToReveal) return;
  
    let cancelled = false;
  
    const revealItem = async (item) => {
      // Get the item's index
      const itemIndex = await window.electron.ipcRenderer.invoke("get-index-of-item", { itemId: item.media_id });
      if (itemIndex == null || cancelled) return;
    
      // Fetch page containing the item
      const pageIndex = Math.floor(itemIndex / PAGE_SIZE);
      const offset = pageIndex * PAGE_SIZE;
    
      const res = await window.electron.ipcRenderer.invoke("fetch-files", {
        offset,
        limit: PAGE_SIZE,
        filters: { sortBy: "media_id", sortOrder: "desc" },
        settings: currentSettings,
      });
      if (!res?.success || cancelled) return;
    
      addItems(res.rows, offset);
    
      // Wait for gridRef to exist (non-blocking)
      for (let i = 0; i < 20; i++) {
        if (cancelled) return;
        if (gridRef.current) break;
        await new Promise(r => setTimeout(r, 50));
      }
      if (!gridRef.current || cancelled) return;
    
      // Compute columnCount locally
      const columnWidth = BASE_COLUMN_WIDTH * scale;
      const columnCount = Math.max(1, Math.floor(containerWidth / (columnWidth + (noGutters ? 0 : GUTTER))));
    
      const rowIndex = Math.floor(itemIndex / columnCount);
      const columnIndex = itemIndex % columnCount;
    
      gridRef.current.scrollToItem({ rowIndex, columnIndex, align: "center" });
    
      // Select the item
      const revealedItem = itemsRef.current[itemIndex];
      if (revealedItem && !cancelled) {
        handleSelect(revealedItem, "single")
        setItemToReveal(null)
      }
    };
  
    revealItem(itemToReveal);
  
    return () => { cancelled = true; };
  }, [itemToReveal, containerWidth, scale, currentSettings]);

  const handleRemoveItem = async (itemId) => {
    try {
      await window.electron.ipcRenderer.invoke(
        "remove-item-from-index",
        itemId
      );
    } catch (err) {
      console.error("Failed to remove item:", err);
    }
  }

  const handleRemoveModeClick = (item) => {
    setRemoveModeSelected((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(item.id)) {
        newSet.delete(item.id);
      } else {
        newSet.add(item.id);
      }
      return newSet;
    });
  };

  // If we know there are no files, show settings hint
  if (totalCount === 0 && (!filters || filters && filters.length === 0)) {
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

  const hasActiveFilters = filters ? Object.values(filters).some(
    value => value !== "" && value != null
  ) : false;

  if (totalCount === 0 && hasActiveFilters) {
    return (
      <div className="explorer-view empty" style={{ padding: 40 }}>
        <h2>No results</h2>
        <br />
        <p>Try adjusting your filters or search terms.</p>
      </div>
    );
  }

  if (totalCount === null) {
    return <div style={{alignSelf: "center"}} className="loader"></div>;
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
              key={`${filters ? JSON.stringify(filters) : "nofilter"}`}
              ref={(grid) => {
                ref(grid);
                gridRef.current = grid;
              }}
              columnCount={columnCount}
              columnWidth={columnWidth + (noGutters ? 0 : GUTTER)}
              height={gridHeight}
              rowCount={rowCount}
              rowHeight={rowHeight}
              width={containerWidth}
              onScroll={handleScroll}
              className="explorer-grid"
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
      {explorerMode && explorerMode.enabled && (explorerMode.type === "remove") && (
  <div
    style={{
      position: "fixed",
      bottom: 40,
      right: 20,
      padding: "10px 20px",
      backgroundColor: "#15131a",
      color: "white",
      border: "1px solid #484050",
      borderRadius: 6,
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      gap: "10px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    }}
  >
    <span>Remove Mode Enabled</span>

    <button
      style={{
        padding: "6px 12px",
        backgroundColor: "#484050",
        border: "none",
        color: "white",
        borderRadius: 4,
        cursor: "pointer",
      }}
      onClick={async () => {
        // Remove all selected items
        for (const id of removeModeSelected) {
          await handleRemoveItem(id);
        }
        setExplorerMode({enabled: false, value: null, type: ""})
        setRemoveModeSelected(new Set());
      }}
    >
      Remove Selected ({removeModeSelected.size})
    </button>

    <button
      style={{
        padding: "6px 12px",
        backgroundColor: "#484050",
        border: "none",
        color: "white",
        borderRadius: 4,
        cursor: "pointer",
        fontWeight: "bold",
      }}
      onClick={() => {
        setExplorerMode({enabled: false, value: null, type: ""})
        setRemoveModeSelected(new Set());
      }}
    >
      <FontAwesomeIcon icon={faXmark} />
    </button>
  </div>
)}

{explorerMode && explorerMode.enabled && (explorerMode.type === "tag" || explorerMode.type === "memory") && (
  <div
    style={{
      position: "fixed",
      bottom: 40,
      right: 20,
      padding: "10px 15px",
      backgroundColor: "#15131a",
      color: "white",
      border: "1px solid #484050",
      borderRadius: 6,
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      gap: "10px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    }}
  >
    {/* Tagging Mode Text */}
    <span style={{lineHeight: "1"}}>Add Mode</span>

    {/* Attach Tag Button */}
    <button
      style={{
        padding: "6px 12px",
        backgroundColor: "#484050",
        border: "none",
        color: "white",
        borderRadius: 4,
        cursor: "pointer",
      }}
      onClick={() => {
        setExplorerMode({enabled: false, value: null, type: ""})
        if(explorerMode.type === "tag") {
          window.electron.ipcRenderer.invoke("tag-selected-items", {
            tagId: explorerMode.value,
            mediaIds: Array.from(addModeSelected),
          });
        } else if(explorerMode.type === "memory") {
          window.electron.ipcRenderer.invoke("add-items-to-memory", {
            memoryId: explorerMode.value,
            mediaIds: Array.from(addModeSelected),
          });
        }
      }}
    >
      Add to {explorerMode.type} ({addModeSelected.size})
    </button>

    {/* Close Button */}
    <button
      style={{
        padding: "6px 12px",
        backgroundColor: "#484050",
        border: "none",
        color: "white",
        borderRadius: 4,
        cursor: "pointer",
        fontWeight: "bold",
      }}
      onClick={() => {
        // Close tagging mode
        setExplorerMode({enabled: false, value: null, type: ""})
      }}
    >
      <FontAwesomeIcon icon={faXmark} />
    </button>
  </div>
)}

{contextMenu && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    item={contextMenu.item}
    onClose={() => setContextMenu(null)}
    revealFromContextMenu={revealFromContextMenu}
    onRemoveItem={handleRemoveItem}
  />
)}

<SnackbarProvider />


    </div>
  );
};

export default ExplorerView;
