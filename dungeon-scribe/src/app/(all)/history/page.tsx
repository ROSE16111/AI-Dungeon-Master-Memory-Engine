"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";

/* Lock body scroll */
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

const HEADER_H = 88; // TopBar height (adjust if needed)
const GRID_OFFSET = 28; // Space between title and first row of cards
const PAGE_SIZE = 6;

type Story = {
  id: string;
  title: string;
  date: string;
  imageUrl: string;
  summaryLink: string;
  completed: boolean;
};

const stories: Story[] = Array.from({ length: 12 }).map((_, i) => ({
  id: `s${i + 1}`,
  title: "Forest Adventure",
  date: "17th/Aug 2025",
  imageUrl: "/Griff.png",
  summaryLink: "/summary",
  completed: i % 2 === 0,
}));

/* Filter */
function HistoryFilter({
  value,
  onChange,
}: {
  value: "all" | "completed";
  onChange: (v: "all" | "completed") => void;
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

  const label = value === "all" ? "ALL HISTORY" : "COMPLETED";

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center mt-4"
      style={{ height: 72 }}
    >
      <h1
        className="text-white font-bold"
        style={{
          fontFamily: '"Cinzel", serif',
          fontSize: 50,
          lineHeight: "64px",
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
        <div className="absolute top-[60px] z-50 min-w-[160px] rounded-md border border-white/20 bg-black/70 backdrop-blur shadow-lg text-white">
          <MenuItem
            active={value === "all"}
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
          >
            All History
          </MenuItem>
          <MenuItem
            active={value === "completed"}
            onClick={() => {
              onChange("completed");
              setOpen(false);
            }}
          >
            Completed
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

/** Badge */
function ProgressBadge({ completed }: { completed: boolean }) {
  const imgSrc = completed ? "/completed.png" : "/continue.png";
  return (
    <div className="absolute right-2 top-2 h-8 w-8 z-20">
      <Image
        src={imgSrc}
        alt={completed ? "Completed" : "In Progress"}
        width={32}
        height={32}
        className="object-contain"
      />
    </div>
  );
}

/** Card */
function CardDisplay({
  story,
  onAction,
}: {
  story: Story;
  onAction: (s: Story, type: "continue" | "summary") => void;
}) {
  return (
    <div className="relative w-[300px] bg-white rounded-xl shadow-lg overflow-hidden border border-black/10">
      <ProgressBadge completed={story.completed} />
      <div className="relative w-full h-[140px]">
        <Image
          src={story.imageUrl}
          alt={story.title}
          fill
          className="object-cover"
        />
      </div>
      <div className="px-4 pt-3 pb-3">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-lg font-bold text-gray-900">{story.title}</div>
            <div className="text-sm text-[#A43718]">{story.date}</div>
          </div>
          {story.completed ? (
            <button
              onClick={() => onAction(story, "summary")}
              className="text-base text-gray-600 underline hover:text-[#3D2304]"
            >
              Summary
            </button>
          ) : (
            <button
              onClick={() => onAction(story, "continue")}
              className="text-base text-gray-600 underline hover:text-[#3D2304]"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Dots */
function DotsBar({
  page,
  totalPages,
  onGo,
}: {
  page: number;
  totalPages: number;
  onGo: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="h-8 w-full flex items-center justify-center">
      <div className="flex items-center gap-2">
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            aria-label={`Go to page ${i + 1}`}
            onClick={() => onGo(i)}
            className="h-[10px] w-[10px] rounded-full"
            style={{ background: i === page ? "#0056D6" : "#D3E5FF" }}
          />
        ))}
      </div>
    </div>
  );
}

/** Confirm Modal */
function ConfirmModal({
  story,
  actionType,
  onCancel,
  onConfirm,
}: {
  story: Story;
  actionType: "continue" | "summary";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white text-black rounded-xl shadow-xl w-[360px] p-6">
        <h2 className="text-lg font-bold mb-4">Are you sure?</h2>
        <p className="mb-6">
          Do you want to{" "}
          {actionType === "continue" ? "continue" : "view the summary of"} "
          {story.title}"?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/** Page */
export default function HistoryPage() {
  useLockBodyScroll();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"all" | "completed">("all");
  const [page, setPage] = useState(0);
  const [confirmStory, setConfirmStory] = useState<Story | null>(null);
  const [actionType, setActionType] = useState<"continue" | "summary" | null>(
    null
  );

  const filtered =
    activeTab === "completed" ? stories.filter((s) => s.completed) : stories;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamp = (p: number) => Math.min(Math.max(p, 0), totalPages - 1);
  const go = (p: number) => setPage(clamp(p));
  const prev = () => setPage((p) => clamp(p - 1));
  const next = () => setPage((p) => clamp(p + 1));

  useEffect(() => {
    setPage(0);
  }, [activeTab]);

  const current = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE
  );

  const handleAction = (story: Story, type: "continue" | "summary") => {
    setConfirmStory(story);
    setActionType(type);
  };

  const handleConfirm = () => {
    if (confirmStory && actionType) {
      setConfirmStory(null);
      if (actionType === "continue") {
        router.push("/dashboard/record");
      } else {
        router.push(confirmStory.summaryLink);
      }
    }
  };

  return (
    <div className="min-h-screen text-white">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/bacg2.png"
          alt="bg"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/10" />
      </div>

      {/* TopBar */}
      <TopBar />

      {/* Stage */}
      <main
        className="absolute inset-x-0 overflow-hidden flex flex-col items-center"
        style={{
          top: HEADER_H,
          height: `calc(100vh - ${HEADER_H}px)`,
        }}
      >
        <HistoryFilter value={activeTab} onChange={setActiveTab} />

        <div className="flex-1 w-full max-w-[1200px] flex flex-col items-center justify-start relative">
          <div
            className="w-full flex items-start justify-center"
            style={{ marginTop: GRID_OFFSET, marginBottom: 24 }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
              {current.map((s) => (
                <CardDisplay key={s.id} story={s} onAction={handleAction} />
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <>
              <button
                aria-label="Previous"
                onClick={prev}
                disabled={page === 0}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full grid place-items-center bg-black/60 text-white disabled:opacity-40 z-30"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M15 6l-6 6 6 6"
                    stroke="white"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                aria-label="Next"
                onClick={next}
                disabled={page === totalPages - 1}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full grid place-items-center bg-black/60 text-white disabled:opacity-40 z-30"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ transform: "rotate(180deg)" }}
                >
                  <path
                    d="M15 6l-6 6 6 6"
                    stroke="white"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}

          <DotsBar page={page} totalPages={totalPages} onGo={go} />
        </div>
      </main>

      {confirmStory && actionType && (
        <ConfirmModal
          story={confirmStory}
          actionType={actionType}
          onCancel={() => {
            setConfirmStory(null);
            setActionType(null);
          }}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
