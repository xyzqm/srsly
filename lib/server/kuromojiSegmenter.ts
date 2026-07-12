import * as kuromoji from 'kuromoji';
import path from 'path';
import jmdictData from '@/public/jmdict.json';
import { JLPT_VOCAB } from '@/lib/data/jlpt-vocab';

/**
 * Server-only Japanese segmenter. Wraps kuromoji (IPADIC morpheme tokenizer) with a fusion
 * pass that re-merges morphemes into the same "one conjugated word per token" unit the app
 * displays — kuromoji itself only gives morpheme-level output (使っ|て|い|ます), which is far
 * more fragmented than what a reader expects (使っています).
 */

export type RawTok = [string] | [string, string] | [string, string, string] | [string, string, string, string];

interface DictOverride { p: string; m: string; }

let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null = null;

function getTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji
        .builder({ dicPath: path.join(process.cwd(), 'node_modules/kuromoji/dict') })
        .build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
    });
  }
  return tokenizerPromise;
}

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KANA_OFFSET = 0x60;

function kataToHira(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    out += code >= KATAKANA_START && code <= KATAKANA_END ? String.fromCodePoint(code - KANA_OFFSET) : ch;
  }
  return out;
}

interface FusedToken {
  surface: string;
  reading: string;
  baseForm?: string;
  isPunct: boolean;
}

// Grammaticalized auxiliary/suffix verb usage (いる/おく/しまう/くれる/もらう in ている/ておく/…,
// or れる/られる/せる/させる passive-potential-causative) — always glues onto the run in progress.
// 非自立 also covers 形容詞 auxiliary use (e.g. てほしい).
const AUX_DETAIL = new Set(['非自立', '接尾']);

// A run starts at an independent verb/adjective (the content-word head) or at a bare 助動詞
// (so a fresh copula chain like でし+た fuses into でした even with no preceding verb).
function isRunStart(m: kuromoji.IpadicFeatures): boolean {
  return ((m.pos === '動詞' || m.pos === '形容詞') && m.pos_detail_1 === '自立') || m.pos === '助動詞';
}

/**
 * Merge kuromoji's morpheme-level output into "one conjugated word per token" units.
 * て/で immediately after a verb/adjective always fuses into the SAME run (it's that word's
 * own conjugation marker, never a standalone token on its own) — but the run then only keeps
 * extending past it if what follows is itself another auxiliary/助動詞, so a genuine
 * clause-joining て ("食べて、飲みました") correctly stops at 食べて instead of swallowing the
 * next clause. Verified against live kuromoji output for this exact case before shipping.
 */
function fuseMorphemes(morphs: kuromoji.IpadicFeatures[]): FusedToken[] {
  const out: FusedToken[] = [];
  let i = 0;
  while (i < morphs.length) {
    const m = morphs[i];
    if (m.pos === '記号') {
      out.push({ surface: m.surface_form, reading: kataToHira(m.reading || m.surface_form), isPunct: true });
      i++;
      continue;
    }
    if (!isRunStart(m)) {
      out.push({ surface: m.surface_form, reading: kataToHira(m.reading || m.surface_form), isPunct: false });
      i++;
      continue;
    }
    let j = i + 1;
    let surface = m.surface_form;
    let reading = kataToHira(m.reading || m.surface_form);
    const headBase = m.basic_form;
    while (j < morphs.length) {
      const n = morphs[j];
      const isAux = n.pos === '助動詞';
      const isAuxVerb = (n.pos === '動詞' || n.pos === '形容詞') && AUX_DETAIL.has(n.pos_detail_1);
      const isTeConn = n.pos === '助詞' && n.pos_detail_1 === '接続助詞' && (n.surface_form === 'て' || n.surface_form === 'で');
      if (!isAux && !isAuxVerb && !isTeConn) break;
      surface += n.surface_form;
      reading += kataToHira(n.reading || n.surface_form);
      j++;
    }
    out.push({ surface, reading, baseForm: headBase !== surface ? headBase : undefined, isPunct: false });
    i = j;
  }
  return out;
}

/** Longest run of consecutive noun-ish tokens a greedy merge will reconstruct as one name/word. */
const MAX_MERGE = 4;

// Re-join consecutive plain tokens (typically names split across 名詞 morphemes, e.g.
// 田中+太郎+さん) whose concatenation matches a known due-word/name — same greedy-merge
// pattern already used for the Chinese pipe format in route.ts's parseTokenString.
function mergeKnownRuns(tokens: FusedToken[], overrides: Map<string, DictOverride>): FusedToken[] {
  const out: FusedToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].isPunct || tokens[i].baseForm) { out.push(tokens[i]); continue; }
    let merged: FusedToken | null = null;
    let used = 1;
    for (let len = Math.min(MAX_MERGE, tokens.length - i); len >= 2; len--) {
      const window = tokens.slice(i, i + len);
      if (window.some(t => t.isPunct || t.baseForm)) continue;
      const joined = window.map(t => t.surface).join('');
      if (overrides.has(joined)) {
        merged = { surface: joined, reading: window.map(t => t.reading).join(''), isPunct: false };
        used = len;
        break;
      }
    }
    out.push(merged ?? tokens[i]);
    i += used - 1;
  }
  return out;
}

const jmdict = jmdictData as unknown as Record<string, { p: string; m: string }>;

function resolveMeaning(baseForm: string | undefined, surface: string): string {
  const key = baseForm ?? surface;
  return jmdict[key]?.m ?? jmdict[surface]?.m ?? JLPT_VOCAB[key]?.meaning ?? JLPT_VOCAB[surface]?.meaning ?? '';
}

/**
 * Segment a plain Japanese sentence into the RawTok wire format the client already consumes
 * (same shape as the Chinese pipe-format parser produces), resolving meaning server-side via
 * JMdict/JLPT_VOCAB keyed by kuromoji's own base-form analysis instead of relying on the model
 * to self-segment or the client to re-derive it.
 */
export async function segmentJa(text: string, overrides: Map<string, DictOverride>): Promise<RawTok[]> {
  if (!text) return [];
  const tokenizer = await getTokenizer();
  const fused = mergeKnownRuns(fuseMorphemes(tokenizer.tokenize(text)), overrides);

  return fused.map((t): RawTok => {
    if (t.isPunct) return [t.surface];
    const override = overrides.get(t.baseForm ?? t.surface) ?? overrides.get(t.surface);
    const reading = override?.p ?? t.reading;
    const meaning = override?.m ?? resolveMeaning(t.baseForm, t.surface);
    return t.baseForm ? [t.surface, reading, meaning, t.baseForm] : [t.surface, reading, meaning];
  });
}
