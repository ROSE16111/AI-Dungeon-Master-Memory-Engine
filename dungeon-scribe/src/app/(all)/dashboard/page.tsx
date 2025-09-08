"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranscript } from "../../context/TranscriptContext";

/** ====== 工具：人类可读的文件大小 ====== */
function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/** ====== 计算后端 WS 地址（支持环境变量） ====== */
function wsURL() {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ASR_WS) {
    return process.env.NEXT_PUBLIC_ASR_WS!;
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname;
    return `${proto}://${host}:5000/audio`;
  }
  return "ws://localhost:5000/audio";
}

/** ====== 上传弹窗 ====== */
function UploadModal({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "submitted" | "error"
  >("idle");

  // 👇 新增：写入全局转写 & 跳转用
  const { setTranscript } = useTranscript(); // import { useTranscript } from "../../context/TranscriptContext";
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
    const allowedExt = new Set(["mp3", "m4a", "mp4", "wav", "aac"]);
    const isAllowedByExt = allowedExt.has(ext);
    const isAllowedByMime = mime.startsWith("audio/") || mime === "video/mp4";

    if (!(isAllowedByExt || isAllowedByMime)) {
      alert("Please upload Mp3 / M4A / Mp4 / Wav / Aac (≤50MB).");
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

  // 仅做“进度条动画”演示（不影响真实上传）
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

  // 👇 新增：转写 URL（你可以直接改到 Python 的 HTTP 地址）
  const TRANSCRIBE_URL =
    process.env.NEXT_PUBLIC_TRANSCRIBE_URL || "/api/transcribe";

  // 👇 修改：提交=发文件给后端→写入全局→跳转 record；不影响录音
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
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch(TRANSCRIBE_URL, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
      const data = await res.json(); // 期望 { text: "..." }

      // ✅ 只把转写结果写入全局，不创建任何录音会话
      const text = typeof data?.text === "string" ? data.text : "";
      setTranscript(text);

      // ✅ 跳转到 /dashboard/record，Record 页会显示 transcript
      router.push("/dashboard/record");

      setSubmitState("submitted");
    } catch (e) {
      console.error(e);
      setSubmitState("error");
      alert("Upload succeeded but transcribe failed. See console.");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000]">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px] z-0"
        onClick={() => {
          if (isFileDialogOpen) return;
          onClose();
        }}
      />

      {/* 面板 */}
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

        {/* 拖拽/点击选择框 */}
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
              accept=".mp3,.m4a,.mp4,.wav,.aac,audio/*,video/mp4"
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

/** ====== Record -> WS -> 写入转写 -> /dashboard/record ====== */
export default function DashboardPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const { setTranscript } = useTranscript();

  const [openUpload, setOpenUpload] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (sp.get("open") === "upload") setOpenUpload(true);
  }, [sp]);

  const startRecording = useCallback(async () => {
    if (starting) return;
    setStarting(true);

    try {
      // 1) 申请麦克风
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2) 16kHz AudioContext + 加载 Worklet（带版本参数避免缓存）
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
        processorOptions: { frameSize: 320 }, // 20ms @ 16kHz
      });

      // 不接到输出，避免回声：只采集不播放
      source.connect(node);

      // 3) WebSocket 连接到后端
      const url = wsURL();
      const ws = new WebSocket(url);

      ws.onopen = () => {
        // 可选：清空旧转写
        setTranscript("");
      };

      // Worklet 帧 -> WS
      node.port.onmessage = (ev) => {
        const ab = ev.data as ArrayBuffer;
        if (ws.readyState === WebSocket.OPEN) ws.send(ab);
      };

      // 后端返回的转写
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string);

          // 你的后端若是 { partial: "..."} 或 { final: "..." }
          if (typeof data.partial === "string" && data.partial.trim() !== "") {
            // 想要“只看最终结果”，可以暂时注释掉这一行
            setTranscript(
              (prev: string) => (prev ? prev + "\n" : "") + data.partial
            );
          }

          if (typeof data.final === "string" && data.final.trim() !== "") {
            setTranscript(
              (prev: string) => (prev ? prev + "\n" : "") + data.final
            );
          }
        } catch {
          // 非 JSON 忽略
        }
      };

      ws.onerror = () => {
        setTranscript((p: string) => (p ? p + "\n" : "") + "[WS error]");
      };
      ws.onclose = () => {
        // 这里不做清理，交给 Record 页处理（或你自己在 Record 页加 Stop 按钮）
      };

      // 4) 跳转到 /dashboard/record
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
        Team TAM！
      </div>

      {openUpload && <UploadModal onClose={() => setOpenUpload(false)} />}
    </div>
  );
}
