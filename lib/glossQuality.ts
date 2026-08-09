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
 * Whether a stored card gloss looks like one WE shipped rather than one the learner wrote.
 *
 * Every sense of the card must appear somewhere in the dictionary's own text. An older
 * build split senses differently — `y` was stored as "…alphabet; and; plus; and" where the
 * dictionary now says "and; …alphabet; plus, and" — so comparing sense SETS declares them
 * unrelated and leaves the card broken forever. Containment survives that reshaping while
 * still rejecting anything typed by hand.
 */
export function isDictionaryDerived(stored: string, dictionary: string): boolean {
  const hay = dictionary.toLowerCase();
  return stored
    .split(';')
    .map(s => s.trim().toLowerCase().replace(/[.]$/, ''))
    .filter(Boolean)
    .every(s => hay.includes(s));
}
