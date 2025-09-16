"use client";

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranscript } from "../../../context/TranscriptContext";
type CharItem = { name: string; img: string; details: string };

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
    setCur((cur - 1 + N) % N);
    setFlippedIndex(null);
  };
  const next = () => {
    setCur((cur + 1) % N);
    setFlippedIndex(null);
  };
  const goTo = (i: number) => {
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
  }: {
    data: CharItem;
    type: "left" | "center" | "right";
    index: number;
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

    return (
      <div
        className="absolute"
        style={{
          ...s,
          transform: isCenter && hintOn ? "scale(1.03)" : undefined,
          transition: "transform 420ms ease-out",
        }}
      >
        {/* 可选发光边框，不影响点击 */}
        {isCenter && hintOn && (
          <div
            className="pointer-events-none absolute -inset-3 rounded-[26px]"
            style={{
              border: "4px solid #A43718",
              filter: "drop-shadow(0 0 14px rgba(164,55,24,0.6))",
              borderRadius: 26,
              opacity: 0.9,
            }}
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
              style={{ background: isCenter ? "#F5F5F5" : "#FFFFFF" }}
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
                  onClick={() => isCenter && setFlippedIndex(index)}
                >
                  View Details
                </button>
              </div>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 rounded-[20px] border border-[#E9E9E9] bg-white px-6 py-5 flex flex-col gap-3 [backface-visibility:hidden]"
              style={{ transform: "rotateY(180deg)" }}
              onClick={() => isCenter && setFlippedIndex(null)}
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
      <Card data={items[cur]} type="center" index={cur} />
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

/* 仅 Sessions 视图使用：羊皮纸“内部”的滚动内容（字幕从纸内出现而不是从网页底部出现）  可连接LLM接口*/
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

  const raw =
    summary ||
    `Arrival in Town
The adventurers arrived in town looking for work. An old man directed them to a brewing company owned by a gnome named Glowkindle, who needed help clearing out giant rats in his cellar.

Brewing Company Encounter
One player tried sneaking around the back, even attempting (and failing) to break into the cellar. Inside, Glowkindle offered the group 25 gold each to kill the rats. He also promised an extra magical sword to one player.

Into the Cellar
The group descended a rickety staircase into a damp cellar. Crates were piled high; the air smelled of grain and stale ale. Scratching echoed from behind a broken cask. When a lid slid aside, a pair of red eyes blinked and leapt forward—rats the size of small dogs.

Giant Rats & Hazard
Two swarms surged at once. While the fighter held the line, the rogue kicked over a lantern and set a ring of light around the party. A wooden support cracked under the chaos; debris rained down, splitting the group in two.

Unexpected Help
From a drain tunnel, a half-sober dwarf named Boran crawled out, swinging a mop like a spear. He’d fallen asleep during his shift and woke to the squealing. “I’ll take left!” he shouted, and somehow he did.

The Arcane Keg
Amid the fight, the wizard sensed faint runes humming on a sealed barrel. A single glyph—“pressure”—glowed. A quick dispel disabled it just as a rat tried to chew through the wax seal. The barrel sighed instead of detonating.

Aftermath
With the swarm scattered, the party found chewed ledgers and a lockbox. Inside were 12 gold, a wax-stamped note from a rival brewer, and a short blue dagger with a crystalline edge. Glowkindle gasped: “That’s the sample I lost!”

Lead to the Sewers
Tracks led to a crack in the wall and a tiny tunnel spilling toward the town sewers. The old man’s directions suddenly made sense—this wasn’t just a rat problem; someone was feeding them. Glowkindle begged the party to follow the trail.

Sewer Ambush
Down in the tunnels, the party waded ankle-deep in water. A wooden plank bridge creaked ahead. As they crossed, figures in burlap masks cut the ropes. The barbarian caught the plank by sheer strength while the cleric pulled everyone up with a burst of radiant light.

Clues & Complications
Among the masked thugs: a bruised apprentice from the rival brewery, muttering that “the Baron wants Glowkindle ruined.” The note in the lockbox matched his story. A rendezvous was scrawled for tomorrow at dawn near the north gate.

To Be Continued
Exhausted but triumphant, the party returned to the brewery for the promised payment—and to plan an ambush of their own at sunrise.`;

  // 解析为 {title, body} 数组；后续可直接换成接口返回的数据
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

  // === search: count hits, highlight, and jump to active hit ===
  const hitRefs = useRef<Array<HTMLSpanElement | null>>([]);
  hitRefs.current = []; // rebuild on each render

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // 根据 activeHit 定位到对应命中（滚动到视窗中央）
  // 当搜索词变化后：下一帧统计并滚到第一个命中
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
  }, [searchTerm]);

  // 当 activeHit 或 searchTerm 变化：切换“当前命中”样式并滚动定位
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

  // 渲染时把命中包一层 <mark>
  // 替换 renderHighlighted，给每个命中标 <mark className="search-hit" data-hit={序号}>
  function renderHighlighted(text: string) {
    if (!searchTerm?.trim()) return text;
    const re = new RegExp(escapeRegExp(searchTerm), "gi");
    const nodes: React.ReactNode[] = [];
    let last = 0,
      idx = 0,
      m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
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

  // 纸内“安全区”：在原始可视区域基础上四周内缩，避免文字或滚动条压到破边
  const SAFE = { left: 22, right: 22, top: 1, bottom: 25 };
  const contentBox = {
    left: 67.86 + SAFE.left,
    top: 24 + SAFE.top,
    width: 867 - SAFE.left - SAFE.right,
    height: 540 - SAFE.top - SAFE.bottom,
  };

  // 自定义滚动条（轨道 + 拖拽的滑块）
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbH, setThumbH] = useState(46);
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef(0);
  const sizesRef = useRef({ trackH: 1, maxThumbTop: 1, maxScrollTop: 1 });
  const SCROLLBAR = { width: 12, gap: 10 };

  // —— 尺寸与位置重算（内容变化/窗口变化/滚动时触发） —— //
  const recalc = () => {
    const vp = viewportRef.current,
      track = trackRef.current;
    if (!vp || !track) return;
    const contentH = vp.scrollHeight,
      viewH = vp.clientHeight,
      trackH = track.clientHeight;
    const minThumb = 30; // 最小拇指高度，避免太短
    const tH = Math.max(minThumb, (viewH / Math.max(contentH, 1)) * trackH);
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
    const t = (vp.scrollTop / maxScrollTop) * maxThumbTop; // 拇指随内容滚动
    setThumbTop(Number.isFinite(t) ? t : 0);
  };

  const onTrackClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const track = trackRef.current,
      vp = viewportRef.current;
    if (!track || !vp) return;
    const rect = track.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const { maxThumbTop, maxScrollTop } = sizesRef.current;
    const target = Math.min(Math.max(y - thumbH / 2, 0), maxThumbTop); // 点击轨道跳转
    vp.scrollTop = (target / Math.max(1, maxThumbTop)) * maxScrollTop;
  };

  const onThumbMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    dragOffsetRef.current = e.clientY - rect.top; // 记录按下位置与拇指顶部的偏移
    setDragging(true);
  };

  // —— 处理拇指拖拽 —— //
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
      vp.scrollTop = ratio * maxScrollTop; // 反向驱动内容滚动
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // —— 初始化与监听：尺寸变化 / 视口变化时重算拇指 —— //
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

  return (
    <>
      <div
        className="absolute"
        style={{ ...contentBox, zIndex: 2, pointerEvents: "auto" }}
      >
        {/* 真正滚动区：隐藏系统滚动条；PageDown/空格只在纸内生效 */}
        <div
          id="sessionViewport"
          ref={viewportRef}
          onScroll={onViewportScroll}
          className="absolute overflow-y-auto"
          style={{
            inset: 0,
            padding: "6px 8px 12px 12px",
            paddingRight: SCROLLBAR.width + SCROLLBAR.gap + 8, // 给自定义滚动条让位
            fontFamily: '"Inter", sans-serif',
            fontWeight: 700,
            fontSize: 20,
            lineHeight: "40px",
            color: "#000",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain", // 阻止滚动传导到整个页面
            scrollbarWidth: "none",
            msOverflowStyle: "none", // 隐藏系统滚动条（Firefox/旧 Edge）
            touchAction: "pan-y", // 限制触控手势为纵向
          }}
          tabIndex={0}
          onKeyDown={(e) => {
            const vp = viewportRef.current;
            if (!vp) return;
            const page = vp.clientHeight - 40; // “一页”的步长（保留 40px 重叠）
            if (["PageDown", "PageUp", " "].includes(e.key)) e.preventDefault();
            if (e.key === "PageDown" || e.key === " ")
              vp.scrollBy({ top: page, behavior: "smooth" });
            if (e.key === "PageUp")
              vp.scrollBy({ top: -page, behavior: "smooth" });
          }}
        >
          {/* 顶/底渐隐，营造“从纸里冒出”的视觉 */}
          <div
            style={{
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
              maskImage:
                "linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
            }}
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

        {/* 自定义滚动条（完全在安全区内，受纸外层 overflow:hidden 裁剪） */}
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
            }}
            title="Drag to scroll"
          />
        </div>
      </div>

      {/* 彻底隐藏 WebKit 的系统滚动条，避免“纸外出现滚条”的错觉 */}
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

export default function RecordPage() {
  useLockBodyScroll();
  const { transcript, setTranscript } = useTranscript();
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray((params as any)?.id)
    ? (params as any).id[0]
    : (params as any)?.id;

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

  // START recording
  const startRecording = async () => {
    if (isRecording) return;

    try {
      stopRecording();
    } catch {}

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
      const ws = new WebSocket(
        (function () {
          if (
            typeof process !== "undefined" &&
            process.env.NEXT_PUBLIC_ASR_WS
          ) {
            return process.env.NEXT_PUBLIC_ASR_WS!;
          }
          const proto = window.location.protocol === "https:" ? "wss" : "ws";
          return `${proto}://${window.location.hostname}:8000/audio`;
        })()
      );
      ws.binaryType = "arraybuffer";

      const queue: ArrayBuffer[] = [];
      let open = false;

      ws.onopen = () => {
        open = true;

        while (queue.length) {
          const buf = queue.shift()!;
          try {
            ws.send(buf);
          } catch {}
        }
        setIsRecording(true);
        console.log("[ASR] WS open, recording started");
      };

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

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string);
          if (typeof data.partial === "string" && data.partial.trim()) {
            setTranscript((prev) => (prev ? prev + "\n" : "") + data.partial);
          }
          if (typeof data.final === "string" && data.final.trim()) {
            setTranscript((prev) => (prev ? prev + "\n" : "") + data.final);
          }
        } catch {}
      };

      ws.onclose = () => {
        console.log("[ASR] WS close");
        setIsRecording(false);
      };
      ws.onerror = (e) => {
        console.error("[ASR] WS error", e);
        setIsRecording(false);
      };

      (window as any).__asrSession = { ctx, source, node, sink, ws, stream };
    } catch (err) {
      console.error(err);
      alert("Failed to start recording. See console for details.");
      setIsRecording(false);
    }
  };

  //stop and clear
  const stopRecording = () => {
    const sess = (window as any).__asrSession || null;
    try {
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
          if (sess.ws.readyState === WebSocket.OPEN) sess.ws.close();
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
      console.log("[ASR] stopped & cleaned");
    }
  };

  // ======= Character carousel data/state (new style) ======= //
  const charItems: CharItem[] = [
    {
      name: "Griff",
      img: "/Griff.png",
      details:
        "Veteran battle master of the north. Proficiencies: longsword, tactics, leadership.",
    },
    {
      name: "Arwyn",
      img: "/Griff.png",
      details:
        "Elven ranger from the silver woods. Proficiencies: bow, tracking, nature magic.",
    },
    {
      name: "Dorian",
      img: "/Griff.png",
      details:
        "Human warlock with a cryptic pact. Proficiencies: eldritch arts, arcana, deception.",
    },
    {
      name: "Lyra",
      img: "/Griff.png",
      details:
        "Half-elf bard with a silver tongue. Proficiencies: performance, persuasion, support magic.",
    },
  ];
  const [charCur, setCharCur] = useState(0);
  const [charSearchKey, setCharSearchKey] = useState("");

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
                onClick={() => router.push(`/campaigns/${id}/summary`)}
                className="ml-45 mt-6 font-bold text-[#3D2304] underline hover:text-[#A43718] cursor-pointer"
              >
                Get Summary
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
              <CharacterCarouselStacked
                items={charItems}
                cur={charCur}
                setCur={setCharCur}
                searchName={charSearchKey}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
