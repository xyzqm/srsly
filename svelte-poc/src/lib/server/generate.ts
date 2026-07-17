import { getLanguageConfig, sentenceCountForLevel } from '$lib/languageConfig';
import type { RawTok, RawPassage } from '$lib/tokens';
import type { LanguageCode } from '$lib/types';
import { askText } from './llm';
import { getDefinition } from './definitions';

// The model's only job is to write natural text and mark word boundaries with `|` — no JSON, no
// per-language branching, no proper-noun gloss side-channel. Every token's reading/meaning is
// resolved afterward by getDefinition (our dictionary -> shared Supabase cache -> one-off LLM
// query), so a name the model reuses across many passages only ever costs one real lookup.

export type Word = { h: string; p: string; m: string };
const MAX_WORD_MERGE = 4;

type DueSet = Set<string>;

const DAILY_THEMES = [
  'travel and transportation', 'food and restaurants', 'work and career',
  'family and relationships', 'health and exercise', 'technology and the internet',
  'nature and the environment', 'shopping and money', 'education and learning',
  'art and entertainment', 'city life and neighborhoods', 'weather and seasons',
];

function buildDueSet(words: Word[]): DueSet {
  return new Set(words.map((w) => w.h));
}

function splitPipeLine(line: string): string[] {
  return line.split('|').map((s) => s.trim()).filter(Boolean);
}

/** Re-merge a due word the model split across bars despite being told to keep it whole. */
function mergeDueWords(segs: string[], due: DueSet): string[] {
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    let merged: string | null = null;
    let used = 1;
    for (let len = Math.min(MAX_WORD_MERGE, segs.length - i); len >= 2; len--) {
      const joined = segs.slice(i, i + len).join('');
      if (due.has(joined)) { merged = joined; used = len; break; }
    }
    out.push(merged ?? segs[i]);
    i += used - 1;
  }
  return out;
}

/** Split the model's raw "title\n\nbody" response. Falls back to a single `\n` if it forgot the
 *  blank line, and folds any stray newlines inside the body into `|` so a token boundary isn't lost. */
function parseOutput(raw: string, due: DueSet): { title: string[]; body: string[] } {
  const cleaned = raw.trim();
  const sep = cleaned.match(/\n\s*\n/) ?? cleaned.match(/\n/);
  if (!sep || sep.index === undefined) return { title: [], body: mergeDueWords(splitPipeLine(cleaned), due) };
  const titlePart = cleaned.slice(0, sep.index);
  const bodyPart = cleaned.slice(sep.index + sep[0].length).replace(/\n+/g, '|');
  return {
    title: mergeDueWords(splitPipeLine(titlePart), due),
    body: mergeDueWords(splitPipeLine(bodyPart), due),
  };
}

/** Resolve each token text to a RawTok, using `cache` to dedupe repeated words (e.g. a name used
 *  in both the title and the body) to a single getDefinition call. */
async function resolveTokens(texts: string[], lang: LanguageCode, cache: Map<string, RawTok>): Promise<RawTok[]> {
  const unresolved = texts.filter((t) => !cache.has(t));
  await Promise.all([...new Set(unresolved)].map(async (text) => {
    const def = await getDefinition(text, lang);
    cache.set(text, def.meaning ? { text, reading: def.reading, meaning: def.meaning } : { text });
  }));
  return texts.map((t) => cache.get(t)!);
}

function buildPrompt(words: Word[], lang: LanguageCode, level: number, themeOffset: number): string {
  const cfg = getLanguageConfig(lang);
  const levelDescriptor = cfg.levels.find((l) => l.level === level) ?? cfg.levels[0];
  const today = new Date().toISOString().slice(0, 10);
  const dayHash = today.split('-').reduce((acc, n) => acc + parseInt(n), 0);
  const theme = DAILY_THEMES[(dayHash + themeOffset) % DAILY_THEMES.length];
  const sentenceCount = sentenceCountForLevel(lang, level);
  const wordList = words.map((w, i) => `${i + 1}. ${w.h} (${w.p}) — ${w.m}`).join('\n');

  return `You are a ${cfg.name} language teacher generating a reading passage.

LEVEL: ${levelDescriptor.label} (${levelDescriptor.desc})
TODAY'S THEME: ${theme} — the passage must revolve around this theme.
${words.length ? `\nWORDS TO USE:\n${wordList}` : '\nNo specific vocabulary required — choose naturally appropriate words for the level and theme.'}

${words.length ? 'Use ALL the words above naturally in a coherent story' : 'Write a coherent story'} (${sentenceCount}–${sentenceCount + 2} sentences).

OUTPUT FORMAT — THIS IS THE MOST IMPORTANT RULE:
Line 1: the title, as ${cfg.name} words separated by a | (vertical bar).
Line 2: blank.
Line 3 onward: the ENTIRE passage as ${cfg.name} words separated by | — one continuous stream,
not broken up per sentence.

Rules for tokens between the bars:
  - Output ONLY ${cfg.name} text (${cfg.nativeName}) and punctuation. NO readings, NO English, NO romanization.
  - Keep every multi-character word / compound / conjugated form WHOLE as one token.
  - Keep proper names WHOLE as ONE token (never split a name across bars).
  - Each punctuation mark is its own token between bars.
  - Do NOT tag proper nouns or any word with a definition — just the bare word/name itself.

Example of correctly-formatted output:
${cfg.promptExample}

Return ONLY the title line, a blank line, then the passage line. No JSON, no markdown fences, no explanation.`;
}

/** Generate one reading passage built around the given due words. */
export async function generatePassage(words: Word[], lang: LanguageCode, level: number, themeOffset = 0): Promise<RawPassage> {
  const due = buildDueSet(words);
  const raw = await askText(buildPrompt(words, lang, level, themeOffset));
  console.log('raw:\n', raw);
  const { title, body } = parseOutput(raw, due);

  const cache = new Map<string, RawTok>();
  return {
    title: await resolveTokens(title, lang, cache),
    body: await resolveTokens(body, lang, cache),
  };
}
