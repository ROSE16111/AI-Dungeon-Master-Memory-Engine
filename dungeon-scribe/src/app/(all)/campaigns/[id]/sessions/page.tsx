// src/app/(all)/campaigns/[id]/session/page.tsx
export default function CampaignSessionPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Campaign {params.id} — Session</h1>
      <p className="text-sm text-muted-foreground">Session details…</p>
    </div>
  );
}
