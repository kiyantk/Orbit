import { faUndo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useState, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FILTERS = {
  dateExact: "",
  dateFrom: "",
  dateTo: "",
  device: "",
  folder: "",
  filetype: "",
  mediaType: "",
  country: "",
  year: "",
  tagId: "",
  age: "",
  ids: null,
};

const DEFAULT_SORT = { sortBy: "media_id", sortOrder: "desc" };
const DEFAULT_SEARCH = { searchBy: "name", searchTerm: "" };
const DEFAULT_SHUFFLE_SETTINGS = { shuffleInterval: 8, hideInfo: false, smoothTransition: false };

// ─── Generic filter hook ───────────────────────────────────────────────────────

function useFilterState(initial = EMPTY_FILTERS) {
  const [filters, setFilters] = useState(initial);

  const handleDateChange = (field, value) => {
    setFilters(prev => {
      const next = { ...prev, [field]: value };
      if (field === "dateExact" && value) {
        next.dateFrom = "";
        next.dateTo   = "";
        next.year     = "";
        next.age      = "";
      } else if ((field === "dateFrom" || field === "dateTo") && value) {
        next.dateExact = "";
        next.year      = "";
        next.age       = "";
      }
      if (field === "dateFrom" && next.dateTo && value > next.dateTo) next.dateTo = value;
      if (field === "dateTo" && next.dateFrom && value < next.dateFrom) next.dateFrom = value;
      return next;
    });
  };

  const handleYearChange = (year) => {
    setFilters(prev => {
      if (!year) return { ...prev, year: "", dateFrom: "", dateTo: "", age: "" };
      return { ...prev, year, age: "", dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
    });
  };

  const handleAgeChange = (age, birthDate) => {
    setFilters(prev => {
      if (!age || !birthDate) return { ...prev, age: "", dateFrom: "", dateTo: "" };
      const birth = new Date(birthDate);
      const dateFrom = new Date(birth);
      dateFrom.setFullYear(birth.getFullYear() + Number(age));
      const dateTo = new Date(birth);
      dateTo.setFullYear(birth.getFullYear() + Number(age) + 1);
      dateTo.setDate(dateTo.getDate() - 1);
      return {
        ...prev,
        age,
        year: "",
        dateExact: "",
        dateFrom: dateFrom.toISOString().slice(0, 10),
        dateTo: dateTo.toISOString().slice(0, 10),
      };
    });
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  return { filters, setFilters, handleDateChange, handleYearChange, handleAgeChange, resetFilters };
}

// ─── Shared FilterPanel component ─────────────────────────────────────────────

const FilterPanel = ({ filters, options, settings, handlers, onReset }) => {
  const { handleDateChange, handleYearChange, handleAgeChange, setFilters } = handlers;

  return (
    <div className="filter-panel">
      {filters.ids && (
        <div>
          <label>Selection</label>
          <span className="filter-static">{filters.ids.length + " items"}</span>
        </div>
      )}

      <div>
        <label>Year</label>
        <select value={filters.year} onChange={e => handleYearChange(e.target.value)}>
          <option value="">All</option>
          {options.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div>
        <label>Date</label>
        <input
          type="date"
          value={filters.dateExact}
          min={options.minDate}
          max={options.maxDate}
          disabled={!!filters.dateFrom || !!filters.dateTo}
          onChange={e => handleDateChange("dateExact", e.target.value)}
        />
      </div>

      <div>
        <label>Date From</label>
        <input
          type="date"
          value={filters.dateFrom}
          min={options.minDate}
          max={options.maxDate}
          disabled={!!filters.dateExact}
          onChange={e => handleDateChange("dateFrom", e.target.value)}
        />
      </div>

      <div>
        <label>Date To</label>
        <input
          type="date"
          value={filters.dateTo}
          min={options.minDate}
          max={options.maxDate}
          disabled={!!filters.dateExact}
          onChange={e => handleDateChange("dateTo", e.target.value)}
        />
      </div>

      {[
        ["Device",     "device",    options.devices],
        ["Filetype",   "filetype",  options.filetypes],
        ["Media Type", "mediaType", options.mediaTypes],
      ].map(([label, key, opts]) => (
        <div key={key}>
          <label>{label}</label>
          <select value={filters[key]} onChange={e => setFilters(prev => ({ ...prev, [key]: e.target.value }))}>
            <option value="">All</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      ))}

      <div>
        <label>Source</label>
        <select value={filters.folder} onChange={e => setFilters(prev => ({ ...prev, folder: e.target.value }))}>
          <option value="">All</option>
          {options.folders.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label>Tag</label>
        <select
          value={filters.tagId}
          onChange={e => setFilters(prev => ({ ...prev, tagId: e.target.value }))}
        >
          <option value="">All</option>
          {(options.tags ?? []).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label>Country</label>
        <select value={filters.country} onChange={e => setFilters(prev => ({ ...prev, country: e.target.value }))}>
          <option value="">All</option>
          {options.countries.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {settings?.birthDate && (
        <div>
          <label>Age</label>
          <select value={filters.age} onChange={e => handleAgeChange(e.target.value, settings.birthDate)}>
            <option value="">All</option>
            {[...options.ages].reverse().map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}

      <div className="action-panel-reset">
        <button onClick={onReset}><FontAwesomeIcon icon={faUndo} /></button>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const ActionPanel = ({
  settings,
  type,
  onApply,
  actionPanelKey,
  activeFilters,
  activeMapFilters,
  activeView,
  activeShuffleFilters,
  activeShuffleSettings,
}) => {
  const [sortBy,    setSortBy]    = useState(DEFAULT_SORT.sortBy);
  const [sortOrder, setSortOrder] = useState(DEFAULT_SORT.sortOrder);
  const [searchBy,  setSearchBy]  = useState(DEFAULT_SEARCH.searchBy);
  const [searchTerm, setSearchTerm] = useState(DEFAULT_SEARCH.searchTerm);
  const [prevActionPanelKey, setPrevActionPanelKey] = useState(0);

  const [shuffleSettings, setShuffleSettings] = useState(DEFAULT_SHUFFLE_SETTINGS);

  const [options, setOptions] = useState({
    devices: [], folders: [], filetypes: [], mediaTypes: [],
    minDate: "", maxDate: "", countries: [], years: [], tags: [], ages: [],
  });

  const explore = useFilterState(activeFilters || EMPTY_FILTERS);
  const shuffle = useFilterState(activeShuffleFilters || EMPTY_FILTERS);
  const map     = useFilterState(activeMapFilters || EMPTY_FILTERS);

  // ── Fetch options ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchOptions() {
      const opts = await window.electron.ipcRenderer.invoke("fetch-options", {
        birthDate: settings?.birthDate ?? null,
      });
      setOptions(opts);
    }
    fetchOptions();
  }, [settings, actionPanelKey]);

  // ── Sync default sort from settings ───────────────────────────────────────

  useEffect(() => {
    if (settings?.defaultSort && !activeFilters) {
      setSortBy(settings.defaultSort);
    }
  }, [settings]);

  // ── Sync active state when view changes ───────────────────────────────────

  useEffect(() => {
    if (activeView === "explore") {
      if (activeFilters?.sortBy && activeFilters?.sortOrder) {
        setSortBy(activeFilters.sortBy);
        setSortOrder(activeFilters.sortOrder);
      } else if (activeFilters?.searchBy && activeFilters?.searchTerm) {
        setSearchBy(activeFilters.searchBy);
        setSearchTerm(activeFilters.searchTerm);
      } else if (activeFilters) {
        explore.setFilters(prev => ({ ...prev, ...activeFilters }));
      }
    } else if (activeView === "shuffle") {
      if (activeShuffleFilters)  shuffle.setFilters(prev => ({ ...prev, ...activeShuffleFilters }));
      if (activeShuffleSettings) setShuffleSettings(prev => ({ ...prev, ...activeShuffleSettings }));
    } else if (activeView === "map") {
      if (activeMapFilters) map.setFilters(prev => ({ ...prev, ...activeMapFilters }));
    }
  }, [activeView]);

  // ── Auto-apply on state change ─────────────────────────────────────────────

  useEffect(() => { if (type === "sort")   onApply({ sortBy, sortOrder }); }, [sortBy, sortOrder]);
  useEffect(() => { if (type === "filter") onApply(explore.filters); },     [explore.filters]);
  useEffect(() => { if (type === "shuffle-filter")   onApply(shuffle.filters); },  [shuffle.filters]);
  useEffect(() => { if (type === "shuffle-settings") onApply(shuffleSettings); },  [shuffleSettings]);
  useEffect(() => { if (type === "search") onApply({ searchBy, searchTerm }); },   [searchBy, searchTerm]);
  useEffect(() => { if (type === "map-filter") onApply(map.filters); },            [map.filters]);

  // ── Reset helpers ──────────────────────────────────────────────────────────

  const resetSort   = () => { setSortBy(settings?.defaultSort ?? "media_id"); setSortOrder("desc"); };
  const resetSearch = () => { setSearchBy("name"); setSearchTerm(""); };

  // Explore filters also clear sort/search
  const handleExploreDate = (field, value) => { explore.handleDateChange(field, value); resetSort(); resetSearch(); };
  const handleExploreYear = (year)          => { explore.handleYearChange(year);         resetSort(); resetSearch(); };
  const handleExploreAge  = (age)           => { explore.handleAgeChange(age, settings?.birthDate); resetSort(); resetSearch(); };
  const handleExploreFilter = (key, value)  => { explore.setFilters(prev => ({ ...prev, [key]: value })); resetSort(); resetSearch(); };

  const resetExploreAll = () => { explore.resetFilters(); resetSort(); resetSearch(); };

  // ── Reset on panel key change ──────────────────────────────────────────────

  useEffect(() => {
    if (actionPanelKey !== prevActionPanelKey) {
      setPrevActionPanelKey(actionPanelKey);
      explore.resetFilters();
      resetSearch();
      setSortBy("media_id");
      setSortOrder("desc");
    }
  }, [actionPanelKey]);

  if (!type) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="action-panel">

      {type === "sort" && (
        <div className="sort-panel">
          <label>Sort by:</label>
          <select value={sortBy} onChange={e => { resetSearch(); explore.resetFilters(); setSortBy(e.target.value); }}>
            <option value="media_id">ID</option>
            <option value="name">Name</option>
            <option value="create_date_local">Date Taken</option>
            <option value="created">Date Created</option>
            <option value="size">File Size</option>
            <option value="random">Random</option>
          </select>
          <button onClick={() => {resetSearch(); explore.resetFilters(); setSortOrder("asc")}}  className={sortOrder === "asc"  ? "active" : ""}>Asc</button>
          <button onClick={() => {resetSearch(); explore.resetFilters(); setSortOrder("desc")}} className={sortOrder === "desc" ? "active" : ""}>Desc</button>
          <div className="action-panel-reset">
            <button onClick={resetSort}><FontAwesomeIcon icon={faUndo} /></button>
          </div>
        </div>
      )}

      {type === "filter" && (
        <FilterPanel
          filters={explore.filters}
          options={options}
          settings={settings}
          handlers={{
            handleDateChange: handleExploreDate,
            handleYearChange: handleExploreYear,
            handleAgeChange:  handleExploreAge,
            setFilters: (updater) => {
              // Wrap setFilters to also reset sort/search for explore view
              explore.setFilters(updater);
              resetSort();
              resetSearch();
            },
          }}
          onReset={resetExploreAll}
        />
      )}

      {type === "search" && (
        <div className="search-panel">
          <select value={searchBy} onChange={e => { explore.resetFilters(); resetSort(); setSearchBy(e.target.value); }}>
            <option value="name">Name</option>
            <option value="media_id">ID</option>
          </select>
          <input
            type="text"
            value={searchTerm}
            onChange={e => { explore.resetFilters(); resetSort(); setSearchTerm(e.target.value); }}
            placeholder="Search..."
          />
          <div className="action-panel-reset">
            <button onClick={resetSearch}><FontAwesomeIcon icon={faUndo} /></button>
          </div>
        </div>
      )}

      {type === "shuffle-filter" && (
        <FilterPanel
          filters={shuffle.filters}
          options={options}
          settings={settings}
          handlers={shuffle}
          onReset={shuffle.resetFilters}
        />
      )}

      {type === "shuffle-settings" && (
        <div className="shuffle-settings-panel">
          <div>
            <label>Shuffle Interval: </label>
            <input
              type="number"
              min="1"
              value={shuffleSettings.shuffleInterval}
              onChange={e => {
                const value = Number(e.target.value);
                setShuffleSettings(prev => ({ ...prev, shuffleInterval: isNaN(value) || value < 1 ? 1 : value }));
              }}
              style={{ width: "80px" }}
            />
            <span> seconds</span>
          </div>
          <div>
            <label>Hide Metadata: </label>
            <div className="slider-wrapper">
              <label className="switch">
                <input type="checkbox" id="shuffle-chronological-checkbox" checked={shuffleSettings.hideInfo} onChange={e => setShuffleSettings(prev => ({ ...prev, hideInfo: e.target.checked }))} />
                <div className="slider round"></div>
              </label>
            </div>
          </div>
          <div>
            <label>Smooth Transition: </label>
            <div className="slider-wrapper">
              <label className="switch">
                <input type="checkbox" id="shuffle-chronological-checkbox" checked={shuffleSettings.smoothTransition} onChange={e => setShuffleSettings(prev => ({ ...prev, smoothTransition: e.target.checked }))} />
                <div className="slider round"></div>
              </label>
            </div>
          </div>
          <div>
            <label>Chronological: </label>
            <div className="slider-wrapper">
              <label className="switch">
                <input type="checkbox" id="shuffle-chronological-checkbox" checked={shuffleSettings.chronological} onChange={e => setShuffleSettings(prev => ({ ...prev, chronological: e.target.checked }))} />
                <div className="slider round"></div>
              </label>
            </div>
          </div>
        </div>
      )}

      {type === "map-filter" && (
        <FilterPanel
          filters={map.filters}
          options={options}
          settings={settings}
          handlers={map}
          onReset={map.resetFilters}
        />
      )}

    </div>
  );
};

export default ActionPanel;