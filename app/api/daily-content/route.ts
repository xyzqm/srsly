import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/** Batch size: words per reading passage */
const BATCH_SIZE = 5;

/** Sentences per passage by HSK level — longer passages = better comprehension questions */
const SENTENCES_PER_PASSAGE: Record<number, number> = {
  1: 7, 2: 8, 3: 9, 4: 10, 5: 12, 6: 14,
};

export async function POST(req: NextRequest) {
  // Use SRSLY_API_KEY to avoid being blocked by Claude Code's ANTHROPIC_API_KEY='' override.
  // Falls back to ANTHROPIC_API_KEY for standard deployments.
  const apiKey = process.env.SRSLY_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  let words: { h: string; p: string; m: string }[];
  let hskLevel: number;
  let themeOffset: number;

  try {
    const body = await req.json();
    words = body.words;
    hskLevel = body.hskLevel ?? 4;
    themeOffset = body.themeOffset ?? 0;
    if (!Array.isArray(words) || words.length < 1) {
      return NextResponse.json({ error: 'words array required' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  const levelDesc = hskLevel <= 2 ? 'beginner' : hskLevel <= 4 ? 'intermediate' : 'advanced';
  const sentenceCount = SENTENCES_PER_PASSAGE[hskLevel] ?? 7;

  // Pick a daily theme so passages vary across days even with the same vocab words
  const DAILY_THEMES = [
    'travel and transportation', 'food and restaurants', 'work and career',
    'family and relationships', 'health and exercise', 'technology and the internet',
    'nature and the environment', 'shopping and money', 'education and learning',
    'art and entertainment', 'city life and neighborhoods', 'weather and seasons',
    'friendship and social life', 'hobbies and free time', 'history and culture',
  ];
  const today = new Date().toISOString().slice(0, 10);
  const dayHash = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);
  const dailyTheme = DAILY_THEMES[(dayHash + themeOffset) % DAILY_THEMES.length];

  // Split words into batches of BATCH_SIZE — each batch gets its own passage
  const batches: typeof words[] = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    batches.push(words.slice(i, i + BATCH_SIZE));
  }
  const numPassages = batches.length;

  const batchDescriptions = batches.map((batch, bi) => {
    const list = batch.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n');
    return `PASSAGE ${bi + 1} WORDS:\n${list}`;
  }).join('\n\n');

  const prompt = `You are a Chinese language teacher generating personalized daily practice content.

HSK LEVEL: ${hskLevel} (${levelDesc})
TODAY'S THEME: ${dailyTheme} — all passages, fill items, and conversation must revolve around this theme.

${batchDescriptions}

ALL WORDS (used for fill-in-blank and conversation):
${words.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n')}

Generate a JSON object with EXACTLY this structure:

{
  "passages": [PASSAGE, PASSAGE, ...],
  "fill": [FILL_ITEM, ...],
  "convo": [CONVO_TURN, ...]
}

PASSAGE = {
  "title": TOKEN_ARRAY,
  "sentences": [TOKEN_ARRAY, TOKEN_ARRAY, ...],
  "questions": [QUESTION, QUESTION, QUESTION]
}
  Each passage uses ALL the words from its designated word list (PASSAGE 1 uses PASSAGE 1 WORDS, etc.).
  Each passage is a coherent, flowing story or description (${sentenceCount}–${sentenceCount + 2} sentences).
  All passages are set within today's theme (${dailyTheme}) and feel connected.
  Each passage must have exactly 3 comprehension questions about its own content.

TOKEN formats — each token is a small JSON array:
  ["word", "pinyin", "meaning"]  — REQUIRED for every word with 2+ characters and any content word
  ["word", "pinyin"]             — ONLY single-character function particles: 的、了、是、在、和、也、都、有、没、不、把、被、让、与、或、于
  ["punctuation"]                — Punctuation only: 。！？，、—…

CRITICAL TOKENIZATION RULES:
1. Every word with 2+ characters MUST be a 3-element array ["word","pinyin","meaning"]. No exceptions.
2. NEVER emit ["word","pinyin"] for any multi-character word.
3. Do NOT bundle multiple words into one token.
4. For vocab words, use the exact meaning from the list above.
5. NEVER split compound words. Even if a single character (e.g. 节, 学, 习) appears in the vocab list, that does NOT mean you should break apart compound words containing it. 节日 must ALWAYS be one token ["节日","jiérì","festival/holiday"], never split into 节+日. The same applies to all compounds: 中秋节, 春节, 学习, 意义, etc.
6. NEVER emit empty tokens like ["",""] or ["","",""]. Every token must have a non-empty text field.

QUESTION = {
  "q": TOKEN_ARRAY,
  "model": "English model answer (1-2 sentences)",
  "key": ["hanzi_word1", "hanzi_word2"],
  "options": [
    {"tokens": TOKEN_ARRAY, "correct": true},
    {"tokens": TOKEN_ARRAY, "correct": false},
    {"tokens": TOKEN_ARRAY, "correct": false},
    {"tokens": TOKEN_ARRAY, "correct": false}
  ]
}

FILL_ITEM = {
  "before": TOKEN_ARRAY,
  "answer": ["hanzi", "pinyin"],
  "after": TOKEN_ARRAY,
  "distractors": [["h","p"], ["h","p"], ["h","p"]]
}
  "answer" MUST be one of the ALL WORDS above.

CONVO_TURN = {
  "key": ["hanzi", ...],
  "tutor": TOKEN_ARRAY,
  "suggestions": [TOKEN_ARRAY, TOKEN_ARRAY]
}
  Last turn must have "suggestions": [].

REQUIREMENTS:
1. Generate exactly ${numPassages} passage(s) in the "passages" array.
2. Each passage: ${sentenceCount}–${sentenceCount + 2} sentences, exactly 3 questions.
3. "fill": 5–8 items, one per answer word from ALL WORDS.
4. "convo": 4–5 turns practicing ALL WORDS in a realistic dialogue; last turn has "suggestions": [].
5. Pinyin must use diacritical tone marks: ā á ǎ à, NOT numbers.
6. Difficulty appropriate for HSK ${hskLevel}: ${hskLevel <= 2 ? 'simple grammar, short sentences' : hskLevel <= 4 ? 'varied patterns, moderate complexity' : 'complex grammar, literary or abstract vocabulary'}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      system: 'You output only valid JSON. No markdown, no code blocks, no explanations.',
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Attempt to repair common AI JSON mistakes before parsing.
    // Most frequent: trailing commas before ] or } (strict JSON disallows these).
    function repairJson(s: string): string {
      return s.replace(/,(\s*[}\]])/g, '$1');
    }

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(cleaned);
    } catch {
      json = JSON.parse(repairJson(cleaned));
    }

    return NextResponse.json({
      ok: true,
      data: json,
      vocabWords: words.map(w => w.h),
      batches: batches.map(b => b.map(w => w.h)),
    });
  } catch (err) {
    console.error('[daily-content] generation error:', err);
    return NextResponse.json({ error: 'generation failed', detail: String(err) }, { status: 500 });
  }
}
