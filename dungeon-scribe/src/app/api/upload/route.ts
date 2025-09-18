// app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { analyzeSession } from "@/lib/analyzeSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ------- Config -------
const DEFAULT_TRANSCRIBE_CAP_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS ?? 600_000); // 10 min cap
const DEFAULT_TRANSCRIBE_RTF = Number(process.env.TRANSCRIBE_RTF ?? 4); // expected real-time factor
const MIN_TRANSCRIBE_TIMEOUT_MS = 120_000; // 2 min floor

// ------- Helpers -------
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms = 15000
) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function extOf(name?: string) {
  return (name || "").toLowerCase().split(".").pop() || "";
}

function isAudioExt(ext: string) {
  return ext === "mp3" || ext === "wav" || ext === "m4a" || ext === "aac";
}

function isTextExt(ext: string) {
  return ext === "txt";
}

function isDocxExt(ext: string) {
  return ext === "docx";
}

function isPdfExt(ext: string) {
  return ext === "pdf";
}

async function deriveAudioTimeout(
  fileBuffer: Buffer,
  mime: string,
  capMs: number
): Promise<number> {
  // Try to read duration; if it fails, fall back to the cap.
    return capMs;
}

// ------- Route -------
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }

    const origin = req.nextUrl?.origin ?? new URL(req.url).origin;
    const name = file.name || "upload";
    const mime = (file.type || "").toLowerCase();
    const ext = extOf(name);

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    let text = "";

    // -------- Text family --------
    if (isTextExt(ext)) {
      text = buffer.toString("utf8");

    } else if (isDocxExt(ext)) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      text = value || "";

    } else if (isPdfExt(ext)) {
      const pdfParse = (await import("pdf-parse")).default;
      const out = await pdfParse(buffer);
      text = out.text || "";

    // -------- Audio family --------
    } else if (isAudioExt(ext) || mime.startsWith("audio/") || mime === "video/mp4") {
      const perReqTimeout = await deriveAudioTimeout(buffer, mime, DEFAULT_TRANSCRIBE_CAP_MS);

      // Forward original form to /api/transcribe (may hit Whisper / local STT)
      const resp = await fetchWithTimeout(new URL("/api/transcribe", origin), {
        method: "POST",
        body: form,
      }, perReqTimeout);

      if (!resp.ok) {
        const msg = await resp.text().catch(() => "");
        return NextResponse.json({ error: `transcribe failed: ${msg}` }, { status: 500 });
      }
      const data = await resp.json();
      text = (data?.text ?? "").trim();

    } else {
      return NextResponse.json({ error: `unsupported file type: .${ext || "unknown"}` }, { status: 415 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "no text extracted" }, { status: 400 });
    }

    // -------- Analyze in-process (no nested HTTP; avoids headers timeout) --------
    const payload = await analyzeSession({
      text,
      source: "upload",
      // you can strip extension if you prefer: name.replace(/\.[^/.]+$/, "")
      title: name,
    });

    // Include raw text for your UI context panel
    return NextResponse.json({ ...payload, text });
  } catch (e: any) {
    console.error("UPLOAD_ERROR", e);
    const msg =
      e?.name === "AbortError"
        ? "upstream timeout"
        : e?.message ?? "upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
