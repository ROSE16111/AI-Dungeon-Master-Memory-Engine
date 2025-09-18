// lib/chat/orchestrator.ts
import type { PrismaClient } from "@prisma/client";
import { composeAnswer, type OrchestratorResult } from "./composer";
import { parseIntent } from "./intent"; // assumes you have parseIntent(text)

type RunArgs = {
    prisma: PrismaClient;
    campaignId: string;
    text: string;
};

export async function runOrchestrator(
    { prisma, campaignId, text }: RunArgs
    ): Promise<OrchestratorResult> {
    const intent: any = parseIntent(text ?? "");

    switch (intent?.kind) {
        case "INVENTORY": {
        const c = await resolveCharacter(prisma, campaignId, intent.character ?? intent.characterName ?? "");
        if (c.kind === "NEEDS_CLARIFICATION") return c;
        if (c.kind === "none") return noCharacterReply(intent.character ?? "");
        const items = await getCurrentInventory(prisma, campaignId, c.id);
        return {
            kind: "INVENTORY",
            character: { id: c.id, name: c.name },
            items: items.map((p) => ({
            name: p.itemName,
            kind: p.itemKind ?? null,
            obtainedAt: p.obtainedAt ?? null,
            sessionNumber: p.obtainedSessionNumber ?? null,
            locationName: p.locationName ?? null,
            note: p.note ?? null,
            })),
        };
        }

        case "STATS": {
        const stat = normalizeStat(intent.stat ?? intent.statType ?? "");
        if (!stat) {
            return {
            kind: "NEEDS_CLARIFICATION",
            reason: "Which stat do you want?",
            options: ["STR","DEX","CON","INT","WIS","CHA"].map((s) => ({ type: "session", label: s })),
            };
        }
        const c = await resolveCharacter(prisma, campaignId, intent.character ?? intent.characterName ?? "");
        if (c.kind === "NEEDS_CLARIFICATION") return c;
        if (c.kind === "none") return noCharacterReply(intent.character ?? "");
        const stats = await getLatestStats(prisma, campaignId, c.id);
        return {
            kind: "STATS",
            character: { id: c.id, name: c.name },
            stats, // already 6 entries with latest values
        };
        }

        case "LOCATION_EVENTS": {
        const loc = await resolveLocation(prisma, campaignId, intent.location ?? intent.locationText ?? "");
        if (loc.kind === "NEEDS_CLARIFICATION") return loc;
        if (loc.kind === "none") {
            return {
            kind: "NEEDS_CLARIFICATION",
            reason: "I couldn't find that location.",
            options: [{ type: "location", label: String(intent.location ?? intent.locationText ?? "") }],
            };
        }
        const limit = clampInt(intent.limit ?? 7, 1, 25);
        const sessionNumber: number | null = toIntOrNull(intent.sessionNumber ?? intent.sessionHint);
        const sessionId = sessionNumber != null
            ? await getSessionIdByNumber(prisma, campaignId, sessionNumber)
            : null;

        const events = await getEventsAtLocation(prisma, campaignId, loc.id, { sessionId, limit });
        return {
            kind: "LOCATION_EVENTS",
            location: { id: loc.id, name: loc.name },
            events: events.map((e) => ({
            id: e.id,
            type: e.type,
            summary: e.summary ?? e.type,
            occurredAt: e.occurredAt.toISOString(),
            sessionNumber: e.sessionNumber ?? null,
            snippet: e.snippet
                ? { text: e.snippet.text, startMs: e.snippet.startMs ?? undefined, endMs: e.snippet.endMs ?? undefined }
                : null,
            })),
        };
        }

        case "SESSION_SUMMARY": {
        const sessionNumber: number | null = toIntOrNull(intent.sessionNumber ?? intent.n ?? intent.which);
        const session = sessionNumber != null
            ? await prisma.session.findFirst({
                where: { campaignId, sessionNumber },
                select: { id: true, sessionNumber: true, date: true, summary: true },
            })
            : await prisma.session.findFirst({
                where: { campaignId },
                orderBy: { date: "desc" },
                select: { id: true, sessionNumber: true, date: true, summary: true },
            });

        if (!session) {
            return {
            kind: "FREEFORM",
            text: "I couldn't find that session.",
            };
        }

        return {
            kind: "SESSION_SUMMARY",
            session: {
            id: session.id,
            sessionNumber: session.sessionNumber,
            date: session.date.toISOString(),
            },
            summaryText: session.summary ?? "(No summary saved yet.)",
        };
        }

        default: {
        // Fallbacks: attempt smart guesses for common short forms like "Elaria INT" or "Items Thalion"
        const guess = await tryCommonShortcuts(prisma, campaignId, text);
        if (guess) return guess;
        return {
            kind: "FREEFORM",
            text:
            "I can help with inventory, stats, location timelines, and session summaries. Try:\n" +
            "• Items Elaria\n" +
            "• Elaria INT\n" +
            "• Events at Mossy Ruins\n" +
            "• S2 summary",
        };
        }
    }
}

/* ------------------------- Helpers & mini resolvers ------------------------ */

function clampInt(n: any, min: number, max: number) {
    const v = Number.parseInt(String(n), 10);
    if (Number.isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
    }
    function toIntOrNull(n: any): number | null {
    const v = Number.parseInt(String(n), 10);
    return Number.isNaN(v) ? null : v;
}

function normalizeStat(s: string): "STR"|"DEX"|"CON"|"INT"|"WIS"|"CHA"|null {
    const t = (s || "").trim().toUpperCase();
    const map: Record<string,string> = {
        STR:"STR", STRENGTH:"STR",
        DEX:"DEX", DEXTERITY:"DEX",
        CON:"CON", CONSTITUTION:"CON",
        INT:"INT", INTELLIGENCE:"INT",
        WIS:"WIS", WISDOM:"WIS",
        CHA:"CHA", CHARISMA:"CHA",
    };
    return (map[t] as any) ?? null;
}

async function resolveCharacter(
    prisma: PrismaClient,
    campaignId: string,
    raw: string
    ): Promise<
    | { kind: "one"; id: string; name: string }
    | { kind: "NEEDS_CLARIFICATION"; reason: string; options: OrchestratorResult & any["options"] }
    | { kind: "none" }
    > {
    const q = (raw || "").trim();
    if (!q) return { kind: "none" };

    // Exact first, then fuzzy
    const exact = await prisma.role.findMany({
        where: { campaignId, name: { equals: q } },
        select: { id: true, name: true },
    });
    const aliasExact = await prisma.alias.findMany({
        where: { campaignId, alias: { equals: q } },
        select: { characterId: true, alias: true, character: { select: { id: true, name: true } } },
    });

    const candidates = [
        ...exact.map((r) => ({ id: r.id, label: r.name })),
        ...aliasExact.map((a) => ({ id: a.character.id, label: a.character.name, hint: `alias: ${a.alias}` })),
    ];

    if (!candidates.length) {
        const fuzzy = await prisma.role.findMany({
        where: { campaignId, name: { contains: q } },
        select: { id: true, name: true },
        take: 5,
        });
        const aliasFuzzy = await prisma.alias.findMany({
        where: { campaignId, alias: { contains: q } },
        select: { characterId: true, alias: true, character: { select: { id: true, name: true } } },
        take: 5,
        });
        const more = [
        ...fuzzy.map((r) => ({ id: r.id, label: r.name })),
        ...aliasFuzzy.map((a) => ({ id: a.character.id, label: a.character.name, hint: `alias: ${a.alias}` })),
        ];
        if (!more.length) return { kind: "none" };
        if (more.length === 1) return { kind: "one", id: more[0]!.id!, name: more[0]!.label! };
        return {
        kind: "NEEDS_CLARIFICATION",
        reason: "Which character did you mean?",
        options: more.slice(0, 5).map((m) => ({ type: "character" as const, id: m.id, label: m.label })),
        };
    }

    // collapse to unique by id
    const uniq = new Map<string, { id: string; label: string; hint?: string }>();
    for (const c of candidates) uniq.set(c.id!, c);
    const arr = Array.from(uniq.values());
    if (arr.length === 1) return { kind: "one", id: arr[0]!.id, name: arr[0]!.label };
    return {
        kind: "NEEDS_CLARIFICATION",
        reason: "Which character did you mean?",
        options: arr.slice(0, 5).map((m) => ({ type: "character" as const, id: m.id, label: m.label })),
    };
}

async function resolveLocation(
    prisma: PrismaClient,
    campaignId: string,
    raw: string
    ): Promise<
    | { kind: "one"; id: string; name: string }
    | { kind: "NEEDS_CLARIFICATION"; reason: string; options: OrchestratorResult & any["options"] }
    | { kind: "none" }
    > {
    const q = (raw || "").trim();
    if (!q) return { kind: "none" };

    const exact = await prisma.location.findMany({
        where: { campaignId, name: { equals: q } },
        select: { id: true, name: true },
    });
    if (exact.length === 1) return { kind: "one", id: exact[0].id, name: exact[0].name };
    if (exact.length > 1) {
        return {
        kind: "NEEDS_CLARIFICATION",
        reason: "Multiple locations match.",
        options: exact.slice(0, 5).map((l) => ({ type: "location" as const, id: l.id, label: l.name })),
        };
    }

    const fuzzy = await prisma.location.findMany({
        where: { campaignId, name: { contains: q } },
        select: { id: true, name: true },
        take: 5,
    });
    if (!fuzzy.length) return { kind: "none" };
    if (fuzzy.length === 1) return { kind: "one", id: fuzzy[0].id, name: fuzzy[0].name };
    return {
        kind: "NEEDS_CLARIFICATION",
        reason: "Multiple locations match.",
        options: fuzzy.slice(0, 5).map((l) => ({ type: "location" as const, id: l.id, label: l.name })),
    };
    }

    function noCharacterReply(asked: string): OrchestratorResult {
    return {
        kind: "NEEDS_CLARIFICATION",
        reason: asked ? `I couldn't find "${asked}".` : "Which character did you mean?",
        options: [{ type: "character", label: "Try full name or an alias" }],
    };
}

/* ------------------------------ KG fetchers ------------------------------- */

async function getCurrentInventory(
    prisma: PrismaClient,
    campaignId: string,
    roleId: string
    ) {
    const rows = await prisma.possession.findMany({
        where: { campaignId, characterId: roleId, endAt: null },
        orderBy: { startAt: "asc" },
        include: {
        item: { select: { name: true, kind: true } },
        startEvent: {
            select: {
            summary: true,
            occurredAt: true,
            session: { select: { sessionNumber: true } },
            location: { select: { name: true } },
            },
        },
        },
    });
    return rows.map((p) => ({
        itemName: p.item.name,
        itemKind: p.item.kind ? String(p.item.kind) : null,
        obtainedAt: p.startAt?.toISOString() ?? null,
        obtainedSessionNumber: p.startEvent?.session?.sessionNumber ?? null,
        locationName: p.startEvent?.location?.name ?? null,
        note: p.startEvent?.summary ?? null,
    }));
}

async function getLatestStats(
    prisma: PrismaClient,
    campaignId: string,
    roleId: string
    ) {
    const snaps = await prisma.statSnapshot.findMany({
        where: { campaignId, characterId: roleId },
        orderBy: { effectiveAt: "desc" },
        include: { sourceEvent: { select: { session: { select: { sessionNumber: true } } } } },
    });

    const order = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
    const latest = new Map<string, typeof snaps[number]>();
    for (const s of snaps) if (!latest.has(String(s.statType))) latest.set(String(s.statType), s);

    return order.map((t) => {
        const s = latest.get(t);
        return s
        ? {
            type: t,
            value: s.value,
            effectiveAt: s.effectiveAt.toISOString(),
            sessionNumber: s.sourceEvent?.session?.sessionNumber ?? null,
            }
        : { type: t, value: null, effectiveAt: null, sessionNumber: null };
    });
}

async function getEventsAtLocation(
    prisma: PrismaClient,
    campaignId: string,
    locationId: string,
    opts: { sessionId?: string | null; limit?: number } = {}
    ) {
    const events = await prisma.event.findMany({
        where: {
        campaignId,
        locationId,
        ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
        },
        orderBy: { occurredAt: "asc" },
        take: opts.limit ?? 7,
        select: {
        id: true,
        type: true,
        summary: true,
        occurredAt: true,
        session: { select: { sessionNumber: true } },
        spans: {
            take: 1,
            select: {
            span: { select: { text: true, startMs: true, endMs: true } },
            },
        },
        },
    });

    return events.map((e) => ({
        id: e.id,
        type: String(e.type),
        summary: e.summary ?? String(e.type),
        occurredAt: e.occurredAt,
        sessionNumber: e.session?.sessionNumber ?? null,
        snippet: e.spans[0]?.span
        ? {
            text: e.spans[0].span.text,
            startMs: e.spans[0].span.startMs ?? undefined,
            endMs: e.spans[0].span.endMs ?? undefined,
            }
        : null,
    }));
}

async function getSessionIdByNumber(
    prisma: PrismaClient,
    campaignId: string,
    n: number
    ) {
    const s = await prisma.session.findFirst({
        where: { campaignId, sessionNumber: n },
        select: { id: true },
    });
    return s?.id ?? null;
}

/* -------------------------- Optional: quick shortcuts -------------------------- */

async function tryCommonShortcuts(
    prisma: PrismaClient,
    campaignId: string,
    text: string
    ): Promise<OrchestratorResult | null> {
    const t = (text || "").trim();

    // e.g., "Elaria INT"
    const statMatch = t.match(/^(.+?)\s+(STR|DEX|CON|INT|WIS|CHA|strength|dexterity|constitution|intelligence|wisdom|charisma)$/i);
    if (statMatch) {
        const stat = normalizeStat(statMatch[2]);
        const who = await resolveCharacter(prisma, campaignId, statMatch[1]);
        if (stat && who.kind === "one") {
        const stats = await getLatestStats(prisma, campaignId, who.id);
        return { kind: "STATS", character: { id: who.id, name: who.name }, stats };
        }
    }

    // e.g., "Items Thalion" / "Inventory Thalion"
    const invMatch = t.match(/^(items?|inventory|gear)\s+(.+)$/i);
    if (invMatch) {
        const who = await resolveCharacter(prisma, campaignId, invMatch[2]);
        if (who.kind === "one") {
        const items = await getCurrentInventory(prisma, campaignId, who.id);
        return {
            kind: "INVENTORY",
            character: { id: who.id, name: who.name },
            items: items.map((p) => ({
            name: p.itemName,
            kind: p.itemKind ?? null,
            obtainedAt: p.obtainedAt ?? null,
            sessionNumber: p.obtainedSessionNumber ?? null,
            locationName: p.locationName ?? null,
            note: p.note ?? null,
            })),
        };
        }
    }

    // e.g., "S2 summary"
    const sessMatch = t.match(/^s(?:ession)?\s*(\d+)\s*(summary)?$/i);
    if (sessMatch) {
        const n = Number(sessMatch[1]);
        const s = await prisma.session.findFirst({
        where: { campaignId, sessionNumber: n },
        select: { id: true, sessionNumber: true, date: true, summary: true },
        });
        if (s) {
        return {
            kind: "SESSION_SUMMARY",
            session: { id: s.id, sessionNumber: s.sessionNumber, date: s.date.toISOString() },
            summaryText: s.summary ?? "(No summary saved yet.)",
        };
        }
    }

    return null;
}

/* ---------------------------- Convenience wrapper ---------------------------- */

// Optional: a helper that returns composed text directly.
// You can keep using your API route to call runOrchestrator + composeAnswer.
export async function runOrchestratorToText(args: RunArgs): Promise<string> {
    const result = await runOrchestrator(args);
    return composeAnswer(result).text;
}
