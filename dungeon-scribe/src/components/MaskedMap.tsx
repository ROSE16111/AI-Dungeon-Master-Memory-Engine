// src/components/MaskedMap.tsx
// What: 在底层画布绘制地图，在上层画布绘制“雾层”，用 destination-out 打洞形成光路。
// Why: Canvas 方案方便扩展多光源 / Line-of-Sight / 性能更稳。
// Keywords: Fog of War(雾层), Light Source(光源), Grid(网格), destination-out(打洞混合), Radial Gradient(径向渐变软边)
'use client';
import React, { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  imageUrl: string;           // 地图图片 URL
  cols: number;               // 网格列数 (X)
  rows: number;               // 网格行数 (Y)
  initialLight?: {
    i: number;                // 光源格子列索引（0..cols-1）
    j: number;                // 光源格子行索引（0..rows-1）
    radiusTiles: number;      // 光半径（单位=格子数/tiles）
    soft?: number;            // 软边比例（0..1）→ 边缘柔和过渡
  };
  fogOpacity?: number;        // 雾层不透明度（0..1）
};

export default function MaskedMap({
  imageUrl,
  cols,
  rows,
  initialLight = { i: 0, j: 0, radiusTiles: 3, soft: 0.5 },
  fogOpacity = 0.95,
}: Props) {
  // 1) 两张 Canvas：底图(base) + 雾层(fog)
  const baseRef = useRef<HTMLCanvasElement>(null);
  const fogRef = useRef<HTMLCanvasElement>(null);

  // 2) 地图图片与原始尺寸（natural size）
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  // 3) 光源状态（按格子移动）
  const [light, setLight] = useState(initialLight);

  /* -------------------------- 加载图片（Load Image） -------------------------- */
  useEffect(() => {
    const im = new Image();
    im.crossOrigin = "anonymous"; // 如果跨域/CDN，建议设置
    im.onload = () => {
      setImg(im);
      setDims({ w: im.naturalWidth, h: im.naturalHeight }); // 用原图像素绘制更清晰
    };
    im.src = imageUrl;
  }, [imageUrl]);

  /* ------------------------- 绘制底图（Draw Base） -------------------------- */
  const drawBase = useCallback(() => {
    if (!img || !dims || !baseRef.current) return;
    const c = baseRef.current;
    c.width = dims.w;
    c.height = dims.h;

    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
  }, [img, dims]);

  /* --------------- 绘制雾层 + 光洞（Draw Fog + Punch Holes） --------------- */
  const drawFog = useCallback(() => {
    if (!dims || !fogRef.current) return;
    const c = fogRef.current;
    c.width = dims.w;
    c.height = dims.h;

    const g = c.getContext("2d")!;
    // 1) 盖一层黑雾（黑色+可配置透明度）
    g.clearRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "source-over"; // 正常绘制
    g.fillStyle = `rgba(0,0,0,${fogOpacity})`;
    g.fillRect(0, 0, c.width, c.height);

    // 2) 网格(px)计算
    const cellW = c.width / cols;
    const cellH = c.height / rows;
    const cx = (light.i + 0.5) * cellW;              // 光心X（格中心）
    const cy = (light.j + 0.5) * cellH;              // 光心Y（格中心）
    const r  = light.radiusTiles * Math.min(cellW, cellH); // 半径像素
    const soft = (light.soft ?? 0.5) * r;            // 软边宽度像素

    // 3) 用 destination-out 把雾层“挖洞”（底图才能透出来）
    g.globalCompositeOperation = "destination-out";

    // 3.1 内圈硬边
    g.beginPath();
    g.arc(cx, cy, r - soft, 0, Math.PI * 2);
    g.fillStyle = "rgba(0,0,0,1)"; // 颜色不重要，dest-out 只看alpha
    g.fill();

    // 3.2 外圈软边（径向渐变）
    const grad = g.createRadialGradient(cx, cy, r - soft, cx, cy, r);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
  }, [dims, cols, rows, light, fogOpacity]);

  // 初次与依赖变化时重绘
  useEffect(() => {
    drawBase();
    drawFog();
  }, [drawBase, drawFog]);

  /* ------------------------- 键盘移动（一格步进） -------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let di = 0, dj = 0;
      // 左右：i（列方向 / X）
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") di = -1;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") di = 1;
      // 上下：j（行方向 / Y）
      if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") dj = -1;
      if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") dj = 1;

      if (di || dj) {
        e.preventDefault();
        setLight((L) => ({
          ...L,
          i: Math.max(0, Math.min(cols - 1, L.i + di)),
          j: Math.max(0, Math.min(rows - 1, L.j + dj)),
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cols, rows]);

  // 光源/参数变化时，仅需重绘雾层
  useEffect(() => {
    drawFog();
  }, [light, fogOpacity, drawFog]);

  /* ----------------------------- 网格可视层 ------------------------------ */
  const gridStyle: React.CSSProperties = dims
    ? {
        backgroundImage:
          `linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px),
           linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)`,
        backgroundSize: `${dims.w / cols}px ${dims.h / rows}px`,
      }
    : {};

  return (
    <div className="relative w-full h-full overflow-auto">
      <div
        className="relative inline-block"
        style={{ width: dims?.w ?? 0, height: dims?.h ?? 0 }}
      >
        {/* 底图画布 Base Canvas */}
        <canvas ref={baseRef} style={{ display: "block" }} />

        {/* 网格 Overlay（用 div 背景画细线） */}
        <div className="pointer-events-none absolute inset-0" style={gridStyle} />

        {/* 雾层画布 Fog Canvas */}
        <canvas
          ref={fogRef}
          className="absolute inset-0"
          style={{ mixBlendMode: "multiply" }} // 看起来更柔和，可去掉
        />
      </div>
    </div>
  );
}
