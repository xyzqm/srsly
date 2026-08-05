/**
 * Keeps proper nouns out of the generated dictionaries.
 *
 * Wiktionary carries an enormous number of names — people, places, brands — and without
 * filtering they become flashcards. "Michael" and "John" are not vocabulary a learner is
 * trying to acquire, and under the strict dictionary policy they also make those strings
 * importable as if they were ordinary words.
 *
 * Two passes, because the data marks names two different ways:
 *   1. `pos` — kaikki tags proper nouns as "name". Those entries are skipped outright.
 *   2. the gloss — plenty of ordinary-POS entries have senses that only describe a name
 *      ("a surname", "a female given name", "a commune in France"). Those SENSES are
 *      dropped; if a headword has nothing left, it never gets emitted.
 *
 * The second pass matters because it is per-sense, not per-word: `mercado` is both "market"
 * and "a locative surname", and must keep the first. Only a headword whose senses are ALL
 * name senses disappears.
 *
 * This mirrors NAME_SENSE_RE in the server segmenters, which make the same distinction at
 * runtime when deciding whether a surface may be lemmatised.
 */

/** Parts of speech that are never vocabulary. */
const NAME_POS = new Set(['name', 'prop', 'proper noun']);

/**
 * A gloss that only describes a proper noun. Deliberately anchored: "a surname" matches,
 * but "market; a locative surname" is handled per-sense so the market sense survives.
 */
const NAME_SENSE_RE =
  /\b(surname|given name|patronymic|male name|female name)\b|^an? [a-zà-ÿ' ]*\b(city|town|village|commune|municipality|province|county|district|department|region|state|river|island|mountain|lake|dynasty|parish|hamlet|prefecture)\b/i;

/** True when this entry's part of speech marks it as a proper noun. */
export function isNamePos(pos) {
  return NAME_POS.has(String(pos || '').toLowerCase());
}

/** True when this single sense only describes a name/place. */
export function isNameSense(gloss) {
  return NAME_SENSE_RE.test(String(gloss || '').trim());
}
