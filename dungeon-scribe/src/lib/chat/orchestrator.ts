// lib/chat/orchestrator.ts
import type { PrismaClient } from '@prisma/client';
import { parseIntent } from './intent';
import { resolveCharacter } from '../resolvers/character-resolver';
import { resolveLocation } from '../resolvers/location-resolver';
import { resolveSession } from '../resolvers/session-resolver';
import { getCurrentInventory, getEventsAtLocation, getStat } from '../kg/queries';

export type ChatResult =
    | {
        kind: 'INVENTORY';
        character: { id: string; name: string };
        items: Array<{ itemId: string; itemName: string; obtainedAt: Date; obtainedSessionId: string | null }>;
        }
    | {
        kind: 'STATS';
        character: { id: string; name: string };
        stat: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
        current:
            | { value: number; effectiveAt: Date; sourceEventId: string | null; sourceSessionId: string | null }
            | null;
        history?: Array<{ value: number; effectiveAt: Date; sourceEventId: string | null; sourceSessionId: string | null }>;
        }
    | {
        kind: 'LOCATION_EVENTS';
        location: { id: string; name: string };
        session?: { id: string; number: number };
        events: Array<{ id: string; type: string; summary: string; occurredAt: Date; sessionId: string | null; sessionNumber: number | null; spanIds: string[] }>;
        }
    | {
        kind: 'SESSION_SUMMARY';
        session: { id: string; number: number; date: Date };
        summary: string | null;
        eventsIfNoSummary?: Array<{ id: string; type: string; summary: string; occurredAt: Date }>;
        }
    | {
        kind: 'NEEDS_CLARIFICATION';
        reason: string;
        options?: string[];
        }
    | {
        kind: 'FREEFORM';
        note: string;
    };

export async function runChatTurn(
    prisma: PrismaClient,
    params: { campaignId: string; text: string }
    ): Promise<ChatResult> {
    const { campaignId, text } = params;
    const parsed = parseIntent(text);

    // INVENTORY
    if (parsed.intent === 'INVENTORY') {
        if (!parsed.characterName) {
        return { kind: 'NEEDS_CLARIFICATION', reason: 'Which character?' };
        }
        const charRes = await resolveCharacter(prisma, { campaignId, name: parsed.characterName });
        if (!charRes.roleId) {
        return { kind: 'NEEDS_CLARIFICATION', reason: `I couldn’t find "${parsed.characterName}" in this campaign.` };
        }
        const character = await prisma.role.findUnique({ where: { id: charRes.roleId }, select: { id: true, name: true } });
        if (!character) {
        return { kind: 'NEEDS_CLARIFICATION', reason: `Character not found.` };
        }
        const items = await getCurrentInventory(prisma, { campaignId, roleId: character.id });
        return {
        kind: 'INVENTORY',
        character,
        items: items.map((i) => ({
            itemId: i.itemId,
            itemName: i.itemName,
            obtainedAt: i.obtainedAt,
            obtainedSessionId: i.obtainedSessionId,
        })),
        };
    }

    // STATS
    if (parsed.intent === 'STATS') {
        if (!parsed.characterName) {
        return { kind: 'NEEDS_CLARIFICATION', reason: 'Which character?' };
        }
        if (!parsed.statType) {
        return { kind: 'NEEDS_CLARIFICATION', reason: 'Which stat?' };
        }
        const charRes = await resolveCharacter(prisma, { campaignId, name: parsed.characterName });
        if (!charRes.roleId) {
        return { kind: 'NEEDS_CLARIFICATION', reason: `I couldn’t find "${parsed.characterName}" in this campaign.` };
        }
        const character = await prisma.role.findUnique({ where: { id: charRes.roleId }, select: { id: true, name: true } });
        if (!character) {
        return { kind: 'NEEDS_CLARIFICATION', reason: `Character not found.` };
        }
        const stat = await getStat(prisma, {
        campaignId,
        roleId: character.id,
        statType: parsed.statType,
        includeHistory: false,
        });
        return {
        kind: 'STATS',
        character,
        stat: parsed.statType,
        current: stat.current,
        };
    }

    // LOCATION_EVENTS
    if (parsed.intent === 'LOCATION_EVENTS') {
        if (!parsed.locationName) {
        return { kind: 'NEEDS_CLARIFICATION', reason: 'Which location?' };
        }
        const locRes = await resolveLocation(prisma, { campaignId, name: parsed.locationName });
        if (!locRes.locationId) {
        return { kind: 'NEEDS_CLARIFICATION', reason: `I couldn’t find a location matching "${parsed.locationName}".` };
        }

        const sess = await resolveSession(prisma, {
        campaignId,
        sessionNumber: parsed.sessionNumber,
        isLastSession: parsed.isLastSession,
        });

        const events = await getEventsAtLocation(prisma, {
        campaignId,
        locationId: locRes.locationId,
        sessionId: sess?.id,
        });

        return {
        kind: 'LOCATION_EVENTS',
        location: { id: locRes.locationId, name: locRes.label ?? 'Unknown' },
        session: sess ? { id: sess.id, number: sess.sessionNumber } : undefined,
        events,
        };
    }

    // SESSION_SUMMARY
    if (parsed.intent === 'SESSION_SUMMARY') {
        const sess = await resolveSession(prisma, {
        campaignId,
        sessionNumber: parsed.sessionNumber,
        isLastSession: parsed.isLastSession,
        });
        if (!sess) {
        return { kind: 'NEEDS_CLARIFICATION', reason: 'Which session?' };
        }

        const full = await prisma.session.findUnique({
        where: { id: sess.id },
        select: { id: true, sessionNumber: true, date: true, summary: true },
        });

        if (full?.summary) {
        return { kind: 'SESSION_SUMMARY', session: { id: full.id, number: full.sessionNumber, date: full.date }, summary: full.summary };
        }

        // Fallback: list events if no summary exists
        const events = await prisma.event.findMany({
        where: { campaignId, sessionId: sess.id },
        orderBy: { occurredAt: 'asc' },
        select: { id: true, type: true, summary: true, occurredAt: true },
        });

        return {
        kind: 'SESSION_SUMMARY',
        session: { id: sess.id, number: sess.sessionNumber, date: sess.date },
        summary: null,
        eventsIfNoSummary: events.map((e) => ({ id: e.id, type: e.type, summary: e.summary ?? '', occurredAt: e.occurredAt })),
        };
    }

    // FREEFORM (not implemented yet)
    return { kind: 'FREEFORM', note: 'Freeform questions will use vector search later.' };
}
