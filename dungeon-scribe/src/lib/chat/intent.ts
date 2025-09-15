// lib/chat/intent.ts
export type IntentType =
    | 'INVENTORY'
    | 'STATS'
    | 'LOCATION_EVENTS'
    | 'SESSION_SUMMARY'
    | 'FREEFORM';

export type ParsedIntent = {
    intent: IntentType;
    // Extracted fields (raw strings; you’ll resolve to IDs later)
    characterName?: string;
    statType?: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
    locationName?: string;
    sessionNumber?: number; // if parsed like "session 3"
    // Hints
    isLastSession?: boolean;
};

/** Normalize plain text for regex matching. */
function norm(s: string) {
    return s.trim().replace(/\s+/g, ' ');
}

/** Map full/stat synonyms → canonical 3-letter code. */
export function statFromString(s: string): ParsedIntent['statType'] | undefined {
    const x = s.toLowerCase().replace(/[^a-z]/g, '');
    if (x === 'strength' || x === 'str') return 'STR';
    if (x === 'dexterity' || x === 'dex') return 'DEX';
    if (x === 'constitution' || x === 'con') return 'CON';
    if (x === 'intelligence' || x === 'int') return 'INT';
    if (x === 'wisdom' || x === 'wis') return 'WIS';
    if (x === 'charisma' || x === 'cha') return 'CHA';
    return undefined;
}

/**
 * Parse the user's question into a simple intent + raw fields.
 * Keep it deterministic and conservative—return FREEFORM if unsure.
 */
export function parseIntent(text: string): ParsedIntent {
    const q = norm(text);

    // ----- SESSION_SUMMARY -----
    // e.g., "summarize session 3", "recap session 2", "summary of session 10"
    const sessionNumMatch =
        /\b(session)\s+(\d{1,4})\b/i.exec(q) ||
        /\b(s\.)\s*(\d{1,4})\b/i.exec(q);
    if (/\b(recaps?|summar(y|ize|ise)|what happened)\b.*\bsession\b/i.test(q) && sessionNumMatch) {
        return { intent: 'SESSION_SUMMARY', sessionNumber: Number(sessionNumMatch[2]) };
    }
    // "recap last session" / "what happened last session"
    if (/\b(recaps?|what happened|summary|summar(y|ize|ise))\b.*\blast session\b/i.test(q)) {
        return { intent: 'SESSION_SUMMARY', isLastSession: true };
    }

    // ----- STATS -----
    // Pattern A: "what is <name>'s intelligence" / "what's <name>'s INT"
    {
        const m = /\bwhat(?:'s|\s+is)\s+(.+?)['’]s\s+(intelligence|strength|dexterity|constitution|wisdom|charisma|str|dex|con|int|wis|cha)\b/i.exec(
        q
        );
        if (m) {
        const name = m[1].trim();
        const stat = statFromString(m[2]);
        if (name && stat) return { intent: 'STATS', characterName: name, statType: stat };
        }
    }
    // Pattern B: "<stat> of <name>"
    {
        const m = /\b(str|dex|con|int|wis|cha|strength|dexterity|constitution|intelligence|wisdom|charisma)\s+of\s+(.+?)\b\??$/i.exec(
        q
        );
        if (m) {
        const stat = statFromString(m[1]);
        const name = m[2].trim();
        if (name && stat) return { intent: 'STATS', characterName: name, statType: stat };
        }
    }

    // ----- INVENTORY -----
    // "what items does <name> have", "what does <name> carry", "inventory of <name>"
    {
        const m1 = /\bwhat\s+(?:items|inventory|gear|equipment|things)\s+does\s+(.+?)\s+(?:have|carry|hold|possess)\b/i.exec(
        q
        );
        if (m1) return { intent: 'INVENTORY', characterName: m1[1].trim() };

        const m2 = /\b(?:inventory|items)\s+of\s+(.+?)\b\??$/i.exec(q);
        if (m2) return { intent: 'INVENTORY', characterName: m2[1].trim() };

        const m3 = /\bwhat\s+does\s+(.+?)\s+(?:carry|have)\b/i.exec(q);
        if (m3) return { intent: 'INVENTORY', characterName: m3[1].trim() };
    }

    // ----- LOCATION_EVENTS -----
    // "what did (we|the group|the party) do in/at <location>"
    {
        const m =
        /\bwhat\s+did\s+(?:we|the\s+group|the\s+party)\s+do\s+(?:in|at)\s+(.+?)\b\??$/i.exec(q) ||
        /\bwhat\s+happened\s+(?:in|at)\s+(.+?)\b\??$/i.exec(q);
        if (m) return { intent: 'LOCATION_EVENTS', locationName: m[1].trim() };
    }

    // If none matched, fallback
    return { intent: 'FREEFORM' };
}
