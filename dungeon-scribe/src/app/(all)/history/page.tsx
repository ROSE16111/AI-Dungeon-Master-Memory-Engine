"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

const GRID_OFFSET = 28; // Space between title and first row of cards
const PAGE_SIZE = 6;

type Story = {
  // Structure of a single story card
  id: string;
  title: string;
  date: string;
  imageUrl: string;
  completed: boolean;
  campaignId?: string | null;
  sortTime?: number;
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
  onDelete,
}: {
  story: Story;
  onAction: (s: Story, type: "continue" | "summary") => void;
  onDelete: (s: Story) => void;
}) {
  return (
    <div className="relative w-[300px] bg-white rounded-xl shadow-lg overflow-hidden border border-black/10">
      {/* Completed / In Progress icon */}
      {/* <ProgressBadge completed={story.completed} /> */}
      {/* delete button */}
      <button
        onClick={() => onDelete(story)}
        className="absolute top-2 right-2 z-30 p-2 bg-white/85 rounded-full hover:bg-red-100 active:scale-95 transition shadow"
        aria-label="Delete record"
        title="Delete this record"
      >
        🗑️
      </button>

      <div className="relative w-full h-[140px]">
        <img
          src={story.imageUrl || "/Griff.png"}
          alt={story.title}
          className="object-cover w-full h-full"
          onError={(e) => {
            const t = e.currentTarget as HTMLImageElement;
            if (t.src !== "/Griff.png") t.src = "/Griff.png";
          }}
        />
      </div>

      <div className="px-4 pt-3 pb-3">
        <div className="flex justify-between items-center">
          <div>
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
          Do you want to {actionType === "continue" ? "continue" : "view the summary of this session"}?
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
  useLockBodyScroll();
  const [stories, setStories] = useState<Story[]>([]);

  useEffect(() => {
    (async () => {
      try {
        // First, fetch all campaigns
        const res = await fetch("/api/data");
        const data = await res.json();
        const campaigns = data.campaigns || [];

        // If no campaigns exist, show empty
        if (campaigns.length === 0) {
          setStories([]);
          return;
        }

        // Step 1: Try to get the real current campaign from the API (most authoritative)
        let currentCampaignId: string | null = null;
        try {
          const r = await fetch("/api/current-campaign");
          if (r.ok) {
            const j = await r.json();
            currentCampaignId = j?.item?.id || j?.id || null;
          }
        } catch {}

        // Step 2: If API didn't return a campaign, check localStorage
        if (!currentCampaignId && typeof window !== "undefined") {
          currentCampaignId = localStorage.getItem("currentCampaignId");
        }

        // Step 3: Validate that the campaign ID actually exists in the database
        let camp = currentCampaignId 
          ? campaigns.find((c: any) => c.id === currentCampaignId) 
          : null;
        
        // Step 4: If validation failed, clear the invalid data but don't auto-select
        if (!camp && currentCampaignId) {
          console.warn(`Campaign ${currentCampaignId} not found in database. Please select a valid campaign.`);
          if (typeof window !== "undefined") {
            localStorage.removeItem("currentCampaignId");
          }
        }
        
        if (!camp) {
          setStories([]);
          return;
        }

        const records: Story[] = [];
        const sessionSummaries = Array.isArray(camp.sessionSummaries) ? camp.sessionSummaries : [];
        for (const s of sessionSummaries) {
          const ts = s.createdAt ? new Date(s.createdAt).getTime() : (camp.updateDate ? new Date(camp.updateDate).getTime() : Date.now());
          records.push({
            id: s.id,
            title: (s.content || "Untitled Session").split("\n")[0] || camp.title || "Session",
            date: s.createdAt ? new Date(s.createdAt).toLocaleString() : (camp.updateDate ? new Date(camp.updateDate).toLocaleString() : ""),
            imageUrl: s.imageBase64 ? `data:image/png;base64,${s.imageBase64}` : "/Griff.png",
            completed: true,
            campaignId: camp.id,
            sortTime: ts,
          });
        }

        // Load recentRecords but only include those that refer to this campaign (if they carry campaign info) or dedupe by id
        let recent: Story[] = [];
        if (typeof window !== "undefined") {
          try {
            const raw = localStorage.getItem("recentRecords");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                // If recent items include campaignId, filter by it; otherwise include only if id matches an item in records
                const recordIds = new Set(records.map((r) => r.id));
                recent = parsed
                  .filter((r: any) => {
                    if (r.campaignId) return r.campaignId === currentCampaignId;
                    return recordIds.has(r.id);
                  })
                  .map((r: any) => {
                    // attempt to parse timestamp from r.date, fallback to now
                    let ts = Date.now();
                    try {
                      if (r.date) {
                        const t = Date.parse(r.date);
                        if (!Number.isNaN(t)) ts = t;
                      } else if (r.createdAt) {
                        const t = Date.parse(r.createdAt);
                        if (!Number.isNaN(t)) ts = t;
                      }
                    } catch {}
                    return {
                      id: r.id,
                      title: r.title,
                      date: r.date || new Date(ts).toLocaleString(),
                      imageUrl: r.imageUrl || "/Griff.png",
                      completed: r.completed !== undefined ? Boolean(r.completed) : true,
                      campaignId: r.campaignId || currentCampaignId,
                      sortTime: ts,
                    };
                  });
              }
            }
          } catch (e) {
            console.warn("Failed to parse recentRecords from localStorage", e);
          }
        }

        // Combine recent (preferred) + records, dedupe
        const ids = new Set<string>();
        const combined: Story[] = [];
        for (const r of recent) {
          if (!ids.has(r.id)) {
            combined.push(r);
            ids.add(r.id);
          }
        }
        for (const r of records) {
          if (!ids.has(r.id)) {
            combined.push(r);
            ids.add(r.id);
          }
        }

        // Sort combined by sortTime descending (latest first)
        combined.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));

        setStories(combined);
      } catch (err) {
        console.error("Failed to load campaigns for history page:", err);
        setStories([]);
      }
    })();
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
        // =======5.5 View summary: go to corresponding campaign summary (use campaignId)
        const cid = confirmStory.campaignId || confirmStory.id;
        try {
          if (typeof window !== "undefined") {
            localStorage.setItem("currentSummaryId", confirmStory.id);
          }
        } catch {}
        router.push(`/campaigns/${cid}/summary`);
      }
    }
  };
  
  const handleDelete = (story: Story) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${story.title}"? This action cannot be undone.`
      )
    ) {
      fetch(`/api/data?id=${story.id}`, { method: "DELETE" })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(body || `Delete failed (status ${res.status})`);
          }
          setStories((prev) => prev.filter((s) => s.id !== story.id));
        })
        .catch((err) => {
          console.error("Delete failed:", err);
          alert(err?.message || "Failed to delete record");
        });
    } else {
      console.log("Delete canceled");
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

    {/* Stage: changed to a container with padding, no longer using absolute+calc */}
      <main className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 pt-6 pb-16 flex flex-col items-center">
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
                <CardDisplay
                  key={s.id}
                  story={s}
                  onAction={handleAction}
                  onDelete={(story) => handleDelete(story)}
                />
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
