"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/* Adjust parameters */
const HEADER_H = 88; // Navigation bar height
const FILTER_H = 90; // Height of the “SESSIONS / CHARACTERS” title container
const SECTION_PULLUP = 32; // Move the parchment section upward
const CARD_PULLUP = 16; // White card position relative to the parchment
const BOTTOM_GAP = 120; // Bottom margin, avoid sticking to the top of the webpage

/* Adjust parchment position */
const PARCHMENT_SCALE_X = 1.4; // Stretch wider horizontally
const PARCHMENT_SCALE_Y = 1.6; // Stretch longer vertically
const PARCHMENT_SHIFT_Y = -50; // Move parchment upward, negative = up

// Prevent page scrolling, fix screen height to 100%
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

// Display title and dropdown menu for switching views
function TitleWithFilter({
  value,
  onChange,
}: {
  value: "sessions" | "character";
  onChange: (v: "sessions" | "character") => void;
}) {
  const [open, setOpen] = useState(false); // Dropdown menu
  const ref = useRef<HTMLDivElement>(null); // Track mouse click position
  // Close dropdown menu when clicking outside component
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
      style={{ height: FILTER_H, width: 1160 }}
    >
      <h1
        className="text-white font-bold select-none"
        style={{
          fontFamily: '"Cinzel", serif',
          fontSize: 55,
          lineHeight: "74px",
        }}
      >
        {label}
      </h1>
      <button
        aria-label="Toggle"
        onClick={() => setOpen((s) => !s)}
        className="ml-3 h-6 w-6 grid place-items-center rounded-md hover:bg-white/10 transition cursor-pointer"
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
// Control style of dropdown menu items
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
      // Style: full width, left-aligned text, pointer cursor
      className={`w-full text-left px-4 py-2 cursor-pointer transition ${
        active ? "bg-white/15" : "hover:bg-white/10"
      }`}
      style={{ fontFamily: '"Inter", sans-serif', fontSize: 14 }}
    >
      {children}
    </button>
  );
}

/******** Main part of summary ***********/
export default function SummaryPage() {
  useLockBodyScroll();
  const [view, setView] = useState<"sessions" | "character">("sessions"); // Current view state

  return (
    <div className="fixed inset-0 overflow-hidden text-white">
      {/* Avoid navigation bar */}
      <main
        className="absolute inset-x-0 bottom-0 overflow-hidden flex flex-col items-center"
        style={{ top: HEADER_H }}
      >
        {/* Top title and dropdown filter */}
        <TitleWithFilter value={view} onChange={setView} />

        {/* Content area */}
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
            {/* Parchment as background */}
            <ParchmentBackground />

            {/* Sessions view with white card background */}
            {view === "sessions" && <CardOnPaper />}

            {/* Characters view with stacked carousel */}
            {view === "character" && (
              <div
                className="absolute z-[3]" // The topmost card
                style={{
                  // —— Adjust carousel position on parchment —— //
                  left: "50%",
                  transform: "translateX(-50%)",
                  top: 160, // Move carousel vertically
                  width: 760, // Control carousel width
                  height: 460, // Carousel height
                  pointerEvents: "auto",
                }}
              >
                <CharacterCarouselStacked />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/** Parchment background setup */
function ParchmentBackground() {
  return (
    <div className="absolute inset-0 z-[1] pointer-events-none select-none flex justify-center">
      <img
        src="/paper.png"
        alt="parchment"
        className="h-full object-cover rounded-[18px]"
        style={{
          width: "auto",
          transform: `scaleX(${PARCHMENT_SCALE_X}) scaleY(${PARCHMENT_SCALE_Y}) translateY(${PARCHMENT_SHIFT_Y}px)`,
          transformOrigin: "center top",
          filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.35))",
        }}
      />
    </div>
  );
}

/** White card in Sessions view */
function CardOnPaper() {
  return (
    <div
      className="absolute z-[2]"
      style={{
        // Card parameters
        left: 300,
        top: Math.max(0, 12 - CARD_PULLUP),
        width: 560,
        height: 520,
        minHeight: 440,
      }}
    >
      {/* White card base */}
      <div className="absolute inset-0 bg-[#F5F5F5] border border-[#E9E9E9] rounded-[20px] shadow-lg" />

      {/* Cover image in top left */}
      <div
        className="absolute overflow-hidden rounded-[18px] border border-white/50 shadow"
        style={{
          left: 16,
          top: 20,
          width: 180,
          height: 180,
          background: "#00000010",
          zIndex: 2,
        }}
      >
        <Image
          src="/Griff.png"
          alt="cover"
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Title and date */}
      <div
        className="absolute text-black text-center"
        style={{
          left: 220,
          right: 24,
          top: 82,
          fontFamily: '"Abhaya Libre ExtraBold", serif',
          zIndex: 2,
        }}
      >
        {/* Title */}
        <div style={{ fontSize: 40, lineHeight: "44px", fontWeight: 800 }}>
          Forest Adventure
        </div>
        {/* Date */}
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

      {/* Summary diagram */}
      <div
        className="absolute left-24 right-24"
        style={{ top: 260, bottom: 24, zIndex: 1 }}
      >
        <div className="relative w-full h-full">
          <Image
            src="/summary.png"
            alt="main"
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>

      {/* Back arrow */}
      <div
        className="absolute text-black/40"
        style={{
          left: 18,
          top: 18,
          fontSize: 28,
          lineHeight: "28px",
          zIndex: 3,
        }}
        aria-hidden
        title="Back"
      >
        ‹
      </div>
    </div>
  );
}

/********* Characters carousel **********/
function CharacterCarouselStacked() {
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
  ];

  const [cur, setCur] = useState(0); // Center card
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null); // Flipped card
  const N = items.length; // Total number of cards
  if (N === 0) return null;
  // Compute indices
  const idxL = (cur - 1 + N) % N;
  const idxR = (cur + 1) % N;
  // Switch images
  const prev = () => {
    setCur((v) => (v - 1 + N) % N);
    setFlippedIndex(null);
  };
  const next = () => {
    setCur((v) => (v + 1) % N);
    setFlippedIndex(null);
  };
  const goTo = (i: number) => {
    setCur(i);
    setFlippedIndex(null);
  }; // Jump when clicking indicator
  // Define single card
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
      <div className="absolute" style={s}>
        <div className="h-full w-full [perspective:1200px] rounded-[20px]">
          <div
            className="relative h-full w-full rounded-[20px] transition-transform duration-500 [transform-style:preserve-3d] shadow-[0_22px_74px_rgba(0,0,0,0.6)]"
            // Flip effect
            style={{
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 rounded-[20px] border border-[#E9E9E9] [backface-visibility:hidden] overflow-hidden"
              style={{ background: isCenter ? "#F5F5F5" : "#FFFFFF" }}
            >
              {/* Image */}
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
              {/* Title */}
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
              {/* View Details */}
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
              {/* Character name */}
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
              {/* Character details */}
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
              {/* Back button */}
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
  // Control all cards, switch buttons, and indicators
  return (
    <div
      className="relative"
      style={{ width: 730, height: 438, left: 0, top: -70, zIndex: 30 }}
    >
      {/* Previous */}
      <button
        onClick={prev} // Listen for event
        aria-label="Previous"
        className="absolute h-[50px] w-[50px] rounded-full grid place-items-center transition
                   hover:scale-105 active:scale-95 cursor-pointer"
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

      {/* Next */}
      <button
        onClick={next} // Listen for event
        aria-label="Next"
        className="absolute h-[50px] w-[50px] rounded-full grid place-items-center transition
                   hover:scale-105 active:scale-95 cursor-pointer"
        style={{
          right: -18,
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

      {/* Three stacked cards */}
      <Card data={items[idxL]} type="left" index={idxL} />
      <Card data={items[cur]} type="center" index={cur} />
      <Card data={items[idxR]} type="right" index={idxR} />

      {/* Indicator dots, like indexes, click to jump */}
      <div
        className="absolute flex gap-2"
        style={{
          left: "50%",
          transform: "translateX(-50%)",
          top: 388,
          zIndex: 40,
        }}
      >
        {items.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => goTo(i)} // Listen for event
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
}
