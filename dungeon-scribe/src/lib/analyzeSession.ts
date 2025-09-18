// lib/analyzeSession.ts
import { prisma } from "@/lib/prisma";
import { SummaryType } from "@prisma/client";
import { summarizeDnDSession } from "@/lib/llm";

export type AnalyzeBody = {
    title?: string;
    text: string;
    source?: "live" | "upload";
};

// simple fallback so we never 500 just because LLM hiccups
function fallbackBullets(text: string) {
    return text
        .split(/\n+/)
        .filter(Boolean)
        .slice(0, 8)
        .map(l => (l.length > 200 ? l.slice(0, 200) + "…" : l))
        .map(l => (l.startsWith("•") ? l : `• ${l}`))
        .join("\n");
    }

    async function safeSummarize(text: string) {
    try {
        const out = await summarizeDnDSession(text);
        const s = (out ?? "").trim();
        return s || fallbackBullets(text);
    } catch (e) {
        console.error("summarizeDnDSession failed:", e);
        return fallbackBullets(text);
    }
    }

    export async function analyzeSession({ title, text, source = "live" }: AnalyzeBody) {
    const cleanText = (text ?? "").trim();
    if (!cleanText) throw new Error("Empty text");

    const campaignTitle = (title || "Untitled Campaign").trim();

    let campaign = await prisma.campaign.findFirst({ where: { title: campaignTitle } });
    if (!campaign) {
        campaign = await prisma.campaign.create({ data: { title: campaignTitle } });
    }

    const allTxt = await prisma.allTxt.create({
        data: { content: cleanText, campaignId: campaign.id },
    });

    const content = await safeSummarize(cleanText);

    const summary = await prisma.summary.create({
        data: { type: SummaryType.session, content, campaignId: campaign.id },
    });

    return {
        campaignId: campaign.id,
        allTxtId: allTxt.id,
        summaryId: summary.id,
        title: campaignTitle,
        source,
        summary: content,
    };
}
