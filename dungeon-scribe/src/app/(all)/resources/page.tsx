/*
shadcn apply：card/button/badge/Dialog/Input ；
filter near head: TitleWithFilter 

scroll：6 cards per page，keyboard ←/→ can control。

data: The example uses two mock datasets — MOCK_SESSIONS and MOCK_CHARACTERS.
When connecting to the backend, simply replace data with the fetch result.

Add New: Opens a Dialog when clicked.
The handleCreate function has a TODO placeholder — connect it following your existing /api/data implementation.
*/

"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/* ----------------------------------- utils ----------------------------------- */
function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

/* ---------------------------------Filter beside title --------------------------------- */
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
      className={cn(
        "w-full text-left px-4 py-2 cursor-pointer transition rounded-md",
        active ? "bg-white/15" : "hover:bg-white/10"
      )}
      style={{ fontFamily: '"Inter", sans-serif', fontSize: 14 }}
    >
      {children}
    </button>
  );
}
function TitleWithFilter({
  value,
  onChange,
}: {
  value: "Map" | "Background" | "Others";
  onChange: (v: "Map" | "Background" | "Others") => void;
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
  const label = value.toUpperCase();
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ height: 90 }}
      ref={ref}
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
            active={value === "Map"}
            onClick={() => {
              onChange("Map");
              setOpen(false);
            }}
          >
            Map
          </MenuItem>
          <MenuItem
            active={value === "Background"}
            onClick={() => {
              onChange("Background");
              setOpen(false);
            }}
          >
            Background
          </MenuItem>
          <MenuItem
            active={value === "Others"}
            onClick={() => {
              onChange("Others");
              setOpen(false);
            }}
          >
            Others
          </MenuItem>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------ data types ------------------------------------ */
type Category = "Map" | "Background" | "Others";
type CardItem = {
  id: string;
  title: string;
  subtitle?: string;
  img: string;
  tag?: string;
  category: Category;
  /*  View Details / Open / download */
  fileUrl?: string;
};

/* --------------------------------- small pieces -------------------------------- */
function ResourceCard({
  it,
  onOpen,
  onDelete, 
}: {
  it: CardItem;
  onOpen: (item: CardItem) => void;
  onDelete: (item: CardItem) => void;
}) {
  const detailsHref = it.fileUrl ?? `/resources/${it.id}`;
  const target = it.fileUrl ? "_blank" : undefined;

  return (
    <Card className="overflow-hidden rounded-2xl bg-white/90 backdrop-blur relative">
      {/* / Trash bin button at the top-right corner*/}
      <button
        onClick={() => onDelete(it)}
        className="absolute top-2 right-2 z-30 p-2 bg-white/85 rounded-full hover:bg-red-100 active:scale-95 transition shadow"
        aria-label="Delete resource"
        title="Delete this resource"
      >
        🗑️
      </button>

      <CardHeader className="p-0">
        <div className="relative h-36 w-full">
          <Image
            src={it.img}
            alt={it.title}
            fill
            className="object-cover"
            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
          />
        </div>
      </CardHeader>

      <CardContent className="px-4 pt-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{it.title}</CardTitle>
            {it.subtitle && (
              <Link
                href={detailsHref}
                target={target}
                className="text-sm text-sky-700 hover:underline"
              >
                {it.subtitle}
              </Link>
            )}
          </div>
          {it.tag && (
            <Badge variant="secondary" className="capitalize">
              {it.tag}
            </Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="px-4 pb-2 pt-0 justify-end gap-2">
        {it.category === "Map" ? (
          // Map: Opens a new page with grid and lighting view
          <Button asChild size="sm">
            <Link href={`/resources/mapview/${it.id}`}>Open</Link>
          </Button>
        ) : (
          //  Other types: reuse your existing onOpen(it)

          <Button variant="outline" size="sm" onClick={() => onOpen(it)}>
            Open
          </Button>
        )}

        {/* download keep*/}
        <Button asChild variant="outline" size="sm">
          <Link
            href={detailsHref}
            target={target}
            {...(it.fileUrl ? { download: "" } : {})}
          >
            download
          </Link>
        </Button>
      </CardFooter>

    </Card>
  );
}

function AddNewCard({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="outline"
      className="h-[212px] w-full rounded-2xl border-2 border-dashed bg-white/20 text-white/90 hover:bg-white/30" /* fix the white typo */
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/60">
          <Plus className="h-6 w-6" />
        </div>
        <span className="text-sm">{label}</span>
      </div>
    </Button>
  );
}

/* ----------------------------------- page ----------------------------------- */
export default function ResourcesPage() {
  useLockBodyScroll();

  const [view, setView] = useState<Category>("Map");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");

  // Keep your existing file upload & list logic
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // ✅ Use backend data (stop using MOCK_RESOURCES to avoid state conflicts)
  const [items, setItems] = useState<CardItem[]>([]);

  /* ✅ New: State for Open dialog */
  const [selectedItem, setSelectedItem] = useState<CardItem | null>(null);
  const [selectedContent, setSelectedContent] = useState<string>("");

  /* Existing: Filter by category (based on current tab) */
  const data = useMemo(
    () => items.filter((it) => it.category === view),
    [items, view]
  );

  // ---------------------- Connect to backend: fetch resource list ----------------------
  // Fetch resources for the current tab; re-fetch when switching tabs.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/resources?category=${encodeURIComponent(view)}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!res.ok) throw new Error(`fetch list: ${res.status}`);

        const json: {
          ok: boolean;
          items: Array<{
            id: string;
            title: string;
            category: string;
            fileUrl: string;
            previewUrl?: string;
          }>;
        } = await res.json();

        // Map backend records to frontend CardItem
        const arr: CardItem[] = (json.items || []).map((r) => ({
          id: r.id,
          title: r.title,
          subtitle: "View Details",
          img: r.previewUrl || r.fileUrl || "/historypp.png",
          tag: r.category, // Small badge on the top-right corner
          category: view, // Use current tab as frontend category (or strictly map via r.category)
          fileUrl: r.fileUrl,
        }));

        setItems(arr);
        setIndex(0); // Return to first page when switching tabs
      } catch (err: any) {
        //  Ignore AbortError in development mode
        if (err?.name === "AbortError") return;
        console.error(err);
        setItems([]);
      }
    })();

    return () => {
      try {
        if (!controller.signal.aborted) controller.abort();
      } catch {
        // ignore
      }
    };
  }, [view]);

  // ---------------------- Pagination slicing (6 per page) ----------------------
  // First, create a “final list”: all resources + an Add card at the end
  const listWithAdd = useMemo(() => {
    const list = [...data];
    list.push({
      id: "__add__",
      title: "",
      img: "",
      category: view,
    } as CardItem);
    return list;
  }, [data, view]);

  // Then slice it into pages of 6 items each
  const pages: CardItem[][] = useMemo(() => {
    const len = listWithAdd.length;
    const pageCount = Math.ceil(len / 6);
    return Array.from({ length: pageCount }, (_, i) =>
      listWithAdd.slice(i * 6, i * 6 + 6)
    );
  }, [listWithAdd]);

  // Page guard (prevent out-of-range index when page count changes)
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  const max = Math.max(0, pages.length - 1);
  const go = (dir: -1 | 1) =>
    setIndex((i) => Math.min(max, Math.max(0, i + dir)));

  // Keyboard ←/→ navigation support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [max]);

  /* handleCreate: create a new card */
  async function handleCreate() {
    if (!createName.trim() || !createFile) return;
    try {
      setUploading(true);

      const fd = new FormData();
      fd.append("name", createName.trim());
      fd.append("category", view);
      fd.append("file", createFile);

      const res = await fetch("/api/resources", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const json: { id: string; url: string; preview?: string } =
        await res.json();

      // ✅ Optimistic update (or optionally re-fetch the latest list)
      const newItem: CardItem = {
        id: json.id || `${view}-${Date.now()}`,
        title: createName.trim(),
        subtitle: "View Details",
        img: json.preview || "/historypp.png",
        tag:
          view === "Background"
            ? "Background"
            : view === "Map"
            ? "Map"
            : "Others",
        category: view,
        fileUrl: json.url,
      };
      setItems((prev) => [...prev, newItem]);

      setCreateOpen(false);
      setCreateName("");
      setCreateFile(null);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  }

  /* ✅ Force-convert any path (absolute path, local disk, full URL, or test directory) into /uploads/filename */
  function normalizeToUploadsUrl(x: string | undefined | null) {
    if (!x) return "";
    // Keep only the filename
    const fileName = (x.split(/[/\\]/).pop() || "").trim();
    return fileName ? `/uploads/${fileName}` : "";
  }

  // Open: show modal and read file text (keep your existing /api/readFile logic unchanged)
  async function handleOpen(item: CardItem) {
    setSelectedItem({ ...item });
    setSelectedContent("(Loading...)");

    const safeUrl = normalizeToUploadsUrl(item.fileUrl || item.id);
    if (!safeUrl) {
      setSelectedContent("(No file available)");
      return;
    }

    try {
      const res = await fetch(
        `/api/readFile?id=${encodeURIComponent(safeUrl)}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setSelectedContent(
          json?.error ? `(Error) ${json.error}` : "(Failed to load content)"
        );
        return;
      }

      const text = (json?.text ?? "").toString();
      setSelectedContent(text.trim() ? text : "(No content)");
    } catch (e) {
      console.error("handleOpen fetch error:", e);
      setSelectedContent("(Failed to load content)");
    }
  }

  // ✅ Delete function (with confirmation prompt)
  function handleDelete(item: CardItem) {
    if (
      window.confirm(
        `Are you sure you want to delete "${item.title}"? This action cannot be undone.`
      )
    ) {
      // 1️⃣ Immediately remove from frontend
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      // 2️⃣ Notify backend to delete
      fetch(`/api/resources/${encodeURIComponent(item.id)}`, { method: "DELETE" })
        .then((res) => {
          if (!res.ok) throw new Error("Failed to delete resource");
        })
        .catch((err) => console.error("Delete failed:", err));
    }
  }

  return (
    <main className="min-h-screen w-full px-4 pb-16 pt-2 md:px-8">
      <TitleWithFilter
        value={view}
        onChange={(v) => {
          setView(v);
          setIndex(0);
        }}
      />

      {/** Track width = N × 100%, each page width = 100% / N, move step = 100% / N */}
      <section className="relative mx-auto mt-0 max-w-6xl ">
        {/* This wrapper is specifically for clipping overflow from the track */}
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-300"
            style={{
              transform: `translateX(-${
                pages.length > 0 ? (index * 100) / pages.length : 0
              }%)`,
              width: `${Math.max(pages.length, 1) * 100}%`,
            }}
          >
            {pages.map((page, pi) => (
              <div
                key={pi}
                className="shrink-0 px-2 md:px-4"
                style={{ width: `${100 / Math.max(pages.length, 1)}%` }}
              >
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {page.map((it, i) =>
                    it.id === "__add__" ? (
                      <AddNewCard
                        key={`add-${i}`}
                        onClick={() => setCreateOpen(true)}
                        label={
                          view === "Background"
                            ? "Add New Background"
                            : view === "Map"
                            ? "Add New Map"
                            : "Add New Resource"
                        }
                      />
                    ) : (
                      <ResourceCard
                        key={`${it.id}-${i}`}
                        it={it}
                        onOpen={handleOpen}
                        onDelete={handleDelete} 
                      />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {index > 0 && (
          <Button
            aria-label="Prev"
            onClick={() => go(-1)}
            size="icon"
            className="absolute left-[-8px] top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>
        )}
        {index < max && (
          <Button
            aria-label="Next"
            onClick={() => go(1)}
            size="icon"
            className="absolute right-[-8px] top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Button>
        )}

        <div className="mt-6 flex items-center justify-center gap-2">
          {pages.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to page ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition",
                i === index ? "bg-white" : "bg-white/50 hover:bg-white/70"
              )}
            />
          ))}
        </div>
      </section>

      {/* Keep your Create dialog unchanged */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              Create New{" "}
              {view === "Background"
                ? "Background"
                : view === "Map"
                ? "Map"
                : "Resource"}
            </DialogTitle>
            <DialogDescription>
              Provide a name and upload a file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Enter name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />

            {/*Custom file upload button (keep your previous implementation) */}
            <label className="flex flex-col items-center px-4 py-6 bg-white rounded-lg shadow-md tracking-wide uppercase border border-gray-300 cursor-pointer hover:bg-gray-100">
              {createFile && createFile.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(createFile)}
                  alt="preview"
                  className="h-20 w-20 object-cover rounded-md"
                />
              ) : (
                <svg
                  className="w-8 h-8 text-blue-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M16.88 9.94A1.5 1.5 0 0015.5 9h-11a1.5 1.5 0 00-1.38.94L1 14v2a1 1 0 001 1h16a1 1 0 001-1v-2l-2.12-4.06zM12 4a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              )}
              <span className="mt-2 text-base leading-normal max-w-[250px] truncate overflow-hidden text-ellipsis">
                {createFile ? createFile.name : "Choose File"}
              </span>

              <input
                type="file"
                className="hidden"
                accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx"
                onChange={(e) => setCreateFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!createName.trim() || !createFile || uploading}
            >
              {uploading ? "Uploading..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ New: Floating card for Open dialog; other elements remain unaffected */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="relative bg-white rounded-2xl p-6 max-w-3xl w-full shadow-xl">
            {/* Header: thumbnail + title */}
            <div className="flex items-center gap-4 mb-6">
              <img
                src={selectedItem.img}
                alt={selectedItem.title || "preview"}
                className="h-16 w-24 object-cover rounded-md"
              />
              {/* Let the title take up remaining space to prevent flex overflow */}
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-extrabold text-gray-900 leading-tight break-words">
                  {selectedItem?.title?.trim()?.length
                    ? selectedItem.title
                    : "(Untitled)"}
                </h2>
              </div>
            </div>

            {/* Content text */}
            <div className="max-h-[65vh] overflow-y-auto whitespace-pre-line text-gray-800 leading-relaxed">
              {selectedContent || "(No content)"}
            </div>
            {/* Close button at top-right */}
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
