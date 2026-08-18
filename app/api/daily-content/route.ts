import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { consumeAiCredit } from '@/lib/supabase/server';
import type { LanguageCode } from '@/lib/types';
import { sentenceCountForLevel, getLanguageConfig, toLanguageCode, levelLabel, difficultyTier } from '@/lib/languageConfig';
import { segmentJa, type RawTok } from '@/lib/server/kuromojiSegmenter';
import { segmentEs } from '@/lib/server/spanishSegmenter';
import { segmentFr } from '@/lib/server/frenchSegmenter';

const GUEST_LIMIT_MSG = "You've used your free AI generations. Sign in for unlimited AI content and to sync your progress across devices.";

/** Fallback batch size when the client doesn't specify one. */
const DEFAULT_BATCH_SIZE = 5;
/** Hard bounds on the client-configurable words-per-passage batch size. */
const MIN_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 12;

/** How many times to ask the model before giving up (handles occasional bad JSON). */
const MAX_GEN_ATTEMPTS = 2;

/** Independently-generated content blocks. */
type Section = 'passage' | 'fill' | 'convo' | 'questions';

// ─── Token wire format ───────────────────────────────────────────────────────
// Chinese: the model emits each token-list as a single pipe-delimited string of bare hanzi
// (no pinyin/meaning) — e.g. "我|住|在|城市|。". We resolve pinyin/meaning from the
// dictionary on the client. Proper names are the one exception: the model tags them
// "~汉字::pīnyīn::gloss" since the dictionary won't cover them. We expand these strings
// back into the RawTok arrays the client parser already consumes.
//
// Japanese: the model just writes plain sentence text (see PIPE_RULES_JA below) — no pipes,
// no inline furigana. Segmentation, fusion of conjugated forms, and meaning resolution all
// happen server-side via kuromoji (lib/server/kuromojiSegmenter.ts) instead of relying on the
// model to self-segment, which it didn't always do correctly (e.g. splitting 使っています).

/** Longest known-name/word a greedy merge will reconstruct from split segments. */
const MAX_NAME_MERGE = 4;

/** Split one pipe-delimited token string into RawTok[]. */
function parseTokenString(s: unknown, inputMap: Map<string, { p: string; m: string }>): RawTok[] {
  if (typeof s !== 'string' || !s) return [];

  // First pass: clean each segment, surfacing any inline name escape (h::pinyin::gloss)
  // the model may have emitted instead of using the "names" side-channel.
  type Seg = { h: string; inline: { p: string; m: string } | null };
  const segs: Seg[] = [];
  for (const rawSeg of s.split('|')) {
    let seg = rawSeg.trim();
    if (!seg) continue;
    if (seg.startsWith('~')) seg = seg.slice(1).trim();
    if (seg.includes('::')) {
      const [h, p = '', m = ''] = seg.split('::').map(x => x.trim());
      if (!h) continue;
      segs.push({ h, inline: p ? { p, m } : null });
      continue;
    }
    segs.push({ h: seg, inline: null });
  }

  // Second pass: greedily merge consecutive plain segments whose concatenation is a known
  // name/word in the map. The model sometimes splits a full name across tokens (王|小雨)
  // or breaks a compound apart; since the map holds the model's listed names plus the
  // practiced words, rejoining against it keeps names like 王小雨 whole. Inline-escaped
  // names are authoritative and never merged.
  const out: RawTok[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].inline) {
      out.push([segs[i].h, segs[i].inline!.p, segs[i].inline!.m]);
      continue;
    }
    let merged: string | null = null;
    let used = 1;
    for (let len = Math.min(MAX_NAME_MERGE, segs.length - i); len >= 2; len--) {
      const window = segs.slice(i, i + len);
      if (window.some(x => x.inline)) continue;
      const joined = window.map(x => x.h).join('');
      if (inputMap.has(joined)) { merged = joined; used = len; break; }
    }
    // Target/due words and listed names carry authoritative pinyin+meaning (preserves the
    // intended polyphone reading); everything else stays bare for client dict lookup.
    const text = merged ?? segs[i].h;
    const hit = inputMap.get(text);
    out.push(hit ? [text, hit.p, hit.m] : [text]);
    i += used - 1;
  }
  return out;
}

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

/**
 * Run one generation prompt, retrying when the model returns unparseable JSON OR
 * an output that fails `isComplete` (e.g. missing fill/convo). Returns the first
 * complete result as `json`, plus the last parseable result as `best` so callers
 * can degrade gracefully instead of failing outright.
 */
async function generateJson(
  client: Anthropic,
  prompt: string,
  isComplete: (j: Record<string, unknown>) => boolean,
  label: string,
): Promise<{ json: Record<string, unknown> | null; best: Record<string, unknown> | null }> {
  let json: Record<string, unknown> | null = null;
  let best: Record<string, unknown> | null = null;
  for (let attempt = 1; attempt <= MAX_GEN_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 16000,
        system: 'You output only valid JSON. No markdown, no code blocks, no explanations.',
        messages: [{ role: 'user', content: prompt }],
      });
      const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
      const parsed = extractJson(raw);
      best = parsed;
      if (isComplete(parsed)) { json = parsed; break; } // parsed AND has required blocks
      console.error(`[daily-content] ${label} attempt ${attempt}/${MAX_GEN_ATTEMPTS} incomplete`);
    } catch (err) {
      console.error(`[daily-content] ${label} attempt ${attempt}/${MAX_GEN_ATTEMPTS} failed:`, String(err));
    }
  }
  return { json, best };
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
  let sections: Section[];
  let passageText: string;
  let language: LanguageCode;
  let batchSize: number;

  try {
    const body = await req.json();
    words = body.words ?? [];
    language = toLanguageCode(body.language);
    hskLevel = body.hskLevel ?? getLanguageConfig(language).defaultLevel;
    themeOffset = body.themeOffset ?? 0;
    batchSize = Math.min(Math.max(parseInt(body.wordsPerPassage, 10) || DEFAULT_BATCH_SIZE, MIN_BATCH_SIZE), MAX_BATCH_SIZE);
    passageText = typeof body.passageText === 'string' ? body.passageText : '';
    // `sections` selects which blocks to generate. Back-compat: `passageOnly` → passage only.
    if (Array.isArray(body.sections) && body.sections.length > 0) {
      sections = body.sections.filter((s: unknown): s is Section =>
        s === 'passage' || s === 'fill' || s === 'convo' || s === 'questions');
    } else if (body.passageOnly) {
      sections = ['passage'];
    } else {
      sections = ['passage', 'fill', 'convo'];
    }
    if (!Array.isArray(words)) {
      return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
    }
    // Fill/convo need vocab words to anchor on — without them, only a passage is meaningful.
    if (words.length === 0) sections = sections.filter(s => s === 'passage');
    if (sections.length === 0) sections = ['passage'];
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 });
  }

  // Meter generation: guests get a small budget, signed-in users are unlimited. Checked
  // (and decremented) before we spend any Anthropic tokens. No-op when Supabase is off.
  const credit = await consumeAiCredit();
  if (!credit.allowed) {
    return NextResponse.json({ error: 'guest_limit', message: GUEST_LIMIT_MSG, aiRemaining: 0 }, { status: 402 });
  }

  // Authoritative pinyin/meaning for the practiced words, keyed by hanzi.
  const inputMap = new Map<string, { p: string; m: string }>();
  for (const w of words) {
    if (!inputMap.has(w.h)) inputMap.set(w.h, { p: w.p, m: w.m });
  }

  // Difficulty tier, level label and language name all come off the language config —
  // the numbering runs in opposite directions per language (HSK 6 and CEFR C2 are hardest,
  // JLPT N1 is hardest), so this must not be derived from the number here.
  const langConfig = getLanguageConfig(language);
  const levelDesc = difficultyTier(language, hskLevel);
  const sentenceCount = sentenceCountForLevel(language, hskLevel);
  const langName = langConfig.name;
  const levelName = levelLabel(language, hskLevel);

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

  // Split words into batches of batchSize (the user's configured words-per-passage) —
  // each batch gets its own passage.
  const batches: typeof words[] = [];
  for (let i = 0; i < words.length; i += batchSize) {
    batches.push(words.slice(i, i + batchSize));
  }

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

  // Compound/polyphone notes are Chinese-specific — they exist to disambiguate hanzi
  // readings, which no other supported language has.
  const readingNotes = language === 'zh' ? compoundNote + polyphoneNote : '';
  const wordList = words.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n');
  const difficultyByLevel = (beginner: string, intermediate: string, advanced: string) =>
    levelDesc === 'beginner' ? beginner : levelDesc === 'intermediate' ? intermediate : advanced;
  const difficultyNote = difficultyByLevel('simple grammar, short sentences', 'varied patterns, moderate complexity', 'complex grammar, literary or abstract vocabulary');

  // Shared pipe-format rules injected into every prompt variant
  const PIPE_RULES_ZH = `
OUTPUT FORMAT — THIS IS THE MOST IMPORTANT RULE:
Every field marked "WORDS" below MUST be a SINGLE STRING in which you place a | (vertical bar)
between EVERY word and EVERY punctuation mark. Do NOT write an ordinary sentence — you MUST
insert a | between every single token. A sentence with no | bars is INVALID output.

  CORRECT:  "在|现代|社会|中|，|艺术|对|经济|发展|很|重要|。"
  WRONG:    "在现代社会中，艺术对经济发展很重要。"   ← no bars = INVALID, do NOT do this

Rules for the tokens between the bars:
  - Output ONLY hanzi and punctuation. NO pinyin, NO English, NO tone numbers, NO meanings.
  - Keep every multi-character word / compound WHOLE as one token between bars:
      现代 经济 发展 已经 科技 朋友 因为 所以 — never 现|代, 经|济, 已|经, 朋|友.
  - Keep proper names (people, places) WHOLE as ONE token — a surname AND its given name
    together count as a single name token: 王小雨 (never 王|小雨), 李小明 (never 李|小明), 北京, 小王.
  - Each punctuation mark (。 ， ！ ？ 、 — …) is its OWN token between bars.
  - NEVER output an empty token, and NEVER write pinyin or English inside the bars.

PROPER NAMES: list EVERY person/place name you used in the separate "names" array (see schema),
giving its pinyin and a short English gloss. The pipe strings stay pure hanzi; names get their
reading from this list.`.trim();

  // Japanese: unlike Chinese, the model does NOT segment or annotate anything — it just
  // writes plain, natural Japanese sentence text. Segmentation, conjugation fusion, and
  // furigana/meaning resolution all happen server-side via kuromoji (a real morphological
  // analyzer) after generation, which is deterministic where prompt-based self-segmentation
  // wasn't (the model would occasionally split inflected forms, e.g. 使っています → 使 + っています).
  const PIPE_RULES_JA = `
OUTPUT FORMAT:
Every field marked "WORDS" below is a SINGLE STRING of plain, natural, grammatically correct
Japanese — normal sentence text, exactly as it would appear in real writing. Do NOT insert any
"|" bars, "::" furigana annotations, or other markup — write it the way a native speaker would.

  CORRECT:  "私は毎朝コーヒーを飲みます。"
  WRONG:    "私|は|毎朝|コーヒー|を|飲みます|。"   ← do not add bars or segment it yourself
  WRONG:    "私::わたし|は|..."                    ← do not add furigana yourself

PROPER NAMES: list every person/place name in the "names" array (see schema) with its reading —
kuromoji's dictionary coverage of proper nouns is incomplete, so this is still needed for names.`.trim();

  // Spanish: like Japanese, the model does NOT segment anything — it writes plain prose and
  // lib/server/spanishSegmenter.ts splits it on whitespace/punctuation afterwards, which for
  // a space-delimited language is exact rather than merely reliable. The one thing worth
  // spelling out is the inverted opening marks, since they are the only punctuation the
  // model tends to drop.
  const PIPE_RULES_ES = `
OUTPUT FORMAT:
Every field marked "WORDS" below is a SINGLE STRING of plain, natural, grammatically correct
Spanish — normal sentence text, exactly as it would appear in real writing. Do NOT insert any
"|" bars or other markup, and do NOT add English translations inline.

  CORRECT:  "¿Dónde está la biblioteca? Vamos a estudiar allí."
  WRONG:    "Vamos|a|estudiar|allí|."        ← do not add bars or segment it yourself
  WRONG:    "Vamos a estudiar allí (we are going to study there)."  ← no inline translation

PUNCTUATION: use real Spanish punctuation, including the inverted opening marks ¿ and ¡ on
every question and exclamation, and written accents on every word that takes one.

PROPER NAMES: list every person/place name in the "names" array (see schema) so they can be
glossed — the dictionary's coverage of proper nouns is incomplete.`.trim();

  // French: plain prose, segmented server-side by lib/server/frenchSegmenter.ts. The rules
  // worth stating are the ones the model actually gets wrong — elision and the accents,
  // both of which change which dictionary entry a word resolves to.
  const PIPE_RULES_FR = `
OUTPUT FORMAT:
Every field marked "WORDS" below is a SINGLE STRING of plain, natural, grammatically correct
French — normal sentence text, exactly as it would appear in real writing. Do NOT insert any
"|" bars or other markup, and do NOT add English translations inline.

  CORRECT:  "Hier, nous sommes allés au marché pour acheter des fruits frais."
  WRONG:    "Hier|nous|sommes|allés|."          ← do not add bars or segment it yourself
  WRONG:    "Hier (yesterday), nous sommes..."  ← no inline translation

ACCENTS: write every accent and cedilla correctly (é è ê ë à â ç ô û ù î ï). A missing accent
changes the word.

ELISION AND CONTRACTION: use natural French — l'eau, d'accord, j'ai, qu'il, au, du, des.

PROPER NAMES: list every person/place name in the "names" array (see schema) so they can be
glossed — the dictionary's coverage of proper nouns is incomplete.`.trim();

  const PIPE_RULES = language === 'zh' ? PIPE_RULES_ZH
    : language === 'ja' ? PIPE_RULES_JA
    : language === 'fr' ? PIPE_RULES_FR
    : PIPE_RULES_ES;

  // Side-channel for proper-name readings. `p` is the reading slot — empty for Spanish,
  // which has no pinyin/furigana analogue (see `hasReadings` in lib/languageConfig.ts).
  const NAME_EXAMPLE = language === 'zh' ? `{"h": "李明", "p": "Lǐ Míng", "m": "(name) Li Ming"}`
    : language === 'ja' ? `{"h": "田中", "p": "たなか", "m": "(name) Tanaka"}`
    : language === 'fr' ? `{"h": "Marie", "p": "", "m": "(name) Marie"}`
    : `{"h": "María", "p": "", "m": "(name) María"}`;
  const NAMES_SCHEMA = `NAME = ${NAME_EXAMPLE}
  "names" must include EVERY person/place name that appears anywhere above. Use [] if there are none.${
    langConfig.hasReadings ? '' : `\n  "p" is unused for ${langConfig.name} — always pass "".`}`;

  // ── Prompt builders (one per section) ──────────────────────────────────────

  const exampleSentence = language === 'zh' ? '城市|的|经济|发展|离不开|科技|的|进步|。'
    : language === 'ja' ? '私は町の図書館で本を借りました。'
    : language === 'fr' ? 'Hier, nous sommes allés au marché du centre pour acheter des fruits frais.'
    : 'Ayer fuimos al mercado del centro para comprar fruta fresca.';

  const passagePrompt = `You are a ${langName} language teacher generating a reading passage.

LEVEL: ${levelName} (${levelDesc})
TODAY'S THEME: ${dailyTheme} — the passage must revolve around this theme.
${words.length > 0 ? `\nWORDS TO USE:\n${wordList}${readingNotes}` : `\nNo specific vocabulary required — choose naturally appropriate words for the level and theme.`}

Generate a JSON object with EXACTLY this structure:

{
  "passages": [PASSAGE],
  "names": [NAME, ...]
}

PASSAGE = {
  "title": "WORDS",
  "sentences": ["WORDS", "WORDS", ...],
  "contextualMeanings": { "<word>": "<the one matching segment, copied verbatim>" }
}

CONTEXTUAL MEANINGS — this is what makes the hints useful, so read it carefully:
Each word in WORDS above is listed with its dictionary definition. That definition is often
SEVERAL senses joined by semicolons, e.g. "to want, wish, desire; to expect; to think".
For each word you used, decide which single segment matches how YOU used it in this passage,
and copy that segment EXACTLY as written — same words, same order, no rewording, no trailing
punctuation. It must be a character-for-character copy of one semicolon-separated segment.
  - Omit the word entirely (or map it to null) when several segments apply equally, when the
    segments all mean essentially the same thing, or when the definition has only one segment.
  - The map holds ONE sense per word for the whole passage. So if you used a word in two
    different senses (e.g. "livre" as both "book" and "pound"), omit it — a single entry
    would mislabel the other occurrence. Only list a word whose sense is consistent throughout.
  - Never invent a meaning that is not already in the definition string.
Use {} if there is nothing worth marking.
Example of a single correctly-formatted sentence string:
  "${exampleSentence}"
  ${words.length > 0 ? 'Use ALL the words above naturally in a coherent story or description' : 'Write a coherent story or description'} (${sentenceCount}–${sentenceCount + 2} sentences).

${PIPE_RULES}

${NAMES_SCHEMA}

REQUIREMENTS:
1. Exactly 1 passage in the "passages" array.
2. ${sentenceCount}–${sentenceCount + 2} sentences.
3. Difficulty appropriate for ${levelName}: ${difficultyNote}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  const questionsPrompt = `You are a ${langName} language teacher. Given the following ${langName} reading passage at ${levelName} (${levelDesc}) level, generate exactly 5 reading comprehension questions.

PASSAGE:
${passageText}

${words.length > 0 ? `VOCABULARY WORDS IN THE PASSAGE:\n${wordList}` : ''}

Generate a JSON object with EXACTLY this structure:

{
  "questions": [QUESTION, QUESTION, QUESTION, QUESTION, QUESTION],
  "names": [NAME, ...]
}

${PIPE_RULES}

QUESTION = {
  "q": "WORDS",
  "model": "English model answer (1-2 sentences)",
  "key": ["hanzi_word1", "hanzi_word2"],
  "options": [
    {"tokens": "WORDS", "correct": true},
    {"tokens": "WORDS", "correct": false},
    {"tokens": "WORDS", "correct": false},
    {"tokens": "WORDS", "correct": false}
  ]
}
The "key" array must contain the specific words from the passage whose meaning is tested.
Include exactly 5 questions testing both passage understanding AND vocabulary meaning.
Question variety: mix factual recall (who/what/when), inference, vocabulary-in-context, and cause-effect.
Difficulty appropriate for ${levelName}: ${difficultyNote}.

${NAMES_SCHEMA}

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  // For the "answer"/"key" fields the model emits the bare surface form (the word itself,
  // including kanji for Japanese). The blank's reading is resolved from the practiced words.
  const answerNote = language === 'zh'
    ? '"answer" is a SINGLE word (bare hanzi) and MUST be one of the WORDS above.\n  "distractors" are three plausible-but-wrong bare-hanzi words, same part of speech as the answer.'
    : language === 'ja'
      ? '"answer" is the bare surface form of the word (kanji/kana as written) and MUST be one of the WORDS above.\n  "distractors" are three plausible-but-wrong words (bare surface form), same part of speech as the answer.'
      : '"answer" is a SINGLE Spanish word and MUST be one of the WORDS above. Give it in the dictionary form listed there, not conjugated or pluralised.\n  "distractors" are three plausible-but-wrong Spanish words, same part of speech as the answer.';

  const fillPrompt = `You are a ${langName} language teacher generating fill-in-the-blank practice.

LEVEL: ${levelName} (${levelDesc})
TODAY'S THEME: ${dailyTheme} — fill items must revolve around this theme.

WORDS (each is the answer to one fill item):
${wordList}${readingNotes}
Generate a JSON object with EXACTLY this structure:

{
  "fill": [FILL_ITEM, ...],
  "names": [NAME, ...]
}

${PIPE_RULES}

FILL_ITEM = {
  "before": "WORDS",
  "answer": "word",
  "after": "WORDS",
  "distractors": ["word", "word", "word"]
}
  ${answerNote}

${NAMES_SCHEMA}

REQUIREMENTS:
1. "fill": 5–8 items, one per answer word from WORDS.
2. Difficulty appropriate for ${levelName}: ${difficultyNote}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  const convoPrompt = `You are a ${langName} language teacher generating conversation practice.

LEVEL: ${levelName} (${levelDesc})
TODAY'S THEME: ${dailyTheme} — the conversation must revolve around this theme.

WORDS (practice these in a realistic dialogue):
${wordList}${readingNotes}
Generate a JSON object with EXACTLY this structure:

{
  "convo": [CONVO_TURN, ...],
  "names": [NAME, ...]
}

${PIPE_RULES}

CONVO_TURN = {
  "key": ["word", ...],
  "tutor": "WORDS",
  "suggestions": ["WORDS", "WORDS"]
}
  Last turn must have "suggestions": [].

${NAMES_SCHEMA}

REQUIREMENTS:
1. "convo": 4–5 turns practicing the WORDS; last turn has "suggestions": [].
2. Difficulty appropriate for ${levelName}: ${difficultyNote}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  // ── Completeness checks ────────────────────────────────────────────────────
  // Japanese no longer needs an orphaned-conjugation check here — kuromoji segments and
  // fuses conjugated forms deterministically after generation, so there's nothing left for
  // the model to get wrong at the segmentation level.
  const passageComplete = (j: Record<string, unknown>): boolean =>
    Array.isArray(j.passages) && j.passages.length > 0;
  const fillComplete = (j: Record<string, unknown>): boolean =>
    Array.isArray(j.fill) && j.fill.length >= 1;
  const convoComplete = (j: Record<string, unknown>): boolean =>
    Array.isArray(j.convo) && j.convo.length >= 2;
  const questionsComplete = (j: Record<string, unknown>): boolean =>
    Array.isArray(j.questions) && j.questions.length >= 1;

  // Build the per-section resolve map: practiced words (authoritative) plus the model's
  // proper-name list. parseTokenString consults this so names get their reading from a
  // robust side-channel instead of a fragile inline escape.
  function resolveMap(j: Record<string, unknown> | null): Map<string, { p: string; m: string }> {
    const map = new Map(inputMap);
    const names = Array.isArray(j?.names) ? (j!.names as Record<string, unknown>[]) : [];
    for (const n of names) {
      const h = typeof n?.h === 'string' ? n.h.trim() : '';
      if (h && !map.has(h)) {
        map.set(h, { p: typeof n.p === 'string' ? n.p : '', m: typeof n.m === 'string' ? n.m : '' });
      }
    }
    return map;
  }

  // ── Expanders: model JSON → RawTok shapes the client consumes ────────────────
  // Chinese: parses the model's own pipe-delimited segmentation. Japanese: the model wrote
  // plain text (see PIPE_RULES_JA), so this is where segmentation actually happens — via
  // kuromoji, logged alongside the model's raw sentence so segmentation quality is easy to
  // eyeball during testing (temporary, per explicit request — safe to remove later).
  async function expandTokens(s: unknown, map: Map<string, { p: string; m: string }>): Promise<RawTok[]> {
    if (langConfig.segmentation === 'pipe') return parseTokenString(s, map);
    if (typeof s !== 'string' || !s.trim()) return [];
    if (language === 'es') return segmentEs(s, map);
    if (language === 'fr') return segmentFr(s, map);
    return segmentJa(s, map);
  }

  // Resolve a fill-item answer/distractor word: for Japanese, segment it and prefer the
  // resulting base form when it matches a due word — more robust than trusting the model's
  // bare "answer" string as-is (which today has zero validation against the WORDS list).
  async function resolveWord(raw: unknown, map: Map<string, { p: string; m: string }>): Promise<[string, string]> {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (langConfig.segmentation === 'pipe') return [trimmed, map.get(trimmed)?.p ?? ''];
    const tok = language === 'es' ? segmentEs(trimmed, map)[0]
      : language === 'fr' ? segmentFr(trimmed, map)[0]
      : (await segmentJa(trimmed, map))[0];
    if (!tok) return [trimmed, map.get(trimmed)?.p ?? ''];
    const baseForm = tok.length === 4 ? tok[3] : undefined;
    const canonical = baseForm && map.has(baseForm) ? baseForm : trimmed;
    return [canonical, map.get(canonical)?.p ?? tok[1] ?? ''];
  }

  /**
   * Keep only entries whose value is VERBATIM one semicolon-separated segment of that word's
   * own dictionary gloss. The model is told to copy a segment exactly; anything it reworded
   * or invented is dropped rather than shown, since the hint highlights by string match and
   * a near-miss would simply fail to highlight while implying we had an answer.
   */
  function cleanContextualMeanings(raw: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [word, sense] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof sense !== 'string' || !sense.trim()) continue;   // null = "no single sense"
      const gloss = inputMap.get(word)?.m;
      if (!gloss) continue;
      const segments = gloss.split(';').map(x => x.trim()).filter(Boolean);
      if (segments.length < 2) continue;                          // nothing to disambiguate
      const match = segments.find(seg => seg.toLowerCase() === sense.trim().toLowerCase());
      if (match) out[word] = match;
    }
    return out;
  }

  async function expandPassage(p: Record<string, unknown>, map: Map<string, { p: string; m: string }>) {
    const qs = Array.isArray(p.questions) ? p.questions : [];
    return {
      contextualMeanings: cleanContextualMeanings(p.contextualMeanings),
      title: await expandTokens(p.title, map),
      sentences: await Promise.all((Array.isArray(p.sentences) ? p.sentences : []).map(s => expandTokens(s, map))),
      questions: await Promise.all(qs.map(async q => {
        const qq = q as Record<string, unknown>;
        const opts = Array.isArray(qq.options) ? qq.options : [];
        return {
          q: await expandTokens(qq.q, map),
          model: qq.model,
          key: qq.key,
          options: await Promise.all(opts.map(async o => {
            const oo = o as Record<string, unknown>;
            return { tokens: await expandTokens(oo.tokens, map), correct: oo.correct };
          })),
        };
      })),
    };
  }

  async function expandFill(f: Record<string, unknown>, map: Map<string, { p: string; m: string }>) {
    const [ansH, ansP] = await resolveWord(f.answer, map);
    const distractors = Array.isArray(f.distractors) ? f.distractors : [];
    return {
      before: await expandTokens(f.before, map),
      answer: [ansH, ansP] as [string, string],
      after: await expandTokens(f.after, map),
      distractors: await Promise.all(distractors.map(async d => {
        const [h, p] = await resolveWord(d, map);
        // Only ship the reading when the AI is the one that supplied it (ja). For zh the
        // client resolves pinyin from the dictionary, and es has no reading at all.
        return (langConfig.aiProvidesReadings ? [h, p] : [h]) as [string] | [string, string];
      })),
    };
  }

  async function expandConvo(t: Record<string, unknown>, map: Map<string, { p: string; m: string }>) {
    const sugg = Array.isArray(t.suggestions) ? t.suggestions : [];
    return {
      key: t.key,
      tutor: await expandTokens(t.tutor, map),
      suggestions: await Promise.all(sugg.map(s => expandTokens(s, map))),
    };
  }

  // ── Generate the requested sections concurrently ───────────────────────────
  const jobs = sections.map(async (section): Promise<[Section, { complete: boolean; out: unknown }]> => {
    if (section === 'passage') {
      const { json, best } = await generateJson(client, passagePrompt, passageComplete, 'passage');
      const j = json ?? best;
      const map = resolveMap(j);
      const passages = Array.isArray((j as { passages?: unknown })?.passages)
        ? await Promise.all(((j as { passages: Record<string, unknown>[] }).passages).map(p => expandPassage(p, map)))
        : [];
      return ['passage', { complete: json !== null, out: passages }];
    }
    if (section === 'fill') {
      const { json, best } = await generateJson(client, fillPrompt, fillComplete, 'fill');
      const j = json ?? best;
      const map = resolveMap(j);
      const fill = Array.isArray((j as { fill?: unknown })?.fill)
        ? await Promise.all(((j as { fill: Record<string, unknown>[] }).fill).map(f => expandFill(f, map)))
        : [];
      return ['fill', { complete: json !== null, out: fill }];
    }
    if (section === 'questions') {
      const { json, best } = await generateJson(client, questionsPrompt, questionsComplete, 'questions');
      const j = json ?? best;
      const map = resolveMap(j);
      const qsRaw = Array.isArray((j as { questions?: unknown })?.questions)
        ? (j as { questions: Record<string, unknown>[] }).questions
        : [];
      const qs = await Promise.all(qsRaw.map(async q => {
        const qq = q as Record<string, unknown>;
        const opts = Array.isArray(qq.options) ? qq.options : [];
        return {
          q: await expandTokens(qq.q, map),
          model: qq.model,
          key: qq.key,
          options: await Promise.all(opts.map(async o => {
            const oo = o as Record<string, unknown>;
            return { tokens: await expandTokens(oo.tokens, map), correct: oo.correct };
          })),
        };
      }));
      return ['questions', { complete: json !== null, out: qs }];
    }
    const { json, best } = await generateJson(client, convoPrompt, convoComplete, 'convo');
    const j = json ?? best;
    const map = resolveMap(j);
    const convo = Array.isArray((j as { convo?: unknown })?.convo)
      ? await Promise.all(((j as { convo: Record<string, unknown>[] }).convo).map(t => expandConvo(t, map)))
      : [];
    return ['convo', { complete: json !== null, out: convo }];
  });

  const results = await Promise.all(jobs);
  const bySection = new Map(results);

  // If passage was requested but failed entirely, that's a hard failure.
  if (sections.includes('passage')) {
    const p = bySection.get('passage');
    if (!p || (Array.isArray(p.out) && p.out.length === 0)) {
      return NextResponse.json({ error: 'generation failed' }, { status: 500 });
    }
  }

  const data: { passages?: unknown; fill?: unknown; convo?: unknown; questions?: unknown } = {};
  const complete: { passage?: boolean; fill?: boolean; convo?: boolean } = {};
  if (bySection.has('passage'))   { data.passages  = bySection.get('passage')!.out;   complete.passage = bySection.get('passage')!.complete; }
  if (bySection.has('fill'))      { data.fill      = bySection.get('fill')!.out;       complete.fill    = bySection.get('fill')!.complete; }
  if (bySection.has('convo'))     { data.convo     = bySection.get('convo')!.out;      complete.convo   = bySection.get('convo')!.complete; }
  if (bySection.has('questions')) { data.questions = bySection.get('questions')!.out; }

  return NextResponse.json({
    ok: true,
    complete,
    sections,
    data,
    vocabWords: words.map(w => w.h),
    batches: batches.map(b => b.map(w => w.h)),
    aiRemaining: credit.remaining,
  });
}
