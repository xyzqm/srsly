import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig, levelLabel } from '@/lib/languageConfig';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new Anthropic();

interface WordInput { h: string; p: string; m: string; }

interface RequestBody {
  words: WordInput[];
  language: LanguageCode;
  level: number; // HSK 1-6 for zh; JLPT stored as 1-5 where 5=N5 for ja; CEFR 1-6 for es
}

export async function POST(req: NextRequest) {
  const body: RequestBody = await req.json();
  const { words, language, level } = body;
  if (!words?.length) return Response.json({ sentences: {} });

  const config = getLanguageConfig(language);
  const levelDesc = levelLabel(language, level);
  // `p` is the reading slot — empty for languages with no reading layer (es), so it is
  // omitted rather than printed as an empty pair of parentheses.
  const wordList = words
    .map(w => (config.hasReadings && w.p ? `${w.h} (${w.p}, "${w.m}")` : `${w.h} ("${w.m}")`))
    .join('\n');

  // Inflecting languages must be told to leave the word in its dictionary form, or the
  // example sentences come back conjugated and no longer match the card being reviewed.
  const formRule = config.usesBaseForms
    ? 'Each sentence MUST contain the word in EXACTLY the dictionary form shown (do not conjugate or pluralise it).'
    : 'Each sentence MUST contain the word exactly as shown.';

  const prompt = `Generate 3 short example sentences at ${levelDesc} level for each ${config.name} word below.
Rules:
- ${formRule}
- Keep sentences ${config.shortSentenceLimit} each.
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
