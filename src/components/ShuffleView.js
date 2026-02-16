import React, { useEffect, useState, useRef, useCallback } from "react";
import "./ShuffleView.css"; // <- add this

const ShuffleView = ({ preloadCount = 3, interval = 8000, hideMetadata = false, filters = {} }) => {
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const preloadedUrls = useRef(new Set());
  const [displayedIndex, setDisplayedIndex] = useState(0);

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

  const preloadImageBytes = useCallback((imgRecords) => {
    const toLoad = imgRecords.filter((f) => !preloadedUrls.current.has(f.url));
    if (toLoad.length === 0) return Promise.resolve();

    return Promise.all(
      toLoad.map(
        (f) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => { preloadedUrls.current.add(f.url); resolve(); };
            img.onerror = () => { preloadedUrls.current.add(f.url); resolve(); };
            img.src = f.url;
          })
      )
    );
  }, []);

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

const preloadImages = useCallback(async () => {
  let newImgs = [];
  // Keep fetching until we have at least preloadCount new images
  while (newImgs.length < preloadCount) {
    const fetched = await fetchRandom(preloadCount - newImgs.length);
    if (fetched.length === 0) break; // Stop if no more images are available
    newImgs = [...newImgs, ...fetched];
  }

  if (newImgs.length > 0) {
    await preloadImageBytes(newImgs);
    setImages((prev) => [...prev, ...newImgs]);
  }
  setLoading(false);
}, [fetchRandom, preloadCount, preloadImageBytes]);

useEffect(() => {
  if (images.length === 0) return;
  const upcoming = images.slice(currentIndex + 1, currentIndex + 3);
  if (upcoming.length > 0) preloadImageBytes(upcoming);
}, [currentIndex, images, preloadImageBytes]);

const nextImage = useCallback(() => {
  setCurrentIndex((prev) => {
    const next = prev + 1;
    if (next >= images.length) {
      preloadImages();
      return prev;
    }
    return next;
  });
}, [images.length, preloadImages]);

  useEffect(() => {
    setImages([]);
    setCurrentIndex(0);
    setLoading(true);
    clearInterval(timerRef.current);
    setDisplayedIndex(0);
    preloadedUrls.current = new Set();
    preloadImages();
  }, [filters]);

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
  const displayed = images[displayedIndex];
  if (!current) return null;

  return (
    <div className="shuffle-view">
    <img
      key={current.url}
      src={current.url}
      style={{ display: "none" }}
      onLoad={() => setDisplayedIndex(currentIndex)}
    />

    <img
      src={images[displayedIndex]?.url}
      alt={images[displayedIndex]?.filename}
      className="shuffle-image"
    />



    {!hideMetadata && (
      <div className="shuffle-metadata">
        <div>{displayed.filename}</div>
        {(displayed.create_date_local || displayed.create_date) && (
          <div>
            {displayed.create_date_local
              ? formatLocalDateString(displayed.create_date_local)
              : formatDate(displayed.create_date)}
          </div>
        )}
      </div>
    )}
    </div>
  );
};

export default ShuffleView;
