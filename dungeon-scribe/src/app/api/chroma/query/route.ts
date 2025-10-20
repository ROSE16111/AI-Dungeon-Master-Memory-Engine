import { NextResponse } from "next/server";

// Default backend endpoint; points to the local FastAPI RAG service unless overridden.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

/**
 * POST /api/query
 *
 * Proxies search queries from the Next.js frontend to the FastAPI backend.
 * The backend performs vector similarity search using the Chroma database
 * and returns the most relevant stored transcript chunks.
 *
 * Expected request body:
 * {
 *   query: string;          // Search text or question
 *   top_k?: number;         // Number of nearest results to return (default handled by backend)
 *   where?: Record<string, any>;  // Optional metadata filter (e.g., { type: "raw" })
 * }
 *
 * Returns the backend’s JSON response containing retrieved documents and metadata.
 */
export async function POST(req: Request) {
    // Parse incoming JSON body
    const payload = await req.json(); // { query, top_k?, where? }

    try {
        // Forward the request to the FastAPI /query endpoint
        const res = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        });

        // Handle backend response errors
        if (!res.ok) {
        const msg = await res.text().catch(() => "");
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
        }

        // Pass through backend JSON response to the client
        const data = await res.json();
        return NextResponse.json(data);
    } catch (err: any) {
        // Catch and return network or connection errors
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
