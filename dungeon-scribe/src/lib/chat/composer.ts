// lib/chat/composer.ts

// ---- Result types your orchestrator should return ----
export type InventoryAnswer = {
  kind: "INVENTORY";
  character: { id: string; name: string };
  items: Array<{
    name: string;
    kind?: string | null;
    obtainedAt?: string | null;          // ISO
    sessionNumber?: number | null;
    locationName?: string | null;
    note?: string | null;
  }>;
};

export type StatsAnswer = {
  kind: "STATS";
  character: { id: string; name: string };
  stats: Array<{
    type: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
    value: number | null;
    effectiveAt?: string | null;         // ISO
    sessionNumber?: number | null;
  }>;
};

export type LocationEventsAnswer = {
  kind: "LOCATION_EVENTS";
  location: { id: string; name: string };
  events: Array<{
    id: string;
    type: string;
    summary: string;
    occurredAt: string;                   // ISO
    sessionNumber?: number | null;
    snippet?: { text: string; startMs?: number; endMs?: number } | null;
  }>;
};

export type SessionSummaryAnswer = {
  kind: "SESSION_SUMMARY";
  session: { id: string; sessionNumber: number; date: string }; // ISO
  summaryText: string;
};

export type NeedsClarificationAnswer = {
  kind: "NEEDS_CLARIFICATION";
  reason: string;
  options: Array<{
    type: "character" | "location" | "session";
    id?: string;
    label: string;
    hint?: string;
  }>;
};

export type FreeformAnswer = {
  kind: "FREEFORM";
  text: string;
};

export type OrchestratorResult =
  | InventoryAnswer
  | StatsAnswer
  | LocationEventsAnswer
  | SessionSummaryAnswer
  | NeedsClarificationAnswer
  | FreeformAnswer;

// ---- Public API ----
export function composeAnswer(r: OrchestratorResult): { text: string } {
  switch (r.kind) {
    case "INVENTORY":
      return { text: composeInventory(r) };
    case "STATS":
      return { text: composeStats(r) };
    case "LOCATION_EVENTS":
      return { text: composeLocationEvents(r) };
    case "SESSION_SUMMARY":
      return { text: composeSessionSummary(r) };
    case "NEEDS_CLARIFICATION":
      return { text: composeClarification(r) };
    case "FREEFORM":
      return { text: r.text.trim() || "…" };
  }
}

// ---- Composers ----
function composeInventory(a: InventoryAnswer): string {
  if (!a.items.length) {
    return `I don't have any recorded items for **${a.character.name}**.`;
  }
  const lines = a.items.map((it) => {
    const bits: string[] = [`- **${it.name}**`];
    if (it.kind) bits.push(`_${it.kind.toLowerCase()}_`);
    const meta: string[] = [];
    if (it.sessionNumber) meta.push(`S${it.sessionNumber}`);
    if (it.locationName) meta.push(it.locationName);
    if (it.obtainedAt) meta.push(fmtDate(it.obtainedAt));
    if (meta.length) bits.push(`(${meta.join(" • ")})`);
    if (it.note) bits.push(`— ${truncate(it.note, 120)}`);
    return bits.join(" ");
  });
  return `**${a.character.name} — Current Inventory**\n` + lines.join("\n");
}

function composeStats(a: StatsAnswer): string {
  const order: Array<StatsAnswer["stats"][number]["type"]> = [
    "STR",
    "DEX",
    "CON",
    "INT",
    "WIS",
    "CHA",
  ];
  const map = new Map(a.stats.map((s) => [s.type, s]));
  const parts = order.map((t) => {
    const s = map.get(t);
    if (!s || s.value == null) return `**${t}**: —`;
    const tail =
      s.sessionNumber || s.effectiveAt
        ? ` (as of ${s.sessionNumber ? `S${s.sessionNumber}` : fmtDate(s.effectiveAt!)})`
        : "";
    return `**${t}**: ${s.value}${tail}`;
  });
  return `**${a.character.name} — Current Stats**\n` + parts.join(" • ");
}

function composeLocationEvents(a: LocationEventsAnswer): string {
  if (!a.events.length) {
    return `No recorded activity at **${a.location.name}**.`;
  }
  const lines = a.events.map((e) => {
    const when = fmtDateTime(e.occurredAt);
    const head = `- ${when}${e.sessionNumber ? ` (S${e.sessionNumber})` : ""}: ${e.summary}`;
    const tail = e.snippet
      ? `\n  > ${truncate(e.snippet.text, 160)}${
          e.snippet.startMs != null && e.snippet.endMs != null
            ? ` — ${msToClock(e.snippet.startMs)}–${msToClock(e.snippet.endMs)}`
            : ""
        }`
      : "";
    return head + tail;
  });
  return `**Timeline at ${a.location.name}**\n` + lines.join("\n");
}

function composeSessionSummary(a: SessionSummaryAnswer): string {
  const title = `Session ${a.session.sessionNumber} • ${fmtDate(a.session.date)}`;
  return `**${title}**\n${a.summaryText.trim() || "_(No summary)_"}`
    .replace(/\n{3,}/g, "\n\n");
}

function composeClarification(a: NeedsClarificationAnswer): string {
  const lines = a.options.slice(0, 5).map((o, i) => {
    const tag =
      o.type === "character" ? "Character" :
      o.type === "location"  ? "Location"  :
      "Session";
    const hint = o.hint ? ` — ${o.hint}` : "";
    return `${i + 1}. ${o.label} _(${tag})_${hint}`;
  });
  return `I need to clarify: ${a.reason}\n` + lines.join("\n");
}

// ---- Helpers ----
function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function msToClock(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
