import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import CalendarHeatmap from "react-calendar-heatmap"
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";

const StatsView = ({ birthDate }) => {
  const [files, setFiles] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState({
    perYear: [],
    perMonth: [],
    perAge: [],
    topDays: [],
    byType: [],
    byDevice: [],
    byCountry: [],
    totalFiles: 0,
    totalStorage: 0,
    longestStreaks: [],
    calendarData: []
  });
  const currentYear = new Date().getFullYear();
  const [calendarDate, setCalendarDate] = useState({
    start: new Date(currentYear, 0, 1).getTime(),           // local Jan 1 00:00
    end: new Date(currentYear, 11, 31, 23, 59, 59, 999).getTime() // local Dec 31 23:59:59
  });

  const [loading, setLoading] = useState(true);

  const handleChangeYear = (offset) => {
    setCalendarDate(prev => {
      const year = new Date(prev.start).getFullYear() + offset;
      return {
        start: new Date(year, 0, 1).getTime(),
        end: new Date(year, 11, 31, 23, 59, 59, 999).getTime()
      };
    });
  };


  useEffect(() => {
    const fetchAllFiles = async () => {
      setLoading(true);
      try {
        const res = await window.electron.ipcRenderer.invoke("fetch-files", { offset: 0, limit: 100000000 });
        if (res.success) setFiles(res.rows || []);
      } catch (err) {
        console.error("Failed to fetch files", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllFiles();
  }, []);

  function capitalizeFirstLetter(string) {
    return string.split('').map((char, index) => index === 0 ? char.toUpperCase() : char).join('')
  }

  const getReferenceEpoch = item => {
    if (item.create_date) return item.create_date;

    const fallback = Math.min(
      item.created ?? Infinity,
      item.modified ?? Infinity
    );

    return fallback === Infinity ? null : fallback;
  };

  useEffect(() => {
    if (!files.length) return;

    const groupBy = (arr, keyFn) => {
      return arr.reduce((acc, item) => {
        const key = keyFn(item);
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    };

    const perYearObj = groupBy(files, f => f.create_date ? new Date(f.create_date*1000).getFullYear() : null);
    const perYear = Object.keys(perYearObj).sort((a,b) => a-b).map(year => ({ year, count: perYearObj[year] })).reverse();

    const perMonthObj = groupBy(files, f => f.create_date ? `${new Date(f.create_date*1000).getFullYear()}-${String(new Date(f.create_date*1000).getMonth()+1).padStart(2,'0')}` : null);
    const perMonth = Object.keys(perMonthObj).sort().map(month => ({ month, count: perMonthObj[month] })).reverse();

    const ageCounts = [];

    if (birthDate) {
      const birth = new Date(birthDate);
    
      files.forEach(f => {
        const referenceDate = getReferenceEpoch(f);
        if (!referenceDate) return;
      
        const fileDate = new Date(referenceDate * 1000);
      
        let age = fileDate.getFullYear() - birth.getFullYear();
        if (
          fileDate.getMonth() < birth.getMonth() ||
          (fileDate.getMonth() === birth.getMonth() &&
           fileDate.getDate() < birth.getDate())
        ) {
          age--;
        }
      
        ageCounts[age] = (ageCounts[age] || 0) + 1;
      });
    }
    const perAge = Object.keys(ageCounts).map(a => ({ age: a, count: ageCounts[a] })).reverse();

    const topDaysObj = groupBy(files, f => f.create_date ? new Date(f.create_date*1000).toISOString().split("T")[0] : null);
    const topDays = Object.keys(topDaysObj).map(day => ({ day, count: topDaysObj[day] })).sort((a,b) => b.count - a.count).slice(0,10);

    const byTypeObj = groupBy(files, f => capitalizeFirstLetter(f.file_type) || "Unknown");
    const byType = Object.keys(byTypeObj).map(type => ({ type, count: byTypeObj[type] })).sort((a,b) => b.count - a.count);

    const byDeviceObj = groupBy(files, f => f.device_model || "Unknown");
    const byDevice = Object.keys(byDeviceObj).map(device => ({ device, count: byDeviceObj[device] })).sort((a,b) => b.count - a.count);

    const byCountryObj = groupBy(files, f => f.country || "Unknown");
    const byCountry = Object.keys(byCountryObj).map(country => ({ country, count: byCountryObj[country] })).sort((a,b) => b.count - a.count);

    const totalFiles = files.length;
    const totalStorage = files.reduce((sum,f) => sum + (f.size || 0), 0);

    // Compute streaks
    const dates = Object.keys(topDaysObj).sort();
    let streaks = [];
    let streakStart = dates[0];
    let streakLength = 1;
      
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (curr - prev) / (1000 * 60 * 60 * 24);
    
      if (diff === 1) {
        streakLength++;
      } else {
        streaks.push({ start: streakStart, end: dates[i - 1], length: streakLength });
        streakStart = dates[i];
        streakLength = 1;
      }
    }
    streaks.push({ start: streakStart, end: dates[dates.length - 1], length: streakLength });
    
    streaks.sort((a, b) => b.length - a.length);
    const calendarData = Object.values(
      files
        .filter(f => {
          const date = new Date(f.create_date * 1000); // treat as local
          const time = date.getTime();
          return time >= calendarDate.start && time <= calendarDate.end;
        })
        .reduce((acc, f) => {
          const date = new Date(f.create_date * 1000); // local date
        
          // Use local YYYY-MM-DD
          const key = date.getFullYear() + "-" +
                      String(date.getMonth() + 1).padStart(2, "0") + "-" +
                      String(date.getDate()).padStart(2, "0");
        
          if (!acc[key]) acc[key] = { date: key, count: 0 };
          acc[key].count++;
          return acc;
        }, {})
    );

    setStats({ perYear, perMonth, perAge, topDays, byType, byDevice, byCountry, totalFiles, totalStorage, longestStreaks: streaks, calendarData });
  }, [files, birthDate, calendarDate]);

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return parseFloat((bytes/k**i).toFixed(2)) + " " + sizes[i];
  };

  if (loading) return <div className="stats-loading"><div className="loader"></div></div>;

  const renderTable = (title, data, key1, key2, key3 = null) => {
    const sortedData = [...data].sort((a, b) => {
      if (a[key1] === "Unknown" && b[key1] !== "Unknown") return 1;
      if (b[key1] === "Unknown" && a[key1] !== "Unknown") return -1;
      return 0;
    });

    return (
      <div className="stats-card-wrapper">
        <div className="stats-card">
          <h3>{title}</h3>
          <table>
            <thead>
              <tr>
                <th>{capitalizeFirstLetter(key1)}</th>
                {key3 && (
                  <th>{capitalizeFirstLetter(key3)}</th>
                )}
                <th>{capitalizeFirstLetter(key2)}</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((item, idx) => (
                <tr key={idx} className={item[key1] === "Unknown" ? "unknown-row" : ""}>
                  <td>{item[key1]}</td>
                  {key3 && (
                    <td>{item[key3]}</td>
                  )}
                  <td>{item[key2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="stats-layout">
      <div className="tabs-sidebar">
        {[
          { id: "overview", label: "Overview" },
          { id: "calendar", label: "Calendar" }
        ].map(tab => (
          <div
            key={tab.id}
            className={`tab-item ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </div>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === "overview" && (
          <>
            <div className="stats-summary">
              <div className="stats-summary-card">
                <h3>Total Files</h3>
                <p>{stats.totalFiles}</p>
              </div>
              <div className="stats-summary-card">
                <h3>Total Size</h3>
                <p>{formatBytes(stats.totalStorage)}</p>
              </div>
            </div>

            <div className="stats-grid">
              {renderTable("Total Media Per Year", stats.perYear, "year", "count")}
              {renderTable("Total Media Per Month", stats.perMonth, "month", "count")}
              {renderTable("Total Media Per Age", stats.perAge, "age", "count")}
              {renderTable("Top 10 Days by Media Count", stats.topDays, "day", "count")}
              {renderTable("By File Type", stats.byType, "type", "count")}
              {renderTable("By Device", stats.byDevice, "device", "count")}
              {renderTable("By Country", stats.byCountry, "country", "count")}
            </div>
          </>
        )}
        {activeTab === "calendar" && (
          <div className="calendar-layout">
            <div className="calendar-heatmap">
              <div className="calendar-header">
                {/* Replace this block with your actual heatmap */}
                <h3>Calendar Heatmap</h3>
                {/* Example usage */}
                <div className="calendar-controls">
                  {/* Button to go back 1 year */}
                  <button onClick={() => handleChangeYear(-1)}>{<FontAwesomeIcon icon={faChevronLeft} />}</button>

                  {/* Current year */}
                  <span>{new Date(calendarDate.start).getFullYear()}</span>

                  {/* Button to go up 1 year */}
                  <button onClick={() => handleChangeYear(1)}>{<FontAwesomeIcon icon={faChevronRight} />}</button>
                </div>
              </div>
          <div>
              <CalendarHeatmap
                startDate={calendarDate.start}
                endDate={calendarDate.end}
                values={stats.calendarData}
                showOutOfRangeDays={true}
                titleForValue={(value) => { 
                  if(!value) return ""
                  return value.date + " (" + value.count + ")"
                }}
                classForValue={(value) => {
                  if (!value) return 'color-empty';

                  // Map counts to 1-4 scale
                  const maxCount = Math.max(...stats.calendarData.map(v => v.count || 0));
                  const minCount = Math.min(...stats.calendarData.map(v => v.count || 0));

                  // Avoid division by zero
                  const scale = maxCount === minCount ? 4 : Math.ceil(((value.count - minCount) / (maxCount - minCount)) * 4);

                  return `color-scale-${scale}`;
                }}
              />
          </div>
            </div>

            <div className="calendar-streaks">
              {renderTable("Longest Streaks", stats.longestStreaks?.slice(0, 20), "start", "length", "end")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsView