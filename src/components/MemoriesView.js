import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useState, useEffect } from "react";
import { SnackbarProvider, enqueueSnackbar } from "notistack";

const MemoriesView = ({ switchMemoryMode, memoryMode, onAddMedia }) => {
  const [selectedTab, setSelectedTab] = useState("Years");
  const [years, setYears] = useState([]);
  const [months, setMonths] = useState([]);
  const [trips, setTrips] = useState([]);
  const [vacations, setVacations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customMemories, setCustomMemories] = useState([]);

  // --- ADD MEMORY POPUP STATE ---
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [newMemory, setNewMemory] = useState({
    title: "",
    description: "",
    color: "#ffffff",
    quickAddQuery: "",
  });

  useEffect(() => {
    setSelectedTab("Custom")

    setNewMemory({
      title: "",
      description: "",
      color: "#ffffff",
      quickAddQuery: "",
    })

    if (memoryMode === "new") setShowAddMemory(true);
    if (memoryMode === "edit") {
      setShowAddMemory(false);
      enqueueSnackbar(`Click on a memory to edit it`);
    }
  }, [memoryMode]);

  // --- FETCHING DATA ---
  useEffect(() => {
    if (selectedTab === "Years") fetchYears();
    if (selectedTab === "Months") fetchMonths();
    if (selectedTab === "Vacations") fetchVacations();
    if (selectedTab === "Trips") fetchTrips();
    if (selectedTab === "Custom") fetchCustomMemories();
  }, [selectedTab]);

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

  // --- FETCH CUSTOM MEMORIES ---
  const fetchCustomMemories = async () => {
    try {
      setLoading(true);
      const rows = await window.electron.ipcRenderer.invoke("fetch-memories");
      setCustomMemories(
        rows.map((m) => ({
          ...m,
          thumbnails: JSON.parse(m.media_ids || "[]").map((id) => ({ id })), // generate thumbnails
        }))
      );
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

  // --- MEMORY BOX RENDERING ---
  const renderYearBoxes = () => (
    <div className="memories-grid">
      {years.map((y) => (
        <div key={y.year} className="memory-box">
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
        const label = date.toLocaleString("en-US", {
          month: "long",
          year: "numeric",
        });
        return (
          <div key={`${m.year}-${m.month}`} className="memory-box">
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
        <div key={t.id} className="memory-box">
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
        <div key={t.id} className="memory-box">
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
      {customMemories.map((m) => (
        <div key={m.id} className="memory-box"
       onClick={() => {
          if (memoryMode !== "edit") return;

          setNewMemory({
            id: m.id,
            title: m.title,
            description: m.description,
            color: m.color
          });
          setShowAddMemory(true);
        }}>
          <div className="memory-color" style={{ backgroundColor: m.color }}></div>
          <div className="memory-text">
            <div className="title">{m.title}</div>
            <div className="description">{m.description}</div>
          </div>
          <ThumbnailStrip thumbnails={m.thumbnails} />
          <div className="memory-count">{m.thumbnails.length} items</div>
        </div>
      ))}
    </div>
  );

  const ThumbnailStrip = ({ thumbnails = [] }) => (
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
  );

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
    await window.electron.ipcRenderer.invoke("delete-memory", {
      id: newMemory.id
    });

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
            {["Custom", "Years", "Months", "Vacations", "Trips"].map((tab) => (
              <li
                key={tab}
                className={`settings-list-item ${
                  selectedTab === tab ? "settings-list-active" : ""
                } ${
                  memoryMode !== null && tab !== "Custom" ? "settings-list-disabled" : ""
                }
                `}
                onClick={() => {
                  if(memoryMode === null) setSelectedTab(tab)
                }}
              >
                <span>{tab}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="memories-content">
          {loading && <div className="memories-loading"><div className="loader"></div></div>}
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

            {/* Quick Add SQL Builder */}
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
                  onChange={(e) =>
                    setNewMemory({ ...newMemory, mediaFrom: e.target.value })
                  }
                />
              </div>
                
              <div className="filter-row">
                <span>ID to:</span>
                <input
                  type="number"
                  className="input"
                  value={newMemory.mediaTo || ""}
                  onChange={(e) =>
                    setNewMemory({ ...newMemory, mediaTo: e.target.value })
                  }
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
                  <button
                    className="btn btn-primary"
                    onClick={handleDeleteMemory}
                  >
                    Delete
                  </button>
              )}
              {memoryMode === "edit" && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {setShowAddMemory(false); switchMemoryMode(null); onAddMedia(newMemory)}}
                  >
                    Add Media
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