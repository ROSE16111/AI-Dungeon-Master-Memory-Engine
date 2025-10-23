"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation"; // back button

/* Adjust parameters */
const HEADER_H = 88;
const FILTER_H = 90;
const SECTION_PULLUP = 32;
const BOTTOM_GAP = 120;

/* Prevent scrolling */
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

/*=========== Component 0: Top-right Search (controlled, with navigation on match) ===========*/
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

  return (
    <>
      {/* // Search box container: absolutely positioned at the top-right corner (using pixel coordinates） */}
      <form
        onSubmit={onSubmit}
        className="absolute"
        style={{ left: 1096, top: 104, width: 260, height: 45, zIndex: 50 }}
      >
        {/* Input field*/}
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
          title="Enter: next hit; Shift+Enter: previous"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (showPrevNext && (onPrev || onNext)) {
                e.preventDefault();
                if (e.shiftKey && onPrev) onPrev();
                else if (onNext) onNext();
              }
            }
          }}
        />
        {/* Magnifying glass button on the right side */}
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

      {/* Previous/Next match buttons (visible only when matches exist)*/}
      {showPrevNext && (
        <div
          className="absolute flex items-center gap-2 text-white"
          style={{ left: 1096, top: 154, zIndex: 50 }}
        >
          <button
            onClick={onPrev}
            className="px-3 py-1 rounded-md bg-white/15 hover:bg白/25 active:scale-95 transition cursor-pointer"
            title="previous (Shift+Enter)"
          >
            previous
          </button>
          <button
            onClick={onNext}
            className="px-3 py-1 rounded-md bg白/15 hover:bg白/25 active:scale-95 transition cursor-pointer"
            title="next (Enter)"
          >
            next
          </button>
          <span className="text-sm opacity-90">{hitInfo}</span>
        </div>
      )}
    </>
  );
}

/*=========== Components 1: Top Title + View Switch ===========*/
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
/* Component 2: Main Page Body (used only in Characters search) */

export default function SummaryPage() {
  useLockBodyScroll();
  const [view, setView] = useState<"sessions" | "character">("sessions");
  const router = useRouter();
  const params = useParams();
  const [campaignId, setCampaignId] = useState<string | undefined>(undefined);

  // Resolve campaignId from route params, localStorage, or server cookie
  useEffect(() => {
    let id: string | undefined;
    const p = params?.id;
    if (Array.isArray(p)) id = p[0];
    else if (typeof p === "string") id = p;

    if (!id || id === "${campaignId}" || id === "%24%7BcampaignId%7D") {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("currentCampaignId");
        if (stored) id = stored;
      }
    }

    // If still no id, fetch from server cookie endpoint
    if (!id) {
      (async () => {
        try {
          const res = await fetch("/api/current-campaign");
          if (res.ok) {
            const json = await res.json();
            if (json?.id) {
              setCampaignId(json.id);
              return;
            }
          }
        } catch (e) {
          // ignore
        }
        setCampaignId(undefined);
      })();
      return;
    }

    setCampaignId(id as string | undefined);
  }, [params]);

  // Search: only active in the Character view
  // Search: Character + Sessions
  const [q, setQ] = useState("");
  const [charSearchKey, setCharSearchKey] = useState("");
  const [charSearchTick, setCharSearchTick] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [hitCount, setHitCount] = useState(0);
  const [activeHit, setActiveHit] = useState(0);

  const handleSearch = () => {
    const query = q.trim();
    if (view === "character") {
      setCharSearchKey(query);// Character carousel: center + highlight
      setCharSearchTick((t) => t + 1); // Increment on each Enter to trigger animation
    } else {
      setSearchTerm(query); // Sessions: store search keyword
      setActiveHit(0);// Reset cursor to the first match
    }
  };

  const onPrev = () => {
    if (hitCount > 0) setActiveHit((i) => (i - 1 + hitCount) % hitCount);
  };
  const onNext = () => {
    if (hitCount > 0) setActiveHit((i) => (i + 1) % hitCount);
  };

 // Sessions: clear previous search results when input 'q' changes 
// (recalculate matches only when Enter is pressed to trigger handleSearch)
  useEffect(() => {
    if (view === "sessions") {
      if (searchTerm !== "") setSearchTerm("");
      if (hitCount !== 0) setHitCount(0);
      if (activeHit !== 0) setActiveHit(0);
    }
  }, [q, view]);

  const onChangeView = (v: "sessions" | "character") => {
    setView(v);
    setQ("");
    setCharSearchKey("");
    setSearchTerm("");
    setHitCount(0);
    setActiveHit(0);
  };

  return (
    <div className="fixed inset-0 overflow-hidden text-white">
      <button
        onClick={() => router.back()}
        className="absolute top-26 left-6 z-50 p-2 rounded-md bg-black/60 hover:bg-black/80 transition text-white"
      >
        ← Back
      </button>
      
      <SearchMapsBar
        q={q}
        setQ={setQ}
        onSearch={handleSearch}
        showPrevNext={view === "sessions" && hitCount > 0}
        hitInfo={
          view === "sessions" && hitCount > 0
            ? `${activeHit + 1}/${hitCount}`
            : ""
        }
        onPrev={onPrev}
        onNext={onNext}
      />

      {/* main body*/}
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

            {/* Sessions // Keep as-is, do not connect to search */}
            {view === "sessions" && (
              <CardOnPaper
                campaignId={campaignId}
                searchTerm={searchTerm}
                activeHit={activeHit}
                onHitCount={setHitCount}
              />
            )}

            {/* Characters：Hook up `searchName` to implement "center + animation"” */}
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
                <CharacterCarouselStacked
                  searchName={charSearchKey}
                  searchTick={charSearchTick}
                  campaignIdProp={campaignId}
                />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/**====== Component 3: background */
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
/**======= Component 4: White card in Sessions (add a download button at the top-right) */
/**======= Component 4: White card in Sessions (download .txt: Title + Date + Summary) */
function CardOnPaper({
  campaignId,
  searchTerm = "",
  activeHit = 0,
  onHitCount,
}: {
  campaignId?: string | null;
  searchTerm?: string;
  activeHit?: number;
  onHitCount?: (n: number) => void;
}) {
  const PAPER_TOP = "30vh";
  const PAPER_W = "60vw";
// —— Text content: Title / Date / Summary (shared between display and download)
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const initialSummary = ``.trim(); 
  const [coverUrl, setCoverUrl] = useState<string>("/Griff.png");
// —— New: Edit mode & text stat

  const [editable, setEditable] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  function renderHighlighted(text: string) {
    const key = (searchTerm || "").trim();
    if (!key) return text;

    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(esc, "gi");

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

  useEffect(() => {
    // If a campaignId is provided, fetch campaigns and extract the latest session summary for that campaign
    if (!campaignId) return;
    fetch(`/api/data`)
      .then((res) => res.json())
      .then((data) => {
        const campaigns = data.campaigns || [];
        const camp = campaigns.find((c: any) => c.id === campaignId);
        if (camp) {
          // helper: convert imageBase64 (if any) into a data URL, else fallback
        const toImageUrl = (s: any) => {
          if (!s) return "/Griff.png";
          if (s.imageUrl && typeof s.imageUrl === "string") return s.imageUrl; // in case your API already computed it
          if (s.imageBase64 && typeof s.imageBase64 === "string") {
            // NOTE: DB 里只存了 base64，没有 MIME；和 History 页保持一致用 png
            return `data:image/png;base64,${s.imageBase64}`;
          }
          return "/Griff.png";
        };
          // Wire visible title and update date to campaign data
          if (camp.title) setTitle(camp.title);
          if (camp.updateDate)
            setDate(new Date(camp.updateDate).toLocaleString());

          // Check if History asked us to open a specific summary id
          let handled = false;
          try {
            if (typeof window !== "undefined") {
              const sel = localStorage.getItem("currentSummaryId");
              if (sel) {
                const found = Array.isArray(camp.sessionSummaries)
                  ? camp.sessionSummaries.find((s: any) => s.id === sel)
                  : null;
                if (found) {
                  setSummary(found.content || initialSummary);
                  setSummaryId(found.id || null);
                  setCoverUrl(toImageUrl(found)); // show the selected summary's cover
                  handled = true;
                }
                try {
                  localStorage.removeItem("currentSummaryId");
                } catch {}
              }
            }
          } catch (e) {
            console.warn("Error reading currentSummaryId", e);
          }

          if (!handled) {
            if (
              Array.isArray(camp.sessionSummaries) &&
              camp.sessionSummaries.length > 0
            ) {
              // Use the most recent session summary
              const latest =
                camp.sessionSummaries[camp.sessionSummaries.length - 1];
              setSummary(latest.content || initialSummary);
              setSummaryId(latest.id || null);
              setCoverUrl(toImageUrl(latest));
            } else {
              // Explicitly indicate there's no summary for this campaign
              setSummary("There is no summary for this campaign.");
              setSummaryId(null);
              setCoverUrl("/Griff.png"); 
            }
          }
        }
      })
      .catch((err) => console.error("Failed to load session summary:", err));
  }, [campaignId]);
  
// When keyword or content changes: count matches and scroll to the first one
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) {
      onHitCount?.(0);
      return;
    }
    requestAnimationFrame(() => {
      const hits = vp.querySelectorAll<HTMLElement>("mark.search-hit");
      onHitCount?.(hits.length);
      if ((searchTerm || "").trim() && hits.length > 0) {
        const el = hits[0]!;
        const offset =
          el.getBoundingClientRect().top - vp.getBoundingClientRect().top;
        vp.scrollBy({ top: offset - 40, behavior: "smooth" });
      }
    });
  }, [searchTerm, summary]);
// When the current match index changes: scroll to and highlight the current match
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const hits = vp.querySelectorAll<HTMLElement>("mark.search-hit");
    hits.forEach((h) => h.classList.remove("search-hit--active"));
    if (!hits.length) return;

    const idx = Math.max(0, Math.min(activeHit ?? 0, hits.length - 1));
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
  }, [activeHit, searchTerm, summary]);

  // ——download ——
  const downloadSummary = () => {
    const content = `${title}\n${date}\n\n${summary}\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.txt`; // file name：Forest_Adventure.txt
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
        {/* download button */}
        <button
          className="absolute top-4 right-4 p-2 rounded-md hover:bg-black/10 active:scale-95 transition cursor-pointer"
          onClick={downloadSummary}
          aria-label="Download summary as .txt"
          title="Download summary"
        >
          <img src="/download.png" alt="download" width={24} height={24} />
        </button>

        <div className="flex gap-4 md:gap-6">
          <div
            className="overflow-hidden rounded-[18px] border border-white/50 shadow shrink-0"
            style={{ width: 180, height: 180, background: "#00000010" }}
          >
            <img
              src={coverUrl}
              alt="cover"
              width={180}
              height={180}
              className="object-cover w-full h-full"
              onError={(e) => {
                const t = e.currentTarget as HTMLImageElement;
                if (t.src !== "/Griff.png") t.src = "/Griff.png"; // graceful fallback
              }}
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
              {title}
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 18,
                color: "#A43718",
                fontFamily: "Adamina, serif",
              }}
            >
              {date}
            </div>
          </div>
        </div>

        {/* txt summary(editable) */}
        <div className="mt-6">
          <div
            ref={viewportRef}
            className="relative w-full"
            style={{
              minHeight: 220,
              maxHeight: 240, 
              background: "#f0f0f0",
              border: "2px dashed #ccc",
              borderRadius: "12px",
              padding: "20px",
              textAlign: "left",
              overflowY: "auto",
            }}
          >
            {/* edit icon*/}
            {!editable && (
              <button
                className="absolute top-2 right-2 p-2 rounded-md hover:bg-black/10 transition cursor-pointer"
                onClick={() => setEditable(true)}
                aria-label="Edit summary"
                title="Edit"
              >
                {/* more simple */}
                ✏️
              </button>
            )}

            {editable ? (
              <>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full h-[160px] bg-white p-3 rounded-md border border-gray-300 text-[#333] font-sans text-[16px] leading-[1.6] resize-none focus:outline-none focus:ring-2 focus:ring-[#A43718]"
                />
                <div className="flex justify-end mt-3">
                  <button
                    onClick={async () => {
                      if (!campaignId) {
                        alert("No campaign selected to save summary to.");
                        return;
                      }

                      console.log("Saving summary", {
                        campaignId,
                        summaryId,
                        length: summary?.length,
                      });

                      try {
                        // Pre-check: ensure campaign exists on server to avoid 404
                        const listRes = await fetch("/api/data");
                        if (!listRes.ok) {
                          console.warn(
                            "Failed to fetch campaigns before save",
                            listRes.status
                          );
                        } else {
                          const listJson = await listRes
                            .json()
                            .catch(() => ({}));
                          const campaigns = listJson?.campaigns || [];
                          const found = campaigns.find(
                            (c: any) => c.id === campaignId
                          );
                          if (!found) {
                            const msg = `Campaign with id ${campaignId} not found on server.`;
                            console.error(msg, {
                              available: campaigns.map((c: any) => c.id),
                            });
                            alert(msg);
                            return;
                          }
                        }

                        const res = await fetch(`/api/data?type=summary`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            campaignId,
                            content: summary,
                            summaryId,
                          }),
                        });

                        const body = await res.text();
                        let parsed: any = null;
                        try {
                          parsed = JSON.parse(body);
                        } catch {}

                        if (!res.ok) {
                          const errMsg =
                            (parsed && parsed.error) ||
                            `Save failed (status ${res.status})`;
                          console.error("Save failed", {
                            status: res.status,
                            body: parsed || body,
                          });
                          throw new Error(errMsg);
                        }

                        const json = parsed || {};
                        if (json?.summary?.content)
                          setSummary(json.summary.content);
                        if (json?.summary?.id) setSummaryId(json.summary.id);
                        // If server returned campaign updateDate, refresh displayed date
                        if (json?.campaign?.updateDate)
                          setDate(
                            new Date(json.campaign.updateDate).toLocaleString()
                          );
                        setEditable(false);
                      } catch (e: any) {
                        console.error("Failed to save summary:", e);
                        alert(e?.message || "Failed to save summary");
                      }
                    }}
                    className="px-4 py-2 bg-[#A43718] text-white rounded-md hover:opacity-90 active:scale-95 transition"
                  >
                    Save
                  </button>
                </div>
              </>
            ) : (
              <span
                style={{
                  color: "#333",
                  fontFamily: '"Inter", sans-serif',
                  fontSize: 16,
                  lineHeight: "1.6",
                  whiteSpace: "pre-line",
                }}
              >
                {renderHighlighted(summary)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/********* ===== Components 5: Character Carousel (3 slots, supports N>=3 looping; includes search highlight animation) **********/
function CharacterCarouselStacked({
  searchName = "",
  searchTick,
  campaignIdProp,
}: {
  searchName?: string;
  searchTick?: number; // 
  campaignIdProp?: string | undefined | null;
}) {
  const params = useParams();
  const [campaignId, setCampaignId] = useState<string | undefined>(undefined);
  // Keep role id so we can PATCH a specific role cover
  const [items, setItems] = useState<
    Array<{ id: string; name: string; img: string; details: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [cur, setCur] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [flippedIndex, setFlippedIndex] = useState<number | null>(null);
// Match highlight animation (slight scaling + glowing border)
  const [hintOn, setHintOn] = useState(false);
  const fireHint = () => {
    setHintOn(true);
    window.setTimeout(() => setHintOn(false), 900);
  };
// Make sure we only apply the preferred role once per mount
  const preferredAppliedRef = useRef(false);

  // On mount, determine campaignId
  useEffect(() => {
    // Prefer prop if provided
    if (campaignIdProp) {
      setCampaignId(campaignIdProp as string | undefined);
      return;
    }

    let id = params?.id;
    if (Array.isArray(id)) {
      id = id[0];
    }

    // If URL has template string or no id, use localStorage instead
    if (!id || id === "${campaignId}" || id === "%24%7BcampaignId%7D") {
      if (typeof window !== "undefined") {
        id = localStorage.getItem("currentCampaignId") || undefined;
      }
    }

    setCampaignId(id as string | undefined);
  }, [params, campaignIdProp]);

  // Fetch roles from database
  useEffect(() => {
    if (!campaignId) {
      console.log("No campaignId available, skipping fetch");
      setLoading(false);
      return;
    }
    console.log("Fetching roles for campaignId:", campaignId);
    setLoading(true);
    fetch(`/api/data?type=roles&campaignId=${campaignId}`)
      .then((res) => {
        console.log("API response status:", res.status);
        return res.json();
      })
      .then((data) => {
        console.log("API response data:", data);
        if (data.roles && Array.isArray(data.roles)) {
          const processedRoles = data.roles.map((role: any) => {
            const img =
              (role?.url && String(role.url)) ||
              (role?.img && String(role.img)) ||
              "/Griff.png";

            console.log(
              `Character "${role.name}" → img:`,
              img ? img.substring(0, 50) + "..." : "NO IMAGE"
            );

            return {
              id: role.id,                  // NEW: keep id for uploads
              name: role.name,
              img,                          // prefer role.url, then role.img, else default
              details:
                role.details ||
                `Level ${role.level || 1} character. No detailed description available yet.`,
            };
          });
          setItems(processedRoles);
        } else {
          setItems([]);
        }
      })
      .catch((err) => {
        console.error("API fetch error:", err);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [campaignId]);
  
  // Prefer showing the remembered role in the center when entering the page
  useEffect(() => {
    if (preferredAppliedRef.current) return;            // apply only once
    if (!campaignId || items.length === 0) return;

    try {
      const key = `preferredRole:${campaignId}`;
      const saved = localStorage.getItem(key);
      if (!saved) return;

      // Find the exact-match index (case-insensitive)
      const idx = items.findIndex(
        (x) => x.name.toLowerCase() === saved.toLowerCase()
      );
      if (idx >= 0) {
        setCur(idx);                // center on the preferred role
        preferredAppliedRef.current = true;
        // Optional: visual hint
        // fireHint();
      }
    } catch {
      // ignore
    }
  }, [campaignId, items]);

  // Upload a new cover and persist to Role.url via /api/role-cover
  const handleUploadCover = async (roleId: string, file: File) => {
    try {
      // 1) basic client-side guard
      const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
      if (!ALLOWED.has(file.type)) {
        alert("Please choose a PNG/JPEG/WEBP image.");
        return;
      }
      const MAX = 2 * 1024 * 1024; // 2MB
      if (file.size > MAX) {
        alert("Image too large. Please choose a file ≤ 2MB.");
        return;
      }

      // 2) read as data URL (e.g. "data:image/png;base64,AAAA...")
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      // 3) persist to backend (store in Role.url)
      const res = await fetch("/api/role-cover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: roleId, url: dataUrl }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Upload failed (${res.status})`);
      }

      // 4) optimistic UI: update the displayed image immediately
      setItems((prev) => prev.map((x) => (x.id === roleId ? { ...x, img: dataUrl } : x)));
      alert("Cover updated!");
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Failed to upload cover");
    }
  };

  // Helper functions (always defined)
  const mod = (i: number, m: number) => ((i % m) + m) % m;

  const prev = () => {
    setDirection("left");
    setCur((v) => mod(v - 1, N));
    setFlippedIndex(null);
  };
  const next = () => {
    setDirection("right");
    setCur((v) => mod(v + 1, N));
    setFlippedIndex(null);
  };
  const goTo = (i: number) => {
    setDirection(i > cur ? "right" : "left");
    setCur(mod(i, N));
    setFlippedIndex(null);
  };

// Center the matched character based on the search term and trigger the hint animation 
// (exact name match takes priority, partial match as fallback) - ALWAYS called

  const lastTargetRef = useRef<number | null>(null);
  useEffect(() => {
    const key = searchName.trim().toLowerCase();
    if (!key || items.length === 0) return;

// First match by full name, then fallback to partial (substring) match
    let i = items.findIndex((x) => x.name.toLowerCase() === key);
    if (i < 0) i = items.findIndex((x) => x.name.toLowerCase().includes(key));
    if (i < 0) return;

    const sameTarget = lastTargetRef.current === i;
    const alreadyCenter = i === cur;

    if (alreadyCenter) {
      fireHint();
      lastTargetRef.current = i;
      return;
    }
    if (sameTarget) {
      fireHint();
      return;
    }
    goTo(i);
    fireHint();
    lastTargetRef.current = i;
  }, [searchName, searchTick, items, cur]);

  // Conditional rendering AFTER all hooks
  const N = items.length;
  const idxL = N >= 2 ? mod(cur - 1, N) : cur;
  const idxR = N >= 3 ? mod(cur + 1, N) : N === 2 ? mod(cur + 1, N) : cur;

  if (loading) {
    return <div className="text-center text-white">Loading characters...</div>;
  }

  {/*if (N === 0) {
    return (
      <div className="text-center text-white">
        No characters found.
        <div
          style={{
            fontSize: 12,
            marginTop: 16,
            textAlign: "left",
            background: "#222",
            padding: 8,
            borderRadius: 4,
            maxWidth: 600,
            margin: "16px auto",
          }}
        >
          <strong>Debug Info:</strong>
          <br />
          URL campaignId: {params?.id ? String(params.id) : "undefined"}
          <br />
          localStorage campaignId:{" "}
          {typeof window !== "undefined"
            ? localStorage.getItem("currentCampaignId")
            : "N/A"}
          <br />
          Final campaignId: {campaignId || "undefined"}
        </div>
      </div>
    );
  }*/}

  function Card({
    data,
    type,
    index,
    isActive,
    direction,
    onUpload,
  }: {
    data: { id: string; name: string; img: string; details: string };
    type: "left" | "center" | "right";
    index: number;
    isActive?: boolean;
    direction?: "left" | "right";
    onUpload: (roleId: string, file: File) => void;
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
    };

    if (isCenter) {
      return (
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={data.name}
            style={s}
            custom={direction}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={slideVariants}
          >
            {/* 中间卡片命中提示：描边+发光 */}
            {hintOn && (
              <motion.div
                className="pointer-events-none absolute -inset-3 rounded-[26px]"
                style={{
                  border: "4px solid #A43718",
                  filter: "drop-shadow(0 0 14px rgba(164,55,24,0.6))",
                  opacity: 0.9,
                  borderRadius: 26,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, scale: 1.08 }}
                exit={{ opacity: 0 }}
              />
            )}
            <div
              className="h-full w-full [perspective:1200px] rounded-[20px]"
              style={{
                transform: hintOn ? "scale(1.03)" : undefined,
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
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src !== "/Griff.png") {
                          target.src = "/Griff.png";
                        }
                      }}
                    />
                    {/* Hidden file input for this card */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={`role-cover-${data.id}-${index}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(data.id, f);
                    e.currentTarget.value = ""; // allow reselecting same file
                  }}
                />

                {/* Bottom-right overlay "Change" button */}
                <button
                  type="button"
                  title="Change cover"
                  aria-label="Change cover"
                  className="absolute right-3 bottom-3 z-20 px-2 py-1 rounded bg-black/60 text-white text-xs hover:bg-black/75"
                  onClick={(e) => {
                    e.stopPropagation(); // avoid flipping the card
                    const el = document.getElementById(`role-cover-${data.id}-${index}`) as HTMLInputElement | null;
                    el?.click();
                  }}
                >
                  🖼️ Change
                </button>
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
                    className="absolute -inset-20 md:-inset-20 rounded-[24px] border border-[#E9E9E9] bg-white px-7 py-6
                                flex flex-col gap-3 min-h-0 shadow-xl [backface-visibility:hidden]"
                      style={{ transform: "rotateY(180deg)" }}
                      onClick={() => setFlippedIndex(null)}
                    >
                    <div
                      className="text-[#1D1D1D]"
                      style={{ fontFamily: '"Abhaya Libre ExtraBold", serif', fontWeight: 800, fontSize: 24 }}
                    >
                      {data.name}
                    </div>

                    <div
                      className="text-[#333] whitespace-pre-line flex-1 overflow-y-auto pr-2"
                      style={{ fontFamily: '"Inter", sans-serif', fontSize: 15, lineHeight: "24px" }}
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
      <div style={s}>
        <div className="h-full w-full [perspective:1200px] rounded-[20px]">
          <div className="relative h-full w-full rounded-[20px] transition-transform duration-500 [transform-style:preserve-3d] shadow-[0_22px_74px_rgba(0,0,0,0.6)]">
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
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (target.src !== "/Griff.png") {
                      target.src = "/Griff.png";
                    }
                  }}
                />
                

              </div>
              // Side-card title: anchor to bottom, single-line ellipsis, slightly smaller font
              <div
                className="absolute"
                style={{ left: "4.26%", right: "8%", bottom: "6%" }} // use bottom instead of top
              >
                <div
                  className="text-[#1D1D1D]"
                  style={{
                    fontFamily: '"Abhaya Libre ExtraBold", serif',
                    fontWeight: 800,
                    fontSize: 20,          // smaller on side cards
                    lineHeight: "24px",
                    whiteSpace: "nowrap",  // keep in one line
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={data.name}        // full title on hover
                >
                  {data.name}
                </div>
              </div>
              {/*<div
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
              </div>*/}
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
                className="text-[#333] whitespace-pre-line"
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
  
  // N === 0: empty state card
  if (N === 0) {
    return (
      <div
          className="relative"
          style={{ width: 730, height: 438, left: 0, top: -100, zIndex: 30 }}
      >
        <div className="absolute inset-0 rounded-[24px] bg-white/80 shadow-xl flex flex-col items-center justify-center gap-4">
          <div className="text-2xl font-semibold text-neutral-800">No characters yet</div>
          <div className="text-neutral-600">started your adventure to generate automatically</div>
        </div>
      </div>
    );
  }
  
  //else return
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
            left: 698, //use fixed left value
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

      {/* // Three display slots*/}
      {/* Display slots: 1 card when N=1; 2 cards when N=2; 3 cards when N>=3 */}
      <div className="relative" style={{ height: 438 }}>
        {/* N>=3: show left */}
        {N >= 3 && (
          <Card
            data={items[idxL]}
            type="left"
            index={idxL}
            onUpload={handleUploadCover}
          />
        )}

        {/* Always show center */}
        <Card
          data={items[cur]}
          type="center"
          index={cur}
          isActive
          direction={direction}
          onUpload={handleUploadCover}
        />

        {/* N>=2: show right (so total = 2 when N=2; total = 3 when N>=3) */}
        {N >= 2 && (
          <Card
            data={items[idxR]}
            type="right"
            index={idxR}
            onUpload={handleUploadCover}
          />
        )}
      </div>


      {/* Indicator dots: count = N*/}
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
