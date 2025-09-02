// src/app/(all)/dashboard/page.tsx
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

/** ====== 上传弹窗（居中 & 幽灵点击修复） ====== */
function UploadModal({ onClose }: { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);

  // 提交状态：idle -> submitting -> submitted / error
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

  /** 文件选择 & 校验（方案B） */
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

  /** 模拟上传进度 */
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

  /** 点击确认提交（这里演示模拟提交，你可以替换为真实 API 调用） */
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
      // TODO: 如需真实提交，改为你的接口：
      // const fd = new FormData(); fd.append('file', file);
      // const res = await fetch('/api/submit', { method: 'POST', body: fd });
      // if (!res.ok) throw new Error('submit failed');

      // 模拟提交耗时
      await new Promise((r) => setTimeout(r, 900));
      setSubmitState("submitted");
    } catch (e) {
      console.error(e);
      setSubmitState("error");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000]">
      {/* 遮罩：忽略文件选择器回流点击 */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px] z-0"
        onClick={() => {
          if (isFileDialogOpen) return;
          onClose();
        }}
      />

      {/* 面板：居中 */}
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
        {/* 关闭 */}
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
            left: "15.17%",
            right: "21.75%",
            top: "10.94%",
            bottom: "42%", // 内部更均衡
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
              className="px-6 py-2 rounded-xl border-2 border-[#CBD0DC] bg-white 
                         text-[16px] leading-[20px] font-medium text-[#54575C] 
                         hover:bg-zinc-50"
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

        {/* 文件信息 + 进度条 + 确认提交 */}
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
                    {formatSize(doneBytes)} of {formatSize(file.size)} •{" "}
                    {isDone
                      ? submitState === "submitted"
                        ? "Submitted ✓"
                        : submitState === "submitting"
                        ? "Submitting..."
                        : "Complete ✓"
                      : "Uploading..."}
                  </span>
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
                {/* 确认提交按钮：仅在上传完成后显示 */}
                {isDone && (
                  <button
                    onClick={handleConfirmSubmit}
                    disabled={
                      submitState === "submitting" ||
                      submitState === "submitted"
                    }
                    className={`px-4 py-2 rounded-full text-white text-sm font-medium transition-all
                                ${
                                  submitState === "submitted"
                                    ? "bg-green-600 cursor-default"
                                    : submitState === "submitting"
                                    ? "bg-zinc-400 cursor-wait"
                                    : "bg-blue-600 hover:bg-blue-700"
                                }`}
                    title="Confirm submit this file"
                  >
                    {submitState === "submitted"
                      ? "Submitted ✓"
                      : submitState === "submitting"
                      ? "Submitting..."
                      : "Confirm Submit"}
                  </button>
                )}

                {/* 删除按钮 */}
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

/** ====== 页面 ====== */
export default function DashboardPage() {
  const sp = useSearchParams();
  const [openUpload, setOpenUpload] = useState(false);

  useEffect(() => {
    if (sp.get("open") === "upload") setOpenUpload(true);
  }, [sp]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <main
        className="absolute left-0 right-0 top-[140px] h-[879px]
                   flex flex-col items-center gap-[95px] px-6 z-10"
      >
        <h1
          className="w-full text-center text-[90px] leading-[106px] font-extrabold
                     bg-gradient-to-b from-[#EB562C] to-white bg-clip-text text-transparent
                     drop-shadow-[0_4px_4px_#A43718]"
          style={{ fontFamily: '"Abhaya Libre", serif' }}
        >
          Ready to start?
        </h1>

        <div className="flex flex-col items-center gap-14">
          {/* Record */}
          <button
            className="w-[359px] h-[73px] rounded-[250px] cursor-pointer
                       text-white text-[35px] leading-[41px] font-medium
                       shadow-[0_4px_25px_#FF3D00]
                       [background:linear-gradient(0deg,rgba(0,0,0,0.4),rgba(0,0,0,0.4)),rgba(255,61,0,0.9)]
                       hover:!bg-[#9e2c18] hover:shadow-[0_4px_20px_rgba(158,44,24,0.7)]
                       transition-colors"
            style={{ fontFamily: '"Roboto", sans-serif' }}
            onClick={() => console.log("Record clicked")}
          >
            Record
          </button>

          {/* Upload */}
          <button
            className="w-[359px] h-[73px] rounded-[250px] cursor-pointer
                       text-white text-[35px] leading-[41px] font-medium
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
