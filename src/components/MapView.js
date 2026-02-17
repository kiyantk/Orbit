import React, { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import "leaflet.heat";
import * as topojson from "topojson-client";

const TOPO_URL = "/countries.final.topo.json";

const MapView = ({ mapViewType }) => {
  const containerRef = useRef(null);   // DOM div for Leaflet to mount into
  const mapRef = useRef(null);         // L.Map instance
  const [mapReady, setMapReady] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [countryNameMap, setCountryNameMap] = useState({});
  const [countryCounts, setCountryCounts] = useState({});
  const [countryBounds, setCountryBounds] = useState({});
  const allCoords = useRef([]);
  const clusterLayer = useRef(null);
  const allLayer = useRef(L.layerGroup());
  const heatLayer = useRef(null);
  const lineLayer = useRef(null);
  const countriesLayer = useRef(null);
  const geoJsonCache = useRef(null);
  const [countriesMenuVisible, setCountriesMenuVisible] = useState(false);

  // ─── Initialize map first ─────────────────────────────────────────────────
  useEffect(() => {
    const map = L.map(containerRef.current, {
      preferCanvas: false,
      maxZoom: 18,
    }).setView([0, 0], 2);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    clusterLayer.current = L.markerClusterGroup();
    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      clusterLayer.current = null;
    };
  }, []);

  // ─── Fetch all files — only runs once map is ready ───────────────────────
  useEffect(() => {
    if (!mapReady) return;

    const map = mapRef.current;

    const loadMapData = async () => {
      setLoading(true);
      const res = await window.electron.ipcRenderer.invoke("fetch-map-data");

      // Guard: map may have been torn down while awaiting
      if (!res.success || !mapRef.current) return;

      const markers = res.points.map((p) => {
        const marker = L.marker([p.lat, p.lng], {
          icon: L.icon({
            iconUrl: "/marker.png",
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          }),
        });
        marker.on("click", () => {
          if (!marker.getPopup()) {
            const { filename, date, device, country, altitude } = p.popup;
            marker
              .bindPopup(
                `<b>${filename}</b><br>
                 ${formatTimestamp(date)}<br>
                 ${device || "Unknown"}<br>
                 ${country || "Unknown"}${
                   altitude ? ` | ${altitude.toFixed(0)}m` : ""
                 }`
              )
              .openPopup();
          }
        });
        return marker;
      });

      clusterLayer.current.clearLayers();
      clusterLayer.current.addLayers(markers);

      allCoords.current = res.points.map((p) => [p.lat, p.lng]);
      heatLayer.current = L.heatLayer(allCoords.current, {
        radius: 20,
        blur: 15,
      });
      lineLayer.current = L.featureGroup(
        res.lines.map((seg) => L.polyline(seg, { color: "red", weight: 2 }))
      );

      setCountryCounts(res.countryCounts);
      setCountryBounds(res.countryBounds);

      // Resolve country names
      const entries = await Promise.all(
        Object.keys(res.countryCounts).map(async (code) => [
          code,
          await window.electron.ipcRenderer.invoke("get-country-name", code),
        ])
      );
      setCountryNameMap(Object.fromEntries(entries));

      const bounds = clusterLayer.current.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds);
      map.addLayer(clusterLayer.current);

      setLoading(false);
    };

    loadMapData();
  }, [mapReady]);

  // ─── Load and cache TopoJSON → GeoJSON ───────────────────────────────────
  // Only ever called when switching to the "countries" view type.
  const loadGeoJson = async () => {
    if (geoJsonCache.current) return geoJsonCache.current;

    const res = await fetch(TOPO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${TOPO_URL}`);
    const topo = await res.json();

    const objectKeys = Object.keys(topo.objects);
    if (!objectKeys.length) throw new Error("TopoJSON has no objects");

    const key =
      objectKeys.find((k) => k.toLowerCase().includes("countr")) ??
      objectKeys[0];

    const geojson = topojson.feature(topo, topo.objects[key]);
    geoJsonCache.current = geojson;
    return geojson;
  };

  // ─── Build / rebuild the countries GeoJSON highlight layer ───────────────
  const buildCountriesLayer = async (map, visitedCodes) => {
    if (countriesLayer.current && map.hasLayer(countriesLayer.current)) {
      map.removeLayer(countriesLayer.current);
    }

    let geojson;
    try {
      geojson = await loadGeoJson();
    } catch (e) {
      console.error("[MapView] Failed to load GeoJSON:", e);
      return;
    }

    if (map !== mapRef.current) return;

    // Build a lookup: UPPERCASE ISO_A2 code → original key in visitedCodes
    const visitedUpper = {};
    for (const code of Object.keys(visitedCodes)) {
      visitedUpper[code.toUpperCase()] = code;
    }

    const maxCount = Math.max(...Object.values(visitedCodes), 1);

    // Returns the raw visitedCodes key if this feature is a visited country, else null
    const getMatchedRawCode = (feature) => {
      const iso = (feature.properties?.ISO_A2 || "").toUpperCase();
      return (iso && visitedUpper[iso]) ? visitedUpper[iso] : null;
    };

    countriesLayer.current = L.geoJSON(geojson, {
      style: (feature) => {
        const rawCode = getMatchedRawCode(feature);

        if (!rawCode) {
          return {
            fillColor: "transparent",
            fillOpacity: 0,
            color: "#444",
            weight: 0.4,
            opacity: 0.3,
          };
        }

        const count = visitedCodes[rawCode] || 1;
        const opacity = 0.35 + 0.3 * (count / maxCount);

        return {
          fillColor: "#7f54b3",
          fillOpacity: opacity,
          color: "#4e1982",
          weight: 1.2,
          opacity: 0.9,
        };
      },

      onEachFeature: (feature, layer) => {
        const rawCode = getMatchedRawCode(feature);
        if (!rawCode) return;

        const count = visitedCodes[rawCode] || 0;
        const name =
          feature.properties.ADMIN ||
          feature.properties.NAME ||
          feature.properties.name ||
          feature.properties.NAME_EN ||
          rawCode;

        layer.on({
          mouseover(e) {
            e.target.setStyle({
              fillOpacity: Math.min(
                (e.target.options.fillOpacity || 0.5) + 0.2,
                0.92
              ),
              weight: 2,
            });
            e.target
              .bindTooltip(
                `<b>${name}</b><br/>${count} photo${count !== 1 ? "s" : ""}`,
                { sticky: true, className: "country-tooltip" }
              )
              .openTooltip();
          },
          mouseout(e) {
            countriesLayer.current.resetStyle(e.target);
            e.target.closeTooltip();
          },
          click(e) {
            map.fitBounds(e.target.getBounds(), { padding: [20, 20] });
          },
        });
      },
    });

    map.addLayer(countriesLayer.current);

    // Fit map to visited countries only
    const visitedFeatures = geojson.features.filter(
      (f) => getMatchedRawCode(f) !== null
    );

    if (visitedFeatures.length) {
      const tempLayer = L.geoJSON({
        type: "FeatureCollection",
        features: visitedFeatures,
      });
      const bounds = tempLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    }
  };

  // ─── Mode switch ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !clusterLayer.current) return;

    [
      clusterLayer.current,
      heatLayer.current,
      lineLayer.current,
      countriesLayer.current,
    ].forEach((layer) => layer && map.hasLayer(layer) && map.removeLayer(layer));

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
      buildCountriesLayer(map, countryCounts);
    }

    if (activeLayer) {
      map.addLayer(activeLayer);

      let bounds = null;
      if (mapViewType === "cluster") bounds = clusterLayer.current.getBounds();
      if (mapViewType === "heatmap") bounds = L.latLngBounds(allCoords.current);
      if (mapViewType === "line") bounds = lineLayer.current.getBounds();
      if (bounds && bounds.isValid()) map.fitBounds(bounds);
    }
  }, [
    mapReady,
    mapViewType,
    countryCounts,
  ]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function formatTimestamp(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp * 1000);
    const pad = (n) => n.toString().padStart(2, "0");
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function formatLocalDateString(str) {
    if (!str) return "";
    const [datePart, timePart] = str.split(" ");
    if (!datePart) return "";
    const [year, month, day] = datePart.split("-");
    return `${day}-${month}-${year}${timePart ? " " + timePart : ""}`;
  }

  // ─── Files → layers ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!files.length) return;

    const map = mapRef.current;
    if (!map) return;

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

    const markers = [];
    const allCoordsTemp = [];
    const countryCountsTemp = {};
    const countryBoundsTemp = {};
    const lineSegments = [];
    let currentSegment = [];
    let lastPoint = null;

    for (const item of files) {
      const { latitude, longitude, altitude, country } = item;
      if (latitude == null || longitude == null) continue;

      const latlng = [latitude, longitude];
      allCoordsTemp.push(latlng);

      const marker = L.marker(latlng, {
        icon: L.icon({
          iconUrl: "/marker.png",
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        }),
      });

      marker.on("click", () => {
        if (!marker.getPopup()) {
          marker
            .bindPopup(
              `<b>${item.filename}</b><br>
               ${formatLocalDateString(item.create_date_local) || formatTimestamp(item.create_date) || "No date"}<br>
               ${item.device_model || "Unknown device"}<br>
               ${country || "Unknown country"}${altitude ? ` | ${altitude.toFixed(0)} meters` : ""}`
            )
            .openPopup();
        }
      });

      markers.push(marker);

      if (altitude && altitude <= 1500 && country) {
        countryCountsTemp[country] = (countryCountsTemp[country] || 0) + 1;
        (countryBoundsTemp[country] ||= []).push(latlng);

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
    }

    if (currentSegment.length > 1) lineSegments.push(currentSegment);

    clusterLayer.current.clearLayers();
    allLayer.current.clearLayers();
    clusterLayer.current.addLayers(markers);
    allLayer.current.addLayers(markers);

    heatLayer.current = L.heatLayer(allCoordsTemp, { radius: 20, blur: 15 });
    lineLayer.current = L.featureGroup(
      lineSegments.map((seg) =>
        L.polyline(seg, { color: "red", weight: 2, opacity: 0.9 })
      )
    );

    allCoords.current = allCoordsTemp;
    setCountryCounts(countryCountsTemp);
    setCountryBounds(countryBoundsTemp);

    map.addLayer(clusterLayer.current);
    const bounds = clusterLayer.current.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds);
  }, [files]);

  // ─── Country panel click ──────────────────────────────────────────────────
  const handleCountryClick = (countryCode) => {
    const map = mapRef.current;
    if (!map || !countryBounds[countryCode]) return;
    const bounds = L.latLngBounds(countryBounds[countryCode]);
    map.fitBounds(bounds);
  };

  const getCountryName = async (code) => {
    try {
      return await window.electron.ipcRenderer.invoke("get-country-name", code);
    } catch {
      return code;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .country-tooltip {
          background: rgba(20, 20, 20, 0.88);
          color: #fff;
          border: 1px solid #4e1982;
          border-radius: 6px;
          font-size: 12px;
          padding: 5px 9px;
          pointer-events: none;
        }
        .country-tooltip::before { display: none; }
      `}</style>

      <div
        ref={containerRef}
        style={{
          height: "calc(100% - 23px)",
          width: "100%",
          display: !loading ? "block" : "none",
        }}
      />

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
          <h3 style={{ margin: "0 0 8px" }}>Visited Countries</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {Object.entries(countryCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([code, count]) => (
                <li
                  key={code}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    padding: "4px 2px",
                  }}
                  onClick={() => handleCountryClick(code)}
                >
                  <img
                    src={`https://cdn.kiy.li/img/flags/${code.toLowerCase()}.svg`}
                    alt={code}
                    style={{
                      width: 20,
                      height: 14,
                      objectFit: "cover",
                      borderRadius: 2,
                    }}
                  />
                  <span>
                    {countryNameMap[code] || code} ({count})
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {loading && (
        <div className="map-loading stats-loading">
          <div className="loader" />
        </div>
      )}
    </>
  );
};

export default MapView;