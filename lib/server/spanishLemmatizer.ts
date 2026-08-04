import { ES_FORMS } from '@/lib/data/es-forms';

/**
 * Server-only Spanish lemmatizer: maps an inflected surface form to its dictionary form
 * (conjugated verb → infinitive, plural → singular, feminine → masculine), so a passage
 * word like `organizamos` resolves to the deck card `organizar`.
 *
 * Two tiers, in order:
 *   1. ES_FORMS — Spanish Wiktionary's own `form_of` data (lib/data/es-forms.ts). This is
 *      where the irregulars come from: fui → ser, voy → ir, dijeron → decir. Rules cannot
 *      derive those, and hand-maintaining them would rot.
 *   2. Suffix rules, each VALIDATED against the dictionary before being accepted — a
 *      candidate is only returned if it is a real word. Guessing without that check turns
 *      `casa` into the non-word `caso`-adjacent noise and mis-links unrelated cards.
 *
 * Tier 2 exists because ES_FORMS is deliberately capped to forms in the 50k frequency list
 * (shipping every conjugation of every verb would dwarf the dictionary itself), so rarer
 * inflections still need a fallback.
 */

/**
 * The dictionary questions this module needs answered. Supplied by the caller so the
 * lemmatizer stays independent of how the dictionary is loaded.
 */
export interface LemmaDict {
  /** Is this a dictionary headword? Used to validate rule-generated candidates. */
  has(word: string): boolean;
  /**
   * Does this headword carry at least one ORDINARY sense — i.e. is it a real word in its
   * own right, rather than only a proper noun that happens to look like an inflection?
   *
   * This distinction is what keeps `mercado` the noun "market" instead of collapsing to
   * the participle of `mercar`, while still letting `casas` (whose only headword sense is
   * "a habitational surname") resolve to `casa`.
   */
  isCommonWord(word: string): boolean;
}

/**
 * Suffix rewrites, tried in order. Each entry is [ending, ...candidate replacements].
 * Longer/more specific endings come first so `-ciones` wins over `-es`.
 */
const SUFFIX_RULES: Array<[string, ...string[]]> = [
  // ── Verb forms → infinitive ───────────────────────────────────────────────
  // Gerunds and participles.
  ['ándose', 'ar'], ['iéndose', 'er', 'ir'],
  ['ando', 'ar'], ['iendo', 'er', 'ir'], ['yendo', 'ir', 'er'],
  ['ado', 'ar'], ['ados', 'ar'], ['ada', 'ar'], ['adas', 'ar'],
  ['ido', 'er', 'ir'], ['idos', 'er', 'ir'], ['ida', 'er', 'ir'], ['idas', 'er', 'ir'],
  // Future / conditional keep the full infinitive before the ending.
  ['aríamos', 'ar'], ['eríamos', 'er'], ['iríamos', 'ir'],
  ['aremos', 'ar'], ['eremos', 'er'], ['iremos', 'ir'],
  ['arías', 'ar'], ['erías', 'er'], ['irías', 'ir'],
  ['arían', 'ar'], ['erían', 'er'], ['irían', 'ir'],
  ['aréis', 'ar'], ['eréis', 'er'], ['iréis', 'ir'],
  ['arán', 'ar'], ['erán', 'er'], ['irán', 'ir'],
  ['arás', 'ar'], ['erás', 'er'], ['irás', 'ir'],
  ['aría', 'ar'], ['ería', 'er'], ['iría', 'ir'],
  ['aré', 'ar'], ['eré', 'er'], ['iré', 'ir'],
  ['ará', 'ar'], ['erá', 'er'], ['irá', 'ir'],
  // Imperfect.
  ['ábamos', 'ar'], ['abais', 'ar'], ['abas', 'ar'], ['aban', 'ar'], ['aba', 'ar'],
  ['íamos', 'er', 'ir'], ['íais', 'er', 'ir'], ['ías', 'er', 'ir'], ['ían', 'er', 'ir'], ['ía', 'er', 'ir'],
  // Preterite.
  ['asteis', 'ar'], ['aste', 'ar'], ['aron', 'ar'], ['amos', 'ar'], ['ó', 'ar'], ['é', 'ar'],
  ['isteis', 'er', 'ir'], ['iste', 'er', 'ir'], ['ieron', 'er', 'ir'], ['imos', 'ir', 'er'],
  ['ió', 'er', 'ir'], ['í', 'er', 'ir'],
  // Present / subjunctive.
  ['áis', 'ar'], ['éis', 'er'], ['ís', 'ir'],
  ['emos', 'ar', 'er'], ['amos', 'er', 'ir'],
  ['an', 'ar'], ['as', 'ar'], ['a', 'ar'],
  ['en', 'er', 'ir'], ['es', 'er', 'ir'], ['e', 'er', 'ir'],
  ['o', 'ar', 'er', 'ir'],

  // ── Noun / adjective plurals and gender ───────────────────────────────────
  ['ces', 'z'],            // luces → luz, veces → vez
  ['es', ''],              // papeles → papel
  ['s', ''],               // casas → casa
  ['as', 'o'],             // bonitas → bonito
  ['os', 'o'],             // bonitos → bonito
  ['a', 'o'],              // bonita → bonito
];

/** Enclitic pronouns that attach to infinitives, gerunds and imperatives. */
const ENCLITICS = ['melo', 'mela', 'melos', 'melas', 'telo', 'tela', 'selo', 'sela', 'selos', 'selas',
  'noslo', 'nosla', 'me', 'te', 'se', 'lo', 'la', 'le', 'nos', 'os', 'los', 'las', 'les'];

const ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };

/** Strip accents — used only to retry a lookup, never to rewrite output text. */
function deaccent(s: string): string {
  return s.replace(/[áéíóúü]/g, c => ACCENTS[c] ?? c);
}

/**
 * Peel enclitic pronouns off a verb form: `dármelo` → `dar`, `levantarse` → `levantar`,
 * `dime` → `di`. Returns the stripped stem, or undefined if nothing sensible came off.
 */
function stripEnclitics(word: string, dict: LemmaDict): string | undefined {
  for (const clitic of ENCLITICS) {
    if (!word.endsWith(clitic) || word.length - clitic.length < 3) continue;
    const stem = word.slice(0, -clitic.length);
    // Attaching a clitic can add a written accent that the bare verb does not carry
    // (dé → deme, dá → dámelo), so try the de-accented stem too.
    for (const cand of [stem, deaccent(stem)]) {
      if (dict.has(cand)) return cand;
      const viaRules = applySuffixRules(cand, dict);
      if (viaRules) return viaRules;
    }
  }
  return undefined;
}

/** Try each suffix rewrite, returning the first candidate that is a real dictionary word. */
function applySuffixRules(word: string, dict: LemmaDict): string | undefined {
  for (const [ending, ...replacements] of SUFFIX_RULES) {
    if (!word.endsWith(ending)) continue;
    const stem = word.slice(0, word.length - ending.length);
    if (stem.length < 2) continue;
    for (const rep of replacements) {
      const candidate = stem + rep;
      if (candidate !== word && dict.has(candidate)) return candidate;
      // Verb stems often carry a diphthong that the infinitive does not (puedo → poder,
      // quieres → querer). Undo the two common raisings and retry.
      for (const undone of unraiseStem(stem)) {
        const alt = undone + rep;
        if (alt !== word && dict.has(alt)) return alt;
      }
    }
  }
  return undefined;
}

/** Reverse the ie/ue stem-vowel raising in the LAST stem syllable: pued → pod, quier → quer. */
function unraiseStem(stem: string): string[] {
  const out: string[] = [];
  const ieAt = stem.lastIndexOf('ie');
  if (ieAt > 0) out.push(stem.slice(0, ieAt) + 'e' + stem.slice(ieAt + 2));
  const ueAt = stem.lastIndexOf('ue');
  if (ueAt > 0) out.push(stem.slice(0, ueAt) + 'o' + stem.slice(ueAt + 2));
  return out;
}

/**
 * Resolve `word` to its dictionary form, or undefined when it already IS the dictionary
 * form (or nothing plausible was found). Callers treat undefined as "no base form" and
 * omit RawTok's 4th element, exactly as they do for uninflected Japanese tokens.
 */
export function lemmatizeEs(word: string, dict: LemmaDict): string | undefined {
  const lower = word.toLowerCase();
  if (!lower) return undefined;

  // A surface that is a common word in its own right IS its own dictionary form, even when
  // Wiktionary also records it as an inflection of something else. This check must come
  // FIRST: many of the most frequent Spanish words are ambiguous that way, and the
  // everyday reading is essentially always the intended one —
  //   mercado  = "market"           (not the participle of mercar)
  //   centro   = "centre"           (not 1sg of centrar)
  //   para     = "for, to"          (not 1sg of parar)
  //   la       = definite article   (not an object form of ella)
  // Headwords whose only sense is a proper noun do not qualify, so `casas` ("a habitational
  // surname") and `bonita` ("a female given name") still resolve to casa / bonito below.
  //
  // KNOWN TRADE-OFF: Spanish participles frequently double as listed adjectives, so
  // `vivido` ("living, existing") and `hablado` ("spoken") stay as themselves rather than
  // resolving to vivir / hablar, and a passage using them will not mark those cards
  // reviewed. That is the accepted cost of the ordering: reversing it would fix the
  // participles but break far commoner words, and a WRONG lemma (mislabelling `la` as a
  // form of `ella`) is worse than a missing one — it puts the wrong definition in the
  // popup and can attribute a grade to an unrelated card.
  if (dict.isCommonWord(lower)) return undefined;

  // Wiktionary's own inflection data — the only tier that gets irregulars right.
  const known = ES_FORMS[lower];
  if (known && known !== lower) return known;

  const viaClitics = stripEnclitics(lower, dict);
  if (viaClitics && viaClitics !== lower) return viaClitics;

  const viaRules = applySuffixRules(lower, dict);
  if (viaRules && viaRules !== lower) return viaRules;

  // Last resort: the same word without its written accent (mándo → mando).
  const bare = deaccent(lower);
  if (bare !== lower && dict.has(bare)) return bare;

  return undefined;
}
