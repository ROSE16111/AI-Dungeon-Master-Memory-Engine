"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation"; // back 按钮

/* Adjust parameters */
const HEADER_H = 88;
const FILTER_H = 90;
const SECTION_PULLUP = 32;
const BOTTOM_GAP = 120;

/* 防滚动 */
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

/*=========== Component 0: Top-right Search（受控） ===========*/
function SearchMapsBar({
  q,
  setQ,
  onSearch,
}: {
  q: string;
  setQ: (v: string) => void;
  onSearch: () => void;
}) {
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <>
      {/* 搜索框容器：右上角绝对定位（沿用像素坐标） */}
      <form
        onSubmit={onSubmit}
        className="absolute"
        style={{ left: 1096, top: 104, width: 260, height: 45, zIndex: 50 }}
      >
        {/* 输入框 */}
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
          title="输入角色名并回车"
        />
        {/* 右侧放大镜按钮 */}
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
    </>
  );
}

/*=========== Components 1: 顶部标题 + 视图切换 ===========*/
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
      ref={ref}
      className="relative mx-auto flex items-center justify-center"
      style={{ height: FILTER_H, maxWidth: 1160, width: "100%" }}
    >
      <h1
        className="text-white font-bold select-none text-[40px] sm:text-[48px] md:text-[55px] leading-[1.35]"
        style={{ fontFamily: '"Cinzel", serif' }}
      >
        {label}
      </h1>
      <button
        aria-label="Toggle"
        onClick={() => setOpen((s) => !s)}
        className="ml-3 h-6 w-6 grid place-items-center rounded-md hover:bg-white/10 transition cursor-pointer"
        style={{ alignSelf: "center" }}
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

/********  Component 2: 页面主体（仅在 Characters 使用搜索）  ***********/
export default function SummaryPage() {
  useLockBodyScroll();
  const [view, setView] = useState<"sessions" | "character">("sessions");
  const router = useRouter();

  // 搜索：仅在 character 视图里生效
  const [q, setQ] = useState("");
  const [charSearchKey, setCharSearchKey] = useState("");

  const handleSearch = () => {
    const query = q.trim();
    if (view === "character") {
      setCharSearchKey(query); // 交给轮播组件去居中并做动画
    }
    // sessions 不联动（按你的要求先不做）
  };

  const onChangeView = (v: "sessions" | "character") => {
    setView(v);
    setQ("");
    setCharSearchKey("");
  };

  return (
    <div className="fixed inset-0 overflow-hidden text-white">
      {/* 左上角返回 */}
      <button
        onClick={() => router.back()}
        className="absolute top-26 left-6 z-50 p-2 rounded-md bg-black/60 hover:bg-black/80 transition text-white"
      >
        ← Back
      </button>

      {/* 右上角搜索 */}
      <SearchMapsBar q={q} setQ={setQ} onSearch={handleSearch} />

      {/* 主体 */}
      <main
        className="absolute inset-x-0 bottom-0 overflow-hidden flex flex-col items-center"
        style={{ top: HEADER_H }}
      >
        <TitleWithFilter value={view} onChange={onChangeView} />

        <div className="relative w-full h-full">
          <section
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: Math.max(0, FILTER_H - SECTION_PULLUP),
              bottom: BOTTOM_GAP,
              width: 1160,
              overflow: "visible",
            }}
          >
            <ParchmentBackground />

            {/* Sessions 维持原样，不接入搜索 */}
            {view === "sessions" && <CardOnPaper />}

            {/* Characters：接入 searchName 实现“居中+动画” */}
            {view === "character" && (
              <div
                className="absolute z-[3]"
                style={{
                  left: "50%",
                  transform: "translateX(-50%)",
                  top: 160,
                  width: 760,
                  height: 460,
                  pointerEvents: "auto",
                }}
              >
                <CharacterCarouselStacked searchName={charSearchKey} />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/**====== Component 3: 羊皮纸背景 */
function ParchmentBackground() {
  return (
    <div
      className="fixed z-[1] pointer-events-none select-none flex justify-center"
      style={{
        top: "-10vh",
        height: "85vh",
        width: "60vw",
        left: "50%",
        transform: "translateX(-50%)",
      }}
    >
      <img
        src="/paper.png"
        alt="parchment"
        className="h-full w-full object-cover rounded-[18px]"
        style={{
          filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.35))",
        }}
      />
    </div>
  );
}

/**======= Component4: Sessions 里的白卡片（保持不变） */
function CardOnPaper() {
  const PAPER_TOP = "30vh";
  const PAPER_W = "60vw";

  return (
    <div
      className="fixed z-[2]"
      style={{
        top: `calc(${PAPER_TOP} -15px)`,
        left: "50%",
        transform: "translateX(-50%)",
        width: `calc(${PAPER_W} * 0.8)`,
        maxWidth: "980px",
        minWidth: "420px",
      }}
    >
      <div className="w-full bg-[#F5F5F5] border border-[#E9E9E9] rounded-[20px] shadow-lg relative p-6 md:p-8">
        <div className="flex gap-4 md:gap-6">
          <div
            className="overflow-hidden rounded-[18px] border border-white/50 shadow shrink-0"
            style={{ width: 180, height: 180, background: "#00000010" }}
          >
            <Image
              src="/Griff.png"
              alt="cover"
              width={180}
              height={180}
              className="object-cover w-full h-full"
              priority
            />
          </div>

          <div className="flex-1 text-black text-center flex flex-col items-center justify-center px-2">
            <div
              style={{
                fontFamily: '"Abhaya Libre ExtraBold", serif',
                fontWeight: 800,
                fontSize: "clamp(24px, 3vw, 40px)",
                lineHeight: "1.2",
              }}
            >
              Forest Adventure
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 18,
                color: "#A43718",
                fontFamily: "Adamina, serif",
              }}
            >
              10th/Aug 2025
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="relative w-full" style={{ minHeight: 260 }}>
            <Image
              src="/summary.png"
              alt="main"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/********* ===== Components 5: 角色轮播（3 张位，支持 N>=3 环绕；含搜索命中动画） **********/
function CharacterCarouselStacked({
  searchName = "",
}: {
  searchName?: string;
}) {
  const items = [
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
        "Half-elf bard with a silver tongue. Proficiencies: performance, persuasion, rapier.",
    },
  ];

  const [cur, setCur] = useState(0);
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);

  // 命中提示动画（轻微缩放 + 发光框）
  const [hintOn, setHintOn] = useState(false);
  const fireHint = () => {
    setHintOn(true);
    window.setTimeout(() => setHintOn(false), 900);
  };

  const N = items.length;
  if (N === 0) return null;

  const mod = (i: number, m: number) => ((i % m) + m) % m;
  const idxL = N >= 2 ? mod(cur - 1, N) : cur;
  const idxR = N >= 3 ? mod(cur + 1, N) : N === 2 ? mod(cur + 1, N) : cur;

  const prev = () => {
    setCur((v) => mod(v - 1, N));
    setFlippedIndex(null);
  };
  const next = () => {
    setCur((v) => mod(v + 1, N));
    setFlippedIndex(null);
  };
  const goTo = (i: number) => {
    setCur(mod(i, N));
    setFlippedIndex(null);
  };

  // 根据搜索词把对应角色切到中间并触发 hint 动画（全名优先，包含匹配兜底）
  useEffect(() => {
    const key = searchName.trim().toLowerCase();
    if (!key) return;
    let i = items.findIndex((x) => x.name.toLowerCase() === key);
    if (i < 0) i = items.findIndex((x) => x.name.toLowerCase().includes(key));
    if (i >= 0) {
      goTo(i);
      fireHint();
    }
  }, [searchName]); // 参考对照文件的写法

  function Card({
    data,
    type,
    index,
  }: {
    data: { name: string; img: string; details: string };
    type: "left" | "center" | "right";
    index: number;
  }) {
    const styleByType: Record<typeof type, React.CSSProperties> = {
      left: {
        position: "absolute",
        left: 0,
        top: 14,
        width: 399,
        height: 325,
        zIndex: 5,
        opacity: 0.9,
      },
      right: {
        position: "absolute",
        left: 331,
        top: 14,
        width: 399,
        height: 325,
        zIndex: 5,
        opacity: 0.9,
      },
      center: {
        position: "absolute",
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
      <div style={s}>
        {/* 中间卡片命中提示：描边+发光 */}
        {isCenter && hintOn && (
          <div
            className="pointer-events-none absolute -inset-3 rounded-[26px]"
            style={{
              border: "4px solid #A43718",
              filter: "drop-shadow(0 0 14px rgba(164,55,24,0.6))",
              opacity: 0.9,
              borderRadius: 26,
            }}
          />
        )}

        <div
          className="h-full w-full [perspective:1200px] rounded-[20px]"
          style={{
            transform: isCenter && hintOn ? "scale(1.03)" : undefined,
            transition: "transform 420ms ease-out",
          }}
        >
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
      style={{ width: 730, height: 438, left: 0, top: -70, zIndex: 30 }}
    >
      {/* Prev */}
      {N > 1 && (
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
      )}

      {/* Next */}
      {N > 1 && (
        <button
          onClick={next}
          aria-label="Next"
          className="absolute h-[50px] w-[50px] rounded-full grid place-items-center transition hover:scale-105 active:scale-95 cursor-pointer"
          style={{
            left: 698, // 用固定 left 值
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
      )}

      {/* 三张位 */}
      <div className="relative" style={{ height: 438 }}>
        <Card data={items[idxL]} type="left" index={idxL} />
        <Card data={items[cur]} type="center" index={cur} />
        <Card data={items[idxR]} type="right" index={idxR} />
      </div>

      {/* 指示点：数量 = N */}
      <div
        className="absolute flex gap-2"
        style={{ left: 340, top: 388, zIndex: 40 }}
      >
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="h-[10px] w-[10px] rounded-full cursor-pointer"
            style={{ background: i === cur ? "#0056D6" : "#D3E5FF" }}
          />
        ))}
      </div>
    </div>
  );
}
