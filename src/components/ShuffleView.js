import React, { useEffect, useState, useRef, useCallback } from "react";
import "./ShuffleView.css"; // <- add this

const ShuffleView = ({ preloadCount = 3, interval = 8000, filters = {} }) => {
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMetadata, setShowMetadata] = useState(true);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  function formatDate(timestamp) {
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
    const [datePart, timePart] = str.split(' ');
    if (!datePart) return '';
    const [year, month, day] = datePart.split('-');
    return `${day}-${month}-${year}${timePart ? ' ' + timePart : ''}`;
  }

  const fetchRandom = useCallback(async (count = preloadCount) => {
    try {
      const result = await window.electron.ipcRenderer.invoke("fetch-files", {
        offset: 0,
        limit: count,
        filters: { sortBy: "random", ...filters }
      });
      if (result?.success) {
        // Filter only images
        const imagesOnly = result.rows.filter(f => f.file_type === "image");
        return imagesOnly.map((f) => ({
          ...f,
          url: `http://localhost:54055/files/${encodeURIComponent(f.path)}`
        }));
      }
    } catch (err) {
      console.error("Failed to fetch random files:", err);
    }
    return [];
  }, [preloadCount, filters]);

const preloadImages = async () => {
  let newImgs = [];
  // Keep fetching until we have at least preloadCount new images
  while (newImgs.length < preloadCount) {
    const fetched = await fetchRandom(preloadCount - newImgs.length);
    if (fetched.length === 0) break; // Stop if no more images are available
    newImgs = [...newImgs, ...fetched];
  }

  if (newImgs.length > 0) {
    setImages((prev) => [...prev, ...newImgs]); // append to existing images
  }
  setLoading(false);
};

const nextImage = () => {
  setCurrentIndex((prev) => {
    const next = prev + 1;
    if (next >= images.length) {
      preloadImages(); // Fetch more images if we're at the end
      return prev; // Stay on last image until new ones arrive
    }
    return next;
  });
};

  useEffect(() => {
    setImages([]);
    setCurrentIndex(0);
    setLoading(true);
    clearInterval(timerRef.current);
    preloadImages();
  }, [filters]);

  useEffect(() => {
    preloadImages();
  }, []);

  useEffect(() => {
    if (images.length === 0) return;
    timerRef.current = setInterval(nextImage, interval);
    return () => clearInterval(timerRef.current);
  }, [images, interval]);

  if (loading) {
    return (
      <div className="shuffle-loading">
        <div className="loader"></div>
      </div>
    );
  }

  const current = images[currentIndex];
  if (!current) return null;

  return (
    <div className="shuffle-view">
      <img
        src={current.url}
        alt={current.filename}
        className="shuffle-image"
      />

      {showMetadata && (
        <div className="shuffle-metadata">
          <div>{current.filename}</div>
          {(current.create_date_local || current.create_date) && (
            <div>
              {current.create_date_local
                ? formatLocalDateString(current.create_date_local)
                : formatDate(current.create_date)}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setShowMetadata((s) => !s)}
        className="shuffle-toggle"
      >
        {showMetadata ? "Hide Info" : "Show Info"}
      </button>
    </div>
  );
};

export default ShuffleView;
