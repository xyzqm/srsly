/**
 * What a Spanish word is DOING in the sentence in front of you.
 *
 * The Spanish half of the feature `lib/frenchGrammar.ts` provides for French: the app already
 * resolves `hablaba` to `hablar` so the token can link to the right card, and the learner sees
 * only the definition of "hablar", never that they are looking at an imperfect.
 *
 * ── A TAG SET, NOT A POSITIONAL CODE ──
 * French comes from Lexique, whose `infover` packs mood, tense and person into one string where
 * `imp` means imperative in the first position and imperfect in the second — the trap that made
 * two lookup tables necessary there. Wiktionary tags Spanish semantically instead, as a flat
 * set: `hablaba` is `['first-person', 'imperfect', 'indicative', 'singular', 'third-person']`.
 * There is no position to misread, so this decoder is the simpler of the two.
 *
 * What carries over exactly is the discipline about AMBIGUITY. `hablaba` is first person AND
 * third person, one spelling for two jobs, so the line says "imperfect · singular" and does not
 * pick. Naming a person the data does not determine is the one thing this must never do: a
 * beginner cannot catch a confidently wrong grammatical label.
 *
 * ── DECODED HERE, NOT AT BUILD TIME ──
 * The emitted table stores raw `verb|imperfect,indicative,singular`. Storing English there
 * would bake one phrasing into a generated file and make rewording a rebuild.
 */

/** Everything the build script's whitelist can put in a code. */
const PERSONS: Record<string, string> = {
  'first-person': '1st person',
  'second-person': '2nd person',
  'third-person': '3rd person',
};

const NUMBERS: Record<string, string> = { singular: 'singular', plural: 'plural' };
const GENDERS: Record<string, string> = { masculine: 'masculine', feminine: 'feminine', neuter: 'neuter' };

/**
 * The indicative is deliberately absent: it is the unmarked mood, and naming it would add a
 * word to almost every verb while telling the reader nothing they can use.
 */
const MOODS: Record<string, string> = {
  subjunctive: 'subjunctive',
  imperative: 'imperative',
  conditional: 'conditional',
};

const TENSES: Record<string, string> = {
  present: 'present',
  imperfect: 'imperfect',
  preterite: 'preterite',
  future: 'future',
  past: 'past',
};

/** Non-finite forms, which carry no person. */
const NONFINITE: Record<string, string> = {
  infinitive: 'infinitive',
  gerund: 'gerund',
};

const DEGREES: Record<string, string> = {
  superlative: 'superlative',
  comparative: 'comparative',
  diminutive: 'diminutive',
  augmentative: 'augmentative',
};

export interface EsGrammarTable {
  /** The interned codes, `pos|tag,tag,tag`. */
  c: string[];
  /** Surface form → its readings, each an index into `c` plus that reading's lemma. */
  w: Record<string, [code: number, lemma: string][]>;
}

/**
 * One code — `verb|imperfect,indicative,singular` — as a line of English.
 *
 * Returns null when the tags determine nothing worth printing, rather than guessing. A blank
 * line is a small failure; a wrong grammatical label handed to a beginner is one they cannot
 * catch.
 */
export function describeCode(code: string): string | null {
  const [, tagStr = ''] = code.split('|');
  const tags = new Set(tagStr.split(',').filter(Boolean));
  if (!tags.size) return null;

  const pick = (table: Record<string, string>) =>
    [...tags].filter(t => t in table).map(t => table[t]);

  const parts: string[] = [];

  // A past participle is "past participle"; a bare participle is just a participle.
  if (tags.has('participle')) {
    parts.push(tags.has('past') ? 'past participle' : 'participle');
  } else {
    const nonfinite = pick(NONFINITE);
    if (nonfinite.length) {
      parts.push(nonfinite[0]);
    } else {
      const moods = pick(MOODS);
      const tenses = pick(TENSES);
      // Two moods on one reading is a code this does not understand; silence is the honest
      // answer. Two TENSES is different and real: for -ir verbs the first person plural is
      // spelled the same in the present and the preterite, so `vivimos` is both "we live" and
      // "we lived". That ambiguity is a fact about Spanish and worth stating, not hiding.
      if (moods.length > 1 || tenses.length > 2) return null;
      const tense = tenses.length === 2 ? `${tenses[0]} or ${tenses[1]}` : tenses[0];
      const head = [moods[0], tense].filter(Boolean).join(' ');
      if (head) parts.push(head);
    }
  }

  /**
   * PERSON, GENDER AND NUMBER ARE EACH DROPPED WHEN THEIR OWN TAGS DISAGREE.
   *
   * One spelling routinely does several jobs: `hablaba` is tagged first-person AND third-person,
   * and an augmentative adjective is tagged masculine AND feminine because the form serves both.
   * Printing whichever tag happened to sort first is a coin flip presented as a fact — and it
   * did exactly that, rendering `adj|augmentative,feminine,masculine` as "feminine" — so each
   * axis is only named when it is unanimous.
   */
  const only = (values: string[]) => (values.length === 1 ? values[0] : '');
  const agreement = [
    only(pick(PERSONS)),
    only(pick(GENDERS)),
    only(pick(NUMBERS)),
  ].filter(Boolean).join(' ');

  if (agreement) parts.push(agreement);

  // A degree tag stands on its own when nothing else did — `grandísimo` is a superlative.
  if (!parts.length) {
    const degree = pick(DEGREES)[0];
    if (degree) parts.push(degree);
  }

  if (!parts.length) return null;
  // The voseo is a distinct conjugation a reader of Rioplatense text genuinely meets.
  if (tags.has('with-voseo')) parts.push('voseo');
  return parts.join(' · ');
}

/**
 * Every reading of `surface` that the app's OWN lemmatizer agrees with, as English lines.
 *
 * `baseForm` is REQUIRED, exactly as in the French module and for the same reason. `casas` is a
 * form of both `casa` ("houses") and `casar` ("you marry"), and the lemma the app resolved is
 * the only thing that says which the sentence meant. Its absence means the lemmatizer decided
 * the surface is a common word in its own right — a judgement this line must not contradict,
 * since the definition printed directly above it comes from the same decision.
 */
export function lookupGrammar(
  table: EsGrammarTable,
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
  // One fact, printed once: a form listed under two parts of speech often decodes identically.
  return [...new Set(lines)];
}

let cache: EsGrammarTable | null = null;

/**
 * Load the table — LAZILY, on the first word tap, never at module scope. Same discipline as
 * `loadFrGrammar` and `loadLevelTable`; the dynamic import is memoized by the bundler.
 */
export async function loadEsGrammar(): Promise<EsGrammarTable | null> {
  if (cache) return cache;
  try {
    const { ES_GRAMMAR } = await import('./data/es-grammar');
    cache = ES_GRAMMAR as EsGrammarTable;
    return cache;
  } catch {
    return null;
  }
}

/** The already-loaded table, or null — synchronous, so a re-opened popup renders on frame one. */
export function cachedEsGrammar(): EsGrammarTable | null {
  return cache;
}
