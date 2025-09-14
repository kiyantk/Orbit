import React, { useEffect, useState } from "react";

const StatsView = ({ birthDate }) => {
  const [files, setFiles] = useState([]);
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
  });
  const [loading, setLoading] = useState(true);

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
  return string.split('').map((char, index) =>
    index === 0 ? char.toUpperCase() : char).join('')
}

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
        if (!f.create_date) return;
        const fileDate = new Date(f.create_date*1000);
        let age = fileDate.getFullYear() - birth.getFullYear();
        if (fileDate.getMonth() < birth.getMonth() || (fileDate.getMonth() === birth.getMonth() && fileDate.getDate() < birth.getDate())) age--;
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

    setStats({ perYear, perMonth, perAge, topDays, byType, byDevice, byCountry, totalFiles, totalStorage });
  }, [files, birthDate]);

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return parseFloat((bytes/k**i).toFixed(2)) + " " + sizes[i];
  };

  if (loading) return <div className="stats-loading"><div className="loader"></div></div>;

  const renderTable = (title, data, key1, key2) => (
    <div className="stats-card-wrapper">
        <div className="stats-card">
          <h3>{title}</h3>
          <table>
            <thead>
              <tr>
                <th>{capitalizeFirstLetter(key1)}</th>
                <th>{capitalizeFirstLetter(key2)}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => (
                <tr key={idx}>
                  <td>{item[key1]}</td>
                  <td>{item[key2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );

  return (
    <div className="stats-view">
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
    </div>
  );
};

export default StatsView;