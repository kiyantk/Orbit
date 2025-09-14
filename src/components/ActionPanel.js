import { faUndo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useState, useEffect } from "react";

const ActionPanel = ({ type, onApply }) => {
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    device: "",
    folder: "",
    filetype: "",
    mediaType: "",
    country: "",
    year: ""
  });
  const [searchBy, setSearchBy] = useState("name");
  const [searchTerm, setSearchTerm] = useState("");

  // Options dynamically loaded from indexed files
  const [options, setOptions] = useState({
    devices: [],
    folders: [],
    filetypes: [],
    mediaTypes: [],
    minDate: "",
    maxDate: "",
    countries: [],
    years: []
  });

  // Fetch options from database on mount
useEffect(() => {
  async function fetchOptions() {
    const opts = await window.electron.ipcRenderer.invoke("fetch-options");
    setOptions(opts);

    if (opts.minDate && opts.maxDate) {
      setFilters(f => ({ ...f, dateFrom: opts.minDate, dateTo: opts.maxDate }));
    }
  }

  fetchOptions();
}, []);

  // Auto-apply filters or sort whenever they change
  useEffect(() => {
    if (type === "sort") onApply({ sortBy, sortOrder });
    if (type === "filter") onApply(filters);
    if (type === "search") onApply({ searchBy, searchTerm });
  }, [sortBy, sortOrder, filters, searchBy, searchTerm]);

  // Handle date linking
  const handleDateChange = (field, value) => {
    setFilters(prev => {
      let newFilters = { ...prev, [field]: value };
      if (field === "dateFrom" && newFilters.dateTo && value > newFilters.dateTo) {
        newFilters.dateTo = value;
      } else if (field === "dateTo" && newFilters.dateFrom && value < newFilters.dateFrom) {
        newFilters.dateFrom = value;
      }
      return newFilters;
    });
  };

  // Handle year change
const handleYearChange = (year) => {
  setFilters(prev => {
    if (!year) return { ...prev, year: "", dateFrom: options.minDate, dateTo: options.maxDate };

    const dateFrom = `${year}-01-01`;
    const dateTo = `${year}-12-31`;
    return { ...prev, year, dateFrom, dateTo };
  });
};

  if (!type) return null;

const resetFilters = () => {
  setFilters({
    dateFrom: options.minDate || "",
    dateTo: options.maxDate || "",
    device: "",
    folder: "",
    filetype: "",
    mediaType: "",
    country: "",
    year: ""
  });
};

const resetSort = () => {
  setSortBy("id")
  setSortOrder("desc")
}

const resetSearch = () => {
  setSearchBy("name")
  setSearchTerm("")
}

  return (
    <div className="action-panel">
      {type === "sort" && (
        <div className="sort-panel">
          <label>Sort by:</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">Name</option>
            <option value="create_date">Date Taken</option>
            <option value="created">Date Created</option>
            <option value="id">ID</option>
          </select>
          <button onClick={() => setSortOrder("asc")} className={sortOrder === "asc" ? "active" : ""}>Asc</button>
          <button onClick={() => setSortOrder("desc")} className={sortOrder === "desc" ? "active" : ""}>Desc</button>
          <div className="action-panel-reset"><button onClick={resetSort}><FontAwesomeIcon icon={faUndo}/></button></div>
        </div>
      )}

      {type === "filter" && (
        <div className="filter-panel">
          <div>
            <label>Year:</label>
            <select value={filters.year} onChange={e => handleYearChange(e.target.value)}>
              <option value="">All</option>
              {options.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label>Date From:</label>
            <input type="date" 
                   value={filters.dateFrom} 
                   min={options.minDate} 
                   max={options.maxDate} 
                   onChange={e => handleDateChange("dateFrom", e.target.value)}/>
          </div>
          <div>
            <label>Date To:</label>
            <input type="date" 
                   value={filters.dateTo} 
                   min={options.minDate} 
                   max={options.maxDate} 
                   onChange={e => handleDateChange("dateTo", e.target.value)}/>
          </div>
          <div>
            <label>Device:</label>
            <select value={filters.device} onChange={e => setFilters(f => ({ ...f, device: e.target.value }))}>
              <option value="">All</option>
              {options.devices.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>Folder:</label>
            <select value={filters.folder} onChange={e => setFilters(f => ({ ...f, folder: e.target.value }))}>
              <option value="">All</option>
              {options.folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Filetype:</label>
            <select value={filters.filetype} onChange={e => setFilters(f => ({ ...f, filetype: e.target.value }))}>
              <option value="">All</option>
              {options.filetypes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Media Type:</label>
            <select value={filters.mediaType} onChange={e => setFilters(f => ({ ...f, mediaType: e.target.value }))}>
              <option value="">All</option>
              {options.mediaTypes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label>Country:</label>
            <select value={filters.country} onChange={e => setFilters(f => ({ ...f, country: e.target.value }))}>
              <option value="">All</option>
              {options.countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="action-panel-reset"><button onClick={resetFilters}><FontAwesomeIcon icon={faUndo}/></button></div>
        </div>
      )}

      {type === "search" && (
        <div className="search-panel">
          <select value={searchBy} onChange={e => setSearchBy(e.target.value)}>
            <option value="name">Name</option>
            <option value="id">ID</option>
          </select>
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." />
          <div className="action-panel-reset"><button onClick={resetSearch}><FontAwesomeIcon icon={faUndo}/></button></div>
        </div>
      )}
    </div>
  );
};

export default ActionPanel;
