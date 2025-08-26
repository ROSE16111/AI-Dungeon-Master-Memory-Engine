import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import keyword_extractor from 'keyword-extractor';
import { extract as jiebaExtract } from '@node-rs/jieba';
import * as sbd from 'sbd'

export const runtime = 'nodejs';

type AnalyzeBody = {
  title?: string;
  text: string;
  language?: 'en' | 'zh' | 'auto';
  source?: 'live' | 'upload';
  topK?: number;
  topN?: number;
};

function isChinese(text: string) {
  return /[\u4e00-\u9fa5]/.test(text);
}

function splitChineseSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？；\?！;])\s*/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function topKeywords(text: string, lang: 'zh'|'en', k: number): string[] {
  if (lang === 'zh') {
     return jiebaExtract(text, k).map((x: { keyword: string; weight: number }) => x.keyword);
  } else {
    const words = keyword_extractor.extract(text, {
      language: 'english',
      remove_digits: true,
      return_changed_case: true,
      remove_duplicates: false,
    });
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([w]) => w);
  }
}

function scoreSentences(sentences: string[], keywords: string[], lang: 'zh'|'en') {
  const set = new Set(keywords);
  return sentences
    .map((s) => {
      let score = 0;
      if (lang === 'zh') {
        for (const kw of set) {
          const m = s.match(new RegExp(kw, 'g'));
          if (m) score += m.length;
        }
      } else {
        const tokens = s.toLowerCase().match(/[a-z0-9']+/g) || [];
        for (const t of tokens) if (set.has(t)) score += 1;
      }
      score = score / Math.max(1, s.length / 80);
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);
}

export async function POST(req: Request) {
  const body = (await req.json()) as AnalyzeBody;
  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ error: 'Empty text' }, { status: 400 });

  const lang: 'zh'|'en' =
    body.language === 'zh' ? 'zh' :
    body.language === 'en' ? 'en' :
    isChinese(text) ? 'zh' : 'en';

  const sentences =
    lang === 'zh'
      ? splitChineseSentences(text)
      : sbd.sentences(text, { newline_boundaries: true });

  const topK = body.topK ?? 12;
  const topN = body.topN ?? 5;

  const keywords = topKeywords(text, lang, topK);
  const ranked = scoreSentences(sentences, keywords, lang);
  const keySentences = ranked.slice(0, topN).map(r => r.s);

  const session = await prisma.session.create({
    data: {
      title: body.title || (body.source === 'upload' ? 'Uploaded Doc' : 'Live Session'),
      language: lang,
      source: body.source || 'live',
      text,
      keyPhrases: keywords,
      keySentences,
    },
  });

  return NextResponse.json({
    sessionId: session.id,
    language: lang,
    keyPhrases: keywords,
    keySentences,
  });
}
