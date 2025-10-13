// src/components/MaskedMap.tsx
// What: 在底层画布绘制地图，在上层画布绘制“雾层”，用 destination-out 打洞形成光路。
// Why: Canvas 方案方便扩展多光源 / Line-of-Sight / 性能更稳。
// Keywords: Fog of War(雾层), Light Source(光源), Grid(网格), destination-out(打洞混合), Radial Gradient(径向渐变软边)

"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";

/* ---------------------------------- Props ---------------------------------- */
type LightState = {
  i: number;             // 行(Y) index
  j: number;             // 列(X) index
  radiusTiles: number;   // 半径（单位：格）
  soft?: number;         // 软边比例 0~1
};

type Props = {
  resourceId: string;    // ✅ 为了保存到后端，需要知道资源 id
  imageUrl: string;      // 地图图片 URL
  cols: number;          // 初始网格列数 (X)
  rows: number;          // 初始网格行数 (Y)
  initialLight?: LightState;
  fogOpacity?: number;
};

/* ------------------------------- 组件实现 ---------------------------------- */
export default function MaskedMap({
  resourceId,
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

  // 3) 本地可编辑状态（把 props 复制为受控状态）
  const [gridX, setGridX] = useState<number>(Math.max(1, cols));
  const [gridY, setGridY] = useState<number>(Math.max(1, rows));
  const [light, setLight] = useState<LightState>({
    i: Math.max(0, Math.min(initialLight.i, rows - 1)),
    j: Math.max(0, Math.min(initialLight.j, cols - 1)),
    radiusTiles: Math.max(1, initialLight.radiusTiles),
    soft: initialLight.soft ?? 0.5,
  });
  //HUD state
  const [hudOpen, setHudOpen] = useState(true);   // 是否展开
  const [hudAlpha, setHudAlpha] = useState(0.5);  // 背景不透明度 0.2 ~ 0.9


  // ✅ 新增：外层容器，用来测量可用宽度
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState<number>(0);

  // ✅ 监听容器宽度变化（等比缩放的依据）
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerW(Math.max(0, Math.floor(e.contentRect.width)));
      }
    });

    ro.observe(el);
    // 立即取一次
    setContainerW(el.clientWidth);

    return () => ro.disconnect();
  }, []);

    // ✅ 计算显示尺寸：按容器最大宽度等比缩小（不放大）
  const display = React.useMemo(() => {
    if (!dims) return { w: 0, h: 0, scale: 1 };
    const maxW = containerW > 0 ? containerW : dims.w;
    const scale = Math.min(maxW / dims.w); //放大和缩小
    const w = Math.round(dims.w * scale);
    const h = Math.round(dims.h * scale);
    return { w, h, scale };
  }, [dims, containerW]);

  // 防抖定时器（减少 PATCH 次数）
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounce = (fn: () => void, wait = 400) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fn, wait);
  };


  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

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
    c.width = display.w;   // ✅ 用显示尺寸
    c.height = display.h;

    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
      // 将原图缩放绘制到显示尺寸
    g.imageSmoothingEnabled = true;
    g.drawImage(img, 0, 0, c.width, c.height);
  }, [img, dims, display.w, display.h]);

  /* --------------- 绘制雾层 + 光洞（Draw Fog + Punch Holes） --------------- */
  const drawFog = useCallback(() => {
    if (!dims || !fogRef.current) return;
      const c = fogRef.current;
      const w = display.w;
      const h = display.h;
      if (!w || !h) return;
      c.width = w;
      c.height = h;


    const g = c.getContext("2d")!;
    // 1) 盖一层黑雾（黑色+可配置透明度）
    g.clearRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "source-over"; // 正常绘制
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(0,0,0,${fogOpacity})`;
    g.fillRect(-2, -2, w + 4, h + 4); // ← 出血

    // 2) 网格(px)计算 —— 注意这里用可编辑的 gridX/gridY
    const cellW = c.width / gridX;
    const cellH = c.height / gridY;
    const cx = (light.j + 0.5) * cellW;                  // 列 X（j）
    const cy = (light.i + 0.5) * cellH;                  // 行 Y（i）
    const r  = light.radiusTiles * Math.min(cellW, cellH);
    const soft = (light.soft ?? 0.5) * r;

    // 3) 用 destination-out 把雾层“挖洞”（底图才能透出来）
    g.globalCompositeOperation = "destination-out";

    // 3.1 内圈硬边
    g.beginPath();
    g.arc(cx, cy, Math.max(0, r - soft), 0, Math.PI * 2);
    g.fillStyle = "rgba(0,0,0,1)"; // 颜色不重要，dest-out 只看alpha
    g.fill();

    // 3.2 外圈软边（径向渐变）
    const grad = g.createRadialGradient(cx, cy, Math.max(0, r - soft), cx, cy, r);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
  }, [dims, gridX, gridY, light, fogOpacity, display.w, display.h,]);

  // 初次与依赖变化时重绘
  useEffect(() => {
    drawBase();
    drawFog();
  }, [drawBase, drawFog]);

  // 光源/参数变化时，仅需重绘雾层
  useEffect(() => {
    drawFog();
  }, [light, fogOpacity, gridX, gridY, drawFog]);

  /* ------------------------- 键盘移动（一格步进） -------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let di = 0, dj = 0;
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") dj = -1;  // 列 X
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") dj = 1;
      if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") di = -1;    // 行 Y
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
          // 自动保存光源位置（防抖）
          debounce(() => {
            fetch(`/api/resources/${encodeURIComponent(resourceId)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lightI: next.i, lightJ: next.j }),
            }).catch(() => {});
          });
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gridX, gridY, resourceId]);

  /* ----------------------------- 网格可视层 ------------------------------ */
  const gridStyle: React.CSSProperties = display.w
    ? {
        backgroundImage:
          `linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px),
           linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)`,
        backgroundSize: `${display.w / gridX}px ${display.h / gridY}px`,
      }
    : {};

 /* ------------------------------ HUD 控制面板 ------------------------------ */
const Hud = () => (
  <>
    {/* HUD 外壳：不拦截事件 */}
    <div className="absolute bottom-3 right-3 z-[30] pointer-events-none select-none">
      {/* 折叠按钮（小圆点），不挡其他区域 */}
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
        // 只有内容区域接收事件，其余地方透传
        <div
          className="pointer-events-auto w-[320px] rounded-xl shadow-lg border backdrop-blur"
          style={{
            backgroundColor: `rgba(20, 22, 26, ${hudAlpha})`,
            borderColor: "rgba(255,255,255,0.18)",
          }}
        >
          {/* 顶部栏：标题 + 折叠 + 透明度 */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1 text-white">
            <div className="text-sm/5 opacity-90">Inspector / 控制台</div>
            <div className="flex items-center gap-2">
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

          {/* 主体内容 */}
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
                    fetch(`/api/resources/${encodeURIComponent(resourceId)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ lightI: v }),
                    }).catch(() => {});
                  });
                }}
              />
              <label className="text-xs opacity-80">x</label>
              <input
                type="number"
                className="w-16 rounded-md bg白/10 border border-white/20 px-2 py-1 text-sm"
                value={light.j}
                min={0}
                max={Math.max(0, gridX - 1)}
                onChange={(e) => {
                  const v = clamp(parseInt(e.target.value || "0", 10), 0, Math.max(0, gridX - 1));
                  setLight((prev) => ({ ...prev, j: v }));
                  debounce(() => {
                    fetch(`/api/resources/${encodeURIComponent(resourceId)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ lightJ: v }),
                    }).catch(() => {});
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
                    fetch(`/api/resources/${encodeURIComponent(resourceId)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ lightRadius: v }),
                    }).catch(() => {});
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
                    fetch(`/api/resources/${encodeURIComponent(resourceId)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ gridCols: v }),
                    }).catch(() => {});
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
                    fetch(`/api/resources/${encodeURIComponent(resourceId)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ gridRows: v }),
                    }).catch(() => {});
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


  /* ---------------------------------- 渲染 ---------------------------------- */
  return (
    <div ref={outerRef} className="relative w-full h-full overflow-auto">   {/* ✅ 监听这个宽度 */}
      <div
        className="relative inline-block"
        style={{ width: display.w, height: display.h }}                    
      >                                                                        {/* ✅ 显示尺寸 */}
        {/* 底图画布 */}
        <canvas ref={baseRef} style={{ display: "block" }} />

        {/* 网格 Overlay */}
        <div className="pointer-events-none absolute inset-0" style={gridStyle} />

        {/* 雾层画布 */}
        <canvas
          ref={fogRef}
          className="absolute inset-0"
          style={{ zIndex: 20 }}   // 盖在网格上面
        />

        {/* 右下角 HUD（保留你之前的） */}
        <Hud />
      </div>
    </div>
  );

}
