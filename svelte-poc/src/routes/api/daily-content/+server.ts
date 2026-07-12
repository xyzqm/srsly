import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { sentenceCountForLevel } from '$lib/languageConfig';

// Chinese-only PoC port of app/api/daily-content/route.ts (passage section only).
// The model emits pipe-delimited bare-hanzi token strings; we parse them into RawTok
// arrays here and let the client resolve pinyin/meaning from CC-CEDICT.

type RawTok = [string] | [string, string] | [string, string, string];

const DEFAULT_BATCH_SIZE = 5;
const MAX_NAME_MERGE = 4;

/** Split one pipe-delimited token string into RawTok[]. */
function parseTokenString(s: unknown, inputMap: Map<string, { p: string; m: string }>): RawTok[] {
  if (typeof s !== 'string' || !s) return [];
  type Seg = { h: string; inline: { p: string; m: string } | null };
  const segs: Seg[] = [];
  for (const rawSeg of s.split('|')) {
    let seg = rawSeg.trim();
    if (!seg) continue;
    if (seg.startsWith('~')) seg = seg.slice(1).trim();
    if (seg.includes('::')) {
      const [h, p = '', m = ''] = seg.split('::').map((x) => x.trim());
      if (!h) continue;
      segs.push({ h, inline: p ? { p, m } : null });
      continue;
    }
    segs.push({ h: seg, inline: null });
  }
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
      if (window.some((x) => x.inline)) continue;
      const joined = window.map((x) => x.h).join('');
      if (inputMap.has(joined)) { merged = joined; used = len; break; }
    }
    const text = merged ?? segs[i].h;
    const hit = inputMap.get(text);
    out.push(hit ? [text, hit.p, hit.m] : [text]);
    i += used - 1;
  }
  return out;
}

function repairJson(s: string): string {
  return s
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/"([^"\\]*)(\n)([^"\\]*)"/g, (_, a, _nl, b) => `"${a}\\n${b}"`);
}

function extractJson(raw: string): Record<string, unknown> {
  let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jStart = cleaned.indexOf('{');
  const jEnd = cleaned.lastIndexOf('}');
  if (jStart > 0 && jEnd > jStart) cleaned = cleaned.slice(jStart, jEnd + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return JSON.parse(repairJson(cleaned));
  }
}

const DAILY_THEMES = [
  'travel and transportation', 'food and restaurants', 'work and career',
  'family and relationships', 'health and exercise', 'technology and the internet',
  'nature and the environment', 'shopping and money', 'education and learning',
  'art and entertainment', 'city life and neighborhoods', 'weather and seasons',
];

const PIPE_RULES_ZH = `
OUTPUT FORMAT — THIS IS THE MOST IMPORTANT RULE:
Every field marked "WORDS" MUST be a SINGLE STRING with a | (vertical bar) between EVERY
word and EVERY punctuation mark. A sentence with no | bars is INVALID output.

  CORRECT:  "在|现代|社会|中|，|艺术|对|经济|发展|很|重要|。"
  WRONG:    "在现代社会中，艺术对经济发展很重要。"

Rules for tokens between the bars:
  - Output ONLY hanzi and punctuation. NO pinyin, NO English, NO tone numbers.
  - Keep every multi-character word / compound WHOLE as one token: 现代 经济 发展 已经.
  - Keep proper names WHOLE as ONE token: 王小雨 (never 王|小雨), 北京.
  - Each punctuation mark (。 ， ！ ？ 、 — …) is its OWN token between bars.

PROPER NAMES: list EVERY person/place name in the "names" array with pinyin and English gloss.`.trim();

export const POST: RequestHandler = async ({ request }) => {
  const apiKey = env.SRSLY_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
    return json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  let words: { h: string; p: string; m: string }[];
  let hskLevel: number;
  let themeOffset: number;
  try {
    const body = await request.json();
    words = Array.isArray(body.words) ? body.words : [];
    hskLevel = body.hskLevel ?? 3;
    themeOffset = body.themeOffset ?? 0;
  } catch {
    return json({ error: 'invalid request body' }, { status: 400 });
  }

  const inputMap = new Map<string, { p: string; m: string }>();
  for (const w of words) if (!inputMap.has(w.h)) inputMap.set(w.h, { p: w.p, m: w.m });

  const levelDesc = hskLevel <= 2 ? 'beginner' : hskLevel <= 4 ? 'intermediate' : 'advanced';
  const sentenceCount = sentenceCountForLevel('zh', hskLevel);
  const today = new Date().toISOString().slice(0, 10);
  const dayHash = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);
  const dailyTheme = DAILY_THEMES[(dayHash + themeOffset) % DAILY_THEMES.length];
  const wordList = words.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n');
  const difficultyNote = levelDesc === 'beginner'
    ? 'simple grammar, short sentences'
    : levelDesc === 'intermediate'
      ? 'varied patterns, moderate complexity'
      : 'complex grammar, literary or abstract vocabulary';

  const passagePrompt = `You are a Chinese language teacher generating a reading passage.

LEVEL: HSK ${hskLevel} (${levelDesc})
TODAY'S THEME: ${dailyTheme} — the passage must revolve around this theme.
${words.length > 0 ? `\nWORDS TO USE:\n${wordList}` : `\nNo specific vocabulary required — choose naturally appropriate words for the level and theme.`}

Generate a JSON object with EXACTLY this structure:

{
  "passages": [{ "title": "WORDS", "sentences": ["WORDS", "WORDS", ...] }],
  "names": [{ "h": "李明", "p": "Lǐ Míng", "m": "(name) Li Ming" }]
}

Example of a correctly-formatted sentence string:
  "城市|的|经济|发展|离不开|科技|的|进步|。"
${words.length > 0 ? 'Use ALL the words above naturally in a coherent story' : 'Write a coherent story'} (${sentenceCount}–${sentenceCount + 2} sentences).

${PIPE_RULES_ZH}

REQUIREMENTS:
1. Exactly 1 passage. 2. ${sentenceCount}–${sentenceCount + 2} sentences.
3. Difficulty appropriate for HSK ${hskLevel}: ${difficultyNote}.

Return ONLY the JSON object. No markdown fences, no explanation.`;

  let parsed: Record<string, unknown>;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      system: 'You output only valid JSON. No markdown, no code blocks, no explanations.',
      messages: [{ role: 'user', content: passagePrompt }],
    });
    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    parsed = extractJson(raw);
  } catch (err) {
    console.error('[daily-content] generation failed:', String(err));
    throw error(500, 'generation failed');
  }

  // Merge the model's proper-name list into the resolve map.
  const map = new Map(inputMap);
  const names = Array.isArray(parsed.names) ? (parsed.names as Record<string, unknown>[]) : [];
  for (const n of names) {
    const h = typeof n?.h === 'string' ? n.h.trim() : '';
    if (h && !map.has(h)) {
      map.set(h, { p: typeof n.p === 'string' ? n.p : '', m: typeof n.m === 'string' ? n.m : '' });
    }
  }

  const rawPassages = Array.isArray(parsed.passages) ? (parsed.passages as Record<string, unknown>[]) : [];
  const passages = rawPassages.map((p) => ({
    title: parseTokenString(p.title, map),
    sentences: (Array.isArray(p.sentences) ? p.sentences : []).map((s) => parseTokenString(s, map)),
    questions: [] as unknown[],
  }));

  if (passages.length === 0) throw error(500, 'generation failed');

  return json({
    ok: true,
    sections: ['passage'],
    data: { passages },
    vocabWords: words.map((w) => w.h),
  });
};
