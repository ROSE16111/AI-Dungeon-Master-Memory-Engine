// lib/resolvers/location-resolver.ts
import type { PrismaClient } from '@prisma/client';

export type LocationResolverResult = {
    locationId: string | null;
    label: string | null; // matched location name
    matchType: 'name' | 'contains' | 'none';
};

function normalize(s: string): string {
    return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function pickBest<T extends { id: string; label: string }>(arr: T[]): T | null {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => {
        const lenDiff = b.label.length - a.label.length; // prefer longer (more specific)
        if (lenDiff !== 0) return lenDiff;
        const labelDiff = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
        if (labelDiff !== 0) return labelDiff;
        return a.id.localeCompare(b.id);
    });
    return sorted[0];
}

/**
 * Resolve a user-provided location name to a Location.id within a campaign.
 * Priority:
 *   1) Exact (case-insensitive) match on Location.name
 *   2) If not found, a conservative substring/containment match (case-insensitive)
 */
export async function resolveLocation(
    prisma: PrismaClient,
    params: { campaignId: string; name: string }
    ): Promise<LocationResolverResult> {
    const { campaignId } = params;
    const query = normalize(params.name);
    if (!query) return { locationId: null, label: null, matchType: 'none' };

    // Fetch minimal set once; SQLite lacks robust case-insensitive collation via Prisma filters.
    const locations = await prisma.location.findMany({
        where: { campaignId },
        select: { id: true, name: true },
    });

    // 1) Exact normalized name match
    const exact = locations.filter((loc) => normalize(loc.name) === query);
    if (exact.length === 1) return { locationId: exact[0].id, label: exact[0].name, matchType: 'name' };
    if (exact.length > 1) {
        const picked = pickBest(exact.map((l) => ({ id: l.id, label: l.name })));
        return picked ? { locationId: picked.id, label: picked.label, matchType: 'name' } : { locationId: null, label: null, matchType: 'none' };
    }

    // 2) Containment match (e.g., user typed a shorter fragment)
    const contains = locations.filter((loc) => normalize(loc.name).includes(query) || query.includes(normalize(loc.name)));
    if (contains.length === 1) return { locationId: contains[0].id, label: contains[0].name, matchType: 'contains' };
    if (contains.length > 1) {
        const picked = pickBest(contains.map((l) => ({ id: l.id, label: l.name })));
        return picked ? { locationId: picked.id, label: picked.label, matchType: 'contains' } : { locationId: null, label: null, matchType: 'none' };
    }

    return { locationId: null, label: null, matchType: 'none' };
}

/**
 * Scan an entire user utterance and pick the best matching location mention.
 * Useful for telegraphic questions like "what happened in the ruins".
 */
export async function resolveLocationFromText(
    prisma: PrismaClient,
    params: { campaignId: string; text: string }
    ): Promise<LocationResolverResult> {
    const { campaignId, text } = params;
    const q = normalize(text);
    if (!q) return { locationId: null, label: null, matchType: 'none' };

    const locations = await prisma.location.findMany({
        where: { campaignId },
        select: { id: true, name: true },
    });

    const matches = locations.filter((loc) => q.includes(normalize(loc.name)));
    if (matches.length === 0) return { locationId: null, label: null, matchType: 'none' };
    if (matches.length === 1) return { locationId: matches[0].id, label: matches[0].name, matchType: 'contains' };

    const picked = pickBest(matches.map((l) => ({ id: l.id, label: l.name })));
    return picked ? { locationId: picked.id, label: picked.label, matchType: 'contains' } : { locationId: null, label: null, matchType: 'none' };
}
