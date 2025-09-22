"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";

/* （可选）锁定滚动：History 列表页面通常需要滚动，这里先不用 */
// function useLockBodyScroll() { ... }

const GRID_OFFSET = 28; // Space between title and first row of cards
const PAGE_SIZE = 6;

type Story = {
  // Structure of a single story card
  id: string;
  title: string;
  date: string;
  imageUrl: string;
  completed: boolean;
};

// =========== !!!!! Define array to store stories(just demo content,connect with backend)
// const [stories, setStories] = useState<Story[]>([]);

// useEffect(() => {
//   fetch("/api/data")
//     .then((res) => res.json())
//     .then((data) => {
//       const mapped = (data.campaigns || []).map((c: any) => ({
//         id: c.id,
//         title: c.title,
//         date: c.updateDate
//           ? new Date(c.updateDate).toLocaleDateString()
//           : "",
//         imageUrl: "/Griff.png", // Replace with c.imageUrl if available
//         completed: true, // Replace with real field if available
//       }));
//       setStories(mapped);
//     });
// }, []);

/* *****======== Component 1： Filter==== ******/
function HistoryFilter({
  value,
  onChange,
}: {
  value: "all" | "completed";
  onChange: (v: "all" | "completed") => void;
}) {
  const [open, setOpen] = useState(false); // Dropdown menu
  const ref = useRef<HTMLDivElement>(null); // Click position,must be inside
  // Listen to global click events: if the click area is outside this component, close the dropdown
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  //========= 1.2 Switch based on value ALL HISTORY / COMPLETED
  const label = value === "all" ? "ALL HISTORY" : "COMPLETED";

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-center mt-6 mb-4"
    >
      {/* Display the current filter label */}
      <h1
        className="text-white font-bold text-3xl sm:text-4xl md:text-[50px] leading-tight"
        style={{ fontFamily: '"Cinzel", serif' }}
      >
        {label}
      </h1>
      {/* Dropdown toggle button */}
      <button
        aria-label="Toggle"
        onClick={() => setOpen((s) => !s)}
        className="ml-3 h-7 w-7 grid place-items-center rounded-md hover:bg-white/10 transition cursor-pointer"
      >
        {/* Down arrow icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M7 10l5 5 5-5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {/* ======= 1.2.1 Dropdown menu content: show when open is true */}
      {open && (
        <div className="absolute top-full mt-3 z-50 min-w-[160px] rounded-md border border-white/20 bg-black/70 backdrop-blur shadow-lg text-white">
          {/* Menu item 1: show all history */}
          <MenuItem
            active={value === "all"}
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
          >
            All History
          </MenuItem>
          {/* Menu item 2: show only completed history */}
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

// ========= 1.2.1 Single row option component in dropdown menu
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

/** Top-right corner icon, distinguish between completed or continue */
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

/**=========== Component 2: Display Card ====*/
function CardDisplay({
  story,
  onAction,
}: {
  story: Story;
  onAction: (s: Story, type: "continue" | "summary") => void;
}) {
  return (
    // =====2.1 Outer white card container
    <div className="relative w-[300px] bg-white rounded-xl shadow-lg overflow-hidden border border-black/10">
      {/* 2.1.1 Top-right Completed / In Progress icon */}
      <ProgressBadge completed={story.completed} />
      <div className="relative w-full h-[140px]">
        <Image
          src={story.imageUrl}
          alt={story.title}
          fill
          className="object-cover"
        />
      </div>
      {/* 2.1.2 Text and action area */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex justify-between items-center">
          {/* Left side: title and date */}
          <div>
            {/* Story title */}
            <div className="text-lg font-bold text-gray-900">{story.title}</div>
            {/* Story date */}
            <div className="text-sm text-[#A43718]">{story.date}</div>
          </div>
          {/* ======= 2.2 Switch between showing Summary or Continue */}
          {story.completed ? (
            //==== 2.2.1 button 1
            <button
              onClick={() => onAction(story, "summary")} // Trigger callback when clicked
              className="text-base text-gray-600 underline hover:text-[#3D2304]"
            >
              Summary
            </button>
          ) : (
            //======= 2.2.2 button 2
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

/** ======== Component 3: page dots ====*/
function DotsBar({
  page,
  totalPages,
  onGo,
}: {
  page: number;
  totalPages: number;
  onGo: (p: number) => void;
}) {
  if (totalPages <= 1) return null; // ====== 3.1 If total pages <= 1, no need to show dots, return null
  return (
    <div className="h-8 w-full flex items-center justify-center">
      <div className="flex items-center gap-2">
        {/* ===== 3.2 Use Array.from to create array with length totalPages, map to generate dots */}
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            aria-label={`Go to page ${i + 1}`} // ===== 3.3. Jump to page number
            onClick={() => onGo(i)} // Handle click
            className="h-[10px] w-[10px] rounded-full"
            style={{ background: i === page ? "#0056D6" : "#D3E5FF" }}
          />
        ))}
      </div>
    </div>
  );
}

/**=========== Components 4: Confirm Modal */
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
      {/* Modal container */}
      <div className="bg-white text-black rounded-xl shadow-xl w-[360px] p-6">
        {/* Title */}
        <h2 className="text-lg font-bold mb-4">Are you sure?</h2>
        <p className="mb-6">
          {/* ======= 4.1 Description text, changes dynamically based on actionType */}
          Do you want to{" "}
          {actionType === "continue" ? "continue" : "view the summary of"} "
          {story.title}"?
        </p>
        <div className="flex justify-end gap-3">
          {/* ==== 4.2 Cancel button */}
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
          >
            Cancel
          </button>
          {/* ===== 4.3 Confirm button */}
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

/************* Components 5: main Page ***********/
export default function HistoryPage() {
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    fetch("/api/data")
      .then((res) => res.json())
      .then((data) => {
        const mapped = (data.campaigns || []).map((c: any) => ({
          id: c.id,
          title: c.title,
          date: c.updateDate
            ? new Date(c.updateDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              })
            : "",
          imageUrl: "/Griff.png", // Replace with c.imageUrl if available
          completed: true, // Replace with real field if available
        }));
        setStories(mapped);
      });
  }, []);
  const router = useRouter();

  //Manages the filter status activeTab
  const [activeTab, setActiveTab] = useState<"all" | "completed">("all");
  // page number page
  const [page, setPage] = useState(0);
  // pop-up related confirmStory and actionType
  const [confirmStory, setConfirmStory] = useState<Story | null>(null);
  const [actionType, setActionType] = useState<"continue" | "summary" | null>(
    null
  );

  // ======= 5.1 Data filtering
  const filtered =
    activeTab === "completed" ? stories.filter((s) => s.completed) : stories;
  // ========5.2 Total pages at least 1
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamp = (p: number) => Math.min(Math.max(p, 0), totalPages - 1);
  // Jump to specified page
  const go = (p: number) => setPage(clamp(p));
  // Previous/next page
  const prev = () => setPage((p) => clamp(p - 1));
  const next = () => setPage((p) => clamp(p + 1));

  useEffect(() => {
    setPage(0);
  }, [activeTab]);

  const current = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE
  );

  // ====== 5.3 When clicking Continue/Summary on card, show confirm modal first
  const handleAction = (story: Story, type: "continue" | "summary") => {
    setConfirmStory(story);
    setActionType(type);
  };

  // After confirmation, perform navigation
  const handleConfirm = () => {
    if (confirmStory && actionType) {
      setConfirmStory(null); // Close modal
      if (actionType === "continue") {
        // ======= 5.4 Continue recording: go to record page
        router.push("/dashboard/record");
      } else {
        // =======5.5 View summary: go to corresponding campaign summary
        router.push(`/campaigns/${confirmStory.id}/summary`);
      }
    }
  };

  /******** View structure and styles *******/
  return (
    <div className="min-h-screen text-white relative">
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

      {/* Stage：改为容器 + 内边距，不再 absolute+calc */}
      <main className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 pt-28 pb-16 flex flex-col items-center">
        {/*Title + Dropdown menu*/}
        <HistoryFilter value={activeTab} onChange={setActiveTab} />

        {/* Card grid + Pagination navigation */}
        <div className="flex-1 w-full flex flex-col items-center justify-start relative mt-7">
          <div
            className="w-full flex items-start justify-center"
            style={{ marginTop: GRID_OFFSET, marginBottom: 24 }}
          >
            {/* Responsive grid: 3 columns, center aligned, 24px gap between cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
              {current.map((s) => (
                <CardDisplay key={s.id} story={s} onAction={handleAction} />
              ))}
            </div>
          </div>

          {/* Pagination arrows */}
          {totalPages > 1 && (
            <>
              {/* Previous button: vertically centered on the left */}
              <button
                aria-label="Previous"
                onClick={prev}
                disabled={page === 0}
                className="hidden sm:grid absolute left-0 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full place-items-center bg-black/60 text-white disabled:opacity-40 z-30"
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
              {/* Next button: vertically centered on the right */}
              <button
                aria-label="Next"
                onClick={next}
                disabled={page === totalPages - 1}
                className="hidden sm:grid absolute right-0 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full place-items-center bg-black/60 text-white disabled:opacity-40 z-30"
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

          {/* Bottom page dots */}
          <DotsBar page={page} totalPages={totalPages} onGo={go} />
        </div>
      </main>

      {/* Confirm modal */}
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
