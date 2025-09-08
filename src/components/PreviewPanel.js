import React from "react";

export default function PreviewPanel({ item, isMuted, setIsMuted }) {
  if (!item) return null;

  // Normalize to forward slashes
  const fileUrl = `http://localhost:3001/files/${encodeURIComponent(item.path)}`;
  const isVideo = item.file_type?.startsWith("video");

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

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-center preview-panel-content">
        {isVideo ? (
          <video
            src={fileUrl}
            autoPlay
            muted={isMuted}
            loop
            className="max-h-[500px] max-w-full rounded-lg bg-black"
          />
        ) : (
          <img
            src={fileUrl}
            alt={item.filename}
            className="max-h-[500px] object-contain rounded-lg bg-gray-200"
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
    </div>
  );
}