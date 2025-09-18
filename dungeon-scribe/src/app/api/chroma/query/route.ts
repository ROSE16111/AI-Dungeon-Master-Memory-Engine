import { NextResponse } from "next/server";

const CHROMA_URL = process.env.CHROMA_URL ?? "http://127.0.0.1:8000";

export async function POST(req: Request) {
  const payload = await req.json(); // { query, top_k?, where? }

    const res = await fetch(`${CHROMA_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const msg = await res.text().catch(() => "");
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(data);
}
