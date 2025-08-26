'use client';
import React from 'react';

export default function DashboardPage() {
  const [text, setText] = React.useState('');
  const [result, setResult] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);

  const analyze = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source: 'live' }),
    });
    const data = await res.json();
    setBusy(false);
    setResult(data);
  };

  const onFile = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    setText(data.text || '');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <input type="file" accept=".pdf,.docx,.txt"
        onChange={e => e.target.files && onFile(e.target.files[0])} />

      <textarea
        className="w-full h-48 border rounded p-2"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="输入或从文件抽取的文本放这里"
      />

      <button
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        onClick={analyze}
        disabled={!text.trim() || busy}
      >
        {busy ? '分析中…' : '分析并保存'}
      </button>

      {result && (
        <div className="space-y-2">
          <div className="text-sm text-gray-600">Session: {result.sessionId} · Lang: {result.language}</div>
          <div>
            <div className="font-semibold">关键句</div>
            <ol className="list-decimal pl-6">
              {result.keySentences?.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ol>
          </div>
          <div>
            <div className="font-semibold">关键词</div>
            <div className="flex flex-wrap gap-2">
              {result.keyPhrases?.map((k: string, i: number) => (
                <span key={i} className="px-2 py-1 bg-gray-100 rounded">{k}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
