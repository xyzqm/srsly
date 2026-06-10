import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

/** Maximum words to use for generation — keeps the output focused. */
const MAX_WORDS = 8;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-api-key-here') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }

  let words: { h: string; p: string; m: string }[];
  let hskLevel: number;

  try {
    const body = await req.json();
    words = body.words;
    hskLevel = body.hskLevel ?? 4;
    if (!Array.isArray(words) || words.length < 1) {
      return NextResponse.json({ error: 'words array required' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  // Cap to top words (sorted by reviews ascending so newer/less-reviewed come first)
  const targetWords = words.slice(0, MAX_WORDS);

  const wordList = targetWords.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n');
  const levelDesc = hskLevel <= 2 ? 'beginner' : hskLevel <= 4 ? 'intermediate' : 'advanced';

  const prompt = `You are a Chinese language teacher generating personalized daily practice content.

VOCABULARY TO REVIEW TODAY (${targetWords.length} words):
${wordList}

HSK LEVEL: ${hskLevel} (${levelDesc})

Generate a cohesive set of practice materials around a single theme that uses ALL the vocabulary words above. Return a JSON object with EXACTLY this structure:

{
  "title": TOKEN_ARRAY,
  "sentences": [TOKEN_ARRAY, TOKEN_ARRAY, ...],
  "fill": [FILL_ITEM, ...],
  "convo": [CONVO_TURN, ...]
}

TOKEN formats — each token is a small JSON array:
  ["word", "pinyin"]               — regular Chinese word with pinyin
  ["word", "pinyin", "meaning"]    — a VOCAB WORD (use ONLY for words in the list above; meaning = the English gloss from the list)
  ["punctuation"]                  — punctuation only: 。！？，、—…

TOKEN_ARRAY = array of the token arrays above.

FILL_ITEM = {
  "before": TOKEN_ARRAY,
  "answer": ["hanzi", "pinyin"],
  "after": TOKEN_ARRAY,
  "distractors": [["h","p"], ["h","p"], ["h","p"]]
}
  "answer" MUST be one of the vocabulary words in the list.
  "distractors" = 3 plausible but wrong words (can be from the passage; must NOT be the answer).

CONVO_TURN = {
  "key": ["hanzi", ...],
  "tutor": TOKEN_ARRAY,
  "suggestions": [TOKEN_ARRAY, TOKEN_ARRAY]
}
  "key" = 1-3 vocab words used in this turn.
  "suggestions" = 1-2 model replies the student might give. Last turn must have "suggestions": [].

REQUIREMENTS:
1. "title": 3-6 tokens — a natural title for today's theme.
2. "sentences": 4-6 sentences — a short coherent passage; use EVERY vocab word at least once; for each vocab word token add the meaning (3rd array element).
3. "fill": 3-4 items — one per vocab word as the answer. Only use vocab words as answers.
4. "convo": 4-5 turns — a natural dialogue practicing the vocab; vocab words should appear in tutor messages and suggestions; mark them with meaning in TOKEN arrays; last turn has "suggestions": [].
5. Pinyin must use diacritical tone marks: ā á ǎ à, NOT numbers.
6. The passage, fill items, and conversation should share a single coherent everyday theme.
7. Difficulty appropriate for HSK ${hskLevel}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text before or after.`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: 'You output only valid JSON. No markdown, no code blocks, no explanations.',
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    // Strip accidental markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const json = JSON.parse(cleaned);

    return NextResponse.json({ ok: true, data: json, vocabWords: targetWords.map(w => w.h) });
  } catch (err) {
    console.error('[daily-content] generation error:', err);
    return NextResponse.json({ error: 'generation failed', detail: String(err) }, { status: 500 });
  }
}
