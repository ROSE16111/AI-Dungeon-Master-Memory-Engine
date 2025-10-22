// src/components/MaskedMap.tsx
// What: Draws the map on the base canvas and an overlaid “fog layer” on the top canvas.
//        Uses `destination-out` blending to carve holes, forming visible light paths.
// Why: The Canvas-based solution supports multiple light sources, Line-of-Sight,
//      and provides better performance and flexibility.
// Keywords: Fog of War, Light Source, Grid, destination-out (hole blending),
//            Radial Gradient (soft edge lighting)
//
// Input:
// - Route param [id] for the resource (map).
// - User’s current campaign (from an httpOnly cookie currentCampaignId, read server-side).
// - Initial map attributes from DB (e.g., gridCols, gridRows, optional lightI, lightJ, lightRadius).
// - The uploaded map image (fileUrl) or a preview URL.
//
// Structure:
// <div style={{width: display.w, height: display.h}}>
//   [Bottom Layer] <canvas ref={baseRef}>   —— Map image (scaled proportionally)
//   [Middle Layer] <div style={gridStyle}>  —— Grid (drawn via CSS gradient lines; cheap & clear)
//   [Top Layer]    <canvas ref={fogRef}>    —— Fog layer (solid black + “holes” for light)
//   [HUD Layer]    <Hud/>                   —— HUD control panel (bottom-right, adjustable params)
// </div>
"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";

/* ---------------------------------- Props ---------------------------------- */
type LightState = {
  i: number;             // Row (Y) index
  j: number;             // Column (X) index
  radiusTiles: number;   // Radius (in tiles)
  soft?: number;         // Soft edge ratio (0–1)
};

type Props = {
  resourceId: string;    // ✅ Required for saving back to the server
  imageUrl: string;      // Map image URL
  cols: number;          // Initial number of grid columns (X)
  rows: number;          // Initial number of grid rows (Y)
  initialLight?: LightState;
  fogOpacity?: number;
};

/* ------------------------------- Component Implementation ---------------------------------- */
export default function MaskedMap({
  resourceId,
  imageUrl,
  cols,
  rows,
  initialLight = { i: 0, j: 0, radiusTiles: 3, soft: 0.5 },
  fogOpacity = 0.95,
}: Props) {
  // 1) Two canvases: base (map) + fog (overlay)
  const baseRef = useRef<HTMLCanvasElement>(null);
  const fogRef = useRef<HTMLCanvasElement>(null);

  // 2) Map image and its natural dimensions
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // 3) Local editable state (copy props to controlled state)
  const [gridX, setGridX] = useState<number>(Math.max(1, cols));
  const [gridY, setGridY] = useState<number>(Math.max(1, rows));
  const [light, setLight] = useState<LightState>({
    i: Math.max(0, Math.min(initialLight.i, rows - 1)),
    j: Math.max(0, Math.min(initialLight.j, cols - 1)),
    radiusTiles: Math.max(1, initialLight.radiusTiles),
    soft: initialLight.soft ?? 0.5,
  });

  // HUD state
  const [hudOpen, setHudOpen] = useState(true);   // Whether the HUD is expanded
  const [hudAlpha, setHudAlpha] = useState(0.5);  // HUD background opacity (0.2–0.9)

  // Save state (for displaying "Saving…" / "Saved ✓")
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null); // Used to show “Saved ✓” feedback

  // ✅ Outer container, used to measure available width (basis for proportional scaling)
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState<number>(0);

  // ✅ Listen to container width changes (basis for proportional scaling)
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;


    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerW(Math.max(0, Math.floor(e.contentRect.width)));
      }
    });

    ro.observe(el);
    setContainerW(el.clientWidth);

    return () => ro.disconnect();
  }, []);

  // ✅ Compute display size: scale proportionally to fit container width (no upscaling)
  const display = React.useMemo(() => {
    if (!dims) return { w: 0, h: 0, scale: 1 };
    const maxW = containerW > 0 ? containerW : dims.w;
    const scale = Math.min(maxW / dims.w);
    const w = Math.round(dims.w * scale);
    const h = Math.round(dims.h * scale);
    return { w, h, scale };
  }, [dims, containerW]);

  // Debounce timer (to reduce PATCH request frequency)
  // PATCH is triggered in three cases: moving light via keyboard; 
  // adjusting light radius via HUD; changing grid size via HUD

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounce = (fn: () => void, wait = 400) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fn, wait);
  };

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  /* -------------------------- Backend save wrapper (unified status handling) -------------------------- */
  async function patchResource(patch: Record<string, number>) {
    try {
      setSaving(true);
      const res = await fetch(`/api/resources/${encodeURIComponent(resourceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("PATCH failed", await res.text());
        return false;
      }
      setSavedAt(Date.now()); // Used to display “Saved ✓”
      return true;
    } catch (e) {
      console.error("PATCH error", e);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // “Saved ✓” fades out after 2 seconds
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  /* -------------------------- Load image -------------------------- */
  useEffect(() => {
    const im = new Image();
    im.crossOrigin = "anonymous"; // Recommended if loading from CDN or cross-origin
    im.onload = () => {
      setImg(im);
      setDims({ w: im.naturalWidth, h: im.naturalHeight }); // Use original pixels for better clarity
    };
    im.src = imageUrl;
  }, [imageUrl]);

  /* ------------------------- Draw base map -------------------------- */
  const drawBase = useCallback(() => {
    if (!img || !dims || !baseRef.current) return;
    const c = baseRef.current;
    c.width = display.w;   // ✅ Use scaled display dimensions
    c.height = display.h;

    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    // Draw original image scaled to display size
    g.imageSmoothingEnabled = true;
    g.drawImage(img, 0, 0, c.width, c.height);
  }, [img, dims, display.w, display.h]);

  /* --------------- Draw fog layer + punch light holes --------------- */
  const drawFog = useCallback(() => {
    if (!dims || !fogRef.current) return;
    const c = fogRef.current;
    const w = display.w;
    const h = display.h;
    if (!w || !h) return;
    c.width = w;
    c.height = h;

    const g = c.getContext("2d")!;
    // 1) Cover with black fog (black + configurable opacity)
    g.clearRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "source-over"; // Normal drawing mode
    // Reset after resizing canvas (resets context state)
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(0,0,0,${fogOpacity})`;
    g.fillRect(-2, -2, w + 4, h + 4); // Bleed edges to avoid visible seams

    // 2) Grid (px) calculation — use editable gridX/gridY
    const cellW = c.width / gridX;
    const cellH = c.height / gridY;
    const cx = (light.j + 0.5) * cellW; // Column (X)
    const cy = (light.i + 0.5) * cellH; // Row (Y)
    const r  = light.radiusTiles * Math.min(cellW, cellH);
    const soft = (light.soft ?? 0.5) * r;

    // 3) Use destination-out to punch holes in fog (reveal base layer)
    g.globalCompositeOperation = "destination-out";

    // 3.1 Hard inner circle
    g.beginPath();
    g.arc(cx, cy, Math.max(0, r - soft), 0, Math.PI * 2);
    g.fillStyle = "rgba(0,0,0,1)"; // Color irrelevant — only alpha matters
    g.fill();

    // 3.2 Soft outer edge (radial gradient)
    const grad = g.createRadialGradient(cx, cy, Math.max(0, r - soft), cx, cy, r);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
  }, [dims, gridX, gridY, light, fogOpacity, display.w, display.h]);

  // Redraw on first mount and dependency changes
  useEffect(() => {
    drawBase();
    drawFog();
  }, [drawBase, drawFog]);

  // Redraw fog layer only when light/params change
  useEffect(() => {
    drawFog();
  }, [light, fogOpacity, gridX, gridY, drawFog]);

  /* ------------------------- Keyboard movement (step by one cell) -------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let di = 0, dj = 0;
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") dj = -1;  // Column X
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") dj = 1;
      if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") di = -1;    // Row Y
      if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") di = 1;
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        setHudOpen((s) => !s);
      }

      if (di || dj) {
        e.preventDefault();
        setLight((L) => {
          const next = {
            ...L,
            i: clamp(L.i + di, 0, gridY - 1),
            j: clamp(L.j + dj, 0, gridX - 1),
          };
          // All state-changing interactions (move light, change radius, change grid)
          // are throttled via debounce() before triggering PATCH
          debounce(() => {
            patchResource({ lightI: next.i, lightJ: next.j }); // ✅ unified handler
          });
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gridX, gridY]); // resourceId is constant, no need to include
  /* ----------------------------- Grid visual layer ------------------------------ */
  const gridStyle: React.CSSProperties = display.w
    ? {
        backgroundImage:
          `linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px),
           linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)`,
        backgroundSize: `${display.w / gridX}px ${display.h / gridY}px`,
      }
    : {};

  /* ------------------------------ HUD control panel ------------------------------ */
  const Hud = () => (
    <>
      {/* HUD wrapper: non-blocking to pointer events */}
      <div className="absolute bottom-3 right-3 z-[30] pointer-events-none select-none">
        {/* Collapse button (small dot), doesn’t block other UI */}
        {!hudOpen && (
          <button
            onClick={() => setHudOpen(true)}
            className="pointer-events-auto h-8 w-8 rounded-full bg-black/50 text-white grid place-items-center shadow"
            title="Open Inspector (H)"
            aria-label="Open Inspector"
          >
            ☰
          </button>
        )}

        {hudOpen && (
          // Only the panel area accepts events, others are pass-through
          <div
            className="pointer-events-auto w-[320px] rounded-xl shadow-lg border backdrop-blur"
            style={{
              backgroundColor: `rgba(20, 22, 26, ${hudAlpha})`, // dark gray, not pure black
              borderColor: "rgba(255,255,255,0.18)",
            }}
          >
            {/* Top bar: title + collapse + opacity + save status */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1 text-white relative">
              <div className="text-sm/5 opacity-90">Inspector / Console</div>

              {/* Save status badge */}
              <div className="absolute right-[56px] top-2 text-xs" aria-live="polite">
                {saving ? (
                  <span className="px-2 py-0.5 rounded bg-white/10 border border-white/20">
                    Saving…
                  </span>
                ) : savedAt ? (
                  <span
                    className="px-2 py-0.5 rounded bg-emerald-500/80 text-black"
                    key={savedAt}
                  >
                    Saved ✓
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {/* Opacity slider */}
                <input
                  type="range"
                  min={0.2}
                  max={0.9}
                  step={0.05}
                  value={hudAlpha}
                  onChange={(e) => setHudAlpha(Number(e.target.value))}
                  className="accent-white w-24"
                  title="Panel Opacity"
                />
                {/* Collapse button */}
                <button
                  onClick={() => setHudOpen(false)}
                  className="h-7 w-7 rounded-md bg-white/10 hover:bg-white/20 text-white"
                  title="Collapse (H)"
                  aria-label="Collapse"
                >
                  –
                </button>
              </div>
            </div>

            {/* Main body */}
            <div className="px-3 pb-3 text-white space-y-2">
              {/* current (x,y) */}
              <div className="flex items-center gap-2">
                <span className="text-sm whitespace-nowrap">current:</span>
                <label className="text-xs opacity-80">y</label>
                <input
                  type="number"
                  className="w-16 rounded-md bg-white/10 border border-white/20 px-2 py-1 text-sm"
                  value={light.i}
                  min={0}
                  max={Math.max(0, gridY - 1)}
                  onChange={(e) => {
                    const v = clamp(parseInt(e.target.value || "0", 10), 0, Math.max(0, gridY - 1));
                    setLight((prev) => ({ ...prev, i: v }));
                    debounce(() => {
                      patchResource({ lightI: v }); // ✅
                    });
                  }}
                />
                <label className="text-xs opacity-80">x</label>
                <input
                  type="number"
                  className="w-16 rounded-md bg-white/10 border border-white/20 px-2 py-1 text-sm"
                  value={light.j}
                  min={0}
                  max={Math.max(0, gridX - 1)}
                  onChange={(e) => {
                    const v = clamp(parseInt(e.target.value || "0", 10), 0, Math.max(0, gridX - 1));
                    setLight((prev) => ({ ...prev, j: v }));
                    debounce(() => {
                      patchResource({ lightJ: v }); // ✅
                    });
                  }}
                />
              </div>

              {/* radius */}
              <div className="flex items-center gap-2">
                <span className="text-sm whitespace-nowrap">radius:</span>
                <input
                  type="number"
                  className="w-20 rounded-md bg-white/10 border border-white/20 px-2 py-1 text-sm"
                  value={light.radiusTiles}
                  min={1}
                  max={200}
                  onChange={(e) => {
                    const v = clamp(parseInt(e.target.value || "1", 10), 1, 200);
                    setLight((prev) => ({ ...prev, radiusTiles: v }));
                    debounce(() => {
                      patchResource({ lightRadius: v }); // ✅
                    });
                  }}
                />
              </div>

              {/* grid */}
              <div className="flex items-center gap-2">
                <span className="text-sm whitespace-nowrap">grid:</span>
                <label className="text-xs opacity-80">X</label>
                <input
                  type="number"
                  className="w-16 rounded-md bg-white/10 border border-white/20 px-2 py-1 text-sm"
                  value={gridX}
                  min={1}
                  max={200}
                  onChange={(e) => {
                    const v = clamp(parseInt(e.target.value || "1", 10), 1, 200);
                    setGridX(v);
                    setLight((prev) => ({ ...prev, j: clamp(prev.j, 0, v - 1) }));
                    debounce(() => {
                      patchResource({ gridCols: v }); // ✅
                    });
                  }}
                />
                <label className="text-xs opacity-80">Y</label>
                <input
                  type="number"
                  className="w-16 rounded-md bg-white/10 border border-white/20 px-2 py-1 text-sm"
                  value={gridY}
                  min={1}
                  max={200}
                  onChange={(e) => {
                    const v = clamp(parseInt(e.target.value || "1", 10), 1, 200);
                    setGridY(v);
                    setLight((prev) => ({ ...prev, i: clamp(prev.i, 0, v - 1) }));
                    debounce(() => {
                      patchResource({ gridRows: v }); // ✅
                    });
                  }}
                />
              </div>

              <div className="text-xs opacity-80">
                current: (<b>{light.j}</b>, <b>{light.i}</b>) · grid: <b>{gridX}</b>×<b>{gridY}</b> · radius: <b>{light.radiusTiles}</b>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
  /* ---------------------------------- Render ---------------------------------- */
  return (
    <div ref={outerRef} className="relative w-full h-full overflow-auto">   {/* ✅ Observe this container width */}
      {/* ✅ Displayed dimensions */}
      <div
        className="relative inline-block"
        style={{ width: display.w, height: display.h }}
      >
        {/* Base canvas */}
        <canvas ref={baseRef} style={{ display: "block" }} />

        {/* Grid overlay */}
        <div className="pointer-events-none absolute inset-0" style={gridStyle} />

        {/* Fog canvas */}
        <canvas
          ref={fogRef}
          className="absolute inset-0"
          style={{ zIndex: 20 }}   // Layer above the grid
        />

        {/* Bottom-right HUD (keep previous implementation) */}
        <Hud />
      </div>
    </div>
  );
}

