/**
 * Register filter for the graded vocabulary tables.
 *
 * Wiktionary tags every sense with its register, and a study list has no business
 * containing words that exist only as slang, only as profanity, only in a 17th-century
 * text, or only in one province. Those are the words the passage generator cannot use
 * naturally, because a natural sentence for them is not a natural sentence for a learner.
 *
 * This is deliberately NARROWER than the RESTRICTED_TAGS lists in the build scripts. Those
 * govern *ordering* — a restricted sense is kept but ranked below plain ones, which is why
 * `perro` leads with "dog" and not with its Chilean sense. This governs *membership*, and
 * membership is destructive, so it only names registers that genuinely disqualify a word:
 *
 *   slang · vulgar · obsolete · dialectal
 *
 * Notably absent: `colloquial` and `informal`. Everyday speech is exactly what a learner
 * needs, and Wiktionary tags a great deal of ordinary vocabulary that way. Also absent:
 * `historical` — "feudalism" is a current word for a past thing, not an obsolete word.
 *
 * ONLY-ness matters. A word is excluded when EVERY one of its senses is non-standard, never
 * when one of them is: `cabeza` keeps "head" and merely deprioritises its slang reading.
 * Use `isNonStandardSense` per sense, then `isExcludedHeadword` over the collected flags.
 *
 * The dictionary itself is NOT filtered by this — a learner who meets a slang word in the
 * wild still needs to be able to look it up, and the strict-dictionary policy depends on
 * lookups being comprehensive. Only the graded level/vocab tables are.
 */

/** Sense tags that disqualify a sense from counting toward graded vocabulary. */
const EXCLUDED_TAGS = new Set([
  // slang
  'slang',
  // vulgar / abusive
  'vulgar', 'obscene', 'offensive', 'derogatory', 'pejorative', 'ethnic-slur',
  'swear-word', 'coarse',
  // no longer current
  'obsolete', 'archaic', 'dated', 'anachronistic',
  // not the standard language
  'dialectal', 'dialect', 'regional', 'nonstandard', 'eye-dialect',
]);

/**
 * True when a Wiktionary sense is slang / vulgar / obsolete / dialectal.
 *
 * Checks `raw_tags` as well as `tags`: kaikki normalises most register labels into `tags`,
 * but leaves anything it does not recognise in `raw_tags`, and the spelling varies by
 * language edition. Comparison is case-insensitive for the same reason.
 *
 * @param {{ tags?: string[], raw_tags?: string[] }} sense
 */
export function isNonStandardSense(sense) {
  const tags = [...(sense?.tags ?? []), ...(sense?.raw_tags ?? [])];
  return tags.some(t => typeof t === 'string' && EXCLUDED_TAGS.has(t.toLowerCase()));
}

/**
 * True when a headword should be kept out of the graded tables: it has senses, and every
 * single one of them is non-standard.
 *
 * A word with no surviving senses at all is also excluded — it has nothing to teach.
 *
 * @param {Array<{ excluded: boolean }>} senses  the candidate senses collected for one headword
 */
export function isExcludedHeadword(senses) {
  if (!senses || senses.length === 0) return true;
  return senses.every(s => s.excluded);
}

/**
 * Parts of speech that are not vocabulary a learner studies: letter names, symbols,
 * bound affixes, romanizations. Wiktionary lists `p` and `n` as Spanish letters, and
 * without this they surface in the A1 band because encyclopedic text is full of
 * abbreviations. Numerals (`num`) are deliberately NOT here — `uno` is a word.
 *
 * Applied to band eligibility only, like the register filter: the dictionary keeps these
 * entries so a lookup on one still resolves.
 */
const NON_LEXICAL_POS = new Set([
  'letter', 'symbol', 'punct', 'character', 'abbrev', 'romanization', 'syllable',
  'prefix', 'suffix', 'infix', 'interfix', 'circumfix', 'combining_form',
]);

/** @param {string} pos */
export function isLexicalPos(pos) {
  return !NON_LEXICAL_POS.has(String(pos ?? '').toLowerCase());
}

/**
 * Glosses that describe the *string* rather than teach a word: letter names, abbreviation
 * expansions, misspellings. `n` reached Spanish A2 on the strength of "The fourteenth
 * letter of the Spanish alphabet" plus "abbreviation of norte", because encyclopedic text
 * is thick with abbreviations and both senses looked like ordinary definitions.
 *
 * Marked excluded rather than dropped, so a word only loses its place in the graded tables
 * when it has nothing else to say — `a` keeps the preposition and its letter sense both.
 *
 * @param {string} gloss  an already-cleaned gloss
 */
export function isMetalinguisticGloss(gloss) {
  return /^(?:the\s+)?(?:\w+\s+)?letter of the\b/i.test(gloss)
    || /^(?:abbreviation|initialism|acronym|misspelling|contraction|symbol|romanization|alternative spelling|alternative form|obsolete spelling) (?:of|for)\b/i.test(gloss);
}
