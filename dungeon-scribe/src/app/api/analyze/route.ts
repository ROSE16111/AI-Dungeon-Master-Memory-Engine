import { NextResponse } from "next/server";
import { analyzeSession } from "@/lib/analyzeSession";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, title, source } = body || {};
    if (!text?.trim()) return NextResponse.json({ error: "Empty text" }, { status: 400 });

    const payload = await analyzeSession({ text, title, source });
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("POST /api/analyze error:", err?.message || err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
