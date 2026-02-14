import React, { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import "leaflet.heat";

const MapView = ({mapViewType}) => {
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
  const [countriesMenuVisible, setCountriesMenuVisible] = useState(false);

  // Fetch all files on mount
  useEffect(() => {
 const loadMapData = async () => {
  setLoading(true);
  const res = await window.electron.ipcRenderer.invoke("fetch-map-data");
  if (!res.success) return;

  // markers
  const markers = res.points.map((p) => {
    const marker = L.marker([p.lat, p.lng], {
      icon: L.icon({ iconUrl: "/marker.png", iconSize: [10,10], iconAnchor: [5,5] }),
    });
    marker.on("click", () => {
      if (!marker.getPopup()) {
        const { filename, date, device, country, altitude } = p.popup;
        marker.bindPopup(`
          <b>${filename}</b><br>
          ${formatTimestamp(date)}<br>
          ${device || "Unknown"}<br>
          ${country || "Unknown"}${altitude ? ` | ${altitude.toFixed(0)}m` : ""}
        `).openPopup();
      }
    });
    return marker;
  });

  clusterLayer.current.clearLayers();
  clusterLayer.current.addLayers(markers);

  allCoords.current = res.points.map(p => [p.lat, p.lng]);
  heatLayer.current = L.heatLayer(allCoords.current, { radius: 20, blur: 15 });
  lineLayer.current = L.featureGroup(res.lines.map(seg => L.polyline(seg, { color: "red", weight: 2 })));

  setCountryCounts(res.countryCounts);
  setCountryBounds(res.countryBounds);

  // Fit bounds immediately for first mode
  const map = mapRef.current.leafletMap;
  if (map) {
    let bounds = clusterLayer.current.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds);
    map.addLayer(clusterLayer.current); // default mode
  }

  setLoading(false);
};


    loadMapData();
  }, []);

  // Initialize map
useEffect(() => {
  const map = L.map(mapRef.current, { preferCanvas: false, maxZoom: 18 }).setView([0, 0], 2);

  // Add OSM tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  mapRef.current.leafletMap = map;

  return () => map.remove();
}, []);

// Mode switch effect
useEffect(() => {
  const map = mapRef.current.leafletMap;
  if (!map || !clusterLayer.current) return;

  // Remove all layers first
  [clusterLayer.current, heatLayer.current, lineLayer.current].forEach(
    (layer) => layer && map.hasLayer(layer) && map.removeLayer(layer)
  );

  setCountriesMenuVisible(false);

  let activeLayer = null;

  if (mapViewType === "cluster") {
    activeLayer = clusterLayer.current;
  } else if (mapViewType === "heatmap") {
    activeLayer = heatLayer.current;
  } else if (mapViewType === "line") {
    activeLayer = lineLayer.current;
  } else if (mapViewType === "countries") {
    setCountriesMenuVisible(true);
  }

  if (activeLayer) {
    map.addLayer(activeLayer);

    // Fit bounds automatically for current layer
    let bounds = null;
    if (mapViewType === "cluster") bounds = clusterLayer.current.getBounds();
    if (mapViewType === "heatmap") bounds = L.latLngBounds(allCoords.current);
    if (mapViewType === "line") bounds = lineLayer.current.getBounds();

    if (bounds && bounds.isValid()) map.fitBounds(bounds);
  }
}, [mapViewType, clusterLayer.current, heatLayer.current, lineLayer.current]);


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
  
  function formatLocalDateString(str) {
    if (!str) return '';
    // str is "2024-12-31 23:59:25"
    const [datePart, timePart] = str.split(' ');
    if (!datePart) return '';
    const [year, month, day] = datePart.split('-');
    return `${day}-${month}-${year}${timePart ? ' ' + timePart : ''}`;
  }

  useEffect(() => {
  if (!files.length) return;

  const map = mapRef.current.leafletMap;

  // ---------- helpers ----------
  const toRad = (x) => (x * Math.PI) / 180;
  const haversineDistance = ([lat1, lon1], [lat2, lon2]) => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // ---------- temp structures ----------
  const markers = [];
  const allCoordsTemp = [];
  const countryCountsTemp = {};
  const countryBoundsTemp = {};

  const lineSegments = [];
  let currentSegment = [];
  let lastPoint = null;

  // ---------- main loop ----------
  for (const item of files) {
    const { latitude, longitude, altitude, country } = item;
    if (latitude == null || longitude == null) continue;

    const latlng = [latitude, longitude];
    allCoordsTemp.push(latlng);

    // ---- marker (NO popup yet) ----
    const marker = L.marker(latlng, {
      icon: L.icon({
        iconUrl: "/marker.png",
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      }),
    });

    marker.on("click", () => {
      if (!marker.getPopup()) {
        marker.bindPopup(`
          <b>${item.filename}</b><br>
          ${formatLocalDateString(item.create_date_local) || formatTimestamp(item.create_date) || "No date"}<br>
          ${item.device_model || "Unknown device"}<br>
          ${country || "Unknown country"}${
          altitude ? ` | ${altitude.toFixed(0)} meters` : ""
        }
        `).openPopup();
      }
    });

    markers.push(marker);

    // ---- country stats + lines (low altitude only) ----
    if (altitude && altitude <= 1500 && country) {
      countryCountsTemp[country] =
        (countryCountsTemp[country] || 0) + 1;
      (countryBoundsTemp[country] ||= []).push(latlng);

      if (lastPoint) {
        const dist = haversineDistance(lastPoint, latlng);
        if (dist > 200) {
          if (currentSegment.length > 1)
            lineSegments.push(currentSegment);
          currentSegment = [];
        }
      }
      currentSegment.push(latlng);
      lastPoint = latlng;
    }
  }

  if (currentSegment.length > 1) {
    lineSegments.push(currentSegment);
  }

  // ---------- layers ----------
  clusterLayer.current.clearLayers();
  allLayer.current.clearLayers();

  clusterLayer.current.addLayers(markers);
  allLayer.current.addLayers(markers);

  heatLayer.current = L.heatLayer(allCoordsTemp, {
    radius: 20,
    blur: 15,
  });

  lineLayer.current = L.featureGroup(
    lineSegments.map((seg) =>
      L.polyline(seg, {
        color: "red",
        weight: 2,
        opacity: 0.9,
      })
    )
  );

  // ---------- state updates ----------
  allCoords.current = allCoordsTemp;
  setCountryCounts(countryCountsTemp);
  setCountryBounds(countryBoundsTemp);

  // ---------- resolve country names (parallel) ----------
  (async () => {
    const entries = await Promise.all(
      Object.keys(countryCountsTemp).map(async (code) => [
        code,
        await getCountryName(code),
      ])
    );
    setCountryNameMap(Object.fromEntries(entries));
  })();

  // ---------- initial fit ----------
  map.addLayer(clusterLayer.current);
  const bounds = clusterLayer.current.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds);

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
      {loading && (
      <div className="map-loading stats-loading"><div className="loader"></div></div>
      )}
    </>
  );
};

export default MapView;
