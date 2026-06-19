import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { consumeAiCredit } from '@/lib/supabase/server';

const GUEST_LIMIT_MSG = "You've used your free AI generations. Sign in for unlimited AI content and to sync your progress across devices.";

/** Batch size: words per reading passage */
const BATCH_SIZE = 5;

/** Sentences per passage by HSK level — longer passages = better comprehension questions */
const SENTENCES_PER_PASSAGE: Record<number, number> = {
  1: 7, 2: 8, 3: 9, 4: 10, 5: 12, 6: 14,
};

/** How many times to ask the model before giving up (handles occasional bad JSON). */
const MAX_GEN_ATTEMPTS = 2;

/** Independently-generated content blocks. */
type Section = 'passage' | 'fill' | 'convo';

// ─── Token wire format ───────────────────────────────────────────────────────
// The model emits each token-list as a single pipe-delimited string of bare hanzi
// (no pinyin/meaning) — e.g. "我|住|在|城市|。". We resolve pinyin/meaning from the
// dictionary on the client. Proper names are the one exception: the model tags them
// "~汉字::pīnyīn::gloss" since the dictionary won't cover them. We expand these strings
// back into the RawTok arrays the client parser already consumes.

type RawTok = [string] | [string, string] | [string, string, string];

/** Split one pipe-delimited token string into RawTok[]. */
function parseTokenString(s: unknown, inputMap: Map<string, { p: string; m: string }>): RawTok[] {
  if (typeof s !== 'string' || !s) return [];
  const out: RawTok[] = [];
  for (const rawSeg of s.split('|')) {
    let seg = rawSeg.trim();
    if (!seg) continue;
    if (seg.startsWith('~')) seg = seg.slice(1).trim();
    // Tolerate an inline name escape (h::pinyin::gloss) in case the model reverts to it
    // instead of using the "names" side-channel — keeps junk out of the token text.
    if (seg.includes('::')) {
      const [h, p = '', m = ''] = seg.split('::').map(x => x.trim());
      if (!h) continue;
      out.push(p ? [h, p, m] : [h]);
      continue;
    }
    // Target/due words carry authoritative pinyin+meaning from the deck (preserves the
    // intended polyphone reading); everything else stays bare for client dict lookup.
    const hit = inputMap.get(seg);
    out.push(hit ? [seg, hit.p, hit.m] : [seg]);
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

  try {
    const body = await req.json();
    words = body.words ?? [];
    hskLevel = body.hskLevel ?? 4;
    themeOffset = body.themeOffset ?? 0;
    // `sections` selects which blocks to generate. Back-compat: `passageOnly` → passage only.
    if (Array.isArray(body.sections) && body.sections.length > 0) {
      sections = body.sections.filter((s: unknown): s is Section =>
        s === 'passage' || s === 'fill' || s === 'convo');
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
  const wordList = words.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n');
  const difficultyNote = hskLevel <= 2 ? 'simple grammar, short sentences'
    : hskLevel <= 4 ? 'varied patterns, moderate complexity'
    : 'complex grammar, literary or abstract vocabulary';

  // Shared pipe-format rules injected into every prompt variant
  const PIPE_RULES = `
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
  - Keep proper names (people, places) WHOLE as one bare token too: 小王 北京 李明 — never split them.
  - Each punctuation mark (。 ， ！ ？ 、 — …) is its OWN token between bars.
  - NEVER output an empty token, and NEVER write pinyin or English inside the bars.

PROPER NAMES: list EVERY person/place name you used in the separate "names" array (see schema),
giving its pinyin and a short English gloss. The pipe strings stay pure hanzi; names get their
reading from this list.`.trim();

  // Side-channel for proper-name readings — keeps the pipe stream pure hanzi.
  const NAMES_SCHEMA = `NAME = {"h": "李明", "p": "Lǐ Míng", "m": "(name) Li Ming"}
  "names" must include EVERY person/place name that appears anywhere above. Use [] if there are none.`;

  // ── Prompt builders (one per section) ──────────────────────────────────────

  const passagePrompt = `You are a Chinese language teacher generating a reading passage.

HSK LEVEL: ${hskLevel} (${levelDesc})
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
  "questions": [QUESTION, QUESTION, QUESTION, QUESTION, QUESTION]
}
Example of a single correctly-formatted sentence string (note the | between every token):
  "城市|的|经济|发展|离不开|科技|的|进步|。"
  ${words.length > 0 ? 'Use ALL the words above naturally in a coherent story or description' : 'Write a coherent story or description'} (${sentenceCount}–${sentenceCount + 2} sentences).
  Include exactly 5 comprehension questions testing both passage understanding AND vocabulary meaning.
  Question variety: mix factual recall (who/what/when), inference, vocabulary-in-context, and cause-effect questions.
  The "key" array must contain the specific hanzi words from the passage whose meaning is tested by that question.

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

${NAMES_SCHEMA}

REQUIREMENTS:
1. Exactly 1 passage in the "passages" array.
2. ${sentenceCount}–${sentenceCount + 2} sentences, exactly 5 questions.
3. Difficulty appropriate for HSK ${hskLevel}: ${difficultyNote}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  const fillPrompt = `You are a Chinese language teacher generating fill-in-the-blank practice.

HSK LEVEL: ${hskLevel} (${levelDesc})
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
  "answer": "hanzi",
  "after": "WORDS",
  "distractors": ["hanzi", "hanzi", "hanzi"]
}
  "answer" is a SINGLE word (bare hanzi) and MUST be one of the WORDS above.
  "distractors" are three plausible-but-wrong bare-hanzi words, same part of speech as the answer.

${NAMES_SCHEMA}

REQUIREMENTS:
1. "fill": 5–8 items, one per answer word from WORDS.
2. Difficulty appropriate for HSK ${hskLevel}: ${difficultyNote}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  const convoPrompt = `You are a Chinese language teacher generating conversation practice.

HSK LEVEL: ${hskLevel} (${levelDesc})
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
  "key": ["hanzi", ...],
  "tutor": "WORDS",
  "suggestions": ["WORDS", "WORDS"]
}
  Last turn must have "suggestions": [].

${NAMES_SCHEMA}

REQUIREMENTS:
1. "convo": 4–5 turns practicing the WORDS; last turn has "suggestions": [].
2. Difficulty appropriate for HSK ${hskLevel}: ${difficultyNote}.

Return ONLY the JSON object. No markdown fences, no explanation, no extra text.`;

  // ── Completeness checks ────────────────────────────────────────────────────
  const passageComplete = (j: Record<string, unknown>): boolean =>
    Array.isArray(j.passages) && j.passages.length > 0;
  const fillComplete = (j: Record<string, unknown>): boolean =>
    Array.isArray(j.fill) && j.fill.length >= 1;
  const convoComplete = (j: Record<string, unknown>): boolean =>
    Array.isArray(j.convo) && j.convo.length >= 2;

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

  // ── Expanders: model JSON (pipe strings) → RawTok shapes the client consumes ─
  function expandPassage(p: Record<string, unknown>, map: Map<string, { p: string; m: string }>) {
    const qs = Array.isArray(p.questions) ? p.questions : [];
    return {
      title: parseTokenString(p.title, map),
      sentences: (Array.isArray(p.sentences) ? p.sentences : []).map(s => parseTokenString(s, map)),
      questions: qs.map(q => {
        const qq = q as Record<string, unknown>;
        const opts = Array.isArray(qq.options) ? qq.options : [];
        return {
          q: parseTokenString(qq.q, map),
          model: qq.model,
          key: qq.key,
          options: opts.map(o => {
            const oo = o as Record<string, unknown>;
            return { tokens: parseTokenString(oo.tokens, map), correct: oo.correct };
          }),
        };
      }),
    };
  }

  function expandFill(f: Record<string, unknown>, map: Map<string, { p: string; m: string }>) {
    const ansH = typeof f.answer === 'string' ? f.answer.trim() : '';
    const ansP = map.get(ansH)?.p ?? '';
    const distractors = Array.isArray(f.distractors) ? f.distractors : [];
    return {
      before: parseTokenString(f.before, map),
      answer: [ansH, ansP] as [string, string],
      after: parseTokenString(f.after, map),
      // Bare hanzi — the client resolves distractor pinyin from the dictionary.
      distractors: distractors.map(d => [String(d).trim()] as [string]),
    };
  }

  function expandConvo(t: Record<string, unknown>, map: Map<string, { p: string; m: string }>) {
    const sugg = Array.isArray(t.suggestions) ? t.suggestions : [];
    return {
      key: t.key,
      tutor: parseTokenString(t.tutor, map),
      suggestions: sugg.map(s => parseTokenString(s, map)),
    };
  }

  // ── Generate the requested sections concurrently ───────────────────────────
  const jobs = sections.map(async (section): Promise<[Section, { complete: boolean; out: unknown }]> => {
    if (section === 'passage') {
      const { json, best } = await generateJson(client, passagePrompt, passageComplete, 'passage');
      const j = json ?? best;
      const map = resolveMap(j);
      const passages = Array.isArray((j as { passages?: unknown })?.passages)
        ? ((j as { passages: Record<string, unknown>[] }).passages).map(p => expandPassage(p, map))
        : [];
      return ['passage', { complete: json !== null, out: passages }];
    }
    if (section === 'fill') {
      const { json, best } = await generateJson(client, fillPrompt, fillComplete, 'fill');
      const j = json ?? best;
      const map = resolveMap(j);
      const fill = Array.isArray((j as { fill?: unknown })?.fill)
        ? ((j as { fill: Record<string, unknown>[] }).fill).map(f => expandFill(f, map))
        : [];
      return ['fill', { complete: json !== null, out: fill }];
    }
    const { json, best } = await generateJson(client, convoPrompt, convoComplete, 'convo');
    const j = json ?? best;
    const map = resolveMap(j);
    const convo = Array.isArray((j as { convo?: unknown })?.convo)
      ? ((j as { convo: Record<string, unknown>[] }).convo).map(t => expandConvo(t, map))
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

  const data: { passages?: unknown; fill?: unknown; convo?: unknown } = {};
  const complete: { passage?: boolean; fill?: boolean; convo?: boolean } = {};
  if (bySection.has('passage')) { data.passages = bySection.get('passage')!.out; complete.passage = bySection.get('passage')!.complete; }
  if (bySection.has('fill'))    { data.fill     = bySection.get('fill')!.out;    complete.fill    = bySection.get('fill')!.complete; }
  if (bySection.has('convo'))   { data.convo    = bySection.get('convo')!.out;   complete.convo   = bySection.get('convo')!.complete; }

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
