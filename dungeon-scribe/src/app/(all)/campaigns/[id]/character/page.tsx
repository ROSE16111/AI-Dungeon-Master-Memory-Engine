// src/app/(all)/campaigns/[id]/character/page.tsx
export default function CampaignCharacterPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Campaign {params.id} — Character</h1>
      <p className="text-sm text-muted-foreground">Character details…</p>
    </div>
  );
}
