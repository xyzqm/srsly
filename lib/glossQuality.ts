/**
 * Judgements about a gloss that the RUNTIME needs, mirroring scripts/lib/registerFilter.mjs.
 *
 * The build scripts are .mjs and cannot be imported from the app bundle, so this is a second
 * copy of one predicate. scripts/lib/registerFilter.mjs is the original; a shared case table
 * is asserted against both, so the two cannot drift apart silently.
 */

/**
 * A gloss that describes the STRING rather than teaching a word: letter names, abbreviation
 * expansions, alternative spellings.
 *
 * Kept identical to isMetalinguisticGloss in scripts/lib/registerFilter.mjs. Note what is
 * deliberately absent: "apocopic form of" and "clipping of" look metalinguistic and are
 * traps — Spanish apocope produces `muy`, `su`, `tu`, `gran`, and clipping produces `foto`,
 * `cine`. Treating those as noise deletes core vocabulary.
 */
export function isMetalinguisticGloss(gloss: string): boolean {
  return /^(?:the\s+)?(?:[\w-]+\s+)?letter of the\b/i.test(gloss)
    // "A with grave accent", "a letter in the French alphabet, after x and before z" —
    // descriptions of the CHARACTER. No real word is ever defined this way.
    || /^.{1,2} with (?:grave|acute|circumflex|tilde|cedilla|diaeresis|macron|breve|caron|ring)\b/i.test(gloss)
    || /^an? letter (?:in|of) the\b/i.test(gloss)
    // Orphans left by an older build that split "…alphabet, written in the Latin script."
    // at the comma: the tail is not a definition of anything on its own.
    || /\bwritten in the .{0,16}\bscript\b/i.test(gloss)
    || /\bname of the .{0,24}\bletter\b/i.test(gloss)
    || /^(?:abbreviation|initialism|acronym|misspelling|contraction|symbol|romanization|alternative spelling|alternative form|obsolete spelling) (?:of|for)\b/i.test(gloss)
    || /^only used in\b/i.test(gloss);
}

/**
 * A proper noun the passage generator labelled for the reader.
 *
 * app/api/daily-content/route.ts asks the model to gloss names as "(name) María" so a
 * learner meeting one in a passage can see it is a person and move on. That is right for
 * READING and wrong for a deck: a character's name is not vocabulary, it will not recur,
 * and it cannot be studied. The marker is the generator's own and unambiguous, so it is
 * safe to key on.
 */
export function isProperNounGloss(gloss: string): boolean {
  return /^\s*\((?:name|proper noun)\)/i.test(gloss.trim());
}

/**
 * A gloss whose EVERY sense only names a person or place, so it defines nothing.
 *
 * CC-CEDICT lists a surname as its own entry, and for a handful of characters that entry sorts
 * ahead of the real one — capitalised surname pinyin (`Mǎ`) before the lowercase reading (`mǎ`).
 * `scripts/build-cedict.mjs` now prefers the real definition when it builds the dictionary, but
 * `lib/data/hsk-vocab.ts` is checked-in data with no generator and still carries seven of these:
 * 马 as "surname Ma" rather than "horse", 能 as "surname Neng" rather than "can".
 *
 * Since the HSK table is consulted BEFORE CC-CEDICT, those seven would shadow the fix. Treating
 * a name-only gloss as no gloss lets the dictionary answer instead, and it is the right rule
 * regardless: a surname is not what a learner tapping 马 in a sentence about horses wants.
 */
const NAME_ONLY_SENSE =
  /^\s*(?:a\s+)?(?:surname|given name|patronymic|male name|female name)\b/i;

export function isNameOnlyGloss(gloss: string): boolean {
  const senses = String(gloss || '').split(/[;/]/).map(s => s.trim()).filter(Boolean);
  return senses.length > 0 && senses.every(s => NAME_ONLY_SENSE.test(s));
}
