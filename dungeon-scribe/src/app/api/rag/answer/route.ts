// app/api/rag/answer/route.ts
import { NextResponse } from "next/server";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "phi3:medium";
const CHROMA_URL = process.env.CHROMA_URL ?? "http://127.0.0.1:8000";

const SYSTEM_PROMPT = `
You are a helpful assistant. Answer the user's question using the provided CONTEXT.
If the answer is not in the context, say you don't know briefly. Be concise.
`;

type QueryResult = {
    id: string;
    text: string;
    metadata: Record<string, unknown>;
    distance: number | null;
};

export async function POST(req: Request) {
    const { question, topK = 5, where } = await req.json();

    // 1) Query Chroma directly (no relative URL)
    const qRes = await fetch(`${CHROMA_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question, top_k: topK, where }),
        cache: "no-store",
    });
    if (!qRes.ok) {
        const msg = await qRes.text().catch(() => "");
        return NextResponse.json({ ok: false, error: `Chroma query failed: ${msg}` }, { status: 500 });
    }
    const { results } = (await qRes.json()) as { results: QueryResult[] };

    const contextBlock =
        results?.length
        ? results.map((r, i) => `[#${i + 1} • id=${r.id}]\n${r.text}`).join("\n\n")
        : "(no context found)";

    // 2) Ask Ollama
    const chatRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
            { role: "system", content: SYSTEM_PROMPT.trim() },
            {
            role: "user",
            content:
                `CONTEXT:\n${contextBlock}\n\nQUESTION: ${question}\n\n` +
                `When useful, cite snippets like [#1], [#2] from the context.`,
            },
        ],
        options: { temperature: 0.2, num_ctx: 4096 },
        }),
    });
    if (!chatRes.ok) {
        const msg = await chatRes.text().catch(() => "");
        return NextResponse.json({ ok: false, error: `Ollama failed: ${msg}` }, { status: 500 });
    }

    const data = await chatRes.json();
    const answer: string = data?.message?.content ?? "";

    return NextResponse.json({
        ok: true,
        answer,
        used: results?.map((r, i) => ({ i: i + 1, id: r.id, meta: r.metadata })) ?? [],
    });
}
