// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "no file" }, { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const name = (file.name || "").toLowerCase();

    let text = "";

    // ========= 文本类 =========
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

      // ========= 音频类 (mp3, wav, m4a, aac) =========
    } else if (
      name.endsWith(".mp3") ||
      name.endsWith(".wav") ||
      name.endsWith(".m4a") ||
      name.endsWith(".aac")
    ) {
      // 转发到 /api/transcribe
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

      const resp = await fetch(`${baseUrl}/api/transcribe`, {
        method: "POST",
        body: form, // 原始 FormData 直接转发
      });

      if (!resp.ok) {
        return NextResponse.json(
          { error: "transcribe failed" },
          { status: 500 }
        );
      }

      const data = await resp.json();
      text = data.text || "";

      // ========= 不支持的类型 =========
    } else {
      return NextResponse.json(
        { error: "unsupported file type" },
        { status: 415 }
      );
    }

    // ========= 自动调用 /api/analyze =========
    if (text.trim()) {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

      const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          source: "upload",
          title: file.name || "Untitled Upload",
        }),
      });

      if (!analyzeRes.ok) {
        return NextResponse.json({ error: "analyze failed" }, { status: 500 });
      }

      const analyzeData = await analyzeRes.json();

      return NextResponse.json({ ...analyzeData, text });
    }

    return NextResponse.json({ error: "no text extracted" }, { status: 400 });
  } catch (e: any) {
    console.error("UPLOAD_ERROR", e);
    return NextResponse.json(
      { error: e?.message ?? "upload failed" },
      { status: 500 }
    );
  }
}
