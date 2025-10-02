import React, { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import "leaflet.heat";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleNodes, faFire, faGlobe, faLightbulb, faLocationDot, faMoon } from "@fortawesome/free-solid-svg-icons";

const MapView = () => {
  const mapRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [countryNameMap, setCountryNameMap] = useState({});
  const [countryCounts, setCountryCounts] = useState({});
  const [countryBounds, setCountryBounds] = useState({});
  const allCoords = useRef([]);
  const clusterLayer = useRef(L.markerClusterGroup());
  const allLayer = useRef(L.layerGroup());
  const heatLayer = useRef(null);
  const lineLayer = useRef(null);
  const currentTileLayer = useRef(null);
  const [countriesMenuVisible, setCountriesMenuVisible] = useState(false);
  const [currentMode, setCurrentMode] = useState(null)

  // Fetch all files on mount
  useEffect(() => {
    const fetchAllFiles = async () => {
      setLoading(true);
      try {
        const res = await window.electron.ipcRenderer.invoke("fetch-files", {
          offset: 0,
          limit: 100000000,
        });
        if (res.success) setFiles(res.rows || []);
      } catch (err) {
        console.error("Failed to fetch files", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllFiles();
  }, []);

  // Inside the component, but outside useEffect
  const switchTheme = (themeName) => {
    const map = mapRef.current.leafletMap;
    if (!map) return;
  
    const themes = {
      default: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
      },
      light: {
        url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        attribution:
          '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, © <a href="https://carto.com/">CARTO</a>',
      },
      dark: {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution:
          '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>, © <a href="https://carto.com/">CARTO</a>',
      },
    };
  
    if (!themes[themeName]) return;
    if (currentTileLayer.current) map.removeLayer(currentTileLayer.current);
    currentTileLayer.current = L.tileLayer(themes[themeName].url, {
      attribution: themes[themeName].attribution,
      maxZoom: 20,
    }).addTo(map);
  };


  // Initialize map
  useEffect(() => {
    const map = L.map(mapRef.current, { preferCanvas: false }).setView([0, 0], 2);
    mapRef.current.leafletMap = map;

    switchTheme("default");
    setCurrentMode("cluster");

    return () => map.remove();
  }, []);

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

  // Load files into map
  useEffect(() => {
    if (!files.length) return;
    const map = mapRef.current.leafletMap;

    const haversineDistance = (coord1, coord2) => {
      const R = 6371;
      const toRad = (x) => (x * Math.PI) / 180;
      const [lat1, lon1] = coord1;
      const [lat2, lon2] = coord2;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const countryBoundsTemp = {};
    const countryCountsTemp = {};
    const allCoordsTemp = [];

    let lineSegments = [];
    let currentSegment = [];
    let lastPoint = null;

    files.forEach((item) => {
      if (!item.latitude || !item.longitude) return;
      const latlng = [item.latitude, item.longitude];
      allCoordsTemp.push(latlng);

      if (item.altitude && item.altitude <= 1500) {
        if (item.country) {
          if (!countryBoundsTemp[item.country]) countryBoundsTemp[item.country] = [];
          countryBoundsTemp[item.country].push(latlng);
          countryCountsTemp[item.country] = (countryCountsTemp[item.country] || 0) + 1;
        }
      }

      const marker = L.marker(latlng, {
        icon: L.icon({
          iconUrl: "/marker.png",
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        }),
      });

      const popupContent = `
        <b>${item.filename}</b><br>
        ${formatTimestamp(item.create_date) || "No date"}<br>
        ${item.device_model || "Unknown device"}<br>
        ${item.country || "Unknown country"}${
        item.altitude ? " | " + item.altitude.toFixed(0) + " meters" : ""
      }
      `;
      marker.bindPopup(popupContent);

      clusterLayer.current.addLayer(marker);
      allLayer.current.addLayer(marker);

      if (item.altitude && item.altitude <= 1500) {
        if (lastPoint) {
          const dist = haversineDistance(lastPoint, latlng);
          if (dist > 200) {
            if (currentSegment.length > 1) lineSegments.push(currentSegment);
            currentSegment = [];
          }
        }
        currentSegment.push(latlng);
        lastPoint = latlng;
      }
    });

    if (currentSegment.length > 1) lineSegments.push(currentSegment);

    heatLayer.current = L.heatLayer(allCoordsTemp, { radius: 20, blur: 15 });
    lineLayer.current = L.featureGroup(
      lineSegments.map((seg) => L.polyline(seg, { color: "red" }))
    );

    allCoords.current = allCoordsTemp;
    setCountryBounds(countryBoundsTemp);
    setCountryCounts(countryCountsTemp);

      (async () => {
    const nameMap = {};
    for (const code of Object.keys(countryCountsTemp)) {
      nameMap[code] = await getCountryName(code);
    }
    setCountryNameMap(nameMap);
  })();

    map.addLayer(clusterLayer.current);
    if (clusterLayer.current.getLayers().length) map.fitBounds(clusterLayer.current.getBounds());
  }, [files]);

  const handleCountryClick = async (countryCode) => {
    const map = mapRef.current.leafletMap;
    if (!countryBounds[countryCode]) return;
    const bounds = L.latLngBounds(countryBounds[countryCode]);
    map.fitBounds(bounds);
  };

  // Fetch country name via IPC
  const getCountryName = async (code) => {
    try {
      return await window.electron.ipcRenderer.invoke("get-country-name", code);
    } catch {
      return code;
    }
  };

  return (
    <>
      <div ref={mapRef} style={{ height: "calc(100% - 23px)", width: "100%", display: !loading ? "block" : "none" }}></div>
      {/* Floating Buttons */}
      {countriesMenuVisible && (
        <div
          id="countriesMenu"
          style={{
            position: "absolute",
            top: 40,
            right: 20,
            minWidth: 250,
            maxHeight: 400,
            overflowY: "auto",
            background: "rgba(44,44,44,0.95)",
            color: "white",
            padding: 10,
            borderRadius: 10,
            zIndex: 1000,
          }}
        >
          <h3>Visited Countries</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {Object.entries(countryCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([code, count]) => (
                <li
                  key={code}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 2px" }}
                  onClick={() => handleCountryClick(code)}
                >
                  <img
                    src={`https://cdn.kiy.li/img/flags/${code.toLowerCase()}.svg`}
                    alt={code}
                    style={{ width: 20, height: 14, objectFit: "cover", borderRadius: 2 }}
                  />
                  <span>{countryNameMap[code] || code} ({count})</span>
                </li>
              ))}
          </ul>
        </div>
      )}
      <div className="fab-container">
        {/* Mode buttons */}
        <div className="mode-buttons" id="modeButtons">
          <button
            className="fab"
            title="Cluster Mode"
            style={{ color: currentMode === "cluster" ? "#e6cdff" : "white" }}
            onClick={() => {
              const map = mapRef.current.leafletMap;
              [clusterLayer.current, allLayer.current, heatLayer.current, lineLayer.current].forEach(
                (l) => l && map.removeLayer(l)
              );
              map.addLayer(clusterLayer.current);
              map.fitBounds(clusterLayer.current.getBounds());
              setCurrentMode("cluster");
            }}
          >
            <FontAwesomeIcon icon={faLocationDot} />
          </button>
          <button
            className="fab"
            title="Heatmap Mode"
            style={{ color: currentMode === "heatmap" ? "#e6cdff" : "white" }}
            onClick={() => {
              const map = mapRef.current.leafletMap;
              [clusterLayer.current, allLayer.current, heatLayer.current, lineLayer.current].forEach(
                (l) => l && map.removeLayer(l)
              );
              map.addLayer(heatLayer.current);
              map.fitBounds(L.latLngBounds(allCoords.current));
              setCurrentMode("heatmap");
            }}
          >
            <FontAwesomeIcon icon={faFire} />
          </button>
          <button
            className="fab"
            title="Line Mode"
            style={{ color: currentMode === "line" ? "#e6cdff" : "white" }}
            onClick={() => {
              const map = mapRef.current.leafletMap;
              [clusterLayer.current, allLayer.current, heatLayer.current, lineLayer.current].forEach(
                (l) => l && map.removeLayer(l)
              );
              map.addLayer(lineLayer.current);
              map.fitBounds(lineLayer.current.getBounds());
              setCurrentMode("line");
            }}
          >
            <FontAwesomeIcon icon={faCircleNodes} />
          </button>
                  <button
          className="fab"
          title="Countries & Regions"
          onClick={() => setCountriesMenuVisible(!countriesMenuVisible)}
        >
          <FontAwesomeIcon icon={faGlobe} />
        </button>
        </div>
        {/* Theme buttons */}
        <div className="theme-buttons" id="themeButtons">
          <button className="fab" onClick={() => switchTheme("default")}>
            D
          </button>
          <button className="fab" onClick={() => switchTheme("light")}>
            <FontAwesomeIcon icon={faLightbulb} />
          </button>
          <button className="fab" onClick={() => switchTheme("dark")}>
            <FontAwesomeIcon icon={faMoon} />
          </button>
        </div>
      </div>
      {loading && (
      <div className="map-loading stats-loading"><div className="loader"></div></div>
      )}
    </>
  );
};

export default MapView;
