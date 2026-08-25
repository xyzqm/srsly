/**
 * What a Japanese verb or adjective is DOING in the sentence in front of you.
 *
 * ── WHY THIS IS NOT A TABLE ──
 * French and Spanish each get a generated lookup table: a finite list of inflected forms, each
 * mapped to the slot it fills. Japanese cannot work that way, and the reason is not effort — it
 * is that Japanese morphology is PRODUCTIVE. Endings stack:
 *
 *   食べる → 食べさせる → 食べさせられる → 食べさせられたい → 食べさせられたくなかった
 *
 * There is no finite set of forms to enumerate, so any table is incomplete by construction and
 * fails silently on exactly the long forms a reader most needs help with.
 *
 * What Japanese has instead is an analyzer. kuromoji already runs at segmentation time and
 * already walks the auxiliary chain to fuse morphemes into one token (see
 * lib/server/kuromojiSegmenter.ts), so the chain costs nothing extra to collect: 読みました is
 * 読む + ます + た. This module reads that chain and composes a description.
 *
 * ── THE CHAIN TRAVELS ON THE TOKEN, AND THAT IS DELIBERATE ──
 * CLAUDE.md says grammar is NOT attached to tokens server-side. That rule was written about
 * French, where a 2.70 MB table exists and can be lazily fetched, so shipping per-token data
 * would be paying twice for something almost never looked at. Neither half holds here: there is
 * no table to fetch, and kuromoji cannot run in a browser. The chain is a handful of bytes on
 * the minority of tokens that are conjugated, and it is the only way the client can know.
 *
 * Raw auxiliaries travel; English is produced HERE, at render — the same split as the other two
 * languages, so rewording costs no regeneration.
 */

/** One auxiliary → what it contributes. Order of the chain is preserved in the output. */
const AUXILIARIES: Record<string, string> = {
  ます: 'polite',
  です: 'polite',
  た: 'past',
  ない: 'negative',
  ぬ: 'negative',
  ん: 'negative',
  たい: 'want to',
  たがる: 'seems to want to',
  せる: 'causative',
  させる: 'causative',
  そう: 'seems',
  らしい: 'apparently',
  よう: 'seems like',
  まい: 'will not',
  べし: 'should',
  ごとし: 'like, as if',
};

/**
 * `れる`/`られる` is three things at once — passive, potential and honorific — and the ending
 * alone cannot tell them apart. Saying "passive" would be a coin flip presented as a fact, so
 * the ambiguity is stated. Same discipline as `hablaba` declining to name a person.
 */
const AMBIGUOUS: Record<string, string> = {
  れる: 'passive or potential',
  られる: 'passive or potential',
};

/**
 * Helper verbs that follow the て-form and change what the whole thing means. These are the
 * constructions the て-form exists for, and reading them as "te-form, then a separate verb
 * meaning to put" is how a beginner mis-parses a sentence.
 */
const TE_HELPERS: Record<string, string> = {
  いる: 'ongoing',
  ある: 'left in a state',
  おく: 'done in advance',
  しまう: 'done completely',
  みる: 'try doing',
  くる: 'coming to be',
  いく: 'going on to be',
  くれる: 'done for me',
  くださる: 'please — a request',
  ください: 'please — a request',
  もらう: 'received as a favour',
  いただく: 'received as a favour (humble)',
  あげる: 'done for someone',
};

/** The chain as it travels on the token: basic forms joined by `|`. */
export function encodeChain(basicForms: string[]): string {
  return basicForms.join('|');
}

/**
 * `ます|た` → `polite · past`. `て|いる|ます` → `ongoing · polite`.
 *
 * Returns null when nothing in the chain is recognised, rather than inventing a description.
 * An unrecognised auxiliary is exactly the case where a guess would be unverifiable for the
 * beginner most likely to be looking.
 */
export function describeChain(chain: string): string | null {
  const links = chain.split('|').map(s => s.trim()).filter(Boolean);
  if (!links.length) return null;

  const parts: string[] = [];
  let sawTe = false;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];

    // て is not a feature on its own — it is the join that the NEXT auxiliary attaches to.
    if (link === 'て' || link === 'で') {
      sawTe = true;
      continue;
    }

    // Only after て does いる mean "ongoing"; elsewhere it is an ordinary verb.
    if (sawTe && TE_HELPERS[link]) {
      parts.push(TE_HELPERS[link]);
      sawTe = false;
      continue;
    }

    const feature = AUXILIARIES[link] ?? AMBIGUOUS[link];
    if (feature) parts.push(feature);
  }

  // A bare て with nothing attached is the connective form, and worth naming: it is how clauses
  // are joined and how a request is made, and it is the first thing a reader meets that is not
  // a sentence ending.
  if (sawTe && !parts.length) return 'te-form — joins clauses, or asks';
  if (sawTe) parts.push('te-form');

  if (!parts.length) return null;

  // Deduplicate while keeping order: 〜ていました stacks いる and ます with nothing repeated,
  // but a doubled auxiliary would otherwise print twice.
  return [...new Set(parts)].join(' · ');
}

/**
 * The grammatical words JLPT vocabulary lists do not grade.
 *
 * Particles are grammar, not vocabulary, so no level table contains them — which made every one
 * of them read as "above your level" and filled a beginner text's list of hardest words with
 * を, に and は. They are not hard; they are simply not the kind of thing a vocabulary band
 * measures, so `lib/readability.ts` excludes them the way it excludes proper nouns.
 *
 * Deliberately the same closed set the segmenter glosses (PARTICLE_GLOSS in
 * lib/server/kuromojiSegmenter.ts). Kept here because that module is server-only.
 */
export const JA_GRAMMAR_WORDS = new Set([
  'は', 'が', 'を', 'に', 'へ', 'で', 'と', 'の', 'も', 'や', 'か', 'から', 'まで', 'より',
  'ね', 'よ', 'な', 'ば', 'ので', 'のに', 'けど', 'しか', 'だけ', 'ずつ', 'ながら', 'たり',
  'です', 'だ', 'ます', 'ない', 'た', 'て', 'で',
]);
