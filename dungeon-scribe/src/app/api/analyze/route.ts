import { NextResponse } from "next/server";
import { analyzeText, type AnalyzeArgs } from "@/lib/analyze";

// Use Node.js runtime for compatibility with Prisma and server-side libraries.
// (Edge runtime does not support native Node APIs used by Prisma.)
export const runtime = "nodejs";

/**
 * API Route: POST /api/analyze
 * -------------------------------------------------------------
 * Accepts raw or preprocessed session text and performs analysis
 * via `analyzeText()` — including campaign lookup, LLM summary
 * generation, character extraction, and database persistence.
 *
 */
export async function POST(req: Request) {
  try {
    // Parse and type-cast incoming JSON request body
    const body = (await req.json()) as AnalyzeArgs;

    // Delegate analysis to shared library function
    const out = await analyzeText(body);

    // Return successful JSON response to client
    return NextResponse.json(out);
  } catch (err: any) {
    // Log concise message to server logs for debugging
    console.error("POST /api/analyze error:", err?.message || err);

    // Respond with generic message to avoid leaking internal details
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
