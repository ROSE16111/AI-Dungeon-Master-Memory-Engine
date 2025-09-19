// ...existing code...
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

type Props = { params: { id: string; sessionId: string } };

export default async function SessionSummaryPage({ params }: Props) {
    const { id: campaignId, sessionId } = params;

    // Ensure the session belongs to this campaign
    const session = await prisma.Session.findFirst({
        where: { id: sessionId, campaignId },
        select: { sessionNumber: true, date: true, summary: true },
    });
    if (!session) return notFound();

    const summary = session.summary?.trim();

    return (
        <div className="p-6">
        {/* Hidden heading for a11y; page body is just the summary text */}
        <h1>
            {`Session ${session.sessionNumber} — ${new Date(session.date).toLocaleDateString()}`}
        </h1>
        <div className="whitespace-pre-wrap text-base leading-relaxed">
            {summary ?? 'No summary saved yet.'}
        </div>
        </div>
    );
}
// ...existing code...