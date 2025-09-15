import type { PrismaClient } from '@prisma/client';

export type CharacterResolverResult = {
    roleId: string | null;
    matchType: 'name' | 'alias' | 'none';
};

/**
 * Simple canonicalizer: trim, collapse internal whitespace, lower-case.
 * Keeps punctuation (you can extend if needed).
 */
function normalizeName(s: string): string {
    return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Resolve a user-provided character name (e.g., "Thal") to a Role.id.
 * Priority:
 *   1) Exact normalized match on Role.name
 *   2) Exact normalized match on Alias.alias
 * Ties: prefer Role.name over alias; then longest original string; then deterministic alphabetical by name.
 */
export async function resolveCharacter(
    prisma: PrismaClient,
    params: { campaignId: string; name: string }
    ): Promise<CharacterResolverResult> {
    const { campaignId } = params;
    const query = normalizeName(params.name);
    if (!query) return { roleId: null, matchType: 'none' };

    // Fetch minimal fields to resolve locally (SQLite doesn't support Prisma's string mode: 'insensitive')
    const [roles, aliases] = await Promise.all([
        prisma.role.findMany({
        where: { campaignId },
        select: { id: true, name: true },
        }),
        prisma.alias.findMany({
        where: { campaignId },
        select: { characterId: true, alias: true },
        }),
    ]);

    // 1) Try Role.name
    const roleMatches = roles.filter((r: { id: string; name: string }) => normalizeName(r.name) === query);

    if (roleMatches.length === 1) {
        return { roleId: roleMatches[0].id, matchType: 'name' };
    }
    if (roleMatches.length > 1) {
        const picked = pickBest(roleMatches.map((r: { id: string; name: string }) => ({ id: r.id, label: r.name })));
        return { roleId: picked?.id ?? null, matchType: picked ? 'name' : 'none' };
    }

    // 2) Try Alias.alias
    const aliasMatches = aliases.filter((a: { characterId: string; alias: string }) => normalizeName(a.alias) === query);

    if (aliasMatches.length === 1) {
        return { roleId: aliasMatches[0].characterId, matchType: 'alias' };
    }
    if (aliasMatches.length > 1) {
        // Need the canonical Role name(s) for tie-breaking
        const byRoleId = new Map(roles.map((r: { id: string; name: string }) => [r.id, r.name]));
        const candidates = aliasMatches.map((a: { characterId: string; alias: string }) => ({
        id: a.characterId,
        label: byRoleId.get(a.characterId) ?? a.alias,
        }));
        const picked = pickBest(candidates);
        return { roleId: picked?.id ?? null, matchType: picked ? 'alias' : 'none' };
    }

    // Nothing found
    return { roleId: null, matchType: 'none' };
}

/**
 * Tie-breaker:
 *  - Prefer the candidate with the longest label (more specific).
 *  - Then deterministic alphabetical by label.
 *  - Finally by id (to be fully deterministic).
 */
function pickBest<T extends { id: string; label: string }>(arr: T[]): T | null {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => {
        const lenDiff = b.label.length - a.label.length;
        if (lenDiff !== 0) return lenDiff;
        const labelDiff = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
        if (labelDiff !== 0) return labelDiff;
        return a.id.localeCompare(b.id);
    });
    return sorted[0];
}
