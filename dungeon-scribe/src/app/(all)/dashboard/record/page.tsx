"use client";

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import { useTranscript } from "../../../context/TranscriptContext";
import { ragAnswer } from "@/lib/ragClient";
type CharItem = { name: string; img: string; details: string };
import type { Variants } from "framer-motion";

// lock <body>
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

// search and map
// search and map —— 受控版：由父组件传入 q / setQ / onSearch
// Search + Map + (Prev/Next for Sessions) — controlled by parent
function SearchMapsBar({
  q,
  setQ,
  onSearch,
  showPrevNext,
  hitInfo,
  onPrev,
  onNext,
}: {
  q: string;
  setQ: (v: string) => void;
  onSearch: () => void;
  showPrevNext?: boolean;
  hitInfo?: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };
  const onMap = () => {};

  return (
    <>
      {/* Search box */}
      <form
        onSubmit={onSubmit}
        className="absolute"
        style={{ left: 1096, top: 24, width: 260, height: 45, zIndex: 50 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="SEARCH..."
          aria-label="Search"
          className="h-full w-full rounded-full border-2 border-white/90 bg-transparent
                     px-5 pr-12 text-white placeholder:font-bold placeholder:text-white/90
                     outline-none focus:ring-2 focus:ring-white/60 cursor-text"
          style={{
            fontFamily: '"Roboto", sans-serif',
            fontWeight: 700,
            fontSize: 16,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (showPrevNext && (onPrev || onNext)) {
                e.preventDefault();
                if (e.shiftKey && onPrev) onPrev();
                else if (onNext) onNext();
              }
            }
          }}
          title="Enter: next hit; Shift+Enter: previous"
        />
        <button
          type="submit"
          aria-label="Submit search"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-[34px] w-[34px]
                     grid place-items-center rounded-full hover:opacity-90 active:scale-95 transition cursor-pointer"
          title="Search"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2" />
            <path
              d="M20 20L17 17"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </form>

      {/* Prev / Next (only when there are hits) */}
      {showPrevNext && (
        <div
          className="absolute flex items-center gap-2 text-white"
          style={{ left: 1096, top: 74, zIndex: 50 }}
        >
          <button
            onClick={onPrev}
            className="px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 active:scale-95 transition cursor-pointer"
            title="previous (Shift+Enter)"
          >
            previous
          </button>
          <button
            onClick={onNext}
            className="px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 active:scale-95 transition cursor-pointer"
            title="next (Enter)"
          >
            next
          </button>
          <span className="text-sm opacity-90">{hitInfo}</span>
        </div>
      )}

      {/* Map button */}
      <div
        className="absolute flex flex-col items-center select-none"
        style={{ left: 1377, top: 28, width: 38, height: 42, zIndex: 45 }}
        role="button"
        tabIndex={0}
        onClick={onMap}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onMap()}
        title="Open map"
      >
        <div className="h-10 w-10 grid place-items-center cursor-pointer hover:opacity-90 active:scale-95 transition">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 4l5-2 7 2 5-2v16l-5 2-7-2-5 2-5-2V2l5 2z"
              stroke="white"
              strokeWidth="1.6"
            />
            <path
              d="M12 8a3 3 0 100 6 3 3 0 000-6z"
              stroke="white"
              strokeWidth="1.6"
            />
          </svg>
        </div>
        <div className="mt-1 h-[2px] w-[38px] bg-white/90 rounded" />
      </div>
    </>
  );
}

async function endStreamAndWait(): Promise<void> {
  const sess = (window as any).__asrSession || null;
  const ws: WebSocket | undefined = sess?.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Promise resolves when we see {"status":"ended"}
  const ended = new Promise<void>((resolve) => {
    const onMsg = (ev: MessageEvent) => {
      try {
        const raw =
          typeof ev.data === "string"
            ? ev.data
            : ev.data instanceof ArrayBuffer
            ? new TextDecoder().decode(ev.data)
            : String(ev.data);

        // handle one-or-many-per-frame
        for (const line of raw.split(/\r?\n/)) {
          const m = line.trim().match(/\{.*\}$/);
          const body = m ? m[0] : line.trim();
          const payload = JSON.parse(body);
          if (payload?.status === "ended") {
            ws.removeEventListener("message", onMsg);
            resolve();
            return;
          }
        }
      } catch {
        /* ignore */
      }
    };
    ws.addEventListener("message", onMsg);

    // safety timeout so we don't hang forever
    setTimeout(() => {
      ws.removeEventListener("message", onMsg);
      resolve();
    }, 5000);
  });

  try {
    ws.send("__END__"); // <-- send the TEXT frame the server looks for
  } catch {}

  await ended; // <-- wait for drain + ack
}

// Sessions / Characters
function TitleWithFilter({
  value,
  onChange,
}: {
  value: "sessions" | "character";
  onChange: (v: "sessions" | "character") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const label = value === "sessions" ? "SESSIONS" : "CHARACTERS";

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ height: 90 }}
      ref={ref}
    >
      <h1
        className="text-white font-bold"
        style={{
          fontFamily: '"Cinzel", serif',
          fontSize: 55,
          lineHeight: "74px",
        }}
      >
        {label}
      </h1>

      {/* buttons */}
      <button
        aria-label="Toggle"
        onClick={() => setOpen((s) => !s)}
        className="ml-3 h-6 w-6 grid place-items-center rounded-md hover:bg-white/10 transition cursor-pointer"
        title="Switch"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M7 10l5 5 5-5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* session/character */}
      {open && (
        <div className="absolute top-[72px] z-50 min-w-[160px] rounded-md border border-white/20 bg-black/70 backdrop-blur shadow-lg text-white">
          <MenuItem
            active={value === "sessions"}
            onClick={() => {
              onChange("sessions");
              setOpen(false);
            }}
          >
            Sessions
          </MenuItem>
          <MenuItem
            active={value === "character"}
            onClick={() => {
              onChange("character");
              setOpen(false);
            }}
          >
            Characters
          </MenuItem>
        </div>
      )}
    </div>
  );
}
function MenuItem({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 cursor-pointer transition ${
        active ? "bg-white/15" : "hover:bg-white/10"
      }`}
      style={{ fontFamily: '"Inter", sans-serif', fontSize: 14 }}
    >
      {children}
    </button>
  );
}

/*********** Character carousel (stacked, new style) ***********/
const CharacterCarouselStacked = forwardRef(function CharacterCarouselStacked(
  {
    items,
    cur,
    setCur,
    searchName,
  }: {
    items: CharItem[];
    cur: number;
    setCur: (i: number) => void;
    searchName: string;
  },
  _ref: React.Ref<{ focusByName: (name: string) => void }>
) {
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<"left" | "right">("right");

  // hint animation when focused by search
  const [hintOn, setHintOn] = useState(false);
  const fireHint = () => {
    setHintOn(true);
    window.setTimeout(() => setHintOn(false), 900);
  };

  const N = items.length;
  if (N === 0) return null;

  const idxL = (cur - 1 + N) % N;
  const idxR = (cur + 1) % N;

  const prev = () => {
    setDirection("left");
    setCur((cur - 1 + N) % N);
    setFlippedIndex(null);
  };
  const next = () => {
    setDirection("right");
    setCur((cur + 1) % N);
    setFlippedIndex(null);
  };
  const goTo = (i: number) => {
    setDirection(i > cur ? "right" : "left");
    setCur(i);
    setFlippedIndex(null);
  };

  // expose imperative API (optional to use)
  useImperativeHandle(
    _ref,
    () => ({
      focusByName: (name: string) => {
        const i = items.findIndex(
          (x) => x.name.toLowerCase() === name.toLowerCase()
        );
        if (i >= 0) {
          goTo(i);
          fireHint();
        }
      },
    }),
    [items, cur]
  );

  // react to search keyword
  useEffect(() => {
    const key = searchName?.trim().toLowerCase();
    if (!key) return;
    let i = items.findIndex((x) => x.name.toLowerCase() === key);
    if (i < 0) i = items.findIndex((x) => x.name.toLowerCase().includes(key));
    if (i >= 0) {
      goTo(i);
      fireHint();
    }
  }, [searchName]); // eslint-disable-line

  function Card({
    data,
    type,
    index,
    direction,
  }: {
    data: CharItem;
    type: "left" | "center" | "right";
    index: number;
    direction?: "left" | "right";
  }) {
    const styleByType: Record<typeof type, React.CSSProperties> = {
      left: {
        left: 0,
        top: 14,
        width: 399,
        height: 325,
        zIndex: 5,
        opacity: 0.9,
      },
      right: {
        left: 331,
        top: 14,
        width: 399,
        height: 325,
        zIndex: 5,
        opacity: 0.9,
      },
      center: {
        left: 118,
        top: -26,
        width: 486,
        height: 400,
        zIndex: 10,
        opacity: 1,
      },
    };
    const s = styleByType[type];
    const isCenter = type === "center";
    const isFlipped = isCenter && flippedIndex === index;

    // Slide animation variants
    const slideVariants = {
      initial: (dir: "left" | "right") => ({
        x: dir === "right" ? 80 : -80,
        opacity: 0,
        scale: 0.96,
      }),
      animate: {
        x: 0,
        opacity: 1,
        scale: 1,
        transition: { type: "spring", stiffness: 320, damping: 28 },
      },
      exit: (dir: "left" | "right") => ({
        x: dir === "right" ? -80 : 80,
        opacity: 0,
        scale: 0.96,
        transition: { duration: 0.22 },
      }),
    } satisfies Variants;

    if (isCenter) {
      return (
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={data.name}
            className="absolute"
            style={{
              ...s,
              transform: hintOn ? "scale(1.03)" : undefined,
              transition: "transform 420ms ease-out",
            }}
            custom={direction}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={slideVariants}
          >
            {/* 可选发光边框，不影响点击 */}
            {hintOn && (
              <motion.div
                className="pointer-events-none absolute -inset-3 rounded-[26px]"
                style={{
                  border: "4px solid #A43718",
                  filter: "drop-shadow(0 0 14px rgba(164,55,24,0.6))",
                  borderRadius: 26,
                  opacity: 0.9,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, scale: 1.08 }}
                exit={{ opacity: 0 }}
              />
            )}
            <div className="h-full w-full [perspective:1200px] rounded-[20px]">
              <div
                className="relative h-full w-full rounded-[20px] transition-transform duration-500 [transform-style:preserve-3d] shadow-[0_22px_74px_rgba(0,0,0,0.6)]"
                style={{
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 rounded-[20px] border border-[#E9E9E9] [backface-visibility:hidden] overflow-hidden"
                  style={{ background: "#F5F5F5" }}
                >
                  <div
                    className="absolute"
                    style={{
                      left: "4.26%",
                      right: "4.26%",
                      top: "4.31%",
                      bottom: "24.31%",
                    }}
                  >
                    <img
                      src={data.img}
                      alt={data.name}
                      className="h-full w-full object-cover rounded-[20px] border border-[#E9E9E9]"
                    />
                  </div>
                  <div
                    className="absolute"
                    style={{ left: "4.26%", right: "35%", top: "77.5%" }}
                  >
                    <div
                      className="text-[#1D1D1D]"
                      style={{
                        fontFamily: '"Abhaya Libre ExtraBold", serif',
                        fontWeight: 800,
                        fontSize: 24,
                        lineHeight: "28px",
                      }}
                    >
                      {data.name}
                    </div>
                  </div>
                  <div
                    className="absolute"
                    style={{ left: "4.26%", right: "50.13%", top: "87.38%" }}
                  >
                    <button
                      className="text-[#A43718] text-[18px] underline-offset-2 hover:underline cursor-pointer"
                      style={{ fontFamily: '"Adamina", serif' }}
                      onClick={() => setFlippedIndex(index)}
                    >
                      View Details
                    </button>
                  </div>
                </div>

                {/* Back */}
                <div
                  className="absolute inset-0 rounded-[20px] border border-[#E9E9E9] bg-white px-6 py-5 flex flex-col gap-3 [backface-visibility:hidden]"
                  style={{ transform: "rotateY(180deg)" }}
                  onClick={() => setFlippedIndex(null)}
                >
                  <div
                    className="text-[#1D1D1D]"
                    style={{
                      fontFamily: '"Abhaya Libre ExtraBold", serif',
                      fontWeight: 800,
                      fontSize: 24,
                    }}
                  >
                    {data.name}
                  </div>
                  <div
                    className="text-[#333]"
                    style={{
                      fontFamily: '"Inter", sans-serif',
                      fontSize: 15,
                      lineHeight: "24px",
                    }}
                  >
                    {data.details}
                  </div>
                  <div className="mt-auto flex justify-end">
                    <button
                      className="px-4 py-2 rounded-md bg-[#3D2304] text-white hover:opacity-95 active:scale-95 transition cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFlippedIndex(null);
                      }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      );
    }
    // Left/right cards: no animation
    return (
      <div className="absolute" style={{ ...s }}>
        <div className="h-full w-full [perspective:1200px] rounded-[20px]">
          <div
            className="relative h-full w-full rounded-[20px] transition-transform duration-500 [transform-style:preserve-3d] shadow-[0_22px_74px_rgba(0,0,0,0.6)]"
            style={{
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 rounded-[20px] border border-[#E9E9E9] [backface-visibility:hidden] overflow-hidden"
              style={{
                background:
                  type === "left" || type === "right" ? "#FFFFFF" : undefined,
              }}
            >
              <div
                className="absolute"
                style={{
                  left: "4.26%",
                  right: "4.26%",
                  top: "4.31%",
                  bottom: "24.31%",
                }}
              >
                <img
                  src={data.img}
                  alt={data.name}
                  className="h-full w-full object-cover rounded-[20px] border border-[#E9E9E9]"
                />
              </div>
              <div
                className="absolute"
                style={{ left: "4.26%", right: "35%", top: "77.5%" }}
              >
                <div
                  className="text-[#1D1D1D]"
                  style={{
                    fontFamily: '"Abhaya Libre ExtraBold", serif',
                    fontWeight: 800,
                    fontSize: 24,
                    lineHeight: "28px",
                  }}
                >
                  {data.name}
                </div>
              </div>
              <div
                className="absolute"
                style={{ left: "4.26%", right: "50.13%", top: "87.38%" }}
              >
                <button
                  className="text-[#A43718] text-[18px] underline-offset-2 hover:underline cursor-pointer"
                  style={{ fontFamily: '"Adamina", serif' }}
                  disabled
                >
                  View Details
                </button>
              </div>
            </div>
            {/* Back */}
            <div
              className="absolute inset-0 rounded-[20px] border border-[#E9E9E9] bg-white px-6 py-5 flex flex-col gap-3 [backface-visibility:hidden]"
              style={{ transform: "rotateY(180deg)" }}
            >
              <div
                className="text-[#1D1D1D]"
                style={{
                  fontFamily: '"Abhaya Libre ExtraBold", serif',
                  fontWeight: 800,
                  fontSize: 24,
                }}
              >
                {data.name}
              </div>
              <div
                className="text-[#333]"
                style={{
                  fontFamily: '"Inter", sans-serif',
                  fontSize: 15,
                  lineHeight: "24px",
                }}
              >
                {data.details}
              </div>
              <div className="mt-auto flex justify-end">
                <button
                  className="px-4 py-2 rounded-md bg-[#3D2304] text-white hover:opacity-95 active:scale-95 transition cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlippedIndex(null);
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative"
      style={{ width: 730, height: 438, left: 40, top: -36, zIndex: 30 }}
    >
      {/* prev */}
      <button
        onClick={prev}
        aria-label="Previous"
        className="absolute h-[50px] w-[50px] rounded-full grid place-items-center transition hover:scale-105 active:scale-95 cursor-pointer"
        style={{
          left: -18,
          top: 150,
          zIndex: 45,
          background: "rgba(0,0,0,0.85)",
          boxShadow:
            "0 10px 24px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.25) inset",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 6l-6 6 6 6"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* next */}
      <button
        onClick={next}
        aria-label="Next"
        className="absolute h-[50px] w-[50px] rounded-full grid place-items-center transition hover:scale-105 active:scale-95 cursor-pointer"
        style={{
          left: 698,
          top: 150,
          zIndex: 45,
          background: "rgba(0,0,0,0.85)",
          boxShadow:
            "0 10px 24px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.25) inset",
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          style={{ transform: "rotate(180deg)" }}
        >
          <path
            d="M15 6l-6 6 6 6"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* 3 cards */}
      <Card data={items[idxL]} type="left" index={idxL} />
      <Card data={items[cur]} type="center" index={cur} direction={direction} />
      <Card data={items[idxR]} type="right" index={idxR} />

      {/* dots */}
      <div
        className="absolute flex gap-2"
        style={{ left: 340, top: 388, zIndex: 40 }}
      >
        {items.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => goTo(i)}
            className="h-[10px] w-[10px] rounded-full cursor-pointer"
            style={{
              background: i === cur ? "#0056D6" : "#D3E5FF",
              outline: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
});

/* 仅 Sessions 视图使用：羊皮纸“内部”的滚动内容（字幕从纸内出现而不是从网页底部出现）可连接LLM接口*/
function SessionsInsidePaper({
  searchTerm,
  activeHit,
  onHitCount,
}: {
  searchTerm: string;
  activeHit: number;
  onHitCount: (n: number) => void;
}) {
  const { summary } = useTranscript();

  const raw = summary || `No content yet`;

  type Block = { title: string; body: string };
  const blocks: Block[] = raw
    .trim()
    .split(/\n{2,}/)
    .map((b) => {
      const lines = b.split("\n");
      return {
        title: (lines[0] || "").trim(),
        body: lines.slice(1).join("\n").trim(),
      };
    });

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const [thumbTop, setThumbTop] = useState(0);
  const [thumbH, setThumbH] = useState(46);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef(0);
  const sizesRef = useRef({ trackH: 1, maxThumbTop: 1, maxScrollTop: 1 });

  const SCROLLBAR = { width: 12, gap: 10 };
  const SAFE = { left: 22, right: 22, top: 1, bottom: 25 };
  const contentBox = {
    left: 67.86 + SAFE.left,
    top: 24 + SAFE.top,
    width: 867 - SAFE.left - SAFE.right,
    height: 540 - SAFE.top - SAFE.bottom,
  };

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const MAX_HITS = 500;

  function renderHighlighted(text: string) {
    if (!searchTerm?.trim()) return text;
    const re = new RegExp(escapeRegExp(searchTerm), "gi");
    const nodes: React.ReactNode[] = [];
    let last = 0,
      idx = 0,
      m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
      if (idx >= MAX_HITS) break;
      const start = m.index,
        end = start + m[0].length;
      if (start > last) nodes.push(text.slice(last, start));
      nodes.push(
        <mark
          key={`hit-${idx}`}
          className="search-hit"
          data-hit={idx++}
          style={{
            paddingInline: 2,
            background: "rgba(255,230,0,0.6)",
            borderRadius: 3,
          }}
        >
          {text.slice(start, end)}
        </mark>
      );
      last = end;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
  }

  // --- recalc with rAF debounce + only update when changed ---
  let recalcRaf = 0;
  const recalc = () => {
    cancelAnimationFrame(recalcRaf);
    recalcRaf = requestAnimationFrame(() => {
      const vp = viewportRef.current,
        track = trackRef.current;
      if (!vp || !track) return;
      const contentH = vp.scrollHeight,
        viewH = vp.clientHeight,
        trackH = track.clientHeight;
      const minThumb = 48; // 提升最小高度以改善长文手感
      const tH = Math.max(minThumb, (viewH / Math.max(contentH, 1)) * trackH);
      const maxThumbTop = Math.max(trackH - tH, 0);
      const maxScrollTop = Math.max(contentH - viewH, 1);
      const tTop =
        (vp.scrollTop / Math.max(1, maxScrollTop)) * Math.max(0, maxThumbTop);

      sizesRef.current = { trackH, maxThumbTop, maxScrollTop };

      setThumbH((prev) => (Math.abs(prev - tH) > 0.5 ? tH : prev));
      setThumbTop((prev) =>
        Number.isFinite(tTop) && Math.abs(prev - tTop) > 0.5 ? tTop : prev
      );

      if (thumbRef.current) {
        thumbRef.current.style.top = `${Number.isFinite(tTop) ? tTop : 0}px`;
      }
    });
  };

  // --- viewport scroll → rAF sync thumb (no setState in hot path) ---
  let scrollRaf = 0;
  const onViewportScroll = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const { maxThumbTop, maxScrollTop } = sizesRef.current;
      const t =
        (vp.scrollTop / Math.max(1, maxScrollTop)) * Math.max(0, maxThumbTop);
      if (thumbRef.current) {
        thumbRef.current.style.top = `${Number.isFinite(t) ? t : 0}px`;
      }
    });
  };

  const onTrackClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const track = trackRef.current,
      vp = viewportRef.current;
    if (!track || !vp) return;
    const rect = track.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const { maxThumbTop, maxScrollTop } = sizesRef.current;
    const target = Math.min(Math.max(y - thumbH / 2, 0), maxThumbTop);
    const ratio = target / Math.max(1, maxThumbTop);
    vp.scrollTop = ratio * maxScrollTop;
  };

  const onThumbMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    dragOffsetRef.current = e.clientY - rect.top;
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const track = trackRef.current,
        vp = viewportRef.current;
      if (!track || !vp) return;
      const rect = track.getBoundingClientRect();
      const y = e.clientY - rect.top - dragOffsetRef.current;
      const { maxThumbTop, maxScrollTop } = sizesRef.current;
      const clamped = Math.min(Math.max(y, 0), maxThumbTop);
      const ratio = clamped / Math.max(1, maxThumbTop);
      vp.scrollTop = ratio * maxScrollTop;
      if (thumbRef.current) {
        thumbRef.current.style.top = `${clamped}px`;
      }
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    viewportRef.current && ro.observe(viewportRef.current);
    trackRef.current && ro.observe(trackRef.current);
    const onR = () => recalc();
    window.addEventListener("resize", onR);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onR);
      cancelAnimationFrame(recalcRaf);
      cancelAnimationFrame(scrollRaf);
    };
  }, []);

  // --- search: count hits and auto-jump to first on term change ---
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) {
      onHitCount(0);
      return;
    }
    requestAnimationFrame(() => {
      const hits = vp.querySelectorAll<HTMLElement>("mark.search-hit");
      onHitCount(hits.length);
      if (searchTerm && hits.length > 0) {
        const el = hits[0]!;
        const offset =
          el.getBoundingClientRect().top - vp.getBoundingClientRect().top;
        vp.scrollBy({ top: offset - 40, behavior: "smooth" });
      }
    });
  }, [searchTerm, onHitCount]);

  // --- when activeHit changes, center it if needed ---
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const hits = vp.querySelectorAll<HTMLElement>("mark.search-hit");
    hits.forEach((h) => h.classList.remove("search-hit--active"));
    if (!hits.length) return;

    const idx = Math.max(0, Math.min(activeHit, hits.length - 1));
    const el = hits[idx]!;
    el.classList.add("search-hit--active");

    const vpRect = vp.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const top = elRect.top - vpRect.top;
    if (top < 60 || top > vp.clientHeight - 80) {
      vp.scrollBy({
        top: top - vp.clientHeight / 2 + elRect.height / 2,
        behavior: "smooth",
      });
    }
  }, [activeHit, searchTerm]);

  const heavy = blocks.length > 600 || (summary?.length ?? 0) > 200_000; // 超大文本时可关闭遮罩

  return (
    <>
      {/* 捕获纸外滚轮并导入纸内视口，解决 body 锁滚导致的“滚不动” */}
      <div
        className="absolute"
        style={{
          left: 67.86,
          top: 24,
          width: 867,
          height: 540,
          zIndex: 2,
          pointerEvents: "auto",
        }}
        onWheel={(e) => {
          const vp = viewportRef.current;
          if (!vp) return;
          e.preventDefault();
          vp.scrollBy({ top: e.deltaY, behavior: "auto" });
        }}
      >
        <div
          className="absolute"
          style={{ ...contentBox, zIndex: 2, pointerEvents: "auto" }}
        >
          <div
            id="sessionViewport"
            ref={viewportRef}
            onScroll={onViewportScroll}
            className="absolute overflow-y-auto"
            style={{
              inset: 0,
              padding: "6px 8px 12px 12px",
              paddingRight: SCROLLBAR.width + SCROLLBAR.gap + 8,
              fontFamily: '"Inter", sans-serif',
              fontWeight: 700,
              fontSize: 20,
              lineHeight: "40px",
              color: "#000",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              touchAction: "pan-y",
            }}
            tabIndex={0}
            onKeyDown={(e) => {
              const vp = viewportRef.current;
              if (!vp) return;
              const page = vp.clientHeight - 40;
              if (["PageDown", "PageUp", " "].includes(e.key))
                e.preventDefault();
              if (e.key === "PageDown" || e.key === " ")
                vp.scrollBy({ top: page, behavior: "smooth" });
              if (e.key === "PageUp")
                vp.scrollBy({ top: -page, behavior: "smooth" });
            }}
          >
            <div
              style={
                heavy
                  ? undefined
                  : {
                      WebkitMaskImage:
                        "linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
                      maskImage:
                        "linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
                    }
              }
            >
              {blocks.map((blk, i) => (
                <div key={i} className="mb-4">
                  <div className="flex items-start gap-2">
                    <img
                      src="/dragon.png"
                      alt=""
                      style={{ width: 26, height: 26, marginTop: 6 }}
                      onError={(e) =>
                        ((e.target as HTMLImageElement).style.display = "none")
                      }
                    />
                    <div className="font-extrabold">
                      {renderHighlighted(blk.title)}
                    </div>
                  </div>
                  {blk.body && (
                    <div className="whitespace-pre-wrap mt-1">
                      {renderHighlighted(blk.body)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 自定义滚动条 */}
          <div
            ref={trackRef}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).dataset.role !== "thumb")
                onTrackClick(e);
            }}
            className="absolute"
            style={{
              right: SCROLLBAR.gap,
              top: 10,
              bottom: 10,
              width: SCROLLBAR.width,
              borderRadius: 10,
              background: "rgba(0,0,0,0.18)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
              cursor: "pointer",
            }}
          >
            <div
              ref={thumbRef}
              data-role="thumb"
              onMouseDown={onThumbMouseDown}
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                top: `${thumbTop}px`,
                width: SCROLLBAR.width - 4,
                height: `${thumbH}px`,
                borderRadius: 8,
                background: "rgba(61,35,4,0.75)",
                boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.5)",
                cursor: dragging ? "grabbing" : "grab",
                willChange: "top",
              }}
              title="Drag to scroll"
            />
          </div>
        </div>
      </div>

      <style jsx>{`
        #sessionViewport::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        mark.search-hit--active {
          outline: 2px solid #a43718;
          background: rgba(255, 230, 0, 0.9);
        }
      `}</style>
    </>
  );
}
/******************** chatbox */
/* ========= Fixed Chat Widget (click to open, no drag) ========= */
/* ========= Fixed Chat Widget ========= */
function ChatWidget() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wrapRef.current) {
      wrapRef.current.style.left = "56px";
      wrapRef.current.style.top = "96px";
    }
  }, []);

  const onOpen = () => setOpen(true);
  const onClose = () => setOpen(false);

  async function sendMessage(val: string) {
    if (!val.trim() || busy) return;
    setBusy(true);

    const list = listRef.current!;
    // append user bubble
    {
      const mine = document.createElement("div");
      mine.className = "mb-3 flex justify-end";
      mine.innerHTML = `<div class="max-w-[80%] rounded-2xl px-4 py-3 bg-gray-200 text-gray-900">${escapeHtml(
        val
      )}</div>`;
      list.appendChild(mine);
      list.scrollTop = list.scrollHeight;
    }

    try {
      const { answer } = await ragAnswer({
        question: val,
        topK: 5,
        where: { type: "raw" }, // important
      });

      const bot = document.createElement("div");
      bot.className = "mb-3";
      bot.innerHTML = `<div class="max-w-[80%] rounded-2xl px-4 py-3 text-white bg-violet-800 whitespace-pre-wrap">${escapeHtml(
        answer || "[no answer]"
      )}</div>`;
      list.appendChild(bot);
      list.scrollTop = list.scrollHeight;
    } catch (err: any) {
      const bot = document.createElement("div");
      bot.className = "mb-3";
      bot.innerHTML = `<div class="max-w-[80%] rounded-2xl px-4 py-3 text-white bg-rose-600">Error: ${escapeHtml(
        err?.message || "RAG failed"
      )}</div>`;
      list.appendChild(bot);
      list.scrollTop = list.scrollHeight;
    } finally {
      setBusy(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const inputEl = e.currentTarget as HTMLInputElement;
    const val = inputEl.value.trim();
    if (!val) return;
    inputEl.value = "";
    void sendMessage(val);
  }

  return (
    <div
      ref={wrapRef}
      className="fixed z-[9999] select-none"
      style={{
        left: 56,
        top: 106,
        width: open ? 360 : 60,
        height: open ? 520 : 60,
      }}
    >
      {!open && (
        <button
          aria-label="Open Chat"
          className="h-[60px] w-[60px] rounded-full bg-transparent grid place-items-center cursor-pointer"
          onClick={onOpen}
          title="Chat"
          type="button"
        >
          <img
            src="/chatbox.png"
            alt="chatbot"
            className="w-10 h-10 object-contain"
          />
        </button>
      )}

      {open && (
        <section className="w-[360px] h-[520px] bg-white rounded-[22px] shadow-2xl grid grid-rows-[auto_1fr_auto] overflow-hidden">
          <header className="bg-indigo-600 text-white px-3 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-white/20 grid place-items-center overflow-hidden">
                <img
                  src="/chatbox.png"
                  alt="bot"
                  className="w-5 h-5 object-contain"
                />
              </div>
              <div className="leading-4">
                <div className="font-semibold">Assistant</div>
                <div className="text-xs opacity-90 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.25)]"></span>
                  {busy ? "Thinking…" : "Online"}
                </div>
              </div>
            </div>
            <button
              aria-label="Minimize"
              onClick={onClose}
              className="h-8 w-8 rounded-md bg-white/20 grid place-items-center hover:bg-white/30"
              title="Minimize"
              type="button"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14"></path>
              </svg>
            </button>
          </header>

          {/* messages */}
          <div className="overflow-auto px-3 py-3 bg-slate-50" ref={listRef}>
            <div className="mb-3">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 text-white bg-violet-800">
                Hi! Ask me anything.
              </div>
            </div>
          </div>

          {/* input */}
          <div className="px-3 pb-3">
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-xl px-3 h-11 outline-none text-gray-900 placeholder-gray-400 caret-gray-900"
                placeholder="Type your message here..."
                onKeyDown={onInputKeyDown}
                disabled={busy}
              />
              <button
                className="h-11 w-11 rounded-xl bg-indigo-600 text-white grid place-items-center disabled:opacity-60"
                onClick={(e) => {
                  const input = (e.currentTarget
                    .previousSibling as HTMLInputElement)!;
                  input.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "Enter",
                      bubbles: true,
                    })
                  );
                }}
                aria-label="Send"
                type="button"
                disabled={busy}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 2L11 13"></path>
                  <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
                </svg>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// simple HTML escaper for safety
function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ]!)
  );
}

export default function RecordPage() {
  useEffect(() => {
    (async () => {
      const sess = (window as any).__asrSession;
      if (!sess) return;

      // If the old socket died while we were away, recreate it
      const ws = await ensureOpenSocket(sess);
      bindWsHandlers(ws);
      setIsRecording(ws.readyState === WebSocket.OPEN);

      // Re-send campaign on (re)bind
      try {
        const id = await getCampaignId();
        if (id && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "set_campaign", campaignId: id }));
          console.log("[ASR] set_campaign on mount:", id);
        }
      } catch {}
    })();
  }, []);

  useLockBodyScroll();
  // const { transcript, setTranscript } = useTranscript();
  const { transcript, summary, setTranscript, setSummary } = useTranscript();

  const router = useRouter();

  // 先声明 view（避免“使用前声明”错误）
  const [view, setView] = useState<"sessions" | "character">("sessions");

  // 统一搜索 state（只保留这一份）
  const [q, setQ] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [hitCount, setHitCount] = useState(0);
  const [activeHit, setActiveHit] = useState(0);

  // 切换视图时清空搜索与命中导航（保持与截图一致）
  const onChangeView = (v: "sessions" | "character") => {
    setView(v);
    // 清空 Sessions 搜索相关
    setQ("");
    setSearchTerm("");
    setHitCount(0);
    setActiveHit(0);
    // 清空 Character 关键字
    setCharSearchKey("");
  };

  // 搜索提交 + 上/下一条
  // 搜索提交 + 上/下一条
  const onSearch = () => {
    const key = q.trim();
    if (view === "sessions") {
      setSearchTerm(key);
      setActiveHit(0);
    } else {
      setCharSearchKey(key); // character 视图用这个
    }
  };

  const onPrev = () => {
    if (hitCount > 0) setActiveHit((i) => (i - 1 + hitCount) % hitCount);
  };
  const onNext = () => {
    if (hitCount > 0) setActiveHit((i) => (i + 1) % hitCount);
  };

  // recording state

  const [isRecording, setIsRecording] = useState<boolean>(
    () => typeof window !== "undefined" && !!(window as any).__asrSession?.ctx
  );

  //scroll bar
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbH, setThumbH] = useState(46);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef(0);
  const sizesRef = useRef({ trackH: 1, maxThumbTop: 1, maxScrollTop: 1 });

  const recalc = () => {
    const vp = viewportRef.current,
      track = trackRef.current;
    if (!vp || !track) return;
    const contentH = vp.scrollHeight;
    const viewH = vp.clientHeight;
    const trackH = track.clientHeight;
    const minThumb = 36;
    const tH = Math.max(
      minThumb,
      Math.max(10, (viewH / Math.max(contentH, 1)) * trackH)
    );
    const maxThumbTop = Math.max(trackH - tH, 0);
    const maxScrollTop = Math.max(contentH - viewH, 1);
    const tTop = (vp.scrollTop / maxScrollTop) * maxThumbTop;
    sizesRef.current = { trackH, maxThumbTop, maxScrollTop };
    setThumbH(tH);
    setThumbTop(Number.isFinite(tTop) ? tTop : 0);
  };
  const onViewportScroll = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    const { maxThumbTop, maxScrollTop } = sizesRef.current;
    const t =
      (vp.scrollTop / Math.max(1, maxScrollTop)) * Math.max(0, maxThumbTop);
    setThumbTop(Number.isFinite(t) ? t : 0);
  };
  const onTrackClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const track = trackRef.current,
      vp = viewportRef.current;
    if (!track || !vp) return;
    const rect = track.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const { maxThumbTop, maxScrollTop } = sizesRef.current;
    const target = Math.min(Math.max(y - thumbH / 2, 0), maxThumbTop);
    const ratio = target / Math.max(1, maxThumbTop);
    vp.scrollTop = ratio * maxScrollTop;
  };
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const track = trackRef.current,
        vp = viewportRef.current;
      if (!track || !vp) return;
      const rect = track.getBoundingClientRect();
      const y = e.clientY - rect.top - dragOffsetRef.current;
      const { maxThumbTop, maxScrollTop } = sizesRef.current;
      const clamped = Math.min(Math.max(y, 0), maxThumbTop);
      setThumbTop(clamped);
      const ratio = clamped / Math.max(1, maxThumbTop);
      vp.scrollTop = ratio * maxScrollTop;
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);
  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    viewportRef.current && ro.observe(viewportRef.current);
    trackRef.current && ro.observe(trackRef.current);
    const onR = () => recalc();
    window.addEventListener("resize", onR);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onR);
    };
  }, []);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.scrollTop = vp.scrollHeight;
    recalc();
  }, [transcript]);

  // ws URL
  function wsURL() {
    if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ASR_WS) {
      return process.env.NEXT_PUBLIC_ASR_WS!;
    }
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.hostname}:8000/audio`;
  }

  function bindWsHandlers(ws: WebSocket) {
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      console.log("[ASR] WS open, recording started");
      setIsRecording(true);
    };

    ws.onclose = () => {
      console.log("[ASR] WS close");
      setIsRecording(false);
    };

    ws.onerror = (e) => {
      console.error("[ASR] WS error", e);
      setIsRecording(false);
    };

    ws.onmessage = (ev) => {
      try {
        // 1) 统一拿字符串
        const raw =
          typeof ev.data === "string"
            ? ev.data
            : ev.data instanceof ArrayBuffer
            ? new TextDecoder().decode(ev.data)
            : String(ev.data);

        // 2) 可能一帧多条、可能带日志前缀；逐行解析
        const lines = raw
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);

        for (const line of lines) {
          // 截取最后一个花括号 payload（去掉类似 "[WS] actually sent -> " 的前缀）
          const m = line.match(/\{.*\}$/);
          const candidate = m ? m[0] : line;

          let data: any;
          try {
            data = JSON.parse(candidate);
          } catch (e) {
            console.error("[ASR] JSON parse fail:", e, "raw:", line);
            continue;
          }

          // 3) —— 归一化开始 —— //
          // 3.1 键名去空格（防止 "summary_item " 这种）
          if (data && typeof data === "object" && !Array.isArray(data)) {
            for (const k of Object.keys(data)) {
              const nk = k.trim();
              if (nk !== k) {
                data[nk] = data[k];
                delete (data as any)[k];
              }
            }
          }

          // 3.2 如果是 {"": {...}}，提出来
          if (
            data &&
            typeof data === "object" &&
            "" in data &&
            typeof data[""] === "object"
          ) {
            data = data[""];
          }

          // 3.3 常见包装 {"data": {...}}
          if (
            data &&
            typeof data === "object" &&
            "data" in data &&
            typeof data.data === "object"
          ) {
            data = data.data;
          }

          // 3.4 如果 value 又是 JSON 字符串（二次 JSON），再解一次
          for (const k of ["summary_item", "summary", "final", "partial"]) {
            if (
              typeof data?.[k] === "string" &&
              /^[\[{].*[\]}]$/.test(data[k])
            ) {
              try {
                data[k] = JSON.parse(data[k]);
              } catch {}
            }
          }
          // —— 归一化结束 —— //

          console.log("[ASR] WS message (normalized):", data);

          // 4) transcript
          if (typeof data.partial === "string" && data.partial.trim()) {
            setTranscript((prev) => (prev ? prev + "\n" : "") + data.partial);
          }
          if (typeof data.final === "string" && data.final.trim()) {
            setTranscript((prev) => (prev ? prev + "\n" : "") + data.final);
          }

          // 5) 兼容旧字段 summary
          if (typeof data.summary === "string" && data.summary.trim()) {
            setSummary(data.summary.trim());
          }

          // 6) 新字段 summary_item（标题 + 正文）
          const si = data.summary_item;
          if (si && typeof si === "object" && typeof si.text === "string") {
            const t = (si.title || "Update").trim?.() ?? "Update";
            const b = si.text.trim();
            if (b) {
              setSummary((prev) =>
                prev ? `${prev}\n\n${t}\n${b}` : `${t}\n${b}`
              );
              console.log("[ASR] appended summary_item");
            }
          }
        }
      } catch (e) {
        console.error("[ASR] onmessage handler error:", e, ev.data);
      }
    };
  }

  async function getCampaignId(): Promise<string | null> {
    try {
      const res = await fetch("/api/current-campaign", { method: "GET" });
      const j = await res.json();
      return j?.id ?? j?.item?.id ?? null;
    } catch {
      return null;
    }
  }

  function openWsWithCampaign(baseUrl: string, campaignId: string | null) {
    return new WebSocket(
      campaignId
        ? `${baseUrl}?campaignId=${encodeURIComponent(campaignId)}`
        : baseUrl
    );
  }

  /** (Re)create a socket, bind handlers, and send campaign context when ready. */
  async function createAndBindSocket(): Promise<WebSocket> {
    const base = wsURL();
    const campaignId = await getCampaignId();
    const ws = openWsWithCampaign(base, campaignId);
    bindWsHandlers(ws);
    ws.addEventListener("open", () => {
      if (campaignId) {
        try {
          ws.send(JSON.stringify({ type: "set_campaign", campaignId }));
        } catch {}
      }
    });
    return ws;
  }

  function startPauseKeepAlive(sess: any) {
    try {
      if (!sess || !sess.ws) return;
      stopPauseKeepAlive(sess); // just in case
      sess._keepAliveId = window.setInterval(() => {
        try {
          if (sess.ws && sess.ws.readyState === WebSocket.OPEN) {
            // benign JSON that server will just ignore
            sess.ws.send(JSON.stringify({ type: "ping" }));
          }
        } catch {}
      }, 3000); // every 3s is plenty
    } catch {}
  }

  function stopPauseKeepAlive(sess: any) {
    try {
      if (sess && sess._keepAliveId) {
        clearInterval(sess._keepAliveId);
        sess._keepAliveId = null;
      }
    } catch {}
  }

  /** Ensure we have an OPEN socket; recreate & update __asrSession if needed. */
  async function ensureOpenSocket(sess: any): Promise<WebSocket> {
    const cur: WebSocket | undefined = sess?.ws;
    if (cur && cur.readyState === WebSocket.OPEN) return cur;
    const ws = await createAndBindSocket();
    if (sess) sess.ws = ws;
    return ws;
  }

  // START recording
  const startRecording = async () => {
    // Do NOT clear transcript/summary here — keep previous speech-to-text content.
    if (isRecording) return;

    // ✅ If a paused session exists, reopen WS if needed and rewire the worklet
    const existing = (window as any).__asrSession || null;
    if (existing && (existing as any).paused) {
      try {
        // 1) Make sure the AudioContext is running
        const ctx: AudioContext | undefined = existing.ctx;
        if (ctx && ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch {}
        }

        // 2) Ensure we have an OPEN websocket (recreate if the server closed it after idle)
        const ws: WebSocket = await ensureOpenSocket(existing);

        // 3) Re-bind WS handlers (so we receive results again)
        bindWsHandlers(ws);

        // 4) Re-send campaign context
        try {
          const resumedCampaignId = await getCampaignId();
          if (resumedCampaignId && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "set_campaign",
                campaignId: resumedCampaignId,
              })
            );
            console.log(
              "[ASR] re-sent set_campaign on resume:",
              resumedCampaignId
            );
          }
        } catch {}

        // 5) Re-attach worklet send handler so audio resumes streaming
        const node: AudioWorkletNode | undefined = existing.node;
        if (node && node.port) {
          node.port.onmessage = (ev: any) => {
            const ab = ev.data as ArrayBuffer;
            try {
              if (ws && ws.readyState === WebSocket.OPEN) ws.send(ab);
            } catch {}
          };
          node.port.onmessageerror = (e: any) =>
            console.warn("[ASR] worklet port message error", e);
        }
        stopPauseKeepAlive(existing);
        (existing as any).paused = false;
        setIsRecording(true);
        console.log("[ASR] resumed paused session");
        return; // ← done, we resumed successfully
      } catch (e) {
        console.warn("Failed to resume paused session, starting fresh", e);
        // fall through to fresh start
      }
    }

    // ---- Fresh start path (unchanged except for using wsURL()/bindWsHandlers) ----
    try {
      // ask for mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // AudioContext + Worklet
      const ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const moduleUrl = new URL(
        "/worklets/pcm16-frames.js",
        window.location.origin
      );
      moduleUrl.searchParams.set("v", Date.now().toString());
      await ctx.audioWorklet.addModule(moduleUrl.toString());

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm16-frames", {
        processorOptions: { frameSize: 320 }, // 20ms @ 16kHz
      });

      const sink = ctx.createGain();
      sink.gain.value = 0;
      source.connect(node);
      node.connect(sink).connect(ctx.destination);

      // WebSocket
      const base = wsURL();
      const res = await fetch("/api/current-campaign", { method: "GET" });
      const { id: campaignId } = await res.json();
      const ws = new WebSocket(
        campaignId
          ? `${base}?campaignId=${encodeURIComponent(campaignId)}`
          : base
      );

      // Bind handlers
      bindWsHandlers(ws);

      // queue for early audio until ws opens
      const queue: ArrayBuffer[] = [];
      let open = false;
      ws.addEventListener("open", () => {
        open = true;
        if (campaignId) {
          ws.send(JSON.stringify({ type: "set_campaign", campaignId }));
        }
        while (queue.length) {
          const buf = queue.shift()!;
          try {
            ws.send(buf);
          } catch {}
        }
      });

      node.port.onmessage = (ev) => {
        const ab = ev.data as ArrayBuffer;
        if (open && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(ab);
          } catch {}
        } else {
          queue.push(ab);
          if (queue.length > 200) queue.splice(0, queue.length - 200);
        }
      };
      node.port.onmessageerror = (e) =>
        console.warn("[ASR] worklet port message error", e);

      // Save session handle
      (window as any).__asrSession = { ctx, source, node, sink, ws, stream };
    } catch (err) {
      console.error(err);
      alert("Failed to start recording. See console for details.");
      setIsRecording(false);
    }
  };

  // Pause recording: keep session objects in memory so they can be resumed.
  const stopRecording = () => {
    const sess = (window as any).__asrSession || null;
    try {
      // Remove the worklet send handler so audio stops being sent, but keep streams and context
      if (sess?.node?.port) {
        try {
          sess.node.port.onmessage = null;
        } catch {}
        try {
          sess.node.port.onmessageerror = null;
        } catch {}
      }

      startPauseKeepAlive(sess);

      // Stop processing WS messages locally but don't close the socket; keep it for resume
      // if (sess?.ws) {
      //   try {
      //     sess.ws.onmessage = null;
      //   } catch {}
      // }

      // Mark session as paused
      if (sess) (sess as any).paused = true;
    } finally {
      setIsRecording(false);
      console.log("[ASR] paused (session held in memory)");
    }
  };

  // Full cleanup: close WS, stop tracks, close AudioContext and remove session (used by end-session)
  const cleanupRecording = () => {
    const sess = (window as any).__asrSession || null;
    try {
      stopPauseKeepAlive(sess);
      try {
        if (sess?.node?.port) {
          sess.node.port.onmessage = null;
          sess.node.port.onmessageerror = null;
          sess.node.port.close?.();
        }
      } catch {}
      try {
        sess?.node?.disconnect?.();
      } catch {}
      try {
        sess?.source?.disconnect?.();
      } catch {}
      try {
        sess?.sink?.disconnect?.();
      } catch {}

      if (sess?.stream?.getTracks) {
        for (const t of sess.stream.getTracks()) {
          try {
            t.stop();
          } catch {}
        }
      }

      // close WS
      if (sess?.ws) {
        try {
          sess.ws.onmessage = null;
        } catch {}
        try {
          sess.ws.onclose = null;
        } catch {}
        try {
          sess.ws.onerror = null;
        } catch {}
        try {
          if (sess.ws.readyState === WebSocket.OPEN)
            sess.ws.close(1000, "done");
        } catch {}
      }

      // close AudioContext
      if (
        sess?.ctx &&
        typeof sess.ctx.close === "function" &&
        sess.ctx.state !== "closed"
      ) {
        sess.ctx.close().catch(() => {});
      }
    } finally {
      (window as any).__asrSession = null;
      setIsRecording(false);
      console.log("[ASR] fully stopped & cleaned");
    }
  };

  // End Session: save AI summary to DB (update existing summary if present), cleanup and navigate
  const handleEndSession = async (): Promise<void> => {
    // 1) Politely tell the ASR server we're done and wait for its ack/drain
    try {
      await endStreamAndWait();
    } catch {}

    // 2) Resolve campaign context robustly
    let campaignId = currentCampaignId?.trim() || null;
    if (!campaignId) {
      try {
        campaignId = (await getCampaignId()) || null;
      } catch {}
    }
    if (!campaignId) {
      try {
        campaignId = window.localStorage.getItem("currentCampaignId") || null;
      } catch {}
    }

    const campaignTitle = (
      window?.localStorage?.getItem("currentCampaignTitle") ||
      "Untitled Campaign"
    ).trim();
    const summaryText = summary || "";
    const existingSummaryId =
      typeof window !== "undefined"
        ? window.localStorage.getItem("currentSummaryId")
        : null;

    if (!campaignId) {
      console.error("[EndSession] Missing campaignId; not saving/navigating.");
      alert("No campaign selected. Please select a campaign first.");
      return;
    }

    // 3) Persist transcript/summary to backend
    try {
      const payload: any = {
        text: transcript || "",
        title: campaignTitle,
        source: "live",
        campaignId,
        summary: summaryText,
        useProvidedSummary: true,
        skipCharacterExtraction: true,
      };
      if (existingSummaryId) payload.summaryId = existingSummaryId;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        try {
          const data = await res.json();
          if (data?.summaryId) {
            window.localStorage.setItem("currentSummaryId", data.summaryId);
          }
        } catch {}
      } else {
        console.error("/api/analyze returned", res.status, await res.text());
      }

      // Fire-and-forget: upsert characters from the transcript
      if (transcript?.trim()) {
        fetch("/api/characters/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId, text: transcript }),
        }).catch((e) => console.warn("[CharUpsert] error:", e));
      }
    } catch (e) {
      console.error("Failed to save transcript/summary", e);
    }

    // 4) Stop audio + WS, free resources
    try {
      cleanupRecording();
    } catch (e) {
      console.warn("cleanup failed", e);
    }

    // 5) Reset UI state so the page is fresh next time you return
    try {
      setTranscript("");
      setSummary("");
      window.localStorage.removeItem("currentSummaryId"); // don't accidentally "update" last summary
    } catch {}

    // 6) Navigate to the session summary page
    router.push(`/campaigns/${campaignId}/summary`);
  };

  // ======= Character carousel data/state (new style) ======= //
  const [charItems, setCharItems] = useState<CharItem[]>([]);
  const [charLoading, setCharLoading] = useState(true);
  const [charCur, setCharCur] = useState(0);
  const [charSearchKey, setCharSearchKey] = useState("");
  const [currentCampaignId, setCurrentCampaignId] = useState<string>("");

  // Fetch character roles from database
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setCharLoading(true);
        console.log("Getting current campaign from cookie...");

        // First, get the current campaign from cookie
        const currentCampaignRes = await fetch("/api/current-campaign");
        if (!currentCampaignRes.ok) {
          throw new Error("Failed to get current campaign");
        }

        const currentCampaignData = await currentCampaignRes.json();
        console.log("Current campaign from cookie:", currentCampaignData);

        if (!currentCampaignData.id) {
          console.log("No current campaign set");
          setCharItems([
            {
              name: "No Campaign Selected",
              img: "/Griff.png",
              details:
                "No campaign selected. Please go to login and select a campaign first!",
            },
          ]);
          return;
        }

        setCurrentCampaignId(currentCampaignData.id);

        // Now get all campaigns with their roles to find the current one
        const res = await fetch("/api/data");
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log("All campaigns data:", data);

        if (!data.campaigns || data.campaigns.length === 0) {
          console.log("No campaigns found in database");
          setCharItems([
            {
              name: "No Campaigns",
              img: "/Griff.png",
              details: "No campaigns found. Please create a campaign first!",
            },
          ]);
          return;
        }

        // Find the current campaign by ID
        const currentCampaign = data.campaigns.find(
          (c: any) => c.id === currentCampaignData.id
        );
        if (!currentCampaign) {
          console.log("Current campaign not found in database");
          setCharItems([
            {
              name: "Campaign Not Found",
              img: "/Griff.png",
              details: `Campaign with ID "${currentCampaignData.id}" not found. Please select a valid campaign.`,
            },
          ]);
          return;
        }

        console.log(
          "Using campaign:",
          currentCampaign.title,
          "with roles:",
          currentCampaign.roles
        );

        // Extract roles from the current campaign
        if (currentCampaign.roles && currentCampaign.roles.length > 0) {
          // Transform roles to match CharItem format
          const transformedRoles = currentCampaign.roles.map((role: any) => ({
            name: role.name,
            img: "/Griff.png", // Default image, you can enhance this later
            details: `Level ${role.level} character. ${
              role.description || "No description available."
            }`,
          }));

          console.log(
            "Setting char items for campaign",
            currentCampaign.title,
            ":",
            transformedRoles
          );
          setCharItems(transformedRoles);
        } else {
          console.log("No roles found in current campaign");
          setCharItems([
            {
              name: "No Characters",
              img: "/Griff.png",
              details: `No characters found in campaign "${currentCampaign.title}". Create some roles first!`,
            },
          ]);
        }
      } catch (error) {
        console.error("Error fetching roles:", error);
        // Fallback to default data on error
        setCharItems([
          {
            name: "Error Loading",
            img: "/Griff.png",
            details: `Failed to load characters: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
        ]);
      } finally {
        console.log("Setting loading to false");
        setCharLoading(false);
      }
    };

    fetchRoles();
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <main
        className="relative mx-auto"
        style={{ width: 1440, height: `calc(100vh - 125px - 18px)`, top: 100 }}
      >
        <SearchMapsBar
          q={q}
          setQ={setQ}
          onSearch={onSearch}
          showPrevNext={view === "sessions" && hitCount > 0}
          hitInfo={hitCount > 0 ? `${activeHit + 1}/${hitCount}` : ""}
          onPrev={onPrev}
          onNext={onNext}
        />

        <aside
          className="absolute"
          style={{ left: 0, top: 60, bottom: 18, width: 363 }}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div
              className={`w-[220px] h-[47px] rounded-[250px] flex items-center justify-center
                          text-white text-[28px] font-medium shadow-[0_4px_25px_#FF3D00]
                          [background:linear-gradient(0deg,#3D2304,#3D2304),rgba(0,0,0,0.4)]`}
              style={{ fontFamily: '"Roboto", sans-serif' }}
            >
              {isRecording ? "Recording" : "Paused"}
            </div>

            {/* button：Stop / Start */}
            {isRecording ? (
              <button
                aria-label="Stop recording"
                onClick={stopRecording}
                className="h-[47px] px-4 rounded-full grid place-items-center
                           bg-[#A43718] text-white text-[16px] font-semibold shadow-[0_4px_25px_#FF3D00]
                           hover:opacity-95 active:scale-95 transition cursor-pointer"
                title="Stop"
              >
                Stop
              </button>
            ) : (
              <button
                aria-label="Start recording"
                onClick={startRecording}
                className="h-[47px] px-4 rounded-full grid place-items-center
                           bg-[#3D2304] text-white text-[16px] font-semibold shadow-[0_4px_25px_#FF3D00]
                           hover:opacity-95 active:scale-95 transition cursor-pointer"
                title="Start"
              >
                Start
              </button>
            )}
          </div>

          {/* transcript */}
          <div className="relative" style={{ height: "calc(100% - 48px)" }}>
            <div
              className="absolute left-0 right-0 top-0 bg-[rgba(217,217,217,0.5)]
                         rounded-[12px] px-[26px] py-5 origin-top-left rotate-[-0.55deg]
                         shadow-[0_0_8px_rgba(0,0,0,0.15)]"
              style={{ bottom: 24 }}
            >
              <div
                ref={viewportRef}
                onScroll={onViewportScroll}
                className="relative w-[273.21px] overflow-y-auto pr-2 scrollbar-hide select-none"
                style={{
                  height: "calc(100% - 40px)",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
              >
                <div
                  className="text-black font-[600] text-[24px] leading-[45px] whitespace-pre-wrap"
                  style={{ fontFamily: '"Inter", sans-serif' }}
                >
                  {transcript ||
                    (isRecording ? "Listening..." : "Click Start to record")}
                </div>
              </div>

              {/* scroll bar */}
              <div
                ref={trackRef}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).dataset.role !== "thumb")
                    onTrackClick(e);
                }}
                className="absolute right-3"
                style={{
                  top: 20,
                  bottom: 20,
                  width: 19,
                  borderRadius: 38,
                  background: "#222",
                  boxShadow: "inset 2px 4px 4px rgba(255,255,255,0.57)",
                  cursor: "pointer",
                }}
              >
                <div
                  data-role="thumb"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const rect = (
                      e.currentTarget as HTMLDivElement
                    ).getBoundingClientRect();
                    dragOffsetRef.current = e.clientY - rect.top;
                    setDragging(true);
                  }}
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: `${thumbTop}px`,
                    width: 15,
                    height: `${thumbH}px`,
                    borderRadius: 38,
                    background: "rgba(255,255,255,0.9)",
                    boxShadow: "inset 2px 4px 4px rgba(255,255,255,0.57)",
                    cursor: dragging ? "grabbing" : "grab",
                  }}
                  title="Drag to scroll"
                />
              </div>
              <button
                onClick={handleEndSession}
                className="ml-45 mt-6 font-bold text-[#3D2304] underline hover:text-[#A43718] cursor-pointer disabled:opacity-50"
                type="button"
              >
                End Session
              </button>
            </div>
          </div>
        </aside>

        {/* Sessions / Characters  */}
        <section
          className="absolute"
          style={{
            left: 372,
            top: 27,
            width: 1024,
            height: `calc(100% - 27px - 18px)`,
          }}
        >
          <TitleWithFilter value={view} onChange={onChangeView} />

          <div
            className="absolute"
            style={{
              left: 0,
              top: 106,
              width: 1024,
              height: "calc(100% - 106px - 24px)",
              backgroundImage: "url('/paper.png')",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "cover",
              zIndex: 10,
              pointerEvents: "none",
            }}
            aria-hidden
          />

          {view === "sessions" && (
            <div
              className="absolute"
              onWheel={(e) => {
                const vp = document.getElementById(
                  "sessionViewport"
                ) as HTMLDivElement | null;
                if (!vp) return;
                e.preventDefault();
                vp.scrollBy({ top: e.deltaY, behavior: "auto" });
              }}
              style={{
                left: 0,
                top: 106,
                width: 1024,
                height: "calc(100% - 106px - 24px)",
                overflow: "hidden",
                borderRadius: 8,
                zIndex: 20,
                pointerEvents: "auto",
              }}
            >
              <div className="relative w-full h-full">
                <div className="relative w-full h-full">
                  <SessionsInsidePaper
                    searchTerm={searchTerm}
                    activeHit={activeHit}
                    onHitCount={setHitCount}
                  />
                </div>
              </div>
            </div>
          )}

          {view === "character" && (
            <div
              className="absolute"
              style={{
                left: 77,
                top: 180,
                width: 810,
                height: 464,
                zIndex: 30,
                pointerEvents: "auto",
              }}
            >
              {charLoading ? (
                <div className="flex items-center justify-center h-full text-white text-xl">
                  Loading characters...
                </div>
              ) : (
                <CharacterCarouselStacked
                  items={charItems}
                  cur={charCur}
                  setCur={setCharCur}
                  searchName={charSearchKey}
                />
              )}
            </div>
          )}
        </section>
      </main>
      <ChatWidget />
    </div>
  );
}
