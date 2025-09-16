// app/(all)/campaigns/[id]/characters/[roleId]/page.tsx
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import CharacterSummary from '@/components/CharacterSummary';

export const runtime = 'nodejs';

type Params = { params: { id: string; roleId: string } };

export default async function CharacterPage({ params }: Params) {
    const { id: campaignId, roleId } = params;

    // 1) Role & campaign (guard campaign match)
    const role = await prisma.role.findFirst({
        where: { id: roleId, campaignId },
        select: { id: true, name: true, level: true, campaignId: true },
    });
    if (!role) return notFound();

    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, title: true },
    });
    if (!campaign) return notFound();

    // 2) Aliases
    const aliases = await prisma.alias.findMany({
        where: { campaignId, characterId: role.id },
        select: { alias: true },
        orderBy: { alias: 'asc' },
    });

    // 3) Latest stats per type (pull all then keep first per statType)
    const snaps = await prisma.statSnapshot.findMany({
        where: { campaignId, characterId: role.id },
        orderBy: { effectiveAt: 'desc' },
        include: {
        sourceEvent: { select: { session: { select: { sessionNumber: true } } } },
        },
    });
    const order = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
    const latestByType = new Map<string, typeof snaps[number]>();
    for (const s of snaps) if (!latestByType.has(s.statType)) latestByType.set(s.statType, s);
    const stats = order.map((t) => {
        const s = latestByType.get(t);
        return s
        ? {
            type: t,
            value: s.value,
            effectiveAt: s.effectiveAt.toISOString(),
            sessionNumber: s.sourceEvent?.session?.sessionNumber ?? null,
            }
        : { type: t, value: null as any, effectiveAt: null as any, sessionNumber: null as any };
    });

    // 4) Current inventory (open possessions)
    const possessions = await prisma.possession.findMany({
        where: { campaignId, characterId: role.id, endAt: null },
        orderBy: { startAt: 'asc' },
        include: {
        item: { select: { id: true, name: true, kind: true } },
        startEvent: {
            select: {
            occurredAt: true,
            session: { select: { sessionNumber: true } },
            location: { select: { name: true } },
            summary: true,
            },
        },
        },
    });
    const inventory = possessions.map((p) => ({
        id: p.item.id,
        name: p.item.name,
        kind: String(p.item.kind ?? 'UNKNOWN'), // ← ensure string, no null
        obtainedAt: p.startAt.toISOString(),
        sessionNumber: p.startEvent?.session?.sessionNumber ?? null,
        locationName: p.startEvent?.location?.name ?? null,
        note: p.startEvent?.summary ?? null,
    }));

    // 5) Recent activity events (from possessions + stat snapshots)
    const eventIds = new Set<string>();
    possessions.forEach((p) => {
        if (p.startEventId) eventIds.add(p.startEventId);
        if (p.endEventId) eventIds.add(p.endEventId);
    });
    snaps.forEach((s) => {
        if (s.sourceEventId) eventIds.add(s.sourceEventId);
    });

    const events = eventIds.size
        ? await prisma.event.findMany({
            where: { id: { in: Array.from(eventIds) } },
            orderBy: { occurredAt: 'desc' },
            take: 20,
            select: {
            id: true,
            type: true,
            summary: true,
            occurredAt: true,
            session: { select: { sessionNumber: true } },
            location: { select: { name: true } },
            spans: {
                select: {
                span: { select: { id: true, startMs: true, endMs: true, text: true } },
                },
            },
            },
        })
        : [];

    const activity = events.map((e) => ({
        id: e.id,
        type: e.type,
        summary: e.summary ?? e.type,
        occurredAt: e.occurredAt.toISOString(),
        sessionNumber: e.session?.sessionNumber ?? null,
        locationName: e.location?.name ?? null,
        snippet: e.spans.length && e.spans[0].span
        ? {
            id: e.spans[0].span.id,
            startMs: e.spans[0].span.startMs,
            endMs: e.spans[0].span.endMs,
            text: e.spans[0].span.text,
            }
        : null,
    }));

    const lastActivityISO =
        activity.length > 0
        ? activity.reduce((max, a) => (a.occurredAt > max ? a.occurredAt : max), activity[0].occurredAt)
        : null;

    // 6) Attendance
    const attendanceRows = await prisma.sessionParticipant.findMany({
        where: { roleId: role.id, session: { campaignId } },
        include: { session: { select: { id: true, sessionNumber: true, date: true } } },
        orderBy: { session: { date: 'desc' } },
    });
    const attendance = attendanceRows.map((r) => ({
        sessionId: r.session.id,
        sessionNumber: r.session.sessionNumber,
        date: r.session.date.toISOString(),
        presence: String(r.presence) as 'PRESENT' | 'ABSENT' | 'LATE', // ← ensure plain string union
        joinedAt: r.joinedAt ? r.joinedAt.toISOString() : null,
        leftAt: r.leftAt ? r.leftAt.toISOString() : null,
    }));
    const presentCount = attendance.filter((a) => a.presence === 'PRESENT').length;

    // 7) Top locations from activity
    const locCounts = new Map<string, number>();
    for (const a of activity) if (a.locationName) locCounts.set(a.locationName, (locCounts.get(a.locationName) ?? 0) + 1);
    const topLocations = Array.from(locCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

    return (
        <div className="p-6 space-y-6">
        <CharacterSummary
            characterName={role.name}
            level={role.level ?? null}
            campaignTitle={campaign.title}
            aliases={aliases.map((a) => a.alias)}
            lastActivity={lastActivityISO}
            stats={stats}
            inventory={inventory}
            activity={activity}
            attendance={attendance}
            attendanceSummary={{ present: presentCount, total: attendance.length }}
            topLocations={topLocations}
        />
        </div>
    );
}
