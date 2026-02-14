import { faUndo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useState, useEffect } from "react";

const ActionPanel = ({ settings, type, onApply, actionPanelKey, activeFilters, activeView, activeShuffleFilters }) => {
  const [sortBy, setSortBy] = useState("media_id");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filters, setFilters] = useState({
    dateExact: "",
    dateFrom: "",
    dateTo: "",
    device: "",
    folder: "",
    filetype: "",
    mediaType: "",
    country: "",
    year: "",
    tag: null,
    age: "",
    ids: null
  });
  const [searchBy, setSearchBy] = useState("name");
  const [searchTerm, setSearchTerm] = useState("");
  const [prevActionPanelKey, setPrevActionPanelKey] = useState(0);

  // Options dynamically loaded from indexed files
  const [options, setOptions] = useState({
    devices: [],
    folders: [],
    filetypes: [],
    mediaTypes: [],
    minDate: "",
    maxDate: "",
    countries: [],
    years: [],
    tags: [],
    ages: []
  });

  const [shuffleSettings, setShuffleSettings] = useState({
    shuffleInterval: 8
  });

  const [shuffleFilters, setShuffleFilters] = useState({
    dateExact: "",
    dateFrom: "",
    dateTo: "",
    device: "",
    folder: "",
    filetype: "",
    mediaType: "",
    country: "",
    year: "",
    tag: null,
    age: "",
  });

  // Fetch options from database on mount
  useEffect(() => {
    async function fetchOptions() {
      const opts = await window.electron.ipcRenderer.invoke("fetch-options", {birthDate: settings && settings.birthDate ? settings.birthDate : null});
      setOptions(opts);
    
      // if (opts.minDate && opts.maxDate) {
      //   setFilters(f => ({ ...f, dateFrom: opts.minDate, dateTo: opts.maxDate }));
      // }
    }
  
    fetchOptions();
  }, [settings, actionPanelKey]);
  
  useEffect(() => {
    if(settings && settings.defaultSort && !activeFilters) {
      setSortBy(settings.defaultSort)
    }
  }, [settings]);

    useEffect(() => {
    console.log(filters)
  }, [filters]);

  useEffect(() => {
    if(activeView === "explore") {
      if(activeFilters && activeFilters.sortBy && activeFilters.sortOrder) {
        setSortBy(activeFilters.sortBy)
        setSortOrder(activeFilters.sortOrder)
      } else if(activeFilters && activeFilters.searchBy && activeFilters.searchTerm) {
        setSearchBy(activeFilters.searchBy)
        setSearchTerm(activeFilters.searchTerm)
      } else if(activeFilters) {
        setFilters(prev => ({ ...prev, ...activeFilters }))
      }
    } else if(activeView === "shuffle") {
      if(activeShuffleFilters) {
        setShuffleFilters(prev => ({ ...prev, ...activeShuffleFilters }))
      }
    }
  }, [activeView]);

  // Auto-apply filters or sort whenever they change
  useEffect(() => {
    if (type === "sort") onApply({ sortBy, sortOrder });
    if (type === "filter") onApply(filters);
    if (type === "shuffle-filter") onApply(shuffleFilters);
    if (type === "shuffle-settings") onApply(shuffleSettings);
    if (type === "search") onApply({ searchBy, searchTerm });
  }, [sortBy, sortOrder, filters, searchBy, searchTerm, shuffleFilters, shuffleSettings]);

  // Handle date linking
  const handleDateChange = (field, value) => {
    setFilters(prev => {
      let newFilters = { ...prev, [field]: value };

      if (field === "dateExact") {
        newFilters.dateExact = value;
        // Clear the from/to dates if exact date is set
        if (value) {
          newFilters.dateFrom = "";
          newFilters.dateTo = "";
        }
      } else if (field === "dateFrom" || field === "dateTo") {
        newFilters[field] = value;
        // Clear exact date if from/to is set
        if (value) {
          newFilters.dateExact = "";
          // Reset year and age filters when manually changing date range
          newFilters.year = "";
          newFilters.age = "";
        }
      }
    
      if (field === "dateFrom" && newFilters.dateTo && value > newFilters.dateTo) {
        newFilters.dateTo = value;
      } else if (field === "dateTo" && newFilters.dateFrom && value < newFilters.dateFrom) {
        newFilters.dateFrom = value;
      }
      return newFilters;
    });
    resetSort();
    resetSearch();
  };

    // Handle date linking
  const handleDateShuffleChange = (field, value) => {
    setShuffleFilters(prev => {
      let newFilters = { ...prev, [field]: value };

      if (field === "dateExact") {
        newFilters.dateExact = value;
        // Clear the from/to dates if exact date is set
        if (value) {
          newFilters.dateFrom = "";
          newFilters.dateTo = "";
        }
      } else if (field === "dateFrom" || field === "dateTo") {
        newFilters[field] = value;
        // Clear exact date if from/to is set
        if (value) {
          newFilters.dateExact = "";
        }
      }
    
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
      if (!year) return { ...prev, year: "", dateFrom: "", dateTo: "" };

      const dateFrom = `${year}-01-01`;
      const dateTo = `${year}-12-31`;
      return { ...prev, year, dateFrom, dateTo };
    });
    resetSort();
    resetSearch();
  };

    // Handle year change
  const handleYearShuffleChange = (year) => {
    setShuffleFilters(prev => {
      if (!year) return { ...prev, year: "", dateFrom: "", dateTo: "" };

      const dateFrom = `${year}-01-01`;
      const dateTo = `${year}-12-31`;
      return { ...prev, year, dateFrom, dateTo };
    });
  };

  const resetFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      dateExact: "",
      device: "",
      folder: "",
      filetype: "",
      mediaType: "",
      country: "",
      year: "",
      tag: null,
      age: "",
      ids: null
    });
  };

  const resetShuffleFilters = () => {
    setShuffleFilters({
      dateFrom: "",
      dateTo: "",
      dateExact: "",
      device: "",
      folder: "",
      filetype: "",
      mediaType: "",
      country: "",
      year: "",
      tag: null,
      age: "",
    });
  }

  const resetSort = () => {
    setSortBy(settings.defaultSort || "media_id")
    setSortOrder("desc")
  }

  const resetSearch = () => {
    setSearchBy("name")
    setSearchTerm("")
  }

  const handleAgeChange = (age) => {
    setFilters(prev => {
      if (!age || !settings.birthDate) {
        return {
          ...prev,
          age: "",
          dateFrom: "",
          dateTo: ""
        };
      }

      const birth = new Date(settings.birthDate);

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
        dateTo: dateTo.toISOString().slice(0, 10)
      };
    });
    resetSort();
    resetSearch();
  };

  const handleShuffleAgeChange = (age) => {
    setShuffleFilters(prev => {
      if (!age || !settings.birthDate) {
        return {
          ...prev,
          age: "",
          dateFrom: "",
          dateTo: ""
        };
      }

      const birth = new Date(settings.birthDate);

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
        dateTo: dateTo.toISOString().slice(0, 10)
      };
    });
  };

  const applyFilterChange = updater => {
    resetSearch();
    resetSort();
    setFilters(prev => updater(prev));
  };

  const applySearchChange = (by, term) => {
    resetFilters();
    resetSort();
    setSearchBy(by);
    setSearchTerm(term);
  };

  const applySortChange = (by, order = sortOrder) => {
    resetFilters();
    resetSearch();
    setSortBy(by);
    setSortOrder(order);
  };

  useEffect(() => {
    if(actionPanelKey !== prevActionPanelKey) {
      setPrevActionPanelKey(actionPanelKey)
      resetFilters();
      resetSearch();
      setSortBy("media_id");
      setSortOrder("desc");
    }
  }, [actionPanelKey]);

  if (!type) return null;

  return (
    <div className="action-panel">
      {type === "sort" && (
        <div className="sort-panel">
          <label>Sort by:</label>
          <select value={sortBy} onChange={e => applySortChange(e.target.value)}>
            <option value="media_id">ID</option>
            <option value="name">Name</option>
            <option value="create_date_local">Date Taken</option>
            <option value="created">Date Created</option>
            <option value="size">File Size</option>
            <option value="random">Random</option>
          </select>
          <button  onClick={() => applySortChange(sortBy, "asc")} className={sortOrder === "asc" ? "active" : ""}>Asc</button>
          <button  onClick={() => applySortChange(sortBy, "desc")} className={sortOrder === "desc" ? "active" : ""}>Desc</button>
          <div className="action-panel-reset"><button onClick={resetSort}><FontAwesomeIcon icon={faUndo}/></button></div>
        </div>
      )}

      {type === "filter" && (
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
            <input type="date" 
                   value={filters.dateExact} 
                   min={options.minDate} 
                   max={options.maxDate}
                   disabled={!!filters.dateFrom || !!filters.dateTo}
                   onChange={e => handleDateChange("dateExact", e.target.value)}/>
          </div>
          <div>
            <label>Date From</label>
            <input type="date" 
                   value={filters.dateFrom} 
                   min={options.minDate} 
                   max={options.maxDate}
                   disabled={!!filters.dateExact} 
                   onChange={e => handleDateChange("dateFrom", e.target.value)}/>
          </div>
          <div>
            <label>Date To</label>
            <input type="date" 
                   value={filters.dateTo} 
                   min={options.minDate} 
                   max={options.maxDate}
                   disabled={!!filters.dateExact}
                   onChange={e => handleDateChange("dateTo", e.target.value)}/>
          </div>
          <div>
            <label>Device</label>
            <select value={filters.device} onChange={e => applyFilterChange(prev => ({...prev, device: e.target.value}))}>
              <option value="">All</option>
              {options.devices.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>Source</label>
            <select value={filters.folder} onChange={e => applyFilterChange(prev => ({...prev, folder: e.target.value}))}>
              <option value="">All</option>
              {options.folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Filetype</label>
            <select value={filters.filetype} onChange={e => applyFilterChange(prev => ({...prev, filetype: e.target.value}))}>
              <option value="">All</option>
              {options.filetypes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Media Type</label>
            <select value={filters.mediaType} onChange={e => applyFilterChange(prev => ({...prev, mediaType: e.target.value}))}>
              <option value="">All</option>
              {options.mediaTypes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label>Country</label>
            <select value={filters.country} onChange={e => applyFilterChange(prev => ({...prev, country: e.target.value}))}>
              <option value="">All</option>
              {options.countries.map(c => c !== "" ? <option key={c} value={c}>{c}</option> : "")}
            </select>
          </div>
          <div>
            <label>Tag</label>
            <select value={filters.tag}onChange={e => applyFilterChange(prev => ({...prev, tag: e.target.value}))}>
              <option value="">All</option>
              {options.tags?.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {settings && settings.birthDate && (
            <div>
              <label>Age</label>
              <select value={filters.age} onChange={e => handleAgeChange(e.target.value)}>
                <option value="">All</option>
                {options.ages.map(d => <option key={d} value={d}>{d}</option>).reverse()}
              </select>
            </div>
          )}
          <div className="action-panel-reset"><button onClick={resetFilters}><FontAwesomeIcon icon={faUndo}/></button></div>
        </div>
      )}

      {type === "search" && (
        <div className="search-panel">
          <select value={searchBy} onChange={e => applySearchChange(e.target.value, searchTerm)}>
            <option value="name">Name</option>
            <option value="media_id">ID</option>
          </select>
          <input type="text" value={searchTerm} onChange={e => applySearchChange(searchBy, e.target.value)} placeholder="Search..." />
          <div className="action-panel-reset"><button onClick={resetSearch}><FontAwesomeIcon icon={faUndo}/></button></div>
        </div>
      )}

      {type === "shuffle-filter" && (
        <div className="filter-panel">
          <div>
            <label>Year</label>
            <select value={shuffleFilters.year} onChange={e => handleYearShuffleChange(e.target.value)}>
              <option value="">All</option>
              {options.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label>Date</label>
            <input type="date" 
                   value={shuffleFilters.dateExact} 
                   min={options.minDate} 
                   max={options.maxDate}
                   disabled={!!shuffleFilters.dateFrom || !!shuffleFilters.dateTo}
                   onChange={e => handleDateShuffleChange("dateExact", e.target.value)}/>
          </div>
          <div>
            <label>Date From</label>
            <input type="date" 
                   value={shuffleFilters.dateFrom} 
                   min={options.minDate} 
                   max={options.maxDate}
                   disabled={!!shuffleFilters.dateExact} 
                   onChange={e => handleDateShuffleChange("dateFrom", e.target.value)}/>
          </div>
          <div>
            <label>Date To</label>
            <input type="date" 
                   value={shuffleFilters.dateTo} 
                   min={options.minDate} 
                   max={options.maxDate}
                   disabled={!!shuffleFilters.dateExact}
                   onChange={e => handleDateShuffleChange("dateTo", e.target.value)}/>
          </div>
          <div>
            <label>Device</label>
            <select value={shuffleFilters.device} onChange={e => setShuffleFilters(f => ({ ...f, device: e.target.value }))}>
              <option value="">All</option>
              {options.devices.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>Source</label>
            <select value={shuffleFilters.folder} onChange={e => setShuffleFilters(f => ({ ...f, folder: e.target.value }))}>
              <option value="">All</option>
              {options.folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Filetype</label>
            <select value={shuffleFilters.filetype} onChange={e => setShuffleFilters(f => ({ ...f, filetype: e.target.value }))}>
              <option value="">All</option>
              {options.filetypes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label>Media Type</label>
            <select value={shuffleFilters.mediaType} onChange={e => setShuffleFilters(f => ({ ...f, mediaType: e.target.value }))}>
              <option value="">All</option>
              {options.mediaTypes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label>Country</label>
            <select value={shuffleFilters.country} onChange={e => setShuffleFilters(f => ({ ...f, country: e.target.value }))}>
              <option value="">All</option>
              {options.countries.map(c => c !== "" ? <option key={c} value={c}>{c}</option> : "")}
            </select>
          </div>
          <div>
            <label>Tag</label>
            <select value={shuffleFilters.tag} onChange={e => setShuffleFilters(f => ({ ...f, tag: e.target.value }))}>
              <option value="">All</option>
              {options.tags?.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {settings && settings.birthDate && (
            <div>
              <label>Age</label>
              <select value={shuffleFilters.age} onChange={e => handleShuffleAgeChange(e.target.value)}>
                <option value="">All</option>
                {options.ages.map(d => <option key={d} value={d}>{d}</option>).reverse()}
              </select>
            </div>
          )}
          <div className="action-panel-reset" onClick={resetShuffleFilters}>
            <button><FontAwesomeIcon icon={faUndo}/></button>
          </div>
        </div>
      )}

      {type === "shuffle-settings" && (
  <div className="shuffle-settings-panel">
    <label>Shuffle Interval: </label>
    <input
      type="number"
      min="1"
      value={shuffleSettings.shuffleInterval || 8}
      onChange={e => {
        const value = Number(e.target.value);
        setShuffleSettings({ 
          shuffleInterval: isNaN(value) || value < 1 ? 1 : value 
        });
      }}
      style={{ width: "80px" }}
    />
    <span> seconds</span>
  </div>
)}

    </div>
  );
};

export default ActionPanel;
