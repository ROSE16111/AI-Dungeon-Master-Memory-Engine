// app/api/chat-turn/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runOrchestrator } from "@/lib/chat/orchestrator";
import { composeAnswer } from "@/lib/chat/composer";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const { campaignId, text } = await req.json();
        if (!campaignId || !text) {
        return NextResponse.json({ ok: false, error: "campaignId and text required" }, { status: 400 });
        }

        const result = await runOrchestrator({ prisma, campaignId, text });
        const { text: reply } = composeAnswer(result);

        return NextResponse.json({
        ok: true,
        kind: result.kind,
        text: reply,
        result, // keep the structured payload for rich UI if you want
        });
    } catch (e: any) {
        console.error("chat-turn error:", e?.message || e);
        return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
    }
}
