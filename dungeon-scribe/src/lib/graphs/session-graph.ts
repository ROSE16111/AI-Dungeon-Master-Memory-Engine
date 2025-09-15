// lib/graphs/session-graph.ts
import type { PrismaClient } from '@prisma/client';

export type EventDTO = {
    id: string;
    type: string;
    summary: string;
    occurredAt: string; // ISO
    location?: { id: string; name: string } | null;
    spanSnippets: Array<{ id: string; startMs: number; endMs: number; text: string }>;
};

export type SessionGraphDTO = {
    session: { id: string; number: number; date: string };
    events: EventDTO[];
};

export async function fetchSessionGraph(
    prisma: PrismaClient,
    sessionId: string
    ): Promise<SessionGraphDTO | null> {
    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true, sessionNumber: true, date: true },
    });
    if (!session) return null;

    const events = await prisma.event.findMany({
        where: { sessionId },
        orderBy: { occurredAt: 'asc' },
        select: {
        id: true,
        type: true,
        summary: true,
        occurredAt: true,
        location: { select: { id: true, name: true } },
        spans: {
            select: {
            transcriptSpanId: true,
            span: { select: { id: true, startMs: true, endMs: true, text: true } },
            },
        },
        },
    });

    return {
        session: {
        id: session.id,
        number: session.sessionNumber,
        date: session.date.toISOString(),
        },
        events: events.map((e) => ({
        id: e.id,
        type: e.type,
        summary: e.summary ?? e.type,
        occurredAt: e.occurredAt.toISOString(),
        location: e.location,
        spanSnippets: e.spans
            .map((s) =>
            s.span
                ? {
                    id: s.span.id,
                    startMs: s.span.startMs,
                    endMs: s.span.endMs,
                    text: s.span.text,
                }
                : null
            )
            .filter(Boolean) as any,
        })),
    };
}
