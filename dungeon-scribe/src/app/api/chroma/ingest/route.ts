import { NextResponse } from "next/server";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

export async function POST(req: Request) {
    const payload = await req.json(); // { id_prefix, text, metadata? }
    try {
        const res = await fetch(`${API_URL.replace(/\/$/, "")}/ingest_transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({ detail: "Backend error" }));
        return NextResponse.json(data, { status: res.status });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
}
