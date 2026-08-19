import { FR_FORMS } from '@/lib/data/fr-forms';

/**
 * Server-only French lemmatizer: maps an inflected surface to its dictionary form, so a
 * passage word like `mangé` resolves to the deck card `manger` and `suis` to `être`.
 *
 * WHY THERE IS NO npm PACKAGE HERE
 * There is no maintained French lemmatizer on npm — `lefff-lemmatizer`, `french-lemmatizer`
 * and `fr-lemmatizer` do not exist, and `lemmatizer` is English-only. The one real option
 * is a Snowball STEMMER, which is the wrong tool: stemmers emit non-words (`manger` →
 * `mang`), and every candidate in this codebase has to survive validation against a real
 * dictionary headword. A stemmer would fail that by construction.
 *
 * What French does have is superb data. Wiktionary records its conjugation exhaustively —
 * a sample slice held 28,609 `form_of` entries against 1,658 lemmas — so lib/data/fr-forms.ts
 * carries the irregulars outright and the rules below only cover what falls outside it.
 * Same two-tier design as lib/server/spanishLemmatizer.ts.
 */

/** The dictionary questions this module needs answered — same shape as es/ko. */
export interface LemmaDict {
  /** Is this a dictionary headword? */
  has(word: string): boolean;
  /** Does this headword carry at least one ordinary (non-proper-noun) sense? */
  isCommonWord(word: string): boolean;
}

/**
 * Lemmas whose inflected forms outrank any homographic noun.
 *
 * Most of the time a surface that is itself a common word should stay put — `livre` is
 * "book", not a form of `livrer`; `porte` is "door", not a form of `porter`. But a handful
 * of collisions go the other way, because the verb is overwhelmingly the commoner reading:
 * `est` is "is" far more often than the noun "east", and `été` is "been" more often than
 * "summer". Restricting the exception to forms of these few very high-frequency verbs keeps
 * it clear-cut rather than a matter of taste.
 */
const FORM_DOMINANT_LEMMAS = new Set([
  'être', 'avoir', 'aller', 'faire', 'pouvoir', 'vouloir',
  'devoir', 'dire', 'voir', 'savoir', 'venir', 'prendre',
]);

/**
 * Surfaces the rule above must NOT claim, because the non-verb reading is the common one
 * even though the verb is high-frequency. `puis` is the everyday adverb "then"; `je puis`
 * for "je peux" is literary and rare, so resolving `puis` to `pouvoir` mislabels almost
 * every occurrence a learner will meet.
 */
const FORM_DOMINANT_EXCEPTIONS = new Set(['puis']);

/**
 * Proclitics that elide onto the following word: l'eau, d'accord, j'ai, qu'il, n'est.
 * Splitting on the apostrophe is only safe when the prefix is one of these — plenty of
 * ordinary French words contain an apostrophe of their own (aujourd'hui, presqu'île), and
 * those are caught earlier by the "already a headword" test.
 */
const ELIDED_PROCLITICS = new Set([
  'l', 'd', 'j', 'n', 'c', 's', 'm', 't', 'y',
  'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu',
]);

/**
 * Suffix rewrites, tried in order, each validated against the dictionary before being
 * accepted. Longer/more specific endings come first.
 */
const SUFFIX_RULES: Array<[string, ...string[]]> = [
  // ── Verb forms → infinitive ───────────────────────────────────────────────
  ['eraient', 'er'], ['iraient', 'ir'], ['assions', 'er'], ['issions', 'ir'],
  ['erions', 'er'], ['irions', 'ir'], ['assiez', 'er'], ['issiez', 'ir'],
  ['eriez', 'er'], ['iriez', 'ir'], ['erais', 'er'], ['erait', 'er'],
  ['irais', 'ir'], ['irait', 'ir'], ['erons', 'er'], ['irons', 'ir'],
  ['eront', 'er'], ['iront', 'ir'], ['aient', 'er', 'ir', 're'],
  ['erez', 'er'], ['irez', 'ir'], ['eras', 'er'], ['iras', 'ir'],
  ['ions', 'er', 'ir', 're'], ['iez', 'er', 'ir', 're'],
  ['ais', 'er', 'ir', 're'], ['ait', 'er', 'ir', 're'],
  ['ons', 'er', 'ir', 're'], ['ez', 'er', 'ir', 're'],
  ['ent', 'er', 'ir', 're'], ['ant', 'er', 'ir', 're'],
  ['issant', 'ir'], ['issent', 'ir'], ['issons', 'ir'], ['issez', 'ir'],
  // Past participles, including their gender/number agreement.
  ['ées', 'er'], ['ée', 'er'], ['és', 'er'], ['é', 'er'],
  ['ies', 'ir'], ['ie', 'ir'], ['is', 'ir', 're'], ['it', 'ir', 're'],
  ['us', 'oir', 're'], ['ue', 'oir', 're'], ['u', 'oir', 're'],
  ['es', 'er', 'ir', 're'], ['e', 'er', 'ir', 're'],
  ['s', 'er', 'ir', 're'], ['t', 'er', 'ir', 're'],

  // ── Noun / adjective plural and gender ────────────────────────────────────
  ['aux', 'al'],           // chevaux → cheval, journaux → journal
  ['eaux', 'eau'],         // bateaux → bateau
  ['euses', 'eur'], ['euse', 'eur'],   // chanteuse → chanteur
  ['trices', 'teur'], ['trice', 'teur'],
  ['ères', 'er'], ['ère', 'er'],       // première → premier
  ['elles', 'el'], ['elle', 'el'],     // belle handled by FR_FORMS; nouvelle → nouvel
  ['ives', 'if'], ['ive', 'if'],       // active → actif
  ['x', ''],               // choux → chou
  ['es', ''], ['s', ''],   // grandes → grande → grand
  ['e', ''],               // grande → grand
];

const ACCENTS: Record<string, string> = {
  'à': 'a', 'â': 'a', 'ä': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
  'î': 'i', 'ï': 'i', 'ô': 'o', 'ö': 'o', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ÿ': 'y', 'ç': 'c',
};

/** Strip accents — used only to retry a lookup, never to rewrite output text. */
function deaccent(s: string): string {
  return s.replace(/[àâäéèêëîïôöùûüÿç]/g, c => ACCENTS[c] ?? c);
}

/**
 * The plural of a LIGATURE noun, resolved before the verb rules get a look.
 *
 * FR_FORMS is scoped by Lexique's inflection inventory (see build-frdict.mjs), and Lexique
 * writes no ligature at all — zero of its 142,695 rows contain œ or æ. So every ligature
 * plural is missing from FR_FORMS and falls through to SUFFIX_RULES, where the verb endings
 * are tried first by design: `œuvres` became `œuvrer` "to work" and `manœuvres` became
 * `manœuvrer` "to maneuver". Ordinary plurals never hit this because FR_FORMS answers them
 * first — `portes` → `porte`, `livres` → `livre` — so the ordering is only wrong in exactly
 * the hole the ligature opens.
 *
 * This restores the noun reading for that hole and nowhere else: it fires only on a word
 * containing œ or æ, and only when stripping the plural leaves a headword with an ordinary
 * sense of its own. The trade-off it accepts is the one the module already accepts
 * everywhere else — a surface that is a common noun stays a noun, so `tu manœuvres` reads as
 * the noun. That is the same call `portes` and `fermes` get.
 */
function ligatureNounPlural(word: string, dict: LemmaDict): string | undefined {
  if (!/[œæ]/.test(word)) return undefined;
  for (const ending of ['eaux', 'aux', 'x', 's']) {
    if (!word.endsWith(ending)) continue;
    const stem = word.slice(0, word.length - ending.length);
    if (stem.length < 2) continue;
    for (const rep of ending === 'eaux' ? ['eau'] : ending === 'aux' ? ['al'] : ['']) {
      const candidate = stem + rep;
      if (candidate !== word && dict.isCommonWord(candidate)) return candidate;
    }
  }
  return undefined;
}

/** Try each suffix rewrite, returning the first candidate the dictionary confirms. */
function applySuffixRules(word: string, dict: LemmaDict): string | undefined {
  for (const [ending, ...replacements] of SUFFIX_RULES) {
    if (!word.endsWith(ending)) continue;
    const stem = word.slice(0, word.length - ending.length);
    if (stem.length < 2) continue;
    for (const rep of replacements) {
      const candidate = stem + rep;
      if (candidate !== word && dict.has(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Peel an elided proclitic off the front: l'eau → eau, d'accord → accord, qu'il → il.
 * Returns undefined when the token has no apostrophe or the prefix isn't a proclitic.
 */
function stripElision(word: string, dict: LemmaDict): string | undefined {
  const at = word.search(/['’]/);
  if (at <= 0) return undefined;
  const prefix = word.slice(0, at);
  const rest = word.slice(at + 1);
  if (!rest || !ELIDED_PROCLITICS.has(prefix)) return undefined;
  const restMapped = FR_FORMS[rest];
  // The remainder gets the same dominant-verb treatment the whole word would have got.
  // Without this, `n'est` peels to `est` and stops there because `est` is a headword —
  // the noun meaning "east". It is "is not", so it has to reach `être`.
  if (restMapped && FORM_DOMINANT_LEMMAS.has(restMapped)) return restMapped;
  if (dict.has(rest)) return rest;
  // The remainder may itself be inflected — j'ai → ai → avoir.
  return restMapped ?? applySuffixRules(rest, dict);
}

/**
 * Resolve `word` to its dictionary form, or undefined when it already IS one (or nothing
 * plausible was found). Callers treat undefined as "no base form" and omit RawTok's 4th
 * element, exactly as the other languages do.
 */
export function lemmatizeFr(word: string, dict: LemmaDict): string | undefined {
  const lower = word.trim().toLowerCase();
  if (!lower) return undefined;

  const mapped = FR_FORMS[lower];

  // A form of one of the very high-frequency verbs wins outright, even against a
  // homographic noun — see FORM_DOMINANT_LEMMAS.
  if (mapped && FORM_DOMINANT_LEMMAS.has(mapped) && !FORM_DOMINANT_EXCEPTIONS.has(lower)) {
    return mapped === lower ? undefined : mapped;
  }

  // Otherwise a surface that is a common word in its own right IS its own dictionary form,
  // even when Wiktionary also records it as an inflection: livre is "book" rather than a
  // form of livrer, porte is "door" rather than a form of porter.
  if (dict.isCommonWord(lower)) return undefined;

  // Wiktionary's own inflection data — where the irregulars come from.
  if (mapped && mapped !== lower) return mapped;

  const viaElision = stripElision(lower, dict);
  if (viaElision && viaElision !== lower) return viaElision;

  // Before the generic rules — see ligatureNounPlural for why the ordering matters here.
  const viaLigature = ligatureNounPlural(lower, dict);
  if (viaLigature) return viaLigature;

  const viaRules = applySuffixRules(lower, dict);
  if (viaRules && viaRules !== lower) return viaRules;

  // Last resort: the same word without its accents (ecrire → écrire won't hit, but a
  // de-accented paste like "etre" should still find its entry).
  const bare = deaccent(lower);
  if (bare !== lower && dict.has(bare)) return bare;

  return undefined;
}
