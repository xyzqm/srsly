import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { LanguageCode } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new Anthropic();

interface WordInput { h: string; p: string; m: string; }

interface RequestBody {
  words: WordInput[];
  language: LanguageCode;
  level: number; // HSK 1-6 for zh; JLPT stored as 1-5 where 5=N5 for ja
}

export async function POST(req: NextRequest) {
  const body: RequestBody = await req.json();
  const { words, language, level } = body;
  if (!words?.length) return Response.json({ sentences: {} });

  const levelDesc = language === 'ja' ? `JLPT N${level}` : `HSK ${level}`;
  const wordList = words.map(w => `${w.h} (${w.p}, "${w.m}")`).join('\n');

  const prompt = language === 'ja'
    ? `Generate 3 short example sentences at ${levelDesc} level for each Japanese word below.
Rules:
- Each sentence MUST contain the word in EXACTLY the dictionary form shown (do not conjugate it).
- Keep sentences under 25 characters each.
- Use ${levelDesc}-appropriate vocabulary.
- Return ONLY valid JSON, no explanation.

Words:
${wordList}

Output format:
{"sentences": {"<word>": ["sentence1", "sentence2", "sentence3"]}}`
    : `Generate 3 short example sentences at ${levelDesc} level for each Chinese word below.
Rules:
- Each sentence MUST contain the word exactly as shown.
- Keep sentences under 20 characters each.
- Use ${levelDesc}-appropriate vocabulary.
- Return ONLY valid JSON, no explanation.

Words:
${wordList}

Output format:
{"sentences": {"<word>": ["sentence1", "sentence2", "sentence3"]}}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return Response.json({ sentences: {} });
    return Response.json(JSON.parse(match[0]));
  } catch (e) {
    console.error('missed-review error:', e);
    return Response.json({ sentences: {} }, { status: 500 });
  }
}
