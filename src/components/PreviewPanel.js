import React, { useState, useRef, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faPause, faVolumeMute, faVolumeUp, faXmark, faExpand } from "@fortawesome/free-solid-svg-icons";
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

export default function PreviewPanel({ item, isMuted, setIsMuted, forceFullscreen, setForceFullscreen, birthDate, currentSettings }) {
  
  const videoRefNormal = useRef(null);
  const trackRefNormal = useRef(null);

  const videoRefFullscreen = useRef(null);
  const trackRefFullscreen = useRef(null);
  const wasNormalPlayingRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(true); // autoplay starts
  const [isHovered, setIsHovered] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [itemCountry, setItemCountry] = useState(null)

  const currentVideoRef = isFullscreen ? videoRefFullscreen : videoRefNormal;
  const currentTrackRef = isFullscreen ? trackRefFullscreen : trackRefNormal;

  // Sync fullscreen with parent trigger
  useEffect(() => {
    if (forceFullscreen) {
      openFullscreen();
      setForceFullscreen(false); // reset so it doesn’t auto-trigger again
    }
  }, [forceFullscreen, setForceFullscreen]);

useEffect(() => {
  const video = currentVideoRef.current;
  if (!video) return;

  const handleLoadedMetadata = () => {
    if (isFinite(video.duration)) setDuration(video.duration);
  };
  const handleTimeUpdate = () => {
    if (!isSeeking) setCurrentTime(video.currentTime);
  };

  video.addEventListener("loadedmetadata", handleLoadedMetadata);
  video.addEventListener("timeupdate", handleTimeUpdate);

  return () => {
    video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    video.removeEventListener("timeupdate", handleTimeUpdate);
  };
}, [item, isSeeking, isFullscreen]);

useEffect(() => {
  if (!isFullscreen) return;

  const handleEsc = (e) => {
    if (e.key === "Escape") {
      closeFullscreen();
    }
  };

  document.addEventListener("keydown", handleEsc);
  return () => document.removeEventListener("keydown", handleEsc);
}, [isFullscreen]);

  const convertItemCountry = useCallback(async () => {
    if (!item.country) return;

    try {
      const country = await window.electron.ipcRenderer.invoke('get-country-name', item.country);
      setItemCountry(country);
    } catch (error) {
      console.error("Error converting item country:", error);
    }
  }, [item]);

useEffect(() => {
  setCurrentTime(0);
  setIsPlaying(true);
  setIsLoading(true);
  convertItemCountry();
}, [item]);


  if (!item) return null;

  // Normalize to forward slashes
  const fileUrl = `http://localhost:3001/files/${encodeURIComponent(item.path)}`;
  const isVideo = item.file_type?.startsWith("video");

  const safePlay = (video) => {
  if (!video) return;
  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise.catch((err) => {
      // Ignore "media removed" errors
      if (!err.message.includes("media was removed from the document")) {
        console.error(err);
      }
    });
  }
};


const handleSeekStart = (e) => {
  setIsSeeking(true);
  updateCurrentTime(e); // set time immediately

  // Listen to mousemove & mouseup globally
  const handleMouseMove = (eMove) => updateCurrentTime(eMove);
  const handleMouseUp = () => {
    setIsSeeking(false);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

const updateCurrentTime = (e) => {
  if (!currentVideoRef.current) return;
  const rect = currentTrackRef.current.getBoundingClientRect();
  const pos = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const newTime = (pos / rect.width) * duration;
  setCurrentTime(newTime);
  currentVideoRef.current.currentTime = newTime;
};

  // Convert bytes to human-readable (KB, MB, GB etc.)
  function formatBytes(a, b = 2) {
    if (!+a) return "Unknown";
    const c = b < 0 ? 0 : b;
    const d = Math.floor(Math.log(a) / Math.log(1000));
    return `${parseFloat((a / Math.pow(1000, d)).toFixed(c))} ${
      ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"][d]
    }`;
  }

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

  const togglePlay = () => {
    if (!currentVideoRef.current) return;
    if (isPlaying) {
      currentVideoRef.current.pause();
    } else {
      safePlay(currentVideoRef.current);
    }
    setIsPlaying(!isPlaying);
  };

  // Click handlers for fullscreen
  const openFullscreen = () => {
  setIsFullscreen(true);
  if(item.file_type === "video") {
    wasNormalPlayingRef.current = !videoRefNormal.current.paused;
    videoRefNormal.current.pause();
  }
  
  // small delay so ref exists
  setTimeout(() => {
    if (videoRefNormal.current && videoRefFullscreen.current) {
      videoRefFullscreen.current.currentTime = videoRefNormal.current.currentTime;
      if (isPlaying) {
        safePlay(videoRefFullscreen.current);
      } else {
        videoRefFullscreen.current.pause();
      }
    }
  }, 0);
};

function formatDuration(seconds) {
  // Round down to nearest whole second
  const totalSeconds = Math.floor(seconds);

  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  // Pad with leading zeros if needed
  const formatted = [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ].join(':');

  return formatted;
}

const closeFullscreen = () => {
  if (videoRefNormal.current && videoRefFullscreen.current) {
    videoRefNormal.current.currentTime = videoRefFullscreen.current.currentTime;
    if (isPlaying) {
      safePlay(videoRefNormal.current);
      setIsPlaying(true);
    }
  }
  setIsFullscreen(false);
};

function calculateAge(birthDate, epochSeconds) {
    const birth = new Date(birthDate);
    const date = new Date(epochSeconds * 1000); // convert seconds to milliseconds

    let age = date.getFullYear() - birth.getFullYear();
    const monthDiff = date.getMonth() - birth.getMonth();
    const dayDiff = date.getDate() - birth.getDate();

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age--;
    }

    return age;
}

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <div className="p-4 space-y- preview-panel-wrapper">
      <div className="flex justify-center preview-panel-content">
          {isLoading && (
            <div className="absolute inset-0 flex justify-center items-center bg-black/50 z-10">
              <div className="loader"></div>
            </div>
          )}
{isVideo ? (
  <div
    className="video-wrapper"
    onMouseEnter={() => !isSeeking && setIsHovered(true)}
    onMouseLeave={() => !isSeeking && setIsHovered(false)}
  >
    <video
      ref={videoRefNormal}
      src={fileUrl}
      autoPlay
      muted={isMuted}
      loop
      className={`video-element ${isLoading ? "hidden" : ""}`}
      onLoadedData={() => setIsLoading(false)}
    />

    {/* Overlay */}
    {(isHovered) && (
      <div className="video-overlay">
        {/* Dark overlay + center play, hidden while seeking */}
        {!isSeeking && (
          <>
            <div className="overlay-darken" onClick={togglePlay}></div>
            <button onClick={togglePlay} className="video-control center-control">
              <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
            </button>
          </>
        )}

        {/* Bottom controls: track + mute always visible */}
        <div className="video-controls-bottom">
<div
  className="video-track-wrapper"
  ref={trackRefNormal} onMouseDown={handleSeekStart}
>
  {/* Filled progress */}
  <div
    className="video-track-filled"
    style={{ width: `${progress * 100}%` }}
  ></div>

  {/* Clickable track overlay */}
  <div
    className="video-track-overlay"
  ></div>
</div>



          {/* Mute/Unmute */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted(!isMuted);
            }}
            className="video-control mute-control"
          >
            <FontAwesomeIcon icon={isMuted ? faVolumeMute : faVolumeUp} />
          </button>
          {/* Fullscreen */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openFullscreen();
                    }}
                    className="video-control fullscreen-control"
                  >
                    <FontAwesomeIcon icon={faExpand} />
                  </button>
        </div>
      </div>
    )}
  </div>
) : (
          <img
            src={fileUrl}
            alt={item.filename}
            className={`max-h-[500px] object-contain rounded-lg bg-gray-200 ${isLoading ? "hidden" : ""} ${currentSettings.adjustHeicColors && item.extension === ".heic" ? "heic-color-adjust" : ""}`}
            onClick={openFullscreen}
            onLoad={() => setIsLoading(false)}
          />
        )}
      </div>

<div className="metadata-panel">
  {item.filename && (
    <div className="metadata-row">
      <span className="metadata-label">Filename</span>
      <span className="metadata-value">{item.filename}</span>
    </div>
  )}

  {item.size != null && (
    <div className="metadata-row">
      <span className="metadata-label">Size</span>
      <span className="metadata-value">{formatBytes(item.size)}</span>
    </div>
  )}

  {(item.extension || item.file_type) && (
    <div className="metadata-row">
      <span className="metadata-label">Type</span>
      <span className="metadata-value">{item.extension + (item.file_type ? ` (${item.file_type})` : '')}</span>
    </div>
  )}

  {item.create_date && (
    <div className="metadata-row">
      <span className="metadata-label">Taken</span>
      <span className="metadata-value">{formatTimestamp(item.create_date)}</span>
    </div>
  )}

  {item.device_model && (
    <div className="metadata-row">
      <span className="metadata-label">Device</span>
      <span className="metadata-value">{item.device_model}</span>
    </div>
  )}

  {item.width && item.height && (
    <div className="metadata-row">
      <span className="metadata-label">Resolution</span>
      <span className="metadata-value">{item.width + 'x' + item.height}</span>
    </div>
  )}

  {isVideo && duration && (
    <div className="metadata-row">
      <span className="metadata-label">Duration</span>
      <span className="metadata-value">{formatDuration(duration)}</span>
    </div>
  )}

  {item.latitude != null && item.longitude != null && (
    <div className="metadata-row">
      <span className="metadata-label">Location</span>
      <span className="metadata-value">
        <div style={{ width: "100%", height: "150px" }}>
          {/* Using Leaflet for a simple map */}
          <MapContainer key={item.id} center={[item.latitude, item.longitude]} zoom={13} style={{ width: "100%", height: "100%", userSelect: "none", marginTop: "5px" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <Marker position={[item.latitude, item.longitude]} />
          </MapContainer>
        </div>
        <div style={{ padding: "2px 0px", backgroundColor: "#28262d", borderRadius: "0px 0px 10px 10px" }}>
          {item.latitude}, {item.longitude}
          {item.altitude != null ? `, ${item.altitude.toFixed(0)} m` : ''}
        </div>
      </span>
    </div>
  )}

  {item.country && (
    <div className="metadata-row">
      <span className="metadata-label">Country</span>
      <span className="metadata-value">{itemCountry}</span>
    </div>
  )}

  {item.lens_model && (
    <div className="metadata-row">
      <span className="metadata-label">Lens</span>
      <span className="metadata-value" title={item.lens_model}>{item.lens_model}</span>
    </div>
  )}

  {item.iso && (
    <div className="metadata-row">
      <span className="metadata-label">ISO</span>
      <span className="metadata-value">{item.iso}</span>
    </div>
  )}

  {item.software && (
    <div className="metadata-row">
      <span className="metadata-label">Software</span>
      <span className="metadata-value" title={item.software}>{item.software}</span>
    </div>
  )}

  {item.megapixels && (
    <div className="metadata-row">
      <span className="metadata-label">Megapixels</span>
      <span className="metadata-value">{item.megapixels.toFixed(0)}</span>
    </div>
  )}

  {item.exposure_time && (
    <div className="metadata-row">
      <span className="metadata-label">Exposure</span>
      <span className="metadata-value">{item.exposure_time} s</span>
    </div>
  )}

  {item.color_space && (
    <div className="metadata-row">
      <span className="metadata-label">Color Space</span>
      <span className="metadata-value">{item.color_space}</span>
    </div>
  )}

  {item.flash && (
    <div className="metadata-row">
      <span className="metadata-label">Flash</span>
      <span className="metadata-value">{item.flash}</span>
    </div>
  )}

  {item.aperture && (
    <div className="metadata-row">
      <span className="metadata-label">Aperture</span>
      <span className="metadata-value">f/{item.aperture}</span>
    </div>
  )}

  {item.focal_length && (
    <div className="metadata-row">
      <span className="metadata-label">Focal Length</span>
      <span className="metadata-value">{item.focal_length + ' (' + item.focal_length_35mm + ')'}</span>
    </div>
  )}

  {item.offset_time_original && (
    <div className="metadata-row">
      <span className="metadata-label">Time Offset</span>
      <span className="metadata-value">{item.offset_time_original}</span>
    </div>
  )}


  {item.camera_make && (
    <div className="metadata-row">
      <span className="metadata-label">Make</span>
      <span className="metadata-value">{item.camera_make}</span>
    </div>
  )}

  {(item.create_date || item.created) && birthDate && (
    <div className="metadata-row">
      <span className="metadata-label">Age</span>
      <span className="metadata-value">{calculateAge(birthDate, item.create_date || item.created)}</span>
    </div>
  )}
  
  {item.modified && (
    <div className="metadata-row">
      <span className="metadata-label">Modified At</span>
      <span className="metadata-value">{formatTimestamp(item.modified)}</span>
    </div>
  )}

  {item.created && (
    <div className="metadata-row">
      <span className="metadata-label">Created At</span>
      <span className="metadata-value">{formatTimestamp(item.created)}</span>
    </div>
  )}
  
  {item.path && (
    <div className="metadata-row">
      <span className="metadata-label">Path</span>
      <span className="metadata-value" title={item.path}>
        {item.path}
      </span>
    </div>
  )}

  {item.id && (
    <div className="metadata-row">
      <span className="metadata-label">ID</span>
      <span className="metadata-value">{item.media_id}</span>
    </div>
  )}
</div>


      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fullscreen-overlay" onClick={closeFullscreen}>
          <div
            className="fullscreen-content"
            onClick={(e) => e.stopPropagation()} // prevent closing when clicking content
          >
            {/* Close button */}
            <button className="fullscreen-close" onClick={closeFullscreen}>
              <FontAwesomeIcon icon={faXmark} />
            </button>

            {isVideo ? (
              <div className="video-wrapper fullscreen-video"
                onMouseEnter={() => !isSeeking && setIsHovered(true)}
                onMouseLeave={() => !isSeeking && setIsHovered(false)}>
                <video
                  ref={videoRefFullscreen}
                  src={fileUrl}
                  autoPlay
                  muted={isMuted}
                  loop
                  className="video-element"
                />
                  {(isHovered || isSeeking) && (
                <div className="video-overlay">
                  <div className="overlay-darken" onClick={togglePlay}></div>
                  {(!isSeeking) && (
                  <button onClick={togglePlay} className="video-control center-control">
                    <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
                  </button>
                  )}

                  <div className="video-controls-bottom">
                    <div className="video-track-wrapper" ref={trackRefFullscreen} onMouseDown={handleSeekStart}>
                      <div
                        className="video-track-filled"
                        style={{ width: `${progress * 100}%` }}
                      ></div>
                      <div className="video-track-overlay"></div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMuted(!isMuted);
                      }}
                      className="video-control mute-control"
                    >
                      <FontAwesomeIcon icon={isMuted ? faVolumeMute : faVolumeUp} />
                    </button>
                  </div>
                </div>
                  )}
              </div>
            ) : (
              <img src={fileUrl} alt={item.filename} className={`fullscreen-image ${currentSettings.adjustHeicColors && item.extension === ".heic" ? "heic-color-adjust" : ""}`} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}