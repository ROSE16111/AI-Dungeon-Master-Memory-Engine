"use client";

import { useState } from "react";
import { ragAnswer } from "@/lib/ragClient";

type Msg = { role: "user" | "assistant"; content: string };

export default function RagChatPage() {
    const [q, setQ] = useState("");
    const [log, setLog] = useState<Msg[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function ask(e: React.FormEvent) {
        e.preventDefault();
        if (!q.trim() || busy) return;
        setBusy(true);
        setError(null);

        const question = q.trim();
        setLog((L) => [...L, { role: "user", content: question }]);
        setQ("");

        try {
        const { answer, used } = await ragAnswer({
            question,
            topK: 5,
            where: { type: "summary" }, // match your metadata from ingest
        });

        const cited = used?.length
            ? `\n\n— sources: ${used.map(u => u.id).join(", ")}`
            : "";

        setLog((L) => [...L, { role: "assistant", content: (answer || "[no answer]").trim() + cited }]);
        } catch (e: any) {
        setError(e?.message ?? "RAG failed");
        } finally {
        setBusy(false);
        }
    }

    return (
        <div style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>

        <div style={{ margin: "16px 0", padding: 12, background: "#f7f7f9", borderRadius: 8 }}>
            {log.length === 0 && <p>Ask something like: <i>“What did we discover behind the tapestry?”</i></p>}
            {log.map((m, i) => (
            <div key={i} style={{ margin: "8px 0" }}>
                <b>{m.role === "user" ? "You" : "Assistant"}:</b> {m.content}
            </div>
            ))}
        </div>

        <form onSubmit={ask} style={{ display: "flex", gap: 8 }}>
            <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type your question…"
            style={{ flex: 1, padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
            />
            <button disabled={busy} style={{ padding: "10px 16px" }}>
            {busy ? "Thinking…" : "Ask"}
            </button>
        </form>

        {error && <p style={{ color: "crimson", marginTop: 8 }}>Error: {error}</p>}
        </div>
    );
}
