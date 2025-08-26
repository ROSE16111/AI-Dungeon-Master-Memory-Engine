import { NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  let text = '';
  if (name.endsWith('.pdf')) {
    const data = await pdf(buf);
    text = (data.text || '').trim();
  } else if (name.endsWith('.docx')) {
    const res = await mammoth.extractRawText({ buffer: buf });
    text = (res.value || '').trim();
  } else if (name.endsWith('.txt')) {
    text = buf.toString('utf-8');
  } else {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });
  }

  return NextResponse.json({ text });
}
