// app/api/characters/upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { SummaryType } from "@prisma/client";
import { extractCharactersFromSession, type CharacterCard } from "@/lib/llm";

export const runtime = "nodejs";

type Body = { campaignId: string; text: string };

// ---------------- helpers ----------------
function uniq<T>(arr: T[] | undefined): T[] {
    return Array.from(
        new Set((arr ?? []).map((x) => (typeof x === "string" ? (x as string).trim() : x)))
    ).filter((x) => (typeof x === "string" ? (x as string).length > 0 : true)) as T[];
}

function mergeCard(existing: CharacterCard, incoming: CharacterCard): CharacterCard {
    return {
        name: incoming.name || existing.name,
        role: incoming.role || existing.role,
        affiliation: incoming.affiliation || existing.affiliation,
        lastLocation: incoming.lastLocation || existing.lastLocation,
        status: incoming.status || existing.status,
        traits: uniq([...(existing.traits ?? []), ...(incoming.traits ?? [])]),
        goals: uniq([...(existing.goals ?? []), ...(incoming.goals ?? [])]),
        notes: incoming.notes || existing.notes,
    };
}

function cardToContent(c: CharacterCard): string {
    const lines: string[] = [];
    if (c.role) lines.push(`• Role: ${c.role}`);
    if (c.affiliation) lines.push(`• Affiliation: ${c.affiliation}`);
    if (c.traits?.length) lines.push(`• Traits: ${c.traits.join(", ")}`);
    if (c.goals?.length) lines.push(`• Goals: ${c.goals.join("; ")}`);
    if (c.lastLocation) lines.push(`• Last location: ${c.lastLocation}`);
    if (c.status) lines.push(`• Status: ${c.status}`);
    if (c.notes) lines.push(`• Notes: ${c.notes}`);
    return lines.join("\n") || `• ${c.name}`;
}

function parseContentToCard(name: string, content: string | null | undefined): CharacterCard {
    const get = (re: RegExp) => content?.match(re)?.[1]?.trim();
    const list = (re: RegExp, sep: RegExp) =>
        get(re)?.split(sep).map((s) => s.trim()).filter(Boolean) ?? [];
    return {
        name,
        role: get(/Role:\s*(.+)/i),
        affiliation: get(/Affiliation:\s*(.+)/i),
        traits: list(/Traits:\s*(.+)/i, /\s*,\s*/),
        goals: list(/Goals:\s*(.+)/i, /\s*;\s*/),
        lastLocation: get(/Last location:\s*(.+)/i),
        status: get(/Status:\s*(.+)/i),
        notes: get(/Notes:\s*(.+)/i),
    };
}

function coalesceByName(cards: CharacterCard[]): CharacterCard[] {
    const byKey = new Map<string, CharacterCard>();
    for (const c of cards) {
        const name = (c.name || "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const prev = byKey.get(key);
        byKey.set(
        key,
        prev
            ? mergeCard({ ...prev, name: prev.name || name }, { ...c, name: prev.name || name })
            : { ...c, name }
        );
    }
    return Array.from(byKey.values());
}

// ---------------- route ----------------
export async function POST(req: Request) {
    try {
        const body = (await req.json()) as Body;
        const campaignId = body.campaignId?.trim();
        const text = (body.text ?? "").trim();
        if (!campaignId || !text) {
        return NextResponse.json({ error: "campaignId and text required" }, { status: 400 });
        }

        const extracted = await extractCharactersFromSession(text);
        if (!extracted?.length) return NextResponse.json({ upserts: [] });

        const found = coalesceByName(extracted);
        const names = found.map((c) => c.name).filter(Boolean);
        if (!names.length) return NextResponse.json({ upserts: [] });

        const existing = await prisma.summary.findMany({
        where: { campaignId, type: SummaryType.character, roleName: { in: names } },
        select: { id: true, roleName: true, content: true },
        });

        const byName = new Map<string, (typeof existing)[number]>();
        for (const row of existing) {
        if (!row.roleName) continue; // guard nullable roleName
        byName.set(row.roleName, row);
        }

        // IMPORTANT: type as array of Prisma promises (NOT the interactive tx overload)
        const ops: Prisma.PrismaPromise<{ id: string; roleName: string | null }>[] = [];

        for (const inc of found) {
        const name = inc.name.trim();
        if (!name) continue;

        const had = byName.get(name);
        const merged = had ? mergeCard(parseContentToCard(name, had.content), inc) : inc;
        const content = cardToContent(merged);

        if (had) {
            ops.push(
            prisma.summary.update({
                where: { id: had.id },
                data: { content },
                select: { id: true, roleName: true },
            })
            );
        } else {
            ops.push(
            prisma.summary.create({
                data: { type: SummaryType.character, campaignId, roleName: name, content },
                select: { id: true, roleName: true },
            })
            );
        }
        }

        if (!ops.length) return NextResponse.json({ upserts: [] });

        const rows = await prisma.$transaction(ops);

        // touch campaign update time
        await prisma.campaign.update({
        where: { id: campaignId },
        data: { updateDate: new Date() },
        select: { id: true },
        });

        const upserts = rows.map((r: { id: any; roleName: any; }) => ({ id: r.id, name: (r.roleName ?? "") || "" }));
        return NextResponse.json({ upserts });
    } catch (err: any) {
        console.error("POST /api/characters/upsert error:", err?.message || err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
