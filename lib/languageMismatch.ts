import type { LanguageCode } from './types';
import { getLanguageConfig, SUPPORTED_LANGUAGES } from './languageConfig';

/**
 * Is this text in a different language from the one being studied?
 *
 * WHY IT MATTERS. Every reader in the app — paste, clip, EPUB — hands its text to the
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

/** A language tag's primary subtag: two or three ASCII letters, before any region or script. */
const PRIMARY_SUBTAG = /^[a-z]{2,3}$/;

/**
 * The publisher's own `dc:language`, when there is one.
 *
 * Compared on the PRIMARY SUBTAG only: `es-419`, `es-MX` and `es` are one language for our
 * purposes, and a book tagged `en-GB` against a Spanish study session is the case worth
 * catching. Absent metadata returns false — a missing tag is not evidence.
 *
 * TWO THINGS THIS HAS TO GET RIGHT, both of which it once got wrong:
 *
 * `dc:language` IS OFTEN NOT A LANGUAGE TAG. The EPUB spec only *recommends* RFC 5646, and
 * real publishers write display names — a Chinese edition of Le Petit Prince declares
 * `简体中文`, others `Chinese` or `English (US)`. The old test was `tag.length >= 2 &&
 * tag !== study`, which reads as obviously correct and warned that a Chinese book was not
 * Chinese. So the shape is checked first: anything that is not a plausible primary subtag is
 * not evidence either way, and we fall through to the script check, which reads the prose
 * itself and stays correctly quiet.
 *
 * A LANGUAGE HAS MORE THAN ONE CODE. `zho`, `chi` and `cmn` are all Chinese; comparing
 * against the bare two-letter `LanguageCode` called every one of them a mismatch. The full
 * set lives on the language config, per CLAUDE.md's rule about where languages differ.
 */
export function declaredMismatch(declared: string | undefined, study: LanguageCode): boolean {
  const tag = (declared ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (!PRIMARY_SUBTAG.test(tag)) return false;
  return !getLanguageConfig(study).langTags.includes(tag);
}

/**
 * Which language we study, if `declared` names one of them — otherwise undefined.
 *
 * The same parse as above, read the other way round: `declaredMismatch` asks "does this
 * contradict what I am studying", this asks "does this identify a language I study at all".
 * A display name, a junk value, or a language the app does not teach all return undefined,
 * which callers must treat as "no idea" rather than as "not this one".
 */
export function languageFromTag(declared: string | undefined): LanguageCode | undefined {
  const tag = (declared ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (!PRIMARY_SUBTAG.test(tag)) return undefined;
  return SUPPORTED_LANGUAGES.find(c => c.langTags.includes(tag))?.code;
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
