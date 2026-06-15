import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/** Batch size: words per reading passage */
const BATCH_SIZE = 5;

/** Sentences per passage by HSK level — longer passages = better comprehension questions */
const SENTENCES_PER_PASSAGE: Record<number, number> = {
  1: 7, 2: 8, 3: 9, 4: 10, 5: 12, 6: 14,
};

/** How many times to ask the model before giving up (handles occasional bad JSON). */
const MAX_GEN_ATTEMPTS = 2;

/** Repair common model JSON mistakes before parsing. */
function repairJson(s: string): string {
  let r = s;
  // Trailing commas before ] or } (most common model mistake)
  r = r.replace(/,(\s*[}\]])/g, '$1');
  // Unescaped newlines inside string values
  r = r.replace(/"([^"\\]*)(\n)([^"\\]*)"/g, (_, a, _nl, b) => `"${a}\\n${b}"`);
  // Strip any BOM or zero-width characters
  r = r.replace(/^﻿/, '').replace(/[​-‍﻿]/g, '');
  return r;
}

/** Extract and parse the JSON object from a raw model response. Throws if unparseable. */
function extractJson(raw: string): Record<string, unknown> {
  // Strip markdown fences if the model wrapped the output
  let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // If the model prepended explanation text, narrow to the first { … last }
  const jStart = cleaned.indexOf('{');
  const jEnd = cleaned.lastIndexOf('}');
  if (jStart > 0 && jEnd > jStart) cleaned = cleaned.slice(jStart, jEnd + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return JSON.parse(repairJson(cleaned)); // throws if still invalid
  }
}

export async function POST(req: NextRequest) {
  // Use SRSLY_API_KEY to avoid being blocked by Claude Code's ANTHROPIC_API_KEY='' override.
  // Falls back to ANTHROPIC_API_KEY for standard deployments.
  const apiKey = process.env.SRSLY_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  let words: { h: string; p: string; m: string; compounds?: string[] }[];
  let hskLevel: number;
  let themeOffset: number;
  let passageOnly: boolean;

  try {
    const body = await req.json();
    words = body.words ?? [];
    hskLevel = body.hskLevel ?? 4;
    themeOffset = body.themeOffset ?? 0;
    passageOnly = body.passageOnly ?? false;
    if (!Array.isArray(words)) {
      return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
    }
    // Empty words → passage-only (fill/convo fall back to static in the client)
    if (words.length === 0) passageOnly = true;
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

  // Words whose reading must be surfaced through a compound (e.g. 行 háng → 银行).
  // Fires per-word whenever compounds are present — independent of whether the deck
  // happens to hold another reading of the same character.
  const compoundWords = words.filter(w => w.compounds && w.compounds.length > 0);
  const compoundNote = compoundWords.length > 0
    ? `\nREADING-IN-COMPOUND REQUIREMENT: Each reading below does NOT stand alone as a bare character — you MUST use it through ONE of its whole multi-character words (emitted as a single token), picking whichever best fits the passage. Never use the bare character for these readings.\n${compoundWords.map(w =>
        `  ${w.h} (${w.p}, "${w.m.split(/[;,]/)[0].trim()}") → use one of: ${w.compounds!.join('、')}`
      ).join('\n')}\n`
    : '';

  // Detect polyphones (same hanzi, multiple readings in the deck) so each reading
  // is used in a distinct, disambiguating context.
  const hanziGroups = new Map<string, typeof words>();
  for (const w of words) {
    if (!hanziGroups.has(w.h)) hanziGroups.set(w.h, []);
    hanziGroups.get(w.h)!.push(w);
  }
  const polyphonePairs = [...hanziGroups.entries()].filter(([, ws]) => ws.length > 1);
  const polyphoneNote = polyphonePairs.length > 0
    ? `\nPOLYPHONE GUIDANCE: These characters carry multiple readings (多音字). Use EACH reading in the passage, in natural grammatical contexts that make the intended reading clear. Natural, correct sentences ALWAYS take priority over forcing a reading.\n${polyphonePairs.map(([h, ws]) =>
        `  ${h}: ${ws.map(w => `${w.p} = "${w.m.split(';')[0].trim()}"`).join(' / ')}`
      ).join('\n')}\n`
    : '';

  const readingNotes = compoundNote + polyphoneNote;

  const batchDescriptions = batches.map((batch, bi) => {
    const list = batch.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n');
    return `PASSAGE ${bi + 1} WORDS:\n${list}`;
  }).join('\n\n');

  // Shared token-format rules injected into both prompt variants
  const TOKEN_RULES = `
TOKEN formats — each token is a small JSON array:
  ["word", "pinyin", "meaning"]  — REQUIRED for every word with 2+ characters and any content word
  ["word", "pinyin"]             — ONLY single-character function particles: 的、了、是、在、和、也、都、有、没、不、把、被、让、与、或、于
  ["。"]  — Punctuation: use the ACTUAL punctuation character as text. Examples: ["。"] ["，"] ["！"] ["？"] ["、"] ["—"] ["…"]

CRITICAL TOKENIZATION RULES:
1. Every word with 2+ characters MUST be a 3-element array ["word","pinyin","meaning"]. No exceptions.
2. NEVER emit ["word","pinyin"] for any multi-character word.
3. Do NOT bundle multiple words into one token.
4. For vocab words, use the exact meaning from the word list.
5. NEVER split compound words. Each multi-character word is ONE token:
   已经→["已经","yǐjīng","already"]   NOT 已+经
   科技→["科技","kējì","technology"]  NOT 科+技
   生活→["生活","shēnghuó","life"]    NOT 生+活
   学习→["学习","xuéxí","study"]      NOT 学+习
   工作→["工作","gōngzuò","work"]     NOT 工+作
   朋友→["朋友","péngyou","friend"]   NOT 朋+友
   因为→["因为","yīnwèi","because"]   NOT 因+为
   所以→["所以","suǒyǐ","therefore"]  NOT 所+以
   但是→["但是","dànshì","but"]       NOT 但+是
   可以→["可以","kěyǐ","can"]         NOT 可+以
   知道→["知道","zhīdào","know"]      NOT 知+道
   觉得→["觉得","juéde","feel"]       NOT 觉+得
   喜欢→["喜欢","xǐhuan","like"]      NOT 喜+欢
   高兴→["高兴","gāoxìng","happy"]    NOT 高+兴
   漂亮→["漂亮","piàoliang","pretty"] NOT 漂+亮
6. NEVER emit empty tokens like ["",""] or ["","",""]. Every token must have a non-empty text field.
7. For punctuation ALWAYS use the actual character (。，！？、—…), NEVER the word "punctuation".
8. Proper names (people, places) are ONE token, never split into characters:
   小王→["小王","Xiǎo Wáng","(name) Xiao Wang"]   NOT 小+王
   老李→["老李","Lǎo Lǐ","(name) Old Li"]          NOT 老+李
   北京→["北京","Běijīng","Beijing"]               NOT 北+京`.trim();

  const QUESTION_SCHEMA = `QUESTION = {
  "q": TOKEN_ARRAY,
  "model": "English model answer (1-2 sentences)",
  "key": ["hanzi_word1", "hanzi_word2"],
  "options": [
    {"tokens": TOKEN_ARRAY, "correct": true},
    {"tokens": TOKEN_ARRAY, "correct": false},
    {"tokens": TOKEN_ARRAY, "correct": false},
    {"tokens": TOKEN_ARRAY, "correct": false}
  ]
}`;

  // passage-only prompt (used by loadMore and empty-deck daily load)
  const passageOnlyPrompt = `You are a Chinese language teacher generating a reading passage.

HSK LEVEL: ${hskLevel} (${levelDesc})
TODAY'S THEME: ${dailyTheme} — the passage must revolve around this theme.
${words.length > 0 ? `\nWORDS TO USE:\n${words.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n')}${readingNotes}` : `\nNo specific vocabulary required — choose naturally appropriate words for the level and theme.`}

Generate a JSON object with EXACTLY this structure:

{
  "passages": [PASSAGE]
}

PASSAGE = {
  "title": TOKEN_ARRAY,
  "sentences": [TOKEN_ARRAY, TOKEN_ARRAY, ...],
  "questions": [QUESTION, QUESTION, QUESTION, QUESTION, QUESTION]
}
  ${words.length > 0 ? 'Use ALL the words above naturally in a coherent story or description' : 'Write a coherent story or description'} (${sentenceCount}–${sentenceCount + 2} sentences).
  Include exactly 5 comprehension questions testing both passage understanding AND vocabulary meaning.
  Question variety: mix factual recall (who/what/when), inference, vocabulary-in-context, and cause-effect questions.
  The "key" array must contain the specific hanzi words from the passage whose meaning is tested by that question.

${TOKEN_RULES}

${QUESTION_SCHEMA}

REQUIREMENTS:
1. Exactly 1 passage in the "passages" array.
2. ${sentenceCount}–${sentenceCount + 2} sentences, exactly 5 questions.
3. Pinyin must use diacritical tone marks: ā á ǎ à, NOT numbers.
4. Difficulty appropriate for HSK ${hskLevel}: ${hskLevel <= 2 ? 'simple grammar, short sentences' : hskLevel <= 4 ? 'varied patterns, moderate complexity' : 'complex grammar, literary or abstract vocabulary'}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  // full prompt (initial daily load — passage + fill + convo)
  const fullPrompt = `You are a Chinese language teacher generating personalized daily practice content.

HSK LEVEL: ${hskLevel} (${levelDesc})
TODAY'S THEME: ${dailyTheme} — all passages, fill items, and conversation must revolve around this theme.

${batchDescriptions}

ALL WORDS (used for fill-in-blank and conversation):
${words.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n')}${readingNotes}
Generate a JSON object with EXACTLY this structure:

{
  "passages": [PASSAGE],
  "fill": [FILL_ITEM, ...],
  "convo": [CONVO_TURN, ...]
}

PASSAGE = {
  "title": TOKEN_ARRAY,
  "sentences": [TOKEN_ARRAY, TOKEN_ARRAY, ...],
  "questions": [QUESTION, QUESTION, QUESTION, QUESTION, QUESTION]
}
  Each passage uses ALL the words from its designated word list.
  Each passage is a coherent, flowing story or description (${sentenceCount}–${sentenceCount + 2} sentences).
  Each passage must have exactly 5 comprehension questions testing both passage understanding AND vocabulary meaning.
  Question variety: mix factual recall (who/what/when), inference, vocabulary-in-context, and cause-effect questions.
  The "key" array must contain the specific hanzi words from the passage whose meaning is tested by that question.

${TOKEN_RULES}

${QUESTION_SCHEMA}

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
2. Each passage: ${sentenceCount}–${sentenceCount + 2} sentences, exactly 5 questions.
3. "fill": 5–8 items, one per answer word from ALL WORDS.
4. "convo": 4–5 turns practicing ALL WORDS in a realistic dialogue; last turn has "suggestions": [].
5. Pinyin must use diacritical tone marks: ā á ǎ à, NOT numbers.
6. Difficulty appropriate for HSK ${hskLevel}: ${hskLevel <= 2 ? 'simple grammar, short sentences' : hskLevel <= 4 ? 'varied patterns, moderate complexity' : 'complex grammar, literary or abstract vocabulary'}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  const prompt = passageOnly ? passageOnlyPrompt : fullPrompt;

  // Generate, retrying once if the model returns unparseable JSON (it occasionally does).
  let json: Record<string, unknown> | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 16000,
        system: 'You output only valid JSON. No markdown, no code blocks, no explanations.',
        messages: [{ role: 'user', content: prompt }],
      });
      const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
      json = extractJson(raw);
      break; // parsed successfully
    } catch (err) {
      lastErr = err;
      console.error(`[daily-content] attempt ${attempt}/${MAX_GEN_ATTEMPTS} failed:`, String(err));
    }
  }

  if (!json) {
    return NextResponse.json({ error: 'generation failed', detail: String(lastErr) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: json,
    vocabWords: words.map(w => w.h),
    batches: batches.map(b => b.map(w => w.h)),
  });
}
