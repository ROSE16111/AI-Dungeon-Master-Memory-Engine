// lib/resolvers/session-resolver.ts
import type { PrismaClient } from '@prisma/client';

export type SessionLite = { id: string; sessionNumber: number; date: Date };

export async function getSessionByNumber(
    prisma: PrismaClient,
    params: { campaignId: string; sessionNumber: number }
    ): Promise<SessionLite | null> {
    const s = await prisma.session.findFirst({
        where: { campaignId: params.campaignId, sessionNumber: params.sessionNumber },
        select: { id: true, sessionNumber: true, date: true },
    });
    return s ?? null;
}

export async function getLastSession(
    prisma: PrismaClient,
    params: { campaignId: string }
    ): Promise<SessionLite | null> {
    const s = await prisma.session.findFirst({
        where: { campaignId: params.campaignId },
        orderBy: { date: 'desc' },
        select: { id: true, sessionNumber: true, date: true },
    });
    return s ?? null;
}

/** Resolve based on parser hints. If both hints are missing, returns null. */
export async function resolveSession(
    prisma: PrismaClient,
    params: { campaignId: string; sessionNumber?: number; isLastSession?: boolean }
    ): Promise<SessionLite | null> {
    const { campaignId, sessionNumber, isLastSession } = params;
    if (typeof sessionNumber === 'number') {
        return getSessionByNumber(prisma, { campaignId, sessionNumber });
    }
    if (isLastSession) {
        return getLastSession(prisma, { campaignId });
    }
    return null;
}
