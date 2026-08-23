/**
 * What a French word is DOING in the sentence in front of you.
 *
 * The app already knew this and never said it. `lemmatizeFr` resolves `abaissait → abaisser`
 * so the token can link to the right card, and the learner sees only the definition of
 * "abaisser" — never that they are looking at an imperfect. This turns that silent step into
 * the one thing the app was missing: an explanation of why the sentence is shaped this way.
 *
 * The data is Lexique 3 (`scripts/data/Lexique383.tsv`, CC BY-SA 4.0, already vendored for
 * frequency ranking — see ATTRIBUTION.md), whose `infover`, `genre` and `nombre` columns record
 * the exact slot each inflected form fills. There are only 49 distinct slot codes in the whole
 * database, so this is a closed set that can be mapped exhaustively rather than parsed hopefully.
 *
 * ── CODES ARE DECODED HERE, NOT AT BUILD TIME ──
 * The emitted table stores the raw `VER|ind:imp:3s||`. Storing English there would bake one
 * phrasing into a generated file, so rewording "past historic" would mean a rebuild. Decoding
 * at render keeps the wording editable and this module unit-testable against every code the
 * data actually contains.
 */

/**
 * MOOD comes first, TENSE second — and `imp` appears in BOTH positions meaning different
 * things: imperative as a mood, imparfait as a tense. `imp:pre:2s` is an imperative and
 * `ind:imp:3s` is an imperfect, so a position-blind lookup would confidently mislabel one of
 * them. That is the whole reason these are two separate tables rather than one.
 */
const MOODS: Record<string, string> = {
  ind: '',              // indicative is the unmarked case; saying it adds noise, not meaning
  sub: 'subjunctive',
  cnd: 'conditional',
  imp: 'imperative',
};

const TENSES: Record<string, string> = {
  pre: 'present',
  imp: 'imperfect',
  fut: 'future',
  pas: 'past historic',   // passé simple — literary, and worth naming as such when it appears
};

const PERSONS: Record<string, string> = {
  '1s': '1st person singular',
  '2s': '2nd person singular',
  '3s': '3rd person singular',
  '1p': '1st person plural',
  '2p': '2nd person plural',
  '3p': '3rd person plural',
};

/** The non-finite forms, which carry no person and so are not `mood:tense:person`. */
const STANDALONE: Record<string, string> = {
  inf: 'infinitive',
  'par:pas': 'past participle',
  'par:pre': 'present participle',
};

/**
 * `ind:imp:3s` → `imperfect · 3rd person singular`.
 *
 * Returns null for anything unrecognised rather than guessing. A blank line is a small
 * failure; a wrong grammatical label handed to a beginner is one they cannot catch.
 */
export function describeFeature(code: string): string | null {
  const raw = code.trim().replace(/;+$/, '');
  if (!raw) return null;

  if (STANDALONE[raw]) return STANDALONE[raw];

  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const [mood, tense, person] = parts;

  const t = TENSES[tense];
  const p = PERSONS[person];
  if (t === undefined || p === undefined) return null;
  if (!(mood in MOODS)) return null;

  const m = MOODS[mood];
  // The imperative has no tense contrast worth showing — Lexique writes every one as
  // `imp:pre:…`, so "imperative present" would be saying the same thing twice.
  if (mood === 'imp') return `imperative · ${p}`;
  return m ? `${m} ${t} · ${p}` : `${t} · ${p}`;
}

/** Gender and number, for the inflections that carry them. */
const GENDERS: Record<string, string> = { m: 'masculine', f: 'feminine' };
const NUMBERS: Record<string, string> = { s: 'singular', p: 'plural' };

function agreement(genre: string, nombre: string): string | null {
  const g = GENDERS[genre] ?? '';
  const n = NUMBERS[nombre] ?? '';
  return [g, n].filter(Boolean).join(' ') || null;
}

/** Read order for the groups below — roughly the order a learner meets them. */
const TENSE_ORDER = ['pre', 'imp', 'fut', 'pas', 'par:pre', 'par:pas', 'inf'];

/**
 * A whole code — `VER|ind:imp:3s||`, `ADJ||f|s` — as one line of English.
 *
 * ── ONE FORM, SEVERAL SLOTS ──
 * Lexique lists every reading of a form together: `lève` is `imp:pre:2s;ind:pre:1s;ind:pre:3s;
 * sub:pre:1s`, four different jobs spelled the same way. Describing all four is a wall, and
 * picking one is a guess — so this says exactly as much as the slots JOINTLY determine, and no
 * more. All four are present tense, so `lève` reads "present": the persons and moods disagree,
 * so they go unmentioned. `abaissait` has one slot and keeps its full detail.
 *
 * Measured over the 3,000 commonest forms weighted by frequency, 73% carry a single tense, 21%
 * are nouns and adjectives with none, 5% carry two — rendered "A, or B", which is a true and
 * useful thing to know about `fait` — and 0.9% carry three or more. Those last say nothing:
 * four alternatives is not an explanation, and silence is the honest form of "it depends".
 */
export function describeCode(code: string): string | null {
  const [, slotStr = '', genre = '', nombre = ''] = code.split('|');
  const slots = [...new Set(slotStr.split(';').filter(Boolean))];

  // No slots at all: a noun or adjective, where gender and number ARE the inflection.
  if (!slots.length) return agreement(genre, nombre);

  // Group by tense, since that is the coarsest thing worth naming. A standalone form
  // (infinitive, participle) is its own group.
  const groups = new Map<string, { moods: Set<string>; persons: Set<string> }>();
  for (const s of slots) {
    if (describeFeature(s) === null) return null;   // never guess at a code we cannot read
    const parts = s.split(':');
    const key = parts.length === 3 ? parts[1] : s;
    let g = groups.get(key);
    if (!g) { g = { moods: new Set(), persons: new Set() }; groups.set(key, g); }
    if (parts.length === 3) { g.moods.add(parts[0]); g.persons.add(parts[2]); }
  }

  // Three or more readings cannot be summarised into something a learner can use.
  if (groups.size > 2) return null;

  const phrases: string[] = [];
  for (const key of TENSE_ORDER) {
    const g = groups.get(key);
    if (!g) continue;
    if (STANDALONE[key]) { phrases.push(STANDALONE[key]); continue; }

    const mood = g.moods.size === 1 ? [...g.moods][0] : null;
    const person = g.persons.size === 1 ? PERSONS[[...g.persons][0]] : null;
    // A unanimous imperative names no tense; Lexique writes every one as `imp:pre:…`.
    if (mood === 'imp') { phrases.push(person ? `imperative · ${person}` : 'imperative'); continue; }
    const m = mood ? MOODS[mood] : '';
    const head = m ? `${m} ${TENSES[key]}` : TENSES[key];
    phrases.push(person ? `${head} · ${person}` : head);
  }
  if (phrases.length !== groups.size) return null;   // an ordering we do not know about

  // Gender and number belong to the participle, not to the finite readings sharing its
  // spelling. `faites` is `imp:pre:2p;ind:pre:2p;par:pas` with `f|p` — "feminine plural" is
  // true of the participle alone, so it is only appended when every slot is one.
  const agree = slots.every(s => STANDALONE[s]) ? agreement(genre, nombre) : null;
  const line = phrases.join(', or ');
  return agree ? `${line} · ${agree}` : line;
}

export interface FrGrammarTable {
  /** The interned codes, `POS|slots|gender|number`. */
  c: string[];
  /** Surface form → its readings, each an index into `c` plus that reading's lemma. */
  w: Record<string, [code: number, lemma: string][]>;
}

/**
 * Every reading of `surface` that the app's OWN lemmatizer agrees with, as English lines.
 *
 * ── WHY `baseForm` IS REQUIRED, NOT OPTIONAL ──
 * This table comes from Lexique; the token's `baseForm` comes from Wiktionary via
 * lib/server/frenchLemmatizer.ts. They agree on 99.7% of the 500 commonest forms, and the
 * disagreements are exactly where a label would be wrong: Lexique calls `lui` a form of
 * `luire`, `tu` a participle of `taire` and `mort` one of `mourir`, while the lemmatizer
 * deliberately leaves all three alone because they are common words in their own right.
 *
 * So a missing or non-matching `baseForm` is not a gap to paper over — it is the lemmatizer's
 * homograph judgement, already made, and deferring to it is what stops this line from
 * contradicting the definition printed directly above it.
 */
export function lookupGrammar(
  table: FrGrammarTable,
  surface: string,
  baseForm?: string,
): string[] {
  if (!baseForm) return [];
  const entries = table.w[surface.trim().toLowerCase()];
  if (!entries) return [];
  const want = baseForm.trim().toLowerCase();
  const lines = entries
    .filter(([, lemma]) => lemma.toLowerCase() === want)
    .map(([code]) => describeCode(table.c[code] ?? ''))
    .filter((l): l is string => l !== null);
  // `belle` is listed as both an adjective and a noun, both feminine singular of `beau` — one
  // fact the reader would see twice.
  return [...new Set(lines)];
}

let cache: FrGrammarTable | null = null;

/**
 * Load the table — LAZILY, on the first word tap, never at module scope.
 *
 * It is ~2.7 MB, which has no business in the initial bundle for a learner who may not be
 * studying French at all. Same discipline as `loadLevelTable` in lib/curriculum.ts, and the
 * dynamic import is memoized by the bundler so repeat calls cost no network.
 */
export async function loadFrGrammar(): Promise<FrGrammarTable | null> {
  if (cache) return cache;
  try {
    const { FR_GRAMMAR } = await import('./data/fr-grammar');
    cache = FR_GRAMMAR as FrGrammarTable;
    return cache;
  } catch {
    return null;
  }
}

/** The already-loaded table, or null. Synchronous, so a re-opened popup renders on its first
 *  frame instead of blinking a line in one commit late. */
export function cachedFrGrammar(): FrGrammarTable | null {
  return cache;
}
