import { NextResponse } from "next/server";

export const runtime = "nodejs"; // Run on Node.js runtime to allow localhost fetch requests

/**
 * POST /api/answer
 *
 * Proxies a question request from the Next.js frontend to the local FastAPI backend.
 * The backend performs retrieval-augmented generation (RAG) to produce a concise answer.
 *
 * Request body should include:
 * - question: The text query to be answered.
 * - top_k: Number of top-matching documents to retrieve (default: 5).
 * - where: Optional metadata filter for retrieval.
 *
 * Returns the backend’s JSON response and preserves its HTTP status.
 */
export async function POST(req: Request) {
    // Parse input JSON
    const { question, top_k = 5, where } = await req.json();

    // Construct backend endpoint URL (default to local FastAPI service)
    const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
    const url = `${BACKEND_URL.replace(/\/$/, "")}/answer`;

    // Forward the request to the FastAPI RAG endpoint
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Match FastAPI’s expected schema: { question, top_k, where }
        body: JSON.stringify({ question, top_k, where }),
    });

    // Pass through backend response (content and status) to the client
    const data = await res.json().catch(() => ({ detail: "Backend error" }));
    return NextResponse.json(data, { status: res.status });
}
