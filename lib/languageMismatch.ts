import type { LanguageCode } from './types';
import { getLanguageConfig } from './languageConfig';

/**
 * Is this text in a different language from the one being studied?
 *
 * WHY IT MATTERS. Every reader in the app — paste, EPUB, lyrics — hands its text to the
 * segmenter for the ACTIVE STUDY LANGUAGE, because that is the only one whose dictionary and
 * lemmatizer are loaded. Give the Chinese segmenter Spanish prose and it does not fail; it
 * shreds `camarón` into `camar`, `ó`, `n`, because its word rule only knows Han and ASCII.
 * The result is a page of fragments with no error anywhere, and nothing on screen to suggest
 * the cause is the language selector.
 *
 * WARN, NEVER BLOCK. A learner may well want to read a bilingual text, a song with an English
 * chorus, or a book whose metadata is simply wrong — all real, none our business to refuse.
 */

/** Han, kana, and Hangul — the ranges that decide "CJK or not". */
const HAN = /[㐀-鿿豈-﫿]/;
const KANA = /[぀-ヿ]/;
const LATIN = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

/**
 * The publisher's own `dc:language`, when there is one.
 *
 * Compared on the PRIMARY SUBTAG only: `es-419`, `es-MX` and `es` are one language for our
 * purposes, and a book tagged `en-GB` against a Spanish study session is the case worth
 * catching. Absent or unparseable metadata returns false — a missing tag is not evidence.
 */
export function declaredMismatch(declared: string | undefined, study: LanguageCode): boolean {
  const tag = (declared ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return tag.length >= 2 && tag !== study;
}

/**
 * Does the SCRIPT of this text contradict the study language?
 *
 * Deliberately conservative: it fires only on the two unambiguous cases, because a false
 * warning on every proper noun would train the reader to ignore it.
 *
 *   - studying a Latin-script language and the text is mostly CJK
 *   - studying Chinese or Japanese and the text is mostly Latin
 *
 * Plus one asymmetric case that IS safe: kana in a Chinese session means Japanese, since
 * Chinese never uses it. The reverse — Han with no kana under Japanese — is NOT flagged,
 * because kanji-only Japanese is real.
 */
export function scriptMismatch(text: string, study: LanguageCode): boolean {
  const sample = text.slice(0, 4000);
  let han = 0, kana = 0, latin = 0;
  for (const ch of sample) {
    if (KANA.test(ch)) kana++;
    else if (HAN.test(ch)) han++;
    else if (LATIN.test(ch)) latin++;
  }
  const total = han + kana + latin;
  if (total < 20) return false;          // too little to judge

  const cjk = han + kana;
  const { scriptIsUnspaced } = getLanguageConfig(study);

  if (!scriptIsUnspaced) return cjk / total > 0.5;      // es/fr reading CJK
  if (latin / total > 0.7) return true;                 // zh/ja reading Latin
  if (study === 'zh' && kana / total > 0.05) return true;  // kana is never Chinese
  return false;
}

/** One sentence for the UI, or null when nothing looks wrong. */
export function mismatchWarning(
  study: LanguageCode,
  opts: { declared?: string; text?: string },
): string | null {
  const name = getLanguageConfig(study).name;
  if (opts.declared && declaredMismatch(opts.declared, study)) {
    return `This says it is in “${opts.declared}”, but you are studying ${name} — words will be looked up as ${name}.`;
  }
  if (opts.text && scriptMismatch(opts.text, study)) {
    return `This does not look like ${name}. Words will still be looked up as ${name}, so they may come out wrong — switch language above if that is not what you want.`;
  }
  return null;
}
