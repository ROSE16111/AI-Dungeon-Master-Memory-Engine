// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ANALYZE_TIMEOUT_MS=210000 
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.TRANSCRIBE_TIMEOUT_MS ?? 60_000);

// small helper for fetch timeouts
async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const name = (file.name || "").toLowerCase();

    let text = "";

    // derive same-origin base URL (handles any dev port)
    const origin = req.nextUrl?.origin ?? new URL(req.url).origin;

    // ========= text family =========
    if (name.endsWith(".txt")) {
      text = buffer.toString("utf8");

    } else if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      text = value || "";

    } else if (name.endsWith(".pdf")) {
      const pdfParse = (await import("pdf-parse")).default;
      const out = await pdfParse(buffer);
      text = out.text || "";

      // ========= audio family =========
    } else if (
      name.endsWith(".mp3") ||
      name.endsWith(".wav") ||
      name.endsWith(".m4a") ||
      name.endsWith(".aac")
    ) {
      // forward file to /api/transcribe on same origin
      const resp = await fetchWithTimeout(new URL("/api/transcribe", origin), {
        method: "POST",
        body: form,
      }, TRANSCRIBE_TIMEOUT_MS);

      if (!resp.ok) {
        return NextResponse.json({ error: "transcribe failed" }, { status: 500 });
      }
      const data = await resp.json();
      text = data.text || "";

    } else {
      return NextResponse.json({ error: "unsupported file type" }, { status: 415 });
    }

    // ========= call analyze (same origin) =========
    if (text.trim()) {
    const analyzeRes = await fetchWithTimeout(new URL("/api/analyze", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source: "upload",
        title: file.name || "Untitled Upload",
      }),
    }, ANALYZE_TIMEOUT_MS);

      if (!analyzeRes.ok) {
        return NextResponse.json({ error: "analyze failed" }, { status: 500 });
      }

      const analyzeData = await analyzeRes.json();
      return NextResponse.json({ ...analyzeData, text });
    }

    return NextResponse.json({ error: "no text extracted" }, { status: 400 });
  } catch (e: any) {
    // timeouts & aborts surface here as generic errors
    console.error("UPLOAD_ERROR", e);
    const msg =
      e?.name === "AbortError"
        ? "upstream timeout"
        : e?.message ?? "upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
