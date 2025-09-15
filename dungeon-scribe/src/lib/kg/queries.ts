// lib/kg/queries.ts
import type { PrismaClient } from '@prisma/client';

export type StatTypeLiteral = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export async function getCurrentInventory(
    prisma: PrismaClient,
    params: { campaignId: string; roleId: string }
    ) {
    const { campaignId, roleId } = params;

    const rows = await prisma.possession.findMany({
        where: { campaignId, characterId: roleId, endAt: null },
        orderBy: { startAt: 'asc' },
        include: {
        item: { select: { id: true, name: true, kind: true } },
        startEvent: { select: { id: true, occurredAt: true, sessionId: true } },
        campaign: false,
        },
    });

    return rows.map((p) => ({
        itemId: p.itemId,
        itemName: p.item.name,
        itemKind: p.item.kind,
        obtainedAt: p.startAt,
        obtainedEventId: p.startEventId ?? null,
        obtainedSessionId: p.startEvent?.sessionId ?? null,
    }));
}

export async function getStat(
    prisma: PrismaClient,
    params: { campaignId: string; roleId: string; statType: StatTypeLiteral; includeHistory?: boolean }
    ) {
    const { campaignId, roleId, statType, includeHistory } = params;

    const latest = await prisma.statSnapshot.findFirst({
        where: { campaignId, characterId: roleId, statType },
        orderBy: { effectiveAt: 'desc' },
        include: {
        sourceEvent: { select: { id: true, occurredAt: true, sessionId: true } },
        },
    });

    if (!latest) {
        return {
        current: null as {
            value: number;
            effectiveAt: Date;
            sourceEventId: string | null;
            sourceSessionId: string | null;
        } | null,
        history: [] as Array<{
            value: number;
            effectiveAt: Date;
            sourceEventId: string | null;
            sourceSessionId: string | null;
        }>,
        };
    }

    let history: Array<{
        value: number;
        effectiveAt: Date;
        sourceEventId: string | null;
        sourceSessionId: string | null;
    }> = [];

    if (includeHistory) {
        const rows = await prisma.statSnapshot.findMany({
        where: { campaignId, characterId: roleId, statType },
        orderBy: { effectiveAt: 'asc' },
        include: {
            sourceEvent: { select: { id: true, sessionId: true } },
        },
        });
        history = rows.map((r) => ({
        value: r.value,
        effectiveAt: r.effectiveAt,
        sourceEventId: r.sourceEventId ?? null,
        sourceSessionId: r.sourceEvent?.sessionId ?? null,
        }));
    }

    return {
        current: {
        value: latest.value,
        effectiveAt: latest.effectiveAt,
        sourceEventId: latest.sourceEventId ?? null,
        sourceSessionId: latest.sourceEvent?.sessionId ?? null,
        },
        history,
    };
}

export async function getEventsAtLocation(
    prisma: PrismaClient,
    params: {
        campaignId: string;
        locationId: string;
        sessionId?: string;
        from?: Date;
        to?: Date;
        limit?: number;
    }
    ) {
    const { campaignId, locationId, sessionId, from, to, limit = 100 } = params;

    const where: any = { campaignId, locationId };
    if (sessionId) where.sessionId = sessionId;
    if (from || to) {
        where.occurredAt = {};
        if (from) where.occurredAt.gte = from;
        if (to) where.occurredAt.lte = to;
    }

    const events = await prisma.event.findMany({
        where,
        orderBy: { occurredAt: 'asc' },
        take: limit,
        select: {
        id: true,
        type: true,
        summary: true,
        occurredAt: true,
        sessionId: true,
        session: { select: { id: true, sessionNumber: true, date: true } },
        spans: { select: { transcriptSpanId: true } },
        },
    });

    return events.map((e) => ({
        id: e.id,
        type: e.type,
        summary: e.summary ?? '',
        occurredAt: e.occurredAt,
        sessionId: e.sessionId ?? null,
        sessionNumber: e.session?.sessionNumber ?? null,
        spanIds: e.spans.map((s) => s.transcriptSpanId),
    }));
}
