"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

/** ====== 小工具 ====== */
function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/** ====== 录音 & ASR 工具 ====== */
function wsURL() {
  // If you deploy ASR elsewhere, set NEXT_PUBLIC_ASR_WS="wss://host:port/audio"
  if (process.env.NEXT_PUBLIC_ASR_WS) return process.env.NEXT_PUBLIC_ASR_WS;
  const proto =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss"
      : "ws";
  const host =
    typeof window !== "undefined" ? window.location.hostname : "localhost";
  const port = 5000; // match Python server
  return `${proto}://${host}:${port}/audio`;
}

type WSState = "idle" | "connecting" | "open" | "closed" | "error";

/** ====== 上传弹窗（保持你的原实现） ====== */
function UploadModal({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "submitted" | "error"
  >("idle");

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
    const allowedExt = new Set(["mp3", "m4a", "mp4", "wav", "aac"]);
    const isAllowedByExt = allowedExt.has(ext);
    const isAllowedByMime = mime.startsWith("audio/") || mime === "video/mp4";
    if (!(isAllowedByExt || isAllowedByMime)) {
      alert("Please upload Mp3 / M4A / Mp4 / Wav / Aac (≤50MB). ");
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
    if (
      !file ||
      !isDone ||
      submitState === "submitting" ||
      submitState === "submitted"
    )
      return;
    setSubmitState("submitting");
    try {
      await new Promise((r) => setTimeout(r, 900));
      setSubmitState("submitted");
    } catch (e) {
      console.error(e);
      setSubmitState("error");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000]">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px] z-0"
        onClick={() => {
          if (isFileDialogOpen) return;
          onClose();
        }}
      />

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

        <div
          className="absolute cursor-pointer"
          style={{
            left: "15.17%",
            right: "21.75%",
            top: "10.94%",
            bottom: "42%",
            background: "#FFFFFF",
            border: "6.23035px dashed #CBD0DC",
            borderRadius: "40.4973px",
          }}
          onClick={openPicker}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handlePick(e.dataTransfer.files);
          }}
        >
          <div className="w-full h-full flex flex-col items-center justify-center gap-6">
            <svg
              viewBox="0 0 24 24"
              className="w-12 h-12 text-zinc-700"
              fill="currentColor"
            >
              <path d="M19 18H6a4 4 0 1 1 0-8a5 5 0 0 1 9-2a4 4 0 0 1 4 5h0a3 3 0 0 1 0 5" />
            </svg>
            <p className="w-[432px] max-w-full text-center text-[26px] leading-[31px] font-medium text-[#292D32]">
              Choose a file or drag & drop it here
            </p>
            <p className="w-[383px] max-w-full text-center text-[20px] leading-[24px] font-medium text-[#A9ACB4]">
              Mp3, M4A, MP4, WAV, AAC formats, up to 50MB
            </p>
            <button
              className="px-6 py-2 rounded-xl border-2 border-[#CBD0DC] bg-white text-[16px] leading-[20px] font-medium text-[#54575C] hover:bg-zinc-50"
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
              accept=".mp3,.m4a,.mp4,.wav,.aac,audio/*,video/mp4"
              className="hidden"
              onChange={(e) => handlePick(e.target.files)}
            />
          </div>
        </div>

        {file && (
          <div
            className="absolute left-[3.98%] right-[3.98%] rounded-[40.5px] bg-[#EEF1F7] px-6 py-5"
            style={{ top: "66%", bottom: "10%" }}
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-white/80 flex items-center justify-center text-zinc-600">
                {file.name.split(".").pop()?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[24px] leading-[29px] font-medium text-[#292D32] truncate">
                  {file.name}
                </div>
                <div className="mt-2 flex items-center gap-4 text-[16px] text-[#A9ACB4]">
                  <span>
                    {formatSize((Math.min(progress, 100) / 100) * file.size)} of{" "}
                    {formatSize(file.size)} •{" "}
                    {progress >= 100 ? "Complete ✓" : "Uploading..."}
                  </span>
                </div>
                <div className="mt-3 h-[10px] w-full rounded-full bg-white/80">
                  <div
                    className={`h-full rounded-full transition-all ${
                      progress >= 100 ? "bg-green-500" : "bg-[#375EF9]"
                    }`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              </div>
              <div className="ml-2 flex items-center gap-2">
                {progress >= 100 && (
                  <button
                    onClick={handleConfirmSubmit}
                    className="px-4 py-2 rounded-full text-white text-sm font-medium transition-all bg-blue-600 hover:bg-blue-700"
                    title="Confirm submit this file"
                  >
                    Confirm Submit
                  </button>
                )}
                <button
                  onClick={() => {
                    setFile(null);
                    setProgress(0);
                    setSubmitState("idle");
                  }}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-zinc-600 hover:bg-white"
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

/** ====== 实时字幕面板 ====== */
function TranscriptPanel({
  partial,
  finals,
  wsState,
}: {
  partial: string;
  finals: string[];
  wsState: WSState;
}) {
  return (
    <div className="fixed left-10 bottom-24 z-[12] w-[720px] max-h-[40vh] overflow-auto p-4 rounded-2xl bg-black/45 text-white backdrop-blur">
      <div className="text-xs uppercase tracking-widest opacity-70">
        Live transcript ({wsState})
      </div>
      <div className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-[15px]">
        {finals.join(" ")}
        {partial && <span className="opacity-70"> {partial}</span>}
      </div>
    </div>
  );
}

/** ====== 页面 ====== */
export default function DashboardPage() {
  const sp = useSearchParams();
  const [openUpload, setOpenUpload] = useState(false);

  // --- ASR state ---
  const [recording, setRecording] = useState(false);
  const [wsState, setWsState] = useState<WSState>("idle");
  const [partial, setPartial] = useState("");
  const [finals, setFinals] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // refs for cleanup
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (sp.get("open") === "upload") setOpenUpload(true);
  }, [sp]);

  // --- start / stop recording ---
  const startRecording = useCallback(async () => {
    setErrorMsg(null);
    setFinals([]);
    setPartial("");
    setWsState("connecting");

    // 1) Ask for mic (must be over HTTPS or localhost)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 2) Create 16 kHz AudioContext so we don't need to resample in JS
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(
      { sampleRate: 16000 }
    );
    await ctx.audioWorklet.addModule("/worklets/pcm16-frames.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm16-frames", {
      processorOptions: { frameSize: 320 },
    });

    // 3) WebSocket to Python ASR server
    const url = wsURL();
    const ws = new WebSocket(url);

    ws.onopen = () => setWsState("open");
    ws.onclose = () => setWsState("closed");
    ws.onerror = (e) => {
      setWsState("error");
      setErrorMsg("WebSocket error. Check ASR server & URL.");
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.partial) setPartial(data.partial);
        if (data.final) {
          setFinals((prev) => [...prev, data.final]);
          setPartial("");
        }
      } catch (err) {
        // ignore non-JSON
      }
    };

    // 4) Pipe frames from worklet -> WS
    node.port.onmessage = (ev) => {
      const ab = ev.data; // ArrayBuffer (Int16 frame)
      if (ws.readyState === WebSocket.OPEN) ws.send(ab);
    };

    source.connect(node);
    // No need to connect node to destination (it produces no output)

    // Keep refs for cleanup
    mediaRef.current = stream;
    audioCtxRef.current = ctx;
    workletRef.current = node;
    wsRef.current = ws;
    setRecording(true);
  }, []);

  const stopRecording = useCallback(async () => {
    setRecording(false);
    try {
      wsRef.current?.close();
    } catch {}
    try {
      workletRef.current?.disconnect();
    } catch {}
    try {
      mediaRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    try {
      await audioCtxRef.current?.close();
    } catch {}
    wsRef.current = null;
    workletRef.current = null;
    mediaRef.current = null;
    audioCtxRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recording) stopRecording();
    };
  }, [recording, stopRecording]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <main className="absolute left-0 right-0 top-[140px] h-[879px] flex flex-col items-center gap-[95px] px-6 z-10">
        <h1
          className="w-full text-center text-[90px] leading-[106px] font-extrabold bg-gradient-to-b from-[#EB562C] to-white bg-clip-text text-transparent drop-shadow-[0_4px_4px_#A43718]"
          style={{ fontFamily: '"Abhaya Libre", serif' }}
        >
          Ready to start?
        </h1>

        <div className="flex flex-col items-center gap-14">
          {/* Record */}
          <button
            className={`w-[359px] h-[73px] rounded-[250px] cursor-pointer text-white text-[35px] leading-[41px] font-medium shadow-[0_4px_25px_#FF3D00] [background:linear-gradient(0deg,rgba(0,0,0,0.4),rgba(0,0,0,0.4)),rgba(255,61,0,0.9)] transition-colors ${
              recording
                ? "animate-pulse"
                : "hover:!bg-[#9e2c18] hover:shadow-[0_4px_20px_rgba(158,44,24,0.7)]"
            }`}
            style={{ fontFamily: '"Roboto", sans-serif' }}
            onClick={() => (recording ? stopRecording() : startRecording())}
            title={recording ? "Stop recording" : "Start recording"}
          >
            {recording ? "Stop" : "Record"}
          </button>

          {/* Upload */}
          <button
            className="w-[359px] h-[73px] rounded-[250px] cursor-pointer text-white text-[35px] leading-[41px] font-medium shadow-[0_4px_25px_#FF3D00] [background:linear-gradient(0deg,rgba(0,0,0,0.4),rgba(0,0,0,0.4)),rgba(255,61,0,0.9)] hover:!bg-[#9e2c18] hover:shadow-[0_4px_20px_rgba(158,44,24,0.7)] transition-colors"
            style={{ fontFamily: '"Roboto", sans-serif' }}
            onClick={() => setOpenUpload(true)}
          >
            Upload Audio
          </button>

          {errorMsg && <div className="text-red-600 text-sm">{errorMsg}</div>}
        </div>
      </main>

      <div
        className="fixed right-10 bottom-24 z-[9] w-[450px] text-right font-bold text-[34px] leading-[46px] text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)] select-none"
        style={{ fontFamily: '"Cinzel Decorative", serif' }}
      >
        Welcome back,
        <br />
        Team TAM！
      </div>

      {/* Live transcript overlay */}
      {recording || finals.length || partial ? (
        <TranscriptPanel partial={partial} finals={finals} wsState={wsState} />
      ) : null}

      {openUpload && <UploadModal onClose={() => setOpenUpload(false)} />}
    </div>
  );
}
