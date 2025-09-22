"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranscript } from "../../context/TranscriptContext";


// size
function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

// URL
function wsURL() {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ASR_WS) {
    return process.env.NEXT_PUBLIC_ASR_WS!;
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname;
  return `${proto}://${host}:8000/audio`;
  }
  return "ws://localhost:8000/audio";
}

// upload modal
function UploadModal({ onClose, campaignTitle }: { onClose: () => void; campaignTitle: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const { setTranscript, setSummary } = useTranscript();
  const router = useRouter();

  const openPicker = useCallback(() => {
    if (!inputRef.current) return;
    setIsFileDialogOpen(true);
    const onFocus = () => {
      setTimeout(() => setIsFileDialogOpen(false), 50);
      window.removeEventListener("focus", onFocus);
    };
    window.addEventListener("focus", onFocus, { once: true });
    inputRef.current.click();
  }, []);

  const handlePick = (files: FileList | null) => {
    if (!files || !files.length) return;
    const f = files[0];
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    const mime = (f.type || "").toLowerCase();
    const allowedExt = new Set(["txt", "mp3", "m4a", "mp4", "wav", "aac"]);
    const isAllowedByExt = allowedExt.has(ext);
    const isAllowedByMime = mime.startsWith("audio/") || mime === "video/mp4" || mime === "text/plain";
    if (!(isAllowedByExt || isAllowedByMime)) {
      alert("Please upload txt / Mp3 / M4A / Mp4 / Wav / Aac (≤50MB).");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      alert("File must be ≤ 50MB.");
      return;
    }
    setFile(f);
    setProgress(0);
    setSubmitState("idle");
  };

  useEffect(() => {
    if (!file) return;
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(t);
          return 100;
        }
        return p + 8;
      });
    }, 350);
    return () => clearInterval(t);
  }, [file]);

  const isDone = progress >= 100;
  const doneBytes = file ? (Math.min(progress, 100) / 100) * file.size : 0;

  const handleConfirmSubmit = async () => {
    if (!file || !isDone || submitState === "submitting" || submitState === "submitted") return;
    setSubmitState("submitting");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("campaignTitle", campaignTitle ?? "");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      if (data.text) setTranscript(data.text);
      if (data.summary) {
        setSummary(data.summary);
      } else {
        setSummary("• 没有生成摘要，请检查模型配置。");
      }
      router.push("/dashboard/record");
      setSubmitState("submitted");
    } catch (e) {
      console.error(e);
      setSubmitState("error");
      alert("Upload/analyze failed. See console.");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000]">
      {/* 背景 */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px] z-0"
        onClick={() => {
          if (isFileDialogOpen) return;
          onClose();
        }}
      />

      {/* 主框 */}
      <div
        className="absolute z-10 rounded-[20px] shadow-2xl"
        style={{
          width: "741px",
          height: "556px",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(255,255,255,0.9)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="close"
          onClick={onClose}
          className="absolute right-4 top-4 h-8 w-8 rounded-full flex items-center justify-center text-zinc-600 hover:bg-zinc-100"
          title="Close"
        >
          ✕
        </button>

        {/* 文件拖拽/选择框 */}
        <div
          className="absolute cursor-pointer"
          style={{
            left: "15%",
            right: "22%",
            top: "11%",
            bottom: "42%",
            background: "#FFFFFF",
            border: "6px dashed #CBD0DC",
            borderRadius: "40px",
          }}
          onClick={openPicker}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handlePick(e.dataTransfer.files);
          }}
        >
          <div className="w-full h-full flex flex-col items-center justify-center gap-6">
            <p className="text-[26px] font-medium text-[#292D32]">
              Choose a file or drag & drop it here
            </p>
            <p className="text-[20px] font-medium text-[#A9ACB4]">
              Mp3, M4A, MP4, WAV, AAC ≤50MB
            </p>
            <button
              className="px-6 py-2 rounded-xl border-2 border-[#CBD0DC] bg-white text-[#54575C]"
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
              type="button"
            >
              Browse File
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".txt,.mp3,.m4a,.mp4,.wav,.aac,audio/*,video/mp4"
              className="hidden"
              onChange={(e) => handlePick(e.target.files)}
            />
          </div>
        </div>

        {/* 文件信息 */}
        {file && (
          <div
            className="absolute left-[4%] right-[4%] rounded-[40px] bg-[#EEF1F7] px-6 py-5"
            style={{ top: "66%", bottom: "10%" }}
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-white/80 flex items-center justify-center text-zinc-600">
                {file.name.split(".").pop()?.toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[24px] font-medium truncate">
                  {file.name}
                </div>
                <div className="mt-2 text-[16px] text-[#A9ACB4]">
                  {formatSize(doneBytes)} / {formatSize(file.size)} •{" "}
                  {isDone ? "Complete ✓" : "Uploading..."}
                </div>
                <div className="mt-3 h-[10px] w-full rounded-full bg-white/80">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isDone ? "bg-green-500" : "bg-[#375EF9]"
                    }`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              </div>

              <div className="ml-2 flex items-center gap-2">
                {isDone && (
                  <button
                    onClick={handleConfirmSubmit}
                    disabled={submitState === "submitting"}
                    className="px-4 py-2 rounded-full text-white text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                    title="Confirm submit and transcribe"
                  >
                    {submitState === "submitting"
                      ? "Transcribing..."
                      : "Confirm Submit"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setFile(null);
                    setProgress(0);
                    setSubmitState("idle");
                  }}
                  className="h-8 w-8"
                  title="Remove"
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// main page
export default function DashboardPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const { setTranscript } = useTranscript();

  const [openUpload, setOpenUpload] = useState(false);
  const [starting, setStarting] = useState(false);
  // 当前 Campaign 标题
  const [campaignTitle, setCampaignTitle] = useState<string | null>(null);

  useEffect(() => {
    if (sp.get("open") === "upload") setOpenUpload(true);
  }, [sp]);

  
  // NEW: 读取当前 campaign
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/current-campaign", { cache: "no-store" });
        if (!res.ok) throw new Error("failed");
        const data = await res.json(); // { id, title } | { id: null, title: null }
        setCampaignTitle(data?.title ?? null);

        // 如果你想“没选就回登录”，解开下面这行：
        // if (!data?.id) router.push("/login");
      } catch {
        setCampaignTitle(null);
      }
    })();
  }, [router]);

  const startRecording = useCallback(async () => {
    if (starting) return;
    setStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ sampleRate: 16000 });

      const moduleUrl = new URL(
        "/worklets/pcm16-frames.js",
        window.location.origin
      );
      moduleUrl.searchParams.set("v", "1");
      await ctx.audioWorklet.addModule(moduleUrl.toString());

      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm16-frames", {
        processorOptions: { frameSize: 320 },
      });

      source.connect(node);

      const url = wsURL();
      const ws = new WebSocket(url);

      ws.onopen = () => setTranscript("");

      node.port.onmessage = (ev) => {
        const ab = ev.data as ArrayBuffer;
        if (ws.readyState === WebSocket.OPEN) ws.send(ab);
      };

      ws.onmessage = (ev) => {
        const data = JSON.parse(ev.data as string);

        if (typeof data.partial === "string" && data.partial.trim() !== "") {
          setTranscript(
            (prev: string) => (prev ? prev + "\n" : "") + data.partial
          );
        }

        if (typeof data.final === "string" && data.final.trim() !== "") {
          setTranscript(
            (prev: string) => (prev ? prev + "\n" : "") + data.final
          );
        }
      };

      ws.onerror = () => {
        setTranscript((p: string) => (p ? p + "\n" : "") + "[WS error]");
      };

      (window as any).__asrSession = { ctx, source, node, ws, stream };
      router.push("/dashboard/record");
    } catch (err) {
      console.error(err);
      alert(
        "Microphone permission or AudioWorklet failed. See console for details."
      );
    } finally {
      setStarting(false);
    }
  }, [router, setTranscript, starting]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <main
        className="absolute left-0 right-0 top-[140px] h-[879px]
                   flex flex-col items-center gap-[95px] px-6 z-10"
      >
        <h1
          className="w-full text-center text-[90px] leading-[106px] font-extrabold
                     bg-gradient-to-b from-[#EB562C] to-white bg-clip-text text-transparent"
        >
          Ready to start?
        </h1>

        <div className="flex flex-col items-center gap-14">
          {/* Record */}
          <button
            className={`w-[359px] h-[73px] rounded-[250px] cursor-pointer
                        text-white text-[35px] font-medium
                        shadow-[0_4px_25px_#FF3D00]
                        [background:linear-gradient(0deg,rgba(0,0,0,0.4),rgba(0,0,0,0.4)),rgba(255,61,0,0.9)]
                        transition-colors ${
                          starting
                            ? "opacity-70 cursor-wait"
                            : "hover:!bg-[#9e2c18] hover:shadow-[0_4px_20px_rgba(158,44,24,0.7)]"
                        }`}
            style={{ fontFamily: '"Roboto", sans-serif' }}
            onClick={startRecording}
            disabled={starting}
            title="Start recording"
          >
            {starting ? "Starting..." : "Record"}
          </button>

          {/* Upload */}
          <button
            className="w-[359px] h-[73px] rounded-[250px] cursor-pointer
                       text-white text-[35px] font-medium
                       shadow-[0_4px_25px_#FF3D00]
                       [background:linear-gradient(0deg,rgba(0,0,0,0.4),rgba(0,0,0,0.4)),rgba(255,61,0,0.9)]
                       hover:!bg-[#9e2c18] hover:shadow-[0_4px_20px_rgba(158,44,24,0.7)]
                       transition-colors"
            style={{ fontFamily: '"Roboto", sans-serif' }}
            onClick={() => setOpenUpload(true)}
          >
            Upload Audio
          </button>
        </div>
      </main>

      <div
        className="fixed right-10 bottom-24 z-[9]
                   w-[450px] text-right
                   font-bold text-[34px] leading-[46px] text-white
                   drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)] select-none"
        style={{ fontFamily: '"Cinzel Decorative", serif' }}
      >
        Welcome back,
        <br />
        <span className="italic">
          {campaignTitle ?? "your next adventure"}
        </span>
      </div>

  {openUpload && <UploadModal onClose={() => setOpenUpload(false)} campaignTitle={campaignTitle} />}
    </div>
  );
}
