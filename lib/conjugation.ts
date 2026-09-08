/**
 * Spanish conjugation, turned into cards a learner can actually be tested on.
 *
 * ── NOTHING IS GENERATED AND NOTHING IS STORED ──
 * There is no build script and no `es-conjugation.json`. Every fact here is DERIVED from
 * `lib/data/es-grammar.json`, which every Spanish learner already downloads for the grammar
 * note in the word popup — so a table of conjugation facts would be a second record of what
 * the first one already says, and it would drift the moment either was rebuilt. That is this
 * codebase's oldest rule and it applies cleanly.
 *
 * The cost is arithmetic, and it was measured before being accepted: the analysis is one pass
 * over a verb's ~44 cells, and a learner's deck holds tens of verbs, not the 1,260 the whole
 * graded vocabulary contains. It is milliseconds, once, behind a lazy import that has already
 * happened.
 *
 * ── THE PATTERN COMES FIRST, THE EXCEPTIONS HANG OFF IT ──
 * 61% of graded Spanish verbs are perfectly regular, and the irregular 9.6% of cells collapse
 * about 6-fold once you stop treating each cell as its own fact. So the curriculum is 27
 * PATTERN cards (three classes times nine slots) plus one EXCEPTION card per stem-fact.
 *
 * A1 is the most irregular band in the language — 70 verbs producing 130 stem-facts, only
 * about half of them regular — because the commonest verbs are the irregular ones. The pattern
 * cards are still taught first, deliberately: an exception is only an exception against a rule
 * you already hold, and 130 unanchored stem-facts is rote memorisation wearing a schedule.
 *
 * ── THE DIFFING ENGINE, WHICH IS THE WHOLE DESIGN ──
 * The naive move is to compare the two whole strings and call the difference the stem. It
 * looks right and it is not: `pensa` against `piensa` shares the suffix `ensa`, so a
 * longest-common-suffix walk reports the stem as `pi`. It happens to CLUSTER correctly — every
 * e→ie cell reports `pi` — which is exactly why it survives a counting exercise and then
 * produces a card that says `pi`.
 *
 * The ending is not something to discover: we GENERATED the regular form as stem + ending, so
 * we know precisely where to cut. Cutting there first leaves two stems to compare, and the
 * difference between them is a real, describable change: `pens` → `piens` is "insert i at 1",
 * identical across all eight of pensar's irregular cells and across two tenses.
 *
 * When the actual form does not carry the regular ending at all, that is not a stem change —
 * it is a different sub-paradigm (hacer's preterite is hice/hiciste/hizo, with its own endings
 * on its own stem). Those cluster by TENSE, which is how a textbook teaches them: one card
 * showing the whole row.
 */

/* ────────────────────────────── the cells ─────────────────────────────── */

export type Tense =
  | 'pres' | 'pret' | 'impf' | 'fut' | 'cond' | 'pressubj' | 'impsubj'
  | 'gerund' | 'participle';

/** first/second/third × singular/plural; empty for the two non-finite slots. */
export type Person = 'fs' | 'ss' | 'ts' | 'fp' | 'sp' | 'tp' | '';

export const PERSON_ORDER: readonly Person[] = ['fs', 'ss', 'ts', 'fp', 'sp', 'tp'];

export const FINITE_TENSES: readonly Tense[] =
  ['pres', 'pret', 'impf', 'fut', 'cond', 'pressubj', 'impsubj'];

/** A cell's stable id, used as a card key and as a Record key. */
export type CellKey = string;
export const cellKey = (tense: Tense, person: Person): CellKey => `${tense}:${person}`;

export function allCells(): CellKey[] {
  const out: CellKey[] = [];
  for (const t of FINITE_TENSES) for (const p of PERSON_ORDER) out.push(cellKey(t, p));
  out.push(cellKey('gerund', ''), cellKey('participle', ''));
  return out;
}

/* ─────────────────────────── the regular paradigm ─────────────────────── */

export type VerbClass = 'ar' | 'er' | 'ir';

export function verbClass(lemma: string): VerbClass | null {
  const end = lemma.slice(-2);
  return end === 'ar' || end === 'er' || end === 'ir' ? end : null;
}

/**
 * Endings by class and tense, in person order.
 *
 * Future and conditional are attached to the WHOLE INFINITIVE rather than the stem, which is
 * why they are listed apart — it is also why an irregular future (tendré, haré) shows up here
 * as a change to `tener`/`hacer` itself rather than to `ten`/`hac`.
 */
const ENDINGS: Record<VerbClass, Partial<Record<Tense, readonly string[]>>> = {
  ar: {
    pres: ['o', 'as', 'a', 'amos', 'áis', 'an'],
    pret: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'],
    impf: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
    pressubj: ['e', 'es', 'e', 'emos', 'éis', 'en'],
    impsubj: ['ara', 'aras', 'ara', 'áramos', 'arais', 'aran'],
    gerund: ['ando'], participle: ['ado'],
  },
  er: {
    pres: ['o', 'es', 'e', 'emos', 'éis', 'en'],
    pret: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
    impf: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
    pressubj: ['a', 'as', 'a', 'amos', 'áis', 'an'],
    impsubj: ['iera', 'ieras', 'iera', 'iéramos', 'ierais', 'ieran'],
    gerund: ['iendo'], participle: ['ido'],
  },
  ir: {
    pres: ['o', 'es', 'e', 'imos', 'ís', 'en'],
    pret: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
    impf: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
    pressubj: ['a', 'as', 'a', 'amos', 'áis', 'an'],
    impsubj: ['iera', 'ieras', 'iera', 'iéramos', 'ierais', 'ieran'],
    gerund: ['iendo'], participle: ['ido'],
  },
};

const FUT  = ['é', 'ás', 'á', 'emos', 'éis', 'án'] as const;
const COND = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'] as const;

/**
 * The stem the regular paradigm builds on, and the ending it appends.
 *
 * Returned together and never re-derived, because knowing exactly where the cut falls is what
 * makes the diff below trustworthy. See the module docstring.
 */
export function regularParts(lemma: string, tense: Tense, person: Person):
  { stem: string; ending: string } | null {
  const cls = verbClass(lemma);
  if (!cls) return null;
  const i = PERSON_ORDER.indexOf(person);
  if (tense === 'fut' || tense === 'cond') {
    if (i < 0) return null;
    return { stem: lemma, ending: (tense === 'fut' ? FUT : COND)[i] };
  }
  const table = ENDINGS[cls][tense];
  if (!table) return null;
  const ending = table.length === 1 ? table[0] : (i < 0 ? undefined : table[i]);
  if (ending === undefined) return null;
  return { stem: lemma.slice(0, -2), ending };
}

export function regularForm(lemma: string, tense: Tense, person: Person): string | null {
  const p = regularParts(lemma, tense, person);
  return p && p.stem + p.ending;
}

/* ──────────────────────────── the diffing engine ──────────────────────── */

/**
 * A change to the stem, expressed as a replacement rather than as a truncated string.
 *
 * `pens` → `piens` is `{ from: '', to: 'i', at: 1 }`: an insertion. `tener` → `tendr` in the
 * future is `{ from: 'e', to: 'd', at: 3 }`. `hacer` → `har` is `{ from: 'ce', to: '', at: 2 }`,
 * a deletion. All three are the same operation with different arguments, which is what lets one
 * key cluster them.
 */
export interface StemDelta {
  /** What the regular stem has there. Empty for a pure insertion. */
  from: string;
  /** What the actual stem has instead. Empty for a pure deletion. */
  to: string;
  /** Offset into the regular stem where the change begins. */
  at: number;
}

/**
 * The single contiguous change between two stems.
 *
 * Common prefix from the left, common suffix from the right, and whatever is left in the
 * middle is the change. Two stems that differ in more than one place still produce one delta
 * spanning both — which is correct for a card, since the learner has to produce the whole stem
 * either way.
 */
export function stemDelta(regular: string, actual: string): StemDelta | null {
  if (regular === actual) return null;
  let head = 0;
  while (head < regular.length && head < actual.length && regular[head] === actual[head]) head++;
  let tail = 0;
  while (
    tail < regular.length - head &&
    tail < actual.length - head &&
    regular[regular.length - 1 - tail] === actual[actual.length - 1 - tail]
  ) tail++;
  return {
    from: regular.slice(head, regular.length - tail),
    to: actual.slice(head, actual.length - tail),
    at: head,
  };
}

/** One cell that does not match the regular paradigm. */
export interface CellDiff {
  tense: Tense;
  person: Person;
  /** What the regular paradigm predicts. */
  expected: string;
  /** What the language actually does. */
  actual: string;
  /**
   * The stem change, when the regular ENDING survived. Null means the ending itself differs —
   * a different sub-paradigm rather than a stem tweak, clustered by tense instead.
   */
  delta: StemDelta | null;
}

export function diffCell(
  lemma: string, tense: Tense, person: Person, actual: string,
): CellDiff | null {
  const parts = regularParts(lemma, tense, person);
  if (!parts) return null;
  const expected = parts.stem + parts.ending;
  if (expected === actual) return null;
  const delta = actual.endsWith(parts.ending)
    ? stemDelta(parts.stem, actual.slice(0, actual.length - parts.ending.length))
    : null;
  return { tense, person, expected, actual, delta };
}

/* ──────────────────────────── clustering ──────────────────────────────── */

export type FactKind = 'stem' | 'paradigm';

/**
 * One thing a learner has to know about a verb beyond the regular pattern.
 *
 * A STEM fact is one change wherever it appears — pensar's e→ie covers eight cells across the
 * present indicative and the present subjunctive, and is one card, because it is one thing to
 * learn. A PARADIGM fact is a whole tense with its own endings, and is one card per tense,
 * because that is the unit a textbook teaches and the unit a learner recites.
 */
export interface ConjugationFact {
  /** Stable within a verb, so a card keeps its schedule across rebuilds. */
  key: string;
  kind: FactKind;
  lemma: string;
  /** Every cell this fact accounts for, in paradigm order. */
  cells: CellDiff[];
  /** Present only on a stem fact — the change itself. */
  delta?: StemDelta;
  /** Present only on a paradigm fact — the tense whose endings changed. */
  tense?: Tense;
}

const deltaKey = (d: StemDelta) => `${d.from}>${d.to}@${d.at}`;

/**
 * Group a verb's irregular cells into the smallest set of things worth learning.
 *
 * Ordering is deterministic — by kind, then by key — because these become card ids and a card
 * that changes id has lost its review history.
 */
export function clusterFacts(lemma: string, diffs: readonly CellDiff[]): ConjugationFact[] {
  const byKey = new Map<string, ConjugationFact>();
  for (const d of diffs) {
    const key = d.delta ? `stem:${deltaKey(d.delta)}` : `paradigm:${d.tense}`;
    let fact = byKey.get(key);
    if (!fact) {
      fact = d.delta
        ? { key, kind: 'stem', lemma, cells: [], delta: d.delta }
        : { key, kind: 'paradigm', lemma, cells: [], tense: d.tense };
      byKey.set(key, fact);
    }
    fact.cells.push(d);
  }
  const order = (t: Tense) => {
    const i = FINITE_TENSES.indexOf(t);
    return i < 0 ? FINITE_TENSES.length + (t === 'gerund' ? 0 : 1) : i;
  };
  for (const f of byKey.values()) {
    f.cells.sort((a, b) =>
      order(a.tense) - order(b.tense) ||
      PERSON_ORDER.indexOf(a.person) - PERSON_ORDER.indexOf(b.person));
  }
  return [...byKey.values()].sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
}

/* ─────────────────── reading the cells out of the table ───────────────── */

const PERSON_TAGS = ['first-person', 'second-person', 'third-person'] as const;

/**
 * Which cells a Wiktionary code describes, if any.
 *
 * DELIBERATELY EXCLUDED, each for its own reason:
 *  - the FUTURE SUBJUNCTIVE (hablare, hablaren) is archaic — legal formulae and proverbs, and
 *    testing a learner on it would be testing them on something they will never write;
 *  - VOSEO forms are regional, and the app teaches one standard rather than silently picking
 *    a country;
 *  - IMPERATIVES and INFINITIVES, because Wiktionary tags a clitic-carrying form with the
 *    clitic's own person (hablándonos is "first-person plural" because of the -nos), so those
 *    slots are contaminated in a way the shortest-form rule below cannot clean;
 *  - GENDER AND NUMBER on participles, which are adjective agreement rather than conjugation.
 */
export function cellsForCode(code: string): { tense: Tense; person: Person }[] {
  if (!code.startsWith('verb|')) return [];
  const tags = new Set(code.slice(5).split(','));
  if (tags.has('with-voseo')) return [];
  if (tags.has('future') && tags.has('subjunctive')) return [];
  if (tags.has('infinitive') || tags.has('imperative')) return [];
  const persons = PERSON_TAGS.filter(p => tags.has(p));
  if (tags.has('gerund')) return persons.length ? [] : [{ tense: 'gerund', person: '' }];
  if (tags.has('participle')) {
    return tags.size === 2 && tags.has('past') ? [{ tense: 'participle', person: '' }] : [];
  }
  let tenses: Tense[];
  if (tags.has('conditional')) tenses = ['cond'];
  else if (tags.has('future')) tenses = ['fut'];
  else if (tags.has('imperfect')) tenses = [tags.has('subjunctive') ? 'impsubj' : 'impf'];
  else if (tags.has('present') && tags.has('subjunctive')) tenses = ['pressubj'];
  // hablamos is tagged present AND preterite: for -ar and -ir verbs those really are spelled
  // alike, so the one form fills both cells rather than one of them being wrong.
  else if (tags.has('present') && tags.has('preterite')) tenses = ['pres', 'pret'];
  else if (tags.has('preterite')) tenses = ['pret'];
  else if (tags.has('present')) tenses = ['pres'];
  else return [];
  const num = tags.has('plural') ? 'p' : 's';
  const out: { tense: Tense; person: Person }[] = [];
  for (const t of tenses) {
    for (const p of persons) out.push({ tense: t, person: (p[0] + num) as Person });
  }
  return out;
}

export type GrammarTable = { c: string[]; w: Record<string, [number, string][]> };

/** Every verb's cells, resolved once. Lemma → cell → the form that fills it. */
export type VerbIndex = ReadonlyMap<string, ReadonlyMap<CellKey, string>>;

/**
 * How big a claim a candidate form makes about the paradigm.
 *
 * ── THIS REPLACED "TAKE THE SHORTEST FORM", WHICH WAS NOT SAFE ──
 * A clitic form carries the SAME code as the bare one — `hablándole` is tagged a plain gerund
 * exactly like `hablando` — so the tags cannot separate them and something else must. Shortest
 * separates them correctly and is nonetheless wrong, because a clitic is not the only thing
 * that makes a form differ: 14% of lemma/cell pairs in this table carry more than one
 * candidate, and some of the extras are simply BAD DATA. Wiktionary lists both `tiene` and
 * `tiée` as the third-person present of `tener`. `tiée` is not a word, and it is one character
 * shorter — so shortest-wins printed it on a card for a top-twenty verb.
 *
 * The regular paradigm is the right prior. An exact match costs nothing; a stem tweak costs
 * about what it changes; an ending that does not match at all is a much larger claim — it is
 * both what a genuinely suppletive cell looks like (`soy`, `fui`, `hice`) and what a clitic
 * form looks like, so it is disfavoured without being forbidden.
 *
 * `tiene` is a one-letter insertion; `tiée` rewrites two letters. `hablando` is exact;
 * `hablándole` does not end in `-ando` at all. One rule, both cases.
 */
function candidateCost(lemma: string, tense: Tense, person: Person, form: string): number {
  const parts = regularParts(lemma, tense, person);
  if (!parts) return Number.POSITIVE_INFINITY;
  const expected = parts.stem + parts.ending;
  if (form === expected) return 0;
  if (form.endsWith(parts.ending)) {
    const d = stemDelta(parts.stem, form.slice(0, form.length - parts.ending.length));
    return d ? 1 + d.from.length + d.to.length : 0;
  }
  return 100 + Math.abs(form.length - expected.length);
}

/**
 * Invert the whole table once: lemma → cell → form.
 *
 * ── ONE PASS, NOT ONE PASS PER VERB ──
 * The first version asked the table for each verb in turn, and each ask walked all 132,741
 * forms. Against the 1,260 graded verbs that is 167 million iterations; the aggregate test
 * took 133 seconds and timed out, which is how it was found. A learner's deck is smaller than
 * the graded list, so it would not have hung the app — it would just have been slow for no
 * reason, on a device, where nobody would have measured it.
 */
export function indexVerbs(table: GrammarTable): VerbIndex {
  const best = new Map<string, Map<CellKey, { form: string; cost: number }>>();
  for (const [form, entries] of Object.entries(table.w)) {
    for (const [ci, lemma] of entries) {
      if (!verbClass(lemma)) continue;
      const code = table.c[ci];
      if (!code) continue;
      for (const { tense, person } of cellsForCode(code)) {
        const cost = candidateCost(lemma, tense, person, form);
        if (!Number.isFinite(cost)) continue;
        let cells = best.get(lemma);
        if (!cells) { cells = new Map(); best.set(lemma, cells); }
        const key = cellKey(tense, person);
        const cur = cells.get(key);
        // Ties break on the shorter form and then lexicographically, so the index is
        // deterministic — a card whose id moves has lost its review history.
        if (cur === undefined || cost < cur.cost ||
            (cost === cur.cost && (form.length < cur.form.length ||
              (form.length === cur.form.length && form < cur.form)))) {
          cells.set(key, { form, cost });
        }
      }
    }
  }
  const out = new Map<string, Map<CellKey, string>>();
  for (const [lemma, cells] of best) {
    const flat = new Map<CellKey, string>();
    for (const [key, v] of cells) flat.set(key, v.form);
    out.set(lemma, flat);
  }
  return out;
}

/** Built at most once per table object. The table itself is already loaded lazily. */
const indexCache = new WeakMap<object, VerbIndex>();

export function verbIndex(table: GrammarTable): VerbIndex {
  let idx = indexCache.get(table);
  if (!idx) { idx = indexVerbs(table); indexCache.set(table, idx); }
  return idx;
}

/** One verb's cells. */
export function verbCells(table: GrammarTable, lemma: string): ReadonlyMap<CellKey, string> {
  return verbIndex(table).get(lemma) ?? new Map();
}

/** Everything a verb asks of a learner beyond the regular pattern. */
export function factsForVerb(table: GrammarTable, lemma: string): ConjugationFact[] {
  if (!verbClass(lemma)) return [];
  const diffs: CellDiff[] = [];
  for (const [key, actual] of verbCells(table, lemma)) {
    const [tense, person] = key.split(':') as [Tense, Person];
    const d = diffCell(lemma, tense, person, actual);
    if (d) diffs.push(d);
  }
  return clusterFacts(lemma, diffs);
}

/* ───────────────────────────── pattern cards ──────────────────────────── */

/** One of the 27: a whole tense of one conjugation class, taught as a row. */
export interface PatternCard {
  key: string;
  cls: VerbClass;
  tense: Tense;
  /** The endings in person order — one entry for the two non-finite slots. */
  endings: readonly string[];
}

/**
 * THE FRAMEWORK THE EXCEPTIONS HANG OFF, and it is taught first on purpose.
 *
 * Three classes times nine slots. An exception is only an exception against a rule already
 * held; taught the other way round, A1's 130 stem-facts are 130 unrelated things to memorise
 * and the app has quietly become a list.
 */
export function patternCards(): PatternCard[] {
  const out: PatternCard[] = [];
  for (const cls of ['ar', 'er', 'ir'] as const) {
    for (const tense of [...FINITE_TENSES, 'gerund', 'participle'] as Tense[]) {
      const endings = tense === 'fut' ? FUT
        : tense === 'cond' ? COND
        : ENDINGS[cls][tense];
      if (endings) out.push({ key: `pattern:${cls}:${tense}`, cls, tense, endings });
    }
  }
  return out;
}
