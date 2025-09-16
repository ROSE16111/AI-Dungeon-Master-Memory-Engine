// components/CharacterSummary.tsx
'use client';

import { useMemo } from 'react';
import { Clock, MapPin, Package, Gauge, ChevronRight } from 'lucide-react';

type Stat = {
    type: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
    value: number | null;
    effectiveAt: string | null;
    sessionNumber: number | null;
};

type InventoryItem = {
    id: string;
    name: string;
    kind: string;
    obtainedAt: string;
    sessionNumber: number | null;
    locationName: string | null;
    note: string | null;
};

type ActivityEvent = {
    id: string;
    type: string;
    summary: string;
    occurredAt: string;
    sessionNumber: number | null;
    locationName: string | null;
    snippet: { id: string; startMs: number; endMs: number; text: string } | null;
};

type AttendanceRow = {
    sessionId: string;
    sessionNumber: number;
    date: string;
    presence: 'PRESENT' | 'ABSENT' | 'LATE';
    joinedAt: string | null;
    leftAt: string | null;
};

export default function CharacterSummary(props: {
    characterName: string;
    level: number | null;
    campaignTitle: string;
    aliases: string[];
    lastActivity: string | null;
    stats: Stat[];
    inventory: InventoryItem[];
    activity: ActivityEvent[];
    attendance: AttendanceRow[];
    attendanceSummary: { present: number; total: number };
    topLocations: string[];
    }) {
    const {
        characterName,
        level,
        campaignTitle,
        aliases,
        lastActivity,
        stats,
        inventory,
        activity,
        attendance,
        attendanceSummary,
        topLocations,
    } = props;

    const statOrder: Stat['type'][] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

    const lastActive = lastActivity
        ? new Date(lastActivity).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
        : '—';

    const statGrid = useMemo(() => {
        const byType = new Map(stats.map((s) => [s.type, s]));
        return statOrder.map((t) => byType.get(t)!);
    }, [stats]);

    return (
        <div className="space-y-6">
        {/* Header */}
        <div className="rounded-2xl border bg-white shadow p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <div className="text-2xl font-semibold">{characterName}</div>
                <div className="text-sm text-gray-600">
                {campaignTitle} {level != null ? ` • Level ${level}` : ''}
                </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
                <Clock size={16} className="opacity-60" />
                <span>Last activity: {lastActive}</span>
            </div>
            </div>
            {aliases.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
                {aliases.map((a) => (
                <span key={a} className="text-xs px-2 py-1 rounded-full bg-gray-100 border">
                    {a}
                </span>
                ))}
            </div>
            ) : null}
        </div>

        {/* Stats */}
        <div className="rounded-2xl border bg-white shadow p-5">
            <div className="flex items-center gap-2 mb-3">
            <Gauge size={18} className="opacity-70" />
            <div className="font-semibold">Current Stats</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {statGrid.map((s) => (
                <div
                key={s.type}
                className="rounded-xl border bg-gray-50 p-3 text-center"
                title={
                    s.effectiveAt
                    ? `As of ${new Date(s.effectiveAt).toLocaleString()}${
                        s.sessionNumber ? ` (S${s.sessionNumber})` : ''
                        }`
                    : 'Not recorded'
                }
                >
                <div className="text-xs text-gray-500 mb-1">{s.type}</div>
                <div className="text-xl font-semibold">{s.value ?? '—'}</div>
                <div className="text-[11px] text-gray-500">
                    {s.effectiveAt ? `S${s.sessionNumber ?? '—'}` : ''}
                </div>
                </div>
            ))}
            </div>
        </div>

        {/* Inventory */}
        <div className="rounded-2xl border bg-white shadow p-5">
            <div className="flex items-center gap-2 mb-3">
            <Package size={18} className="opacity-70" />
            <div className="font-semibold">Current Inventory</div>
            </div>
            {inventory.length ? (
            <ul className="divide-y">
                {inventory.map((it) => (
                <li key={it.id} className="py-3 flex items-start justify-between gap-4">
                    <div>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-gray-600">Kind: {it.kind}</div>
                    {it.locationName ? (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-50 border">
                        <MapPin size={12} className="opacity-70" />
                        <span>{it.locationName}</span>
                        </div>
                    ) : null}
                    {it.note ? <div className="text-xs text-gray-600 mt-1">{it.note}</div> : null}
                    </div>
                    <div className="text-right">
                    <div className="text-sm text-gray-700">
                        {new Date(it.obtainedAt).toLocaleDateString()}
                    </div>
                    <div className="text-[11px] text-gray-500">
                        {it.sessionNumber ? `S${it.sessionNumber}` : ''}
                    </div>
                    </div>
                </li>
                ))}
            </ul>
            ) : (
            <div className="text-sm text-gray-600">No items recorded.</div>
            )}
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl border bg-white shadow p-5">
            <div className="flex items-center gap-2 mb-3">
            <ChevronRight size={18} className="opacity-70" />
            <div className="font-semibold">Recent Activity</div>
            </div>
            {activity.length ? (
            <ul className="space-y-3">
                {activity.map((ev) => (
                <li key={ev.id} className="rounded-xl border bg-gray-50 p-3">
                    <div className="flex items-center justify-between">
                    <div className="font-medium">{ev.summary}</div>
                    <div className="text-sm text-gray-700">
                        {new Date(ev.occurredAt).toLocaleString([], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        })}
                    </div>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                    {ev.type}
                    {ev.sessionNumber ? ` • S${ev.sessionNumber}` : ''}
                    {ev.locationName ? ` • ${ev.locationName}` : ''}
                    </div>
                    {ev.snippet ? (
                    <div className="mt-2 text-[12px] text-gray-800">
                        <span className="font-mono text-[10px] opacity-70 mr-1">
                        {msToClock(ev.snippet.startMs)}–{msToClock(ev.snippet.endMs)}
                        </span>
                        {ev.snippet.text}
                    </div>
                    ) : null}
                </li>
                ))}
            </ul>
            ) : (
            <div className="text-sm text-gray-600">No recent events recorded.</div>
            )}
        </div>

        {/* Attendance & locations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl border bg-white shadow p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-3">
                <Clock size={18} className="opacity-70" />
                <div className="font-semibold">Attendance</div>
                <div className="text-sm text-gray-600 ml-auto">
                Present {attendanceSummary.present}/{attendanceSummary.total}
                </div>
            </div>
            {attendance.length ? (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                    <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4">Session</th>
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Presence</th>
                        <th className="py-2 pr-4">Joined</th>
                        <th className="py-2 pr-4">Left</th>
                    </tr>
                    </thead>
                    <tbody>
                    {attendance.map((a) => (
                        <tr key={a.sessionId} className="border-b last:border-0">
                        <td className="py-2 pr-4">S{a.sessionNumber}</td>
                        <td className="py-2 pr-4">
                            {new Date(a.date).toLocaleDateString([], { dateStyle: 'medium' })}
                        </td>
                        <td className="py-2 pr-4">{a.presence}</td>
                        <td className="py-2 pr-4">
                            {a.joinedAt
                            ? new Date(a.joinedAt).toLocaleTimeString([], { timeStyle: 'short' })
                            : '—'}
                        </td>
                        <td className="py-2 pr-4">
                            {a.leftAt
                            ? new Date(a.leftAt).toLocaleTimeString([], { timeStyle: 'short' })
                            : '—'}
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            ) : (
                <div className="text-sm text-gray-600">No attendance records.</div>
            )}
            </div>

            <div className="rounded-2xl border bg-white shadow p-5">
            <div className="flex items-center gap-2 mb-3">
                <MapPin size={18} className="opacity-70" />
                <div className="font-semibold">Top Locations</div>
            </div>
            {topLocations.length ? (
                <div className="flex flex-wrap gap-2">
                {topLocations.map((n) => (
                    <span key={n} className="text-xs px-2 py-1 rounded-full bg-gray-100 border">
                    {n}
                    </span>
                ))}
                </div>
            ) : (
                <div className="text-sm text-gray-600">No locations recorded.</div>
            )}
            </div>
        </div>
        </div>
    );
}

function msToClock(ms: number) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
