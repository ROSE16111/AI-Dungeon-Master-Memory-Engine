export default function SessionPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Session #{params.id}</h1>
      <p className="text-neutral-600">这里以后放：实时字幕 + 时间线。</p>
    </div>
  );
}
