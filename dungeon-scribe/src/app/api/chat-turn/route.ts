import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from "@/lib/prisma";
import { runChatTurn } from '../../../lib/chat/orchestrator';

export const runtime = 'nodejs';

const BodySchema = z.object({
    campaignId: z.string().min(1),
    text: z.string().min(1),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { campaignId, text } = BodySchema.parse(body);
        const result = await runChatTurn(prisma, { campaignId, text });
        return Response.json({ ok: true, result });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid request';
        return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
        });
    }
}
