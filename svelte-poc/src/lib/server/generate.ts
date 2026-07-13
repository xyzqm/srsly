import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { sentenceCountForLevel } from '$lib/languageConfig';
import type { RawTok, RawPassage } from '$lib/tokens';

// Server-side AI generation (Chinese, HSK). The model emits pipe-delimited bare-hanzi token
// strings; we parse them into compact RawTok arrays and let the client resolve pinyin/meaning
// from CC-CEDICT at render time. Returns raw content for storage in Supabase.

export type Word = { h: string; p: string; m: string };
const MAX_NAME_MERGE = 4;

type Resolve = Map<string, { p: string; m: string }>;

/** Split one pipe-delimited token string into RawTok[]. */
function parseTokenString(s: unknown, map: Resolve): RawTok[] {
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
      if (map.has(joined)) { merged = joined; used = len; break; }
    }
    const text = merged ?? segs[i].h;
    const hit = map.get(text);
    out.push(hit ? [text, hit.p, hit.m] : [text]);
    i += used - 1;
  }
  return out;
}

function extractJson(raw: string): Record<string, unknown> {
  let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start > 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Repair common model JSON slips: trailing commas, raw newlines in strings.
    return JSON.parse(cleaned.replace(/,(\s*[}\]])/g, '$1').replace(/"([^"\\]*)\n([^"\\]*)"/g, '"$1\\n$2"'));
  }
}

const DAILY_THEMES = [
  'travel and transportation', 'food and restaurants', 'work and career',
  'family and relationships', 'health and exercise', 'technology and the internet',
  'nature and the environment', 'shopping and money', 'education and learning',
  'art and entertainment', 'city life and neighborhoods', 'weather and seasons',
];

const PIPE_RULES = `
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

function client(): Anthropic {
  const apiKey = env.SRSLY_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') throw new Error('no-api-key');
  return new Anthropic({ apiKey });
}

async function ask(prompt: string): Promise<Record<string, unknown>> {
  const res = await client().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    system: 'You output only valid JSON. No markdown, no code blocks, no explanations.',
    messages: [{ role: 'user', content: prompt }],
  });
  return extractJson(res.content[0].type === 'text' ? res.content[0].text.trim() : '');
}

/** Build a resolve map from the practiced words plus the model's proper-name list. */
function resolveMap(words: Word[], parsed: Record<string, unknown>): Resolve {
  const map: Resolve = new Map();
  for (const w of words) if (!map.has(w.h)) map.set(w.h, { p: w.p, m: w.m });
  for (const n of (Array.isArray(parsed.names) ? parsed.names : []) as Record<string, unknown>[]) {
    const h = typeof n?.h === 'string' ? n.h.trim() : '';
    if (h && !map.has(h)) map.set(h, { p: typeof n.p === 'string' ? n.p : '', m: typeof n.m === 'string' ? n.m : '' });
  }
  return map;
}

function ctx(words: Word[], hskLevel: number, themeOffset: number) {
  const levelDesc = hskLevel <= 2 ? 'beginner' : hskLevel <= 4 ? 'intermediate' : 'advanced';
  const today = new Date().toISOString().slice(0, 10);
  const dayHash = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);
  return {
    levelDesc,
    sentenceCount: sentenceCountForLevel('zh', hskLevel),
    theme: DAILY_THEMES[(dayHash + themeOffset) % DAILY_THEMES.length],
    wordList: words.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n'),
    difficulty: levelDesc === 'beginner'
      ? 'simple grammar, short sentences'
      : levelDesc === 'intermediate'
        ? 'varied patterns, moderate complexity'
        : 'complex grammar, literary or abstract vocabulary',
  };
}

/** Generate one reading passage (raw tokens) built around the given due words. */
export async function generatePassage(words: Word[], hskLevel: number, themeOffset = 0): Promise<RawPassage[]> {
  const c = ctx(words, hskLevel, themeOffset);
  const prompt = `You are a Chinese language teacher generating a reading passage.

LEVEL: HSK ${hskLevel} (${c.levelDesc})
TODAY'S THEME: ${c.theme} — the passage must revolve around this theme.
${words.length ? `\nWORDS TO USE:\n${c.wordList}` : `\nNo specific vocabulary required — choose naturally appropriate words for the level and theme.`}

Generate a JSON object with EXACTLY this structure:

{
  "passages": [{ "title": "WORDS", "sentences": ["WORDS", "WORDS", ...] }],
  "names": [{ "h": "李明", "p": "Lǐ Míng", "m": "(name) Li Ming" }]
}

Example of a correctly-formatted sentence string:
  "城市|的|经济|发展|离不开|科技|的|进步|。"
${words.length ? 'Use ALL the words above naturally in a coherent story' : 'Write a coherent story'} (${c.sentenceCount}–${c.sentenceCount + 2} sentences).

${PIPE_RULES}

REQUIREMENTS:
1. Exactly 1 passage. 2. ${c.sentenceCount}–${c.sentenceCount + 2} sentences.
3. Difficulty appropriate for HSK ${hskLevel}: ${c.difficulty}.

Return ONLY the JSON object. No markdown fences, no explanation.`;

  const parsed = await ask(prompt);
  const map = resolveMap(words, parsed);
  const rows = Array.isArray(parsed.passages) ? (parsed.passages as Record<string, unknown>[]) : [];
  return rows.map((p) => ({
    title: parseTokenString(p.title, map),
    sentences: (Array.isArray(p.sentences) ? p.sentences : []).map((s) => parseTokenString(s, map)),
  }));
}
