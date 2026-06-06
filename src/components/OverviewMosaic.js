import React, { useEffect, useRef, useCallback, useMemo } from "react";

const GAP = 0;
const MAX_WIDTH = 400;
const BASE_TILE = 42;
const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

// ─── Image cache (module-level singleton, survives remounts) ──────────────────
const imageCache = new Map();

function loadImage(src, onLoad) {
  if (imageCache.has(src)) {
    const img = imageCache.get(src);
    if (img.complete && img.naturalWidth) return img;
    img.addEventListener("load", onLoad, { once: true });
    return img;
  }
  const img = new Image();
  img.addEventListener("load", onLoad, { once: true });
  img.src = src;
  imageCache.set(src, img);
  return img;
}

// ─── Cover-crop draw helper ───────────────────────────────────────────────────
function drawCoverImage(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const ir = iw / ih;
  const tr = w / h;
  let sx, sy, sw, sh;
  if (ir > tr) {
    sh = ih; sw = ih * tr; sx = (iw - sw) / 2; sy = 0;
  } else {
    sw = iw; sh = iw / tr; sx = 0; sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// ─── Layout computation (pure, memoizable) ───────────────────────────────────
function computeLayout(scale, containerWidth, totalCount) {
  const width = Math.min(containerWidth, MAX_WIDTH);
  const tileSize = Math.max(14, BASE_TILE * (scale / 0.4));
  const cols = Math.max(1, Math.floor(width / (tileSize + GAP)));
  const totalRows = Math.ceil(totalCount / cols);
  const totalHeight = totalRows * (tileSize + GAP);
  return { width, tileSize, cols, totalRows, totalHeight };
}

// ─── Component ────────────────────────────────────────────────────────────────
const OverviewMosaic = ({
  scale,
  items,
  containerWidth,
  containerHeight,
  scrollTop: controlledScrollTop,
  onSelectItem,
  totalCount,
}) => {
  const canvasRef = useRef(null);
  const scrollTopRef = useRef(controlledScrollTop ?? 0);
  const itemsRef = useRef(items);
  const needsRenderRef = useRef(true);
  const rafRef = useRef(null);
  const lastSizeRef = useRef({ w: 0, h: 0 });

  // Keep itemsRef in sync without triggering re-renders
  itemsRef.current = items;

  // Memoize layout so we only recalculate when inputs change
  const layout = useMemo(
    () => computeLayout(scale, containerWidth, totalCount),
    [scale, containerWidth, totalCount]
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Keep scrollTop in sync when controlled externally
  useEffect(() => {
    if (controlledScrollTop != null) {
      scrollTopRef.current = controlledScrollTop;
      needsRenderRef.current = true;
    }
  }, [controlledScrollTop]);

  // Mark dirty whenever layout or container changes
  useEffect(() => {
    needsRenderRef.current = true;
  }, [layout, containerHeight]);

  // ── Canvas resize (only when dimensions actually change) ──────────────────
  const syncCanvasSize = useCallback((canvas, w, h) => {
    const last = lastSizeRef.current;
    if (last.w === w && last.h === h) return;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    lastSizeRef.current = { w, h };
    needsRenderRef.current = true;
  }, []);

  // ── Core draw ─────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, tileSize, cols, totalRows, totalHeight } = layoutRef.current;
    const scrollTop = scrollTopRef.current;
    const step = tileSize + GAP;
    const list = itemsRef.current || [];

    syncCanvasSize(canvas, width, containerHeight);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, width, containerHeight);

    // Visible row range (view culling)
    const startRow = Math.max(0, Math.floor(scrollTop / step));
    const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / step));

    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (index >= totalCount) break;

        const x = col * step;
        const drawY = row * step - scrollTop;
        const item = list[index];

        if (!item) {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(x, drawY, tileSize, tileSize);
          continue;
        }

        const src = item.thumbnail_path
          ? `orbit://thumbs/${item.id}_thumb_64.jpg`
          : null;

        if (src) {
          const img = loadImage(src, () => { needsRenderRef.current = true; });
          if (img.complete && img.naturalWidth) {
            drawCoverImage(ctx, img, x, drawY, tileSize, tileSize);
          } else {
            ctx.fillStyle = "#222";
            ctx.fillRect(x, drawY, tileSize, tileSize);
          }
        } else {
          ctx.fillStyle = "#333";
          ctx.fillRect(x, drawY, tileSize, tileSize);
        }
      }
    }
  }, [containerHeight, syncCanvasSize, totalCount]);

  // ── Render loop: only paints when dirty ──────────────────────────────────
  useEffect(() => {
    let alive = true;

    const loop = () => {
      if (!alive) return;
      if (needsRenderRef.current) {
        needsRenderRef.current = false;
        draw();
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ── Click → item index ────────────────────────────────────────────────────
  const handleClick = useCallback(async (e) => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const { tileSize, cols } = layoutRef.current;
  const step = tileSize + GAP;
  const rect = canvas.getBoundingClientRect();

  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top + scrollTopRef.current;

  const col = Math.floor(x / step);
  const row = Math.floor(y / step);

  if (GAP > 0) {
    const localX = x - col * step;
    const localY = y - row * step;
    if (localX > tileSize || localY > tileSize) return;
  }

  const index = row * cols + col;
  const item = (itemsRef.current || [])[index];

  if (!item?.id) return;

  try {
    const res = await window.electron.ipcRenderer.invoke(
      "get-item-by-id",
      item.id
    );

    if (res?.success && res.item) {
      onSelectItem?.(res.item);
    } else {
      console.warn("Failed to resolve item", res?.error);
    }
  } catch (err) {
    console.error("IPC fetch failed:", err);
  }
}, [onSelectItem]);

  // ── Scroll handler ────────────────────────────────────────────────────────
  const handleScroll = useCallback((e) => {
    scrollTopRef.current = e.currentTarget.scrollTop;
    needsRenderRef.current = true;
  }, []);

  const { totalHeight, width } = layout;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        position: "relative",
      }}
      onScroll={handleScroll}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: MAX_WIDTH, position: "relative" }}>
          {/* Spacer div establishes scrollable height */}
          <div style={{ height: totalHeight, position: "relative" }}>
            <canvas
              ref={canvasRef}
              onClick={handleClick}
              style={{
                display: "block",
                cursor: "pointer",
                position: "sticky",
                top: 0,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewMosaic;