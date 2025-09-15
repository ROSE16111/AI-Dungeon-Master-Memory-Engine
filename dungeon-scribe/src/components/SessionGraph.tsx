// components/SessionGraph.tsx
'use client';

import React, { useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

type EventDTO = {
    id: string;
    type: string;
    summary: string;
    occurredAt: string; // ISO
    location?: { id: string; name: string } | null;
    spanSnippets: Array<{ id: string; startMs: number; endMs: number; text: string }>;
};

export type SessionGraphProps = {
    sessionLabel: string; // e.g., "Session 1 — 2025-08-05"
    events: EventDTO[];
};

function msToClock(ms: number) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Simple event card node
function EventCard({ data }: any) {
    const { title, subtitle, time, location, snippets } = data as {
        title: string;
        subtitle?: string;
        time: string;
        location?: string;
        snippets: Array<{ id: string; text: string; startMs: number; endMs: number }>;
    };

    return (
        <div className="rounded-2xl border bg-white shadow p-3 w-[260px]">
        <div className="text-sm text-gray-500">{time}</div>
        <div className="text-base font-semibold mt-1">{title}</div>
        {subtitle ? <div className="text-sm text-gray-700">{subtitle}</div> : null}
        {location ? (
            <div className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 border">
            📍 {location}
            </div>
        ) : null}
        {snippets?.length ? (
            <details className="mt-2">
            <summary className="text-xs cursor-pointer text-gray-600">show snippet</summary>
            <div className="mt-1 space-y-1">
                {snippets.slice(0, 1).map((s) => (
                <div key={s.id} className="text-xs text-gray-700">
                    <span className="font-mono text-[10px] opacity-70 mr-1">
                    {msToClock(s.startMs)}–{msToClock(s.endMs)}
                    </span>
                    {s.text}
                </div>
                ))}
            </div>
            </details>
        ) : null}
        </div>
    );
}

const nodeTypes = { eventCard: EventCard };

export default function SessionGraph({ sessionLabel, events }: SessionGraphProps) {
  // Horizontal timeline positions
    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
        const X = 320; // horizontal spacing
        const Y = 50; // baseline

        const nodes: Node[] = events.map((e, idx) => {
        const time = new Date(e.occurredAt).toLocaleString();
        return {
            id: `e-${e.id}`,
            type: 'eventCard',
            position: { x: idx * X, y: Y },
            data: {
            time,
            title: e.summary || e.type,
            subtitle: e.type,
            location: e.location?.name,
            snippets: e.spanSnippets,
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
        };
        });

        const edges: Edge[] = [];
        for (let i = 0; i < events.length - 1; i++) {
        const cur = events[i];
        const next = events[i + 1];
        edges.push({
            id: `edge-${cur.id}-${next.id}`,
            source: `e-${cur.id}`,
            target: `e-${next.id}`,
            animated: true,
            label: 'next',
        });
        }

        return { nodes, edges };
    }, [events]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    return (
        <div className="w-full h-[70vh]">
        <div className="px-2 py-1 text-sm text-gray-600">Timeline: {sessionLabel}</div>
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
        >
            <MiniMap pannable zoomable />
            <Controls />
            <Background />
        </ReactFlow>
        </div>
    );
}
