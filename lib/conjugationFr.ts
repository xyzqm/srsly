import {
  stemDelta, clusterFacts, cellKey, PERSON_ORDER,
  type Tense, type Person, type CellKey, type CellDiff, type ConjugationFact, type GrammarTable,
} from './conjugation';

/**
 * French conjugation — a sibling of `lib/conjugation.ts`, not a branch inside it.
 *
 * The neutral half is shared: `stemDelta`, `clusterFacts` and the cell vocabulary say nothing
 * about Spanish. Everything else differs enough that a ternary would be a lie — Lexique gives
 * POSITIONAL codes where Wiktionary gives tag sets, French has three regular paradigms where
 * Spanish has three uniform ones, and the tense a French learner most needs is not in the data
 * at all. This is the same seam `components/read/GrammarNote.tsx` already uses, where a third
 * language is a third module rather than a rewrite.
 *
 * ── FOUR THINGS THE FRENCH DATA DOES THAT THE SPANISH DATA DOES NOT ──
 *
 * 1. ONE CODE PACKS SEVERAL READINGS. 87 of the 140 verb codes carry more than one slot and
 *    twelve carry four or five: `VER|imp:pre:2s;ind:pre:1s;ind:pre:3s;sub:pre:1s;sub:pre:3s||`
 *    is one form filling five cells. Taking the first would label the commonest form of every
 *    regular -er verb an IMPERATIVE, which CLAUDE.md already documents at length.
 *
 * 2. `imp` MEANS TWO THINGS BY POSITION. A code is `mood:tense:person`, so `imp:pre:2s` is the
 *    imperative MOOD and `ind:imp:3s` is the imparfait TENSE. A substring test mislabels one of
 *    them, and a beginner cannot catch a confidently wrong grammatical label.
 *
 * 3. `inf` SHARES CODES WITH FINITE FORMS — `VER|ind:fut:3s;inf||`. Excluding any code
 *    CONTAINING `inf` would delete real future cells. Filtering happens per SLOT, never per
 *    code, which is the same granularity mistake the Spanish clitic filter made once already.
 *
 * 4. `-ir` IS NOT ONE CLASS. `finir` takes the -iss- infix (finissons) and `partir` does not
 *    (partons), while `ouvrir` conjugates like an -er verb. Spanish's -ir is uniform. See
 *    `verbClassFr`.
 *
 * ── THE PASSÉ COMPOSÉ IS ABSENT BY CONSTRUCTION, AND THAT IS THE BIG ONE ──
 * French's everyday past is `avoir`/`être` plus a participle — two words — and Lexique lists
 * simple forms only (54 multi-word entries in the whole table). So the tense a learner needs
 * most cannot be drilled as a single form. It is not faked here: the PARTICIPLE is drilled
 * directly, which is the half that actually has to be learned, and the auxiliary choice is a
 * separate concept from an authored list rather than a form invented from a rule.
 */

/* ─────────────────────────── reading the codes ────────────────────────── */

/** Lexique mood:tense → our tense. Absent means deliberately not taught. */
const SLOT_TENSE: Record<string, Tense> = {
  'ind:pre': 'pres',
  'ind:imp': 'impf',
  'ind:fut': 'fut',
  'cnd:pre': 'cond',
  'sub:pre': 'pressubj',
  'par:pre': 'gerund',        // participe présent — the same slot Spanish fills with a gerund
  // 'ind:pas' — passé simple, literary. A learner will read it and never write it.
  // 'sub:imp' — imparfait du subjonctif, likewise.
  // 'imp:pre' — imperative: functional, but only three persons, so it needs its own cell
  //             model. Deliberately deferred rather than half-modelled.
  // 'inf'     — the lemma itself, and never a question worth asking.
};

const SLOT_PERSON: Record<string, Person> = {
  '1s': 'fs', '2s': 'ss', '3s': 'ts', '1p': 'fp', '2p': 'sp', '3p': 'tp',
};

/**
 * Which cells a Lexique code describes.
 *
 * The participle is accepted only in its BASE form — masculine singular, or with the fields
 * left empty. `par:pas|f|p` is adjective agreement (`parlées`), which is a different thing
 * from conjugation and is what `GrammarNote` already refuses to attach to a finite reading.
 */
export function cellsForCodeFr(code: string): { tense: Tense; person: Person }[] {
  if (!code.startsWith('VER|')) return [];
  const [, slotField = '', gender = '', number = ''] = code.split('|');
  const out: { tense: Tense; person: Person }[] = [];
  const seen = new Set<CellKey>();
  for (const slot of slotField.split(';')) {
    if (!slot) continue;
    const parts = slot.split(':');
    if (slot === 'par:pas') {
      const base = (gender === 'm' || gender === '') && (number === 's' || number === '');
      if (!base) continue;
      const key = cellKey('participle', '');
      if (!seen.has(key)) { seen.add(key); out.push({ tense: 'participle', person: '' }); }
      continue;
    }
    if (slot === 'par:pre') {
      const key = cellKey('gerund', '');
      if (!seen.has(key)) { seen.add(key); out.push({ tense: 'gerund', person: '' }); }
      continue;
    }
    if (parts.length !== 3) continue;
    const tense = SLOT_TENSE[`${parts[0]}:${parts[1]}`];
    const person = SLOT_PERSON[parts[2]];
    if (!tense || !person) continue;
    const key = cellKey(tense, person);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tense, person });
  }
  return out;
}

/* ────────────────────────── the three paradigms ───────────────────────── */

/**
 * The regular classes, and why there are three rather than four.
 *
 * `er` is 5,311 of the 5,977 verbs Lexique knows — 89% of French. `ir2` is the second group,
 * the -iss- verbs. `re` is the -dre family (vendre, attendre, répondre, perdre), which is
 * genuinely regular among itself.
 *
 * Everything else — `partir`, `ouvrir`, every `-oir`, and `être`/`avoir`/`aller` — is the
 * third group, and it gets NO class on purpose. There is no rule to state, so a pattern card
 * would be a table pretending to be a rule; those verbs are learned as rows, which is both how
 * they are taught and what `factsForVerbFr` emits for them.
 */
export type FrClass = 'er' | 'ir2' | 're';

const ENDINGS: Record<FrClass, Partial<Record<Tense, readonly string[]>>> = {
  er: {
    pres: ['e', 'es', 'e', 'ons', 'ez', 'ent'],
    impf: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    pressubj: ['e', 'es', 'e', 'ions', 'iez', 'ent'],
    gerund: ['ant'], participle: ['é'],
  },
  ir2: {
    pres: ['is', 'is', 'it', 'issons', 'issez', 'issent'],
    impf: ['issais', 'issais', 'issait', 'issions', 'issiez', 'issaient'],
    pressubj: ['isse', 'isses', 'isse', 'issions', 'issiez', 'issent'],
    gerund: ['issant'], participle: ['i'],
  },
  re: {
    pres: ['s', 's', '', 'ons', 'ez', 'ent'],
    impf: ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'],
    pressubj: ['e', 'es', 'e', 'ions', 'iez', 'ent'],
    gerund: ['ant'], participle: ['u'],
  },
};

const FUT  = ['ai', 'as', 'a', 'ons', 'ez', 'ont'] as const;
const COND = ['ais', 'ais', 'ait', 'ions', 'iez', 'aient'] as const;

/** How much of the lemma the finite endings attach to. */
function stemOf(lemma: string, cls: FrClass): string {
  return cls === 're' ? lemma.slice(0, -2) : lemma.slice(0, -2);
}

/**
 * THE FUTURE AND CONDITIONAL BUILD ON THE INFINITIVE, AND `-re` DROPS ITS FINAL `e`.
 *
 * `parler` → `parlerai`, `finir` → `finirai`, but `vendre` → `vendrai` and not `vendreai`.
 * Missing that turns every regular -re verb into a verb with an irregular future, which would
 * be 248 spurious exception cards.
 */
function futureStem(lemma: string, cls: FrClass): string {
  return cls === 're' ? lemma.slice(0, -1) : lemma;
}

export function regularPartsFr(
  lemma: string, cls: FrClass, tense: Tense, person: Person,
): { stem: string; ending: string } | null {
  const i = PERSON_ORDER.indexOf(person);
  if (tense === 'fut' || tense === 'cond') {
    if (i < 0) return null;
    return { stem: futureStem(lemma, cls), ending: (tense === 'fut' ? FUT : COND)[i] };
  }
  const table = ENDINGS[cls][tense];
  if (!table) return null;
  const ending = table.length === 1 ? table[0] : (i < 0 ? undefined : table[i]);
  if (ending === undefined) return null;
  return { stem: stemOf(lemma, cls), ending };
}

export function regularFormFr(lemma: string, cls: FrClass, tense: Tense, person: Person): string | null {
  const p = regularPartsFr(lemma, cls, tense, person);
  return p && p.stem + p.ending;
}

/**
 * Which regular class a verb belongs to, or null for the third group.
 *
 * ── THE SECOND GROUP IS DETECTED FROM THE DATA, NOT FROM THE ENDING ──
 * `finir` and `partir` both end in `-ir` and conjugate differently; nothing in the spelling
 * separates them. What does is the -iss- infix, which is visible in the plural: `finissons`
 * against `partons`. So the verb's own present tense is asked rather than its last two letters,
 * and `ouvrir` — which takes -er endings — falls out of `ir2` correctly because `ouvrons` has
 * no `iss`.
 *
 * A verb whose forms are missing cannot be classified, and gets no class rather than a guess.
 */
export function verbClassFr(lemma: string, cells: ReadonlyMap<CellKey, string>): FrClass | null {
  const guess = classByEnding(lemma, cells);
  if (!guess) return null;
  // A verb has to earn the class its ending claims. See MAX_DEVIATION.
  if (cells.size > 0 && deviationShare(lemma, guess, cells) >= MAX_DEVIATION) return null;
  return guess;
}

function classByEnding(lemma: string, cells: ReadonlyMap<CellKey, string>): FrClass | null {
  const end = lemma.slice(-2);
  if (end === 'er' && lemma !== 'aller') return 'er';
  if (end === 'ir') {
    const plural = cells.get(cellKey('pres', 'fp'));
    return plural?.includes('iss') ? 'ir2' : null;
  }
  if (end === 're') return 're';
  return null;
}

/**
 * How far a verb strays from the class its ending claims.
 *
 * ── A CLASS IT DOES NOT DESERVE IS WORSE THAN NO CLASS AT ALL ──
 * `être` ends in -re, so the ending alone called it a regular -re verb. That is not merely
 * untidy: `candidateCost` then PREFERS whichever candidate looks most regular, and Lexique
 * tags `étaient` as both the imperfect and the present third plural. Against a nominal `re`
 * paradigm `étaient` scores 7 and the correct `sont` scores 101, so `être`'s present row came
 * out as "suis es est sommes êtes étaient" — the imperfect smuggled into the present by a
 * class the verb never had.
 *
 * Measured across the obvious candidates, the split is clean and there is nothing in the gap:
 * parler 0%, vendre 0%, finir 0%, rompre 4%, battre 10%, mettre 13%, manger 21% — then
 * prendre 48%, dire 55%, faire 94%, être 100%. So a verb deviating in two fifths or more of
 * its cells is not that class, whatever it ends in, and is learned as rows instead. That also
 * lands `prendre`, `dire` and `faire` in the third group, which is where a textbook has them.
 */
const MAX_DEVIATION = 0.4;

function deviationShare(lemma: string, cls: FrClass, cells: ReadonlyMap<CellKey, string>): number {
  let bad = 0, total = 0;
  for (const [key, actual] of cells) {
    const [tense, person] = key.split(':') as [Tense, Person];
    const parts = regularPartsFr(lemma, cls, tense, person);
    if (!parts) continue;
    total++;
    if (parts.stem + parts.ending !== actual) bad++;
  }
  return total === 0 ? 1 : bad / total;
}

/* ──────────────────────────── the index ───────────────────────────────── */

/**
 * Cost a candidate against the regular paradigm — the same rule Spanish uses, and for the same
 * reason: bad rows are not always longer rows, so length alone cannot choose between two forms
 * claiming one cell.
 *
 * Returns `null` when there is no paradigm to judge against, which is the THIRD GROUP and is
 * most of the interesting verbs. `sharedPrefix` decides those instead — see below.
 */
function candidateCost(
  lemma: string, cls: FrClass | null, tense: Tense, person: Person, form: string,
): number | null {
  if (!cls) return null;
  const parts = regularPartsFr(lemma, cls, tense, person);
  if (!parts) return null;
  const expected = parts.stem + parts.ending;
  if (form === expected) return 0;
  if (parts.ending !== '' && form.endsWith(parts.ending)) {
    const d = stemDelta(parts.stem, form.slice(0, form.length - parts.ending.length));
    return d ? 1 + d.from.length + d.to.length : 0;
  }
  return 100 + Math.abs(form.length - expected.length);
}

/**
 * How much of the lemma a form still carries — the tiebreak a third-group verb needs.
 *
 * ── A LENGTH RULE PUT `pincer` IN `pouvoir`'s PARADIGM ──
 * Lexique tags `pincer` — the infinitive of "to pinch" — as `VER|ind:pre:2p` with the lemma
 * `pouvoir`. So `pincer` and `pouvez` both claim the second-person plural, and `pouvoir` has no
 * regular class to cost them against, so the fallback was length: both are six letters, the tie
 * broke alphabetically, and the drill was ready to teach `vous pincer`.
 *
 * A conjugated form keeps the shape of its verb even when the verb is irregular. `pouvez`
 * shares four letters with `pouvoir` and `pincer` shares one, which is the whole difference and
 * needs no list of exceptions to express. Suppletion is safe from it: `vais` shares nothing
 * with `aller`, but nothing else claims that cell, so there is no tie to break.
 */
function sharedPrefix(lemma: string, form: string): number {
  let i = 0;
  while (i < lemma.length && i < form.length && lemma[i] === form[i]) i++;
  return i;
}

export type FrVerbIndex = ReadonlyMap<string, ReadonlyMap<CellKey, string>>;

/**
 * Invert the table once — one pass over 86,293 forms rather than one pass per verb.
 *
 * The class cannot be known until the forms are in hand (the -iss- test reads the present), so
 * candidates are collected first and costed in a second pass over the much smaller result.
 */
export function indexVerbsFr(table: GrammarTable): FrVerbIndex {
  const raw = new Map<string, Map<CellKey, string[]>>();
  for (const [form, entries] of Object.entries(table.w)) {
    for (const [ci, lemma] of entries) {
      const code = table.c[ci];
      if (!code || !code.startsWith('VER|')) continue;
      for (const { tense, person } of cellsForCodeFr(code)) {
        let cells = raw.get(lemma);
        if (!cells) { cells = new Map(); raw.set(lemma, cells); }
        const key = cellKey(tense, person);
        cells.set(key, [...(cells.get(key) ?? []), form]);
      }
    }
  }
  const out = new Map<string, Map<CellKey, string>>();
  for (const [lemma, cells] of raw) {
    const provisional = new Map<CellKey, string>();
    for (const [key, forms] of cells) provisional.set(key, forms[0]);
    const cls = verbClassFr(lemma, provisional);
    const flat = new Map<CellKey, string>();
    for (const [key, forms] of cells) {
      const [tense, person] = key.split(':') as [Tense, Person];
      // Ranked in order: how big a claim it makes about the paradigm, then how much of the
      // verb it still carries, then shorter, then lexicographic so the index is deterministic
      // — a card whose id moves has lost its review history.
      const rank = (f: string): [number, number, number, string] => [
        candidateCost(lemma, cls, tense, person, f) ?? 0,
        -sharedPrefix(lemma, f),
        f.length,
        f,
      ];
      let best = forms[0], bestRank = rank(best);
      for (const f of forms.slice(1)) {
        const r = rank(f);
        for (let i = 0; i < r.length; i++) {
          if (r[i] === bestRank[i]) continue;
          if (r[i] < bestRank[i]) { best = f; bestRank = r; }
          break;
        }
      }
      flat.set(key, best);
    }
    out.set(lemma, flat);
  }
  return out;
}

const indexCache = new WeakMap<object, FrVerbIndex>();

export function verbIndexFr(table: GrammarTable): FrVerbIndex {
  let idx = indexCache.get(table);
  if (!idx) { idx = indexVerbsFr(table); indexCache.set(table, idx); }
  return idx;
}

export function verbCellsFr(table: GrammarTable, lemma: string): ReadonlyMap<CellKey, string> {
  return verbIndexFr(table).get(lemma) ?? new Map();
}

/* ───────────────────────────── the facts ──────────────────────────────── */

const FR_TENSE_ORDER: readonly Tense[] =
  ['pres', 'impf', 'fut', 'cond', 'pressubj', 'gerund', 'participle'];

/**
 * Everything a French verb asks beyond its pattern.
 *
 * ── A THIRD-GROUP VERB IS LEARNED AS ROWS, NOT AS DEVIATIONS ──
 * `partir`, `ouvrir`, `pouvoir`, `être` have no regular paradigm to deviate FROM, so there is
 * no delta to state and a stem fact would be arithmetic dressed as a rule. They emit one
 * PARADIGM fact per tense — the whole row, which is exactly how they are taught and how they
 * are recited. Spanish never needed this because every Spanish verb has a class.
 */
export function factsForVerbFr(table: GrammarTable, lemma: string): ConjugationFact[] {
  const cells = verbCellsFr(table, lemma);
  if (cells.size === 0) return [];
  const cls = verbClassFr(lemma, cells);

  if (!cls) {
    const byTense = new Map<Tense, CellDiff[]>();
    for (const [key, actual] of cells) {
      const [tense, person] = key.split(':') as [Tense, Person];
      byTense.set(tense, [...(byTense.get(tense) ?? []), { tense, person, expected: '', actual, delta: null }]);
    }
    return [...byTense.entries()]
      .sort((a, b) => FR_TENSE_ORDER.indexOf(a[0]) - FR_TENSE_ORDER.indexOf(b[0]))
      .map(([tense, diffs]) => ({
        key: `paradigm:${tense}`,
        kind: 'paradigm' as const,
        lemma,
        tense,
        cells: diffs.sort((a, b) => PERSON_ORDER.indexOf(a.person) - PERSON_ORDER.indexOf(b.person)),
      }));
  }

  const diffs: CellDiff[] = [];
  for (const [key, actual] of cells) {
    const [tense, person] = key.split(':') as [Tense, Person];
    const parts = regularPartsFr(lemma, cls, tense, person);
    if (!parts) continue;
    const expected = parts.stem + parts.ending;
    if (expected === actual) continue;
    const delta = parts.ending !== '' && actual.endsWith(parts.ending)
      ? stemDelta(parts.stem, actual.slice(0, actual.length - parts.ending.length))
      : parts.ending === ''
        ? stemDelta(parts.stem, actual)
        : null;
    diffs.push({ tense, person, expected, actual, delta });
  }
  return clusterFacts(lemma, diffs);
}

/** One of the pattern cards: a whole tense of one regular class. */
export interface FrPatternCard {
  key: string;
  cls: FrClass;
  tense: Tense;
  endings: readonly string[];
}

/** Three classes times seven slots. */
export function patternCardsFr(): FrPatternCard[] {
  const out: FrPatternCard[] = [];
  for (const cls of ['er', 'ir2', 're'] as const) {
    for (const tense of FR_TENSE_ORDER) {
      const endings = tense === 'fut' ? FUT : tense === 'cond' ? COND : ENDINGS[cls][tense];
      if (endings) out.push({ key: `pattern:${cls}:${tense}`, cls, tense, endings });
    }
  }
  return out;
}

/* ─────────────────────── the passé composé ────────────────────────────── */

/**
 * THE VERBS THAT TAKE `être`, AUTHORED — because no table records this.
 *
 * Lexique has forms, not auxiliaries, and the passé composé is two words so it is not a form
 * at all. This is the one piece of French the drill cannot derive, so it is written down, kept
 * short, and validated against the grammar table by `tests/conjugationFr.test.ts` — the same
 * arrangement `core-overrides.json`'s `beginner` sets have, and the same as
 * `FORM_DOMINANT_LEMMAS` in the French lemmatizer, which is likewise a small authored set
 * living in TypeScript rather than a generated table.
 *
 * The traditional mnemonic is DR MRS VANDERTRAMP, and it is a list of sixteen verbs plus their
 * prefixed relatives (`revenir`, `redevenir`, `remonter`). Reflexives also take `être`, but a
 * reflexive is a construction rather than a lemma and no card here asks about one.
 *
 * ── SIX OF THESE TAKE `avoir` WHEN THEY HAVE A DIRECT OBJECT ──
 * `monter`, `descendre`, `sortir`, `rentrer`, `retourner` and `passer` are `être` when
 * intransitive ("elle est sortie") and `avoir` when transitive ("elle a sorti les poubelles").
 * A drill card cannot see the object, so it teaches the intransitive reading and SAYS SO
 * rather than pretending the choice is unconditional. Getting that wrong in silence would be
 * the confidently-wrong label this codebase refuses everywhere.
 */
export const ETRE_VERBS: ReadonlySet<string> = new Set([
  'aller', 'arriver', 'descendre', 'devenir', 'entrer', 'monter', 'mourir', 'naître',
  'partir', 'passer', 'rentrer', 'rester', 'retourner', 'revenir', 'sortir', 'tomber', 'venir',
  // Prefixed relatives that inherit the auxiliary.
  'redevenir', 'remonter', 'repartir', 'ressortir', 'retomber', 'parvenir', 'survenir',
  'intervenir', 'provenir', 'redescendre', 'rentrer',
]);

/** The six whose auxiliary depends on whether there is a direct object. */
export const TRANSITIVE_SOMETIMES: ReadonlySet<string> = new Set([
  'monter', 'descendre', 'sortir', 'rentrer', 'retourner', 'passer',
]);

export type Auxiliary = 'avoir' | 'être';

/**
 * Which auxiliary a verb takes in the compound tenses.
 *
 * `avoir` is the default and covers almost everything, which is exactly why the drill treats
 * it as the PATTERN and the `être` list as the exceptions — the same shape the rest of this
 * phase uses.
 */
export function auxiliaryFor(lemma: string): Auxiliary {
  return ETRE_VERBS.has(lemma) ? 'être' : 'avoir';
}

/**
 * The passé composé, composed.
 *
 * Returns one form per person: `ai parlé`, `suis allé`. The pronoun is NOT included — the card
 * prints it as the prompt, so putting it in the answer would make the learner type something
 * they were just shown.
 *
 * ── AGREEMENT IS SHOWN, NOT TESTED ──
 * `être` verbs agree with the subject (`elle est allée`, `ils sont allés`), which depends on a
 * gender the card has no way to know. The masculine singular is what is graded and the Learn
 * row says agreement exists; inventing a gender in order to test it would be fabricating the
 * question.
 */
export function passeCompose(
  table: GrammarTable, lemma: string,
): { aux: Auxiliary; forms: Map<Person, string> } | null {
  const participle = verbCellsFr(table, lemma).get(cellKey('participle', ''));
  if (!participle) return null;
  const aux = auxiliaryFor(lemma);
  const auxCells = verbCellsFr(table, aux);
  const forms = new Map<Person, string>();
  for (const person of PERSON_ORDER) {
    const conjugated = auxCells.get(cellKey('pres', person));
    if (!conjugated) continue;
    forms.set(person, `${conjugated} ${agree(participle, aux, person)}`);
  }
  return forms.size > 0 ? { aux, forms } : null;
}

/**
 * NUMBER agreement, which is not optional — and gender, which is not knowable.
 *
 * An `être` participle agrees with its subject, so `nous sommes allés` takes the plural. That
 * is not a nicety: `nous sommes allé` is simply wrong French, and printing it on a row the
 * learner is asked to read would teach an error. Number is decided by the person, so it is
 * applied.
 *
 * GENDER IS NOT. `elle est allée` depends on who is speaking, which no card can know — so the
 * masculine is what is shown and graded, and `auxiliaryNote` says agreement exists rather than
 * the drill inventing a subject in order to test it. An `avoir` participle does not agree with
 * its subject at all, so it is left alone.
 */
function agree(participle: string, aux: Auxiliary, person: Person): string {
  if (aux !== 'être') return participle;
  const plural = person === 'fp' || person === 'sp' || person === 'tp';
  if (!plural || participle.endsWith('s')) return participle;
  return participle + 's';
}
