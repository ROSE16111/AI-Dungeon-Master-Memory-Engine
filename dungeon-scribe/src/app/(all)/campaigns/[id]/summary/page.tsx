// src/app/(all)/campaigns/[id]/summary/page.tsx
export default function CampaignSummaryPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Campaign #{params.id} — Summary</h1>
      </header>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-2xl p-6 bg-card">
          <h2 className="text-lg font-semibold mb-2">Character</h2>
          <p className="text-sm text-muted-foreground">Character list / details…</p>
        </div>
        <div className="border rounded-2xl p-6 bg-card">
          <h2 className="text-lg font-semibold mb-2">Session</h2>
          <p className="text-sm text-muted-foreground">Recent sessions…</p>
        </div>
      </section>
    </div>
  );
}
