import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { SnackbarProvider, enqueueSnackbar } from "notistack";

const ThumbnailStrip = React.memo(({ thumbnails = [] }) => (
  <div className="memory-thumbs">
    {thumbnails.map((t) => (
      <img
        key={t.id}
        src={`orbit://thumbs/${t.id}_thumb.jpg`}
        draggable={false}
        alt=""
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
    ))}
  </div>
));

const MemoriesView = ({ switchMemoryMode, memoryMode, onAddMedia, onViewMemory }) => {
  const [selectedTab, setSelectedTab] = useState("Years");
  const [years, setYears] = useState([]);
  const [months, setMonths] = useState([]);
  const [trips, setTrips] = useState([]);
  const [vacations, setVacations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customMemories, setCustomMemories] = useState([]);

  // All drag state lives in a single ref — no stale closure issues
  const drag = useRef({ active: false, fromIndex: null, toIndex: null });
  const [dragIndex, setDragIndex] = useState(null);
  // dropEdge: { index, edge: 'top' | 'bottom' } — which card + which side to show the indicator
  const [dropEdge, setDropEdge] = useState(null);

  // --- ADD MEMORY POPUP STATE ---
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [newMemory, setNewMemory] = useState({
    title: "",
    description: "",
    color: "#ffffff",
    quickAddQuery: "",
    existing: null,
  });

  useEffect(() => {
    setSelectedTab("Custom");
    setNewMemory({ title: "", description: "", color: "#ffffff", quickAddQuery: "", existing: null });
    if (memoryMode === "new") setShowAddMemory(true);
    if (memoryMode === "edit") {
      setShowAddMemory(false);
      enqueueSnackbar(`Click on a memory to edit it`);
    }
  }, [memoryMode]);

  // --- FETCHING DATA ---
  useEffect(() => {
    setLoading(true);
    setYears([]);
    setMonths([]);
    setTrips([]);
    setVacations([]);
    setCustomMemories([]);
    if (selectedTab === "All") fetchAll();
    if (selectedTab === "Years") fetchYears();
    if (selectedTab === "Months") fetchMonths();
    if (selectedTab === "Vacations") fetchVacations();
    if (selectedTab === "Trips") fetchTrips();
    if (selectedTab === "Custom") fetchCustomMemories();
  }, [selectedTab]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [yearRows, monthRows, tripRows, memoryRows] = await Promise.all([
        window.electron.ipcRenderer.invoke("fetch-years"),
        window.electron.ipcRenderer.invoke("fetch-months"),
        window.electron.ipcRenderer.invoke("fetch-trips", { minTripPhotos: 10 }),
        window.electron.ipcRenderer.invoke("fetch-memories"),
      ]);
      const convertedTrips = await convertTripCountries(tripRows);
      setYears(yearRows);
      setMonths(monthRows);
      setTrips(convertedTrips);
      setCustomMemories(memoryRows);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch all memories:", err);
    }
  };

  const fetchYears = async () => {
    try {
      setLoading(true);
      const rows = await window.electron.ipcRenderer.invoke("fetch-years");
      setYears(rows);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch years:", err);
    }
  };

  const fetchMonths = async () => {
    try {
      setLoading(true);
      const rows = await window.electron.ipcRenderer.invoke("fetch-months");
      setMonths(rows);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch months:", err);
    }
  };

  const fetchCustomMemories = async () => {
    try {
      setLoading(true);
      const rows = await window.electron.ipcRenderer.invoke("fetch-memories");
      setCustomMemories(rows);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch custom memories:", err);
    }
  };

  const convertTripCountries = async (trips) => {
    return Promise.all(
      trips.map(async (t) => {
        const names = await Promise.all(
          t.countries.map((code) =>
            window.electron.ipcRenderer.invoke("get-country-name", code)
          )
        );
        return { ...t, title: names.join(" – ") + ` ${new Date(t.start).getFullYear()}` };
      })
    );
  };

  const fetchVacations = async () => {
    setLoading(true);
    let rows = await window.electron.ipcRenderer.invoke("fetch-trips");
    rows = await convertTripCountries(rows);
    setVacations(rows);
    setLoading(false);
  };

  const fetchTrips = async () => {
    setLoading(true);
    let rows = await window.electron.ipcRenderer.invoke("fetch-trips", { minTripPhotos: 10 });
    rows = await convertTripCountries(rows);
    setTrips(rows);
    setLoading(false);
  };

  // --- DRAG: whole card is the handle ---
  const handleCardMouseDown = useCallback((e, index) => {
    if (e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let didDrag = false;

    const onMouseMove = (ev) => {
      const dist = Math.sqrt(
        Math.pow(ev.clientX - startX, 2) + Math.pow(ev.clientY - startY, 2)
      );

      if (!didDrag) {
        if (dist < 6) return;
        didDrag = true;
        drag.current.active = true;
        drag.current.fromIndex = index;
        drag.current.toIndex = index;
        setDragIndex(index);
        setDropEdge(null);
      }

      // Find which card the cursor is over and which half
      const grid = document.querySelector(".memories-grid");
      if (!grid) return;
      const cards = Array.from(grid.querySelectorAll(".memory-box"));

      let toIndex = cards.length - 1;
      let edge = "bottom";

      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (ev.clientY < rect.top + rect.height / 2) {
          toIndex = i;
          edge = "top";
          break;
        } else if (ev.clientY < rect.bottom) {
          toIndex = i;
          edge = "bottom";
          break;
        }
      }

      // Convert visual edge into the actual insertion index
      // "top of card i" means insert before i → insertAt = i
      // "bottom of card i" means insert after i → insertAt = i + 1
      const insertAt = edge === "top" ? toIndex : toIndex + 1;
      // Clamp to valid range accounting for the removed dragged item
      const maxInsert = cards.length - 1;
      const clampedInsert = Math.min(insertAt, maxInsert);

      drag.current.toIndex = clampedInsert;

      // Show indicator: if inserting before toIndex show top border on that card,
      // if inserting after toIndex show bottom border on that card
      if (edge === "top") {
        setDropEdge({ index: toIndex, edge: "top" });
      } else {
        setDropEdge({ index: toIndex, edge: "bottom" });
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      if (didDrag) {
        const from = drag.current.fromIndex;
        const to = drag.current.toIndex;
        if (from !== null && to !== null && from !== to) {
          setCustomMemories((prev) => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            const order = next.map((m, i) => ({ id: m.id, sort_order: next.length - i }));
            window.electron.ipcRenderer.invoke("memory:reorder", { order });
            return next;
          });
        }
      }

      drag.current = { active: false, fromIndex: null, toIndex: null };
      setDragIndex(null);
      setDropEdge(null);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  // --- MEMORY BOX RENDERING ---
  const renderYearBoxes = () => (
    <div className="memories-grid">
      {years.map((y) => (
        <div key={y.year} className="memory-box" onClick={() => { onViewMemory(y.ids); }}>
          <div className="memory-text">
            <div className="title">{y.year}</div>
            <div className="description">All media from {y.year}</div>
          </div>
          <ThumbnailStrip thumbnails={y.thumbnails} />
          <div className="memory-count">{y.total} items</div>
        </div>
      ))}
    </div>
  );

  const renderMonthBoxes = () => (
    <div className="memories-grid">
      {months.map((m) => {
        const date = new Date(`${m.year}-${m.month}-01`);
        const label = date.toLocaleString("en-US", { month: "long", year: "numeric" });
        return (
          <div key={`${m.year}-${m.month}`} className="memory-box" onClick={() => { onViewMemory(m.ids); }}>
            <div className="memory-text">
              <div className="title">{label}</div>
              <div className="description">All media from {label}</div>
            </div>
            <ThumbnailStrip thumbnails={m.thumbnails} />
            <div className="memory-count">{m.total} items</div>
          </div>
        );
      })}
    </div>
  );

  const renderVacationBoxes = () => (
    <div className="memories-grid">
      {vacations.map((t) => (
        <div key={t.id} className="memory-box" onClick={() => { onViewMemory(t.ids); }}>
          <div className="memory-text">
            <div className="title">{t.title}</div>
            <div className="description">
              {t.start.slice(0, 10)} <FontAwesomeIcon icon={faArrowRight} /> {t.end.slice(0, 10)}
            </div>
          </div>
          <ThumbnailStrip thumbnails={t.thumbnails} />
          <div className="memory-count">{t.total} items</div>
        </div>
      ))}
    </div>
  );

  const renderTripBoxes = () => (
    <div className="memories-grid">
      {trips.map((t) => (
        <div key={t.id} className="memory-box" onClick={() => { onViewMemory(t.ids); }}>
          <div className="memory-text">
            <div className="title">{t.title}</div>
            <div className="description">
              {t.start.slice(0, 10)} <FontAwesomeIcon icon={faArrowRight} /> {t.end.slice(0, 10)}
            </div>
          </div>
          <ThumbnailStrip thumbnails={t.thumbnails} />
          <div className="memory-count">{t.total} items</div>
        </div>
      ))}
    </div>
  );

  const renderCustomMemories = () => (
    <div className="memories-grid">
      {customMemories.map((m, index) => {
        const isDragging = dragIndex === index;
        const dropClass =
          dropEdge && dropEdge.index === index && dragIndex !== null && dragIndex !== index
            ? dropEdge.edge === "top"
              ? " memory-box--drop-top"
              : " memory-box--drop-bottom"
            : "";

        return (
          <div
            key={m.id}
            className={`memory-box${isDragging ? " memory-box--dragging" : ""}${dropClass}`}
            onMouseDown={(e) => handleCardMouseDown(e, index)}
            onClick={() => {
              if (drag.current.active) return;
              const mediaIds = JSON.parse(m.media_ids || "[]");
              if (memoryMode !== "edit" && mediaIds.length > 0) {
                onViewMemory(mediaIds);
                return;
              } else if (memoryMode !== "edit") {
                return;
              }
              setNewMemory({
                id: m.id,
                title: m.title,
                description: m.description,
                color: m.color,
                existing: mediaIds,
              });
              setShowAddMemory(true);
            }}
          >
            <div className="memory-color" style={{ backgroundColor: m.color }}></div>
            <div className="memory-text">
              <div className="title">{m.title}</div>
              <div className="description">{m.description}</div>
            </div>
            <ThumbnailStrip thumbnails={m.thumbnails} />
            <div className="memory-count">{m.total} items</div>
          </div>
        );
      })}
    </div>
  );

  const renderAllBoxes = () => {
    const items = [
      ...customMemories.map((m) => ({ type: "custom", data: m, ts: m.created * 1000 })),
      ...years.map((y) => ({ type: "year", data: y, ts: new Date(`${y.year}-12-01`).getTime() })),
      ...months.map((m) => ({ type: "month", data: m, ts: new Date(`${m.year}-${m.month}-01`).getTime() })),
      ...trips.map((t) => ({ type: "trip", data: t, ts: new Date(t.start).getTime() })),
    ].sort((a, b) => b.ts - a.ts);

    return (
      <div className="memories-grid">
        {items.map((item) => {
          if (item.type === "custom") {
            const m = item.data;
            return (
              <div
                key={`custom-${m.id}`}
                className="memory-box"
                onClick={() => {
                  const mediaIds = JSON.parse(m.media_ids || "[]");
                  if (memoryMode !== "edit" && mediaIds.length > 0) { onViewMemory(mediaIds); return; }
                  else if (memoryMode !== "edit") return;
                  setNewMemory({ id: m.id, title: m.title, description: m.description, color: m.color, existing: mediaIds });
                  setShowAddMemory(true);
                }}
              >
                <div className="memory-color" style={{ backgroundColor: m.color }}></div>
                <div className="memory-text">
                  <div className="title">{m.title}</div>
                  <div className="description">{m.description}</div>
                </div>
                <ThumbnailStrip thumbnails={m.thumbnails} />
                <div className="memory-count">{m.total} items</div>
              </div>
            );
          }
          if (item.type === "year") {
            const y = item.data;
            return (
              <div key={`year-${y.year}`} className="memory-box" onClick={() => onViewMemory(y.ids)}>
                <div className="memory-text">
                  <div className="title">{y.year}</div>
                  <div className="description">All media from {y.year}</div>
                </div>
                <ThumbnailStrip thumbnails={y.thumbnails} />
                <div className="memory-count">{y.total} items</div>
              </div>
            );
          }
          if (item.type === "month") {
            const m = item.data;
            const date = new Date(`${m.year}-${m.month}-01`);
            const label = date.toLocaleString("en-US", { month: "long", year: "numeric" });
            return (
              <div key={`month-${m.year}-${m.month}`} className="memory-box" onClick={() => onViewMemory(m.ids)}>
                <div className="memory-text">
                  <div className="title">{label}</div>
                  <div className="description">All media from {label}</div>
                </div>
                <ThumbnailStrip thumbnails={m.thumbnails} />
                <div className="memory-count">{m.total} items</div>
              </div>
            );
          }
          if (item.type === "trip") {
            const t = item.data;
            return (
              <div key={`trip-${t.id}`} className="memory-box" onClick={() => onViewMemory(t.ids)}>
                <div className="memory-text">
                  <div className="title">{t.title}</div>
                  <div className="description">
                    {t.start.slice(0, 10)} <FontAwesomeIcon icon={faArrowRight} /> {t.end.slice(0, 10)}
                  </div>
                </div>
                <ThumbnailStrip thumbnails={t.thumbnails} />
                <div className="memory-count">{t.total} items</div>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  // --- HANDLE SAVE MEMORY ---
  const handleSaveMemory = async () => {
    try {
      if (memoryMode === "edit") {
        await window.electron.ipcRenderer.invoke("update-memory", newMemory);
      } else {
        await window.electron.ipcRenderer.invoke("add-memory", newMemory);
      }
      setShowAddMemory(false);
      switchMemoryMode(null);
      fetchCustomMemories();
    } catch (err) {
      console.error("Failed to save memory:", err);
    }
  };

  const handleDeleteMemory = async () => {
    if (!newMemory.id) return;
    try {
      await window.electron.ipcRenderer.invoke("delete-memory", { id: newMemory.id });
      setShowAddMemory(false);
      switchMemoryMode(null);
      fetchCustomMemories();
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  return (
    <div className="memories-view">
      <div className="memories-main">
        <div className="settings-list">
          <ul>
            {["All", "Custom", "Years", "Months", "Vacations", "Trips"].map((tab) => (
              <li
                key={tab}
                className={`settings-list-item ${selectedTab === tab ? "settings-list-active" : ""} ${
                  memoryMode !== null && tab !== "Custom" ? "settings-list-disabled" : ""
                }`}
                onClick={() => { if (memoryMode === null) setSelectedTab(tab); }}
              >
                <span>{tab}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="memories-content">
          {loading && <div className="memories-loading"><div className="loader"></div></div>}
          {!loading && selectedTab === "All" && renderAllBoxes()}
          {!loading && selectedTab === "Years" && renderYearBoxes()}
          {!loading && selectedTab === "Months" && renderMonthBoxes()}
          {!loading && selectedTab === "Custom" && renderCustomMemories()}
          {!loading && selectedTab === "Vacations" && renderVacationBoxes()}
          {!loading && selectedTab === "Trips" && renderTripBoxes()}
        </div>
      </div>

      {/* --- ADD MEMORY POPUP --- */}
      {showAddMemory && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 className="modal-title">Add New Memory</h3>

            <input
              type="text"
              placeholder="Title"
              className="input"
              maxLength={20}
              value={newMemory.title}
              onChange={(e) => setNewMemory({ ...newMemory, title: e.target.value })}
            />

            <input
              placeholder="Description (short)"
              className="input"
              maxLength={20}
              value={newMemory.description}
              onChange={(e) => setNewMemory({ ...newMemory, description: e.target.value })}
            />

            <div className="color-picker">
              <label>Color</label>
              <input
                type="color"
                value={newMemory.color}
                onChange={(e) => setNewMemory({ ...newMemory, color: e.target.value })}
              />
            </div>

            {memoryMode !== "edit" && (
              <div className="quick-add-ui">
                <label>Quick Add</label>

                <div className="filter-row">
                  <span>Start Date:</span>
                  <input
                    type="date"
                    className="date-input"
                    value={newMemory.startDate || ""}
                    onChange={(e) => setNewMemory({ ...newMemory, startDate: e.target.value })}
                  />
                </div>

                <div className="filter-row">
                  <span>End Date:</span>
                  <input
                    type="date"
                    className="date-input"
                    value={newMemory.endDate || ""}
                    onChange={(e) => setNewMemory({ ...newMemory, endDate: e.target.value })}
                  />
                </div>

                <div className="filter-row">
                  <span>ID from:</span>
                  <input
                    type="number"
                    className="input"
                    value={newMemory.mediaFrom || ""}
                    onChange={(e) => setNewMemory({ ...newMemory, mediaFrom: e.target.value })}
                  />
                </div>

                <div className="filter-row">
                  <span>ID to:</span>
                  <input
                    type="number"
                    className="input"
                    value={newMemory.mediaTo || ""}
                    onChange={(e) => setNewMemory({ ...newMemory, mediaTo: e.target.value })}
                  />
                </div>

                <div className="filter-row">
                  <span>Path starts with:</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="/photos/vacation/"
                    value={newMemory.pathStartsWith || ""}
                    onChange={(e) => setNewMemory({ ...newMemory, pathStartsWith: e.target.value })}
                  />
                </div>
                <div className="memory-hint">You can manually add photo's after creating the memory</div>
              </div>
            )}

            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => { setShowAddMemory(false); switchMemoryMode(null); }}
              >
                Cancel
              </button>
              {memoryMode === "edit" && (
                <button className="btn btn-primary" onClick={handleDeleteMemory}>Delete</button>
              )}
              {memoryMode === "edit" && (
                <button
                  className="btn btn-primary"
                  onClick={() => { setShowAddMemory(false); switchMemoryMode(null); onAddMedia(newMemory); }}
                >
                  Select Media
                </button>
              )}
              <button className="btn btn-primary" onClick={handleSaveMemory}>
                {memoryMode === "edit" ? "Save Changes" : "Add Memory"}
              </button>
            </div>
          </div>
        </div>
      )}

      <SnackbarProvider maxSnack={1} />
    </div>
  );
};

export default MemoriesView;