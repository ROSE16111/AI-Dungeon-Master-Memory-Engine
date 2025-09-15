// app/sessions/[sessionId]/graph/page.tsx
import { notFound } from 'next/navigation';
import { prisma } from "@/lib/prisma";
import { fetchSessionGraph } from '@/lib/graphs/session-graph';
import SessionGraph from '@/components/SessionGraph';

export const runtime = 'nodejs';

type Props = { params: { sessionId: string } };

export default async function SessionGraphPage({ params }: Props) {
    const data = await fetchSessionGraph(prisma, params.sessionId);
    if (!data) return notFound();

    const sessionLabel = `Session ${data.session.number} — ${new Date(
        data.session.date
    ).toLocaleDateString()}`;

    return (
        <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">Session Graph</h1>
        <SessionGraph sessionLabel={sessionLabel} events={data.events} />
        </div>
    );
}
