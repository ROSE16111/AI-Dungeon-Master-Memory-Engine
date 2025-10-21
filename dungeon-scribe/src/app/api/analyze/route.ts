// app/api/analyze/route.ts
import { NextResponse } from "next/server";
import { analyzeText, type AnalyzeArgs } from "@/lib/analyze";

export const runtime = "nodejs"; // unchanged

/**
 * POST /api/analyze
 *
 * CHANGED: Now a thin wrapper that delegates to analyzeText().
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeArgs; // CHANGED: typed body
    const out = await analyzeText(body);            // CHANGED: call shared logic
    return NextResponse.json(out);                  // unchanged pattern
  } catch (err: any) {
    console.error("POST /api/analyze error:", err?.message || err); // unchanged
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 }); // unchanged
  }
}
