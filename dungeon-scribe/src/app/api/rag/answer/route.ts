import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node (not Edge) so localhost fetch works

export async function POST(req: Request) {
    const { question, top_k = 5, where } = await req.json();

    const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
    const url = `${BACKEND_URL.replace(/\/$/, "")}/answer`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // match your FastAPI schema keys: question, top_k, where
        body: JSON.stringify({ question, top_k, where }),
    });

    // Pass through JSON + status
    const data = await res.json().catch(() => ({ detail: "Backend error" }));
    return NextResponse.json(data, { status: res.status });
}
