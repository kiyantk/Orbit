import React, { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faPause, faVolumeMute, faVolumeUp, faXmark, faExpand } from "@fortawesome/free-solid-svg-icons";

export default function PreviewPanel({ item, isMuted, setIsMuted, forceFullscreen, setForceFullscreen }) {
  
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
      setIsFullscreen(false);
    }
  };

  document.addEventListener("keydown", handleEsc);
  return () => document.removeEventListener("keydown", handleEsc);
}, [isFullscreen]);

useEffect(() => {
  setCurrentTime(0);
  setIsPlaying(true);
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

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-center preview-panel-content">
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
      className="video-element"
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
            className="max-h-[500px] object-contain rounded-lg bg-gray-200"
            onClick={openFullscreen}
          />
        )}
      </div>

      <div className="metadata-panel">
        <div className="metadata-row">
          <span className="metadata-label">Filename</span>
          <span className="metadata-value">{item.filename}</span>
        </div>
        <div className="metadata-row">
          <span className="metadata-label">Size</span>
          <span className="metadata-value">{formatBytes(item.size)}</span>
        </div>
        <div className="metadata-row">
          <span className="metadata-label">Type</span>
          <span className="metadata-value">{item.file_type}</span>
        </div>
        <div className="metadata-row">
          <span className="metadata-label">Taken</span>
          <span className="metadata-value">{formatTimestamp(item.create_date)}</span>
        </div>
        <div className="metadata-row">
          <span className="metadata-label">Device</span>
          <span className="metadata-value">{item.device_model}</span>
        </div>
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
              <img src={fileUrl} alt={item.filename} className="fullscreen-image" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}