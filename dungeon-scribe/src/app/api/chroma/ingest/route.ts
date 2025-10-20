import { NextResponse } from "next/server";

// Default backend endpoint; points to the local FastAPI service unless overridden.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

/**
 * POST /api/chroma/ingest
 *
 * Proxies transcript ingestion requests from the Next.js frontend to the FastAPI backend.
 * The backend splits, embeds, and stores transcript text in the Chroma vector database.
 *
 * Expected request body:
 * {
 *   id_prefix: string;   // Prefix used for generating chunk IDs
 *   text: string;        // Full transcript text to ingest
 *   metadata?: object;   // Optional metadata describing the source
 * }
 *
 * Returns the backend’s JSON response, including the number of chunks ingested.
 */
export async function POST(req: Request) {
    // Parse incoming JSON body
    const payload = await req.json(); // { id_prefix, text, metadata? }

    try {
        // Forward the request to the FastAPI ingestion endpoint
        const res = await fetch(`${API_URL.replace(/\/$/, "")}/ingest_transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        });

        // Relay backend JSON result and status to the client
        const data = await res.json().catch(() => ({ detail: "Backend error" }));
        return NextResponse.json(data, { status: res.status });
    } catch (err: any) {
        // Handle connection or network-level failures
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
