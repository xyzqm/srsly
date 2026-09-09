import { readPrefsBlob, writePrefsField } from './syncedPrefs';
import { FINITE_TENSES, type Tense } from './conjugation';
import type { LanguageCode } from './types';

/**
 * Which tenses the conjugation drill asks about.
 *
 * ── ABSENT MEANS ALL, AND SO DOES EMPTY ──
 * A learner who has never opened the picker gets everything, which is the only sensible
 * default. A learner who has unticked all nine ALSO gets everything, because a filter that
 * silences the whole drill is a broken screen rather than a preference — and unticking the
 * last one is far more likely to be a fumble than an intent. `filterByTenses` treats the two
 * cases identically for exactly this reason.
 *
 * Stored as a list rather than nine booleans so an added tense does not need a migration, and
 * synced like every other preference — this is a choice about study, not a fact about the
 * device, so it belongs on the account. (Contrast `srsly-tts-voice`, which is device-local
 * precisely because an installed voice is a fact about the machine.)
 */
const FIELD = 'conjugationTenses';

const ALL: readonly Tense[] = [...FINITE_TENSES, 'gerund', 'participle', 'passecompose'];

/**
 * The tenses this language can actually be asked about.
 *
 * Offered per language rather than as one list, because a picker that lists something the
 * drill will never ask is a control with no effect — and the passé composé is composed only
 * for French, while Spanish's preterite is a simple form it already has. The STORED value is
 * still validated against the full set, so switching language cannot corrupt a saved choice.
 */
export function allTenses(lang: LanguageCode = 'es'): Tense[] {
  return ALL.filter(t => (t === 'passecompose' ? lang === 'fr' : true));
}

export function getConjugationTenses(): Tense[] {
  const raw = readPrefsBlob()[FIELD];
  if (!Array.isArray(raw)) return [];
  const on = raw.filter((t): t is Tense => (ALL as readonly string[]).includes(t as string));
  return on;
}

export function setConjugationTenses(tenses: readonly Tense[]): void {
  // Storing "all of them" as an explicit list would be indistinguishable from a stale copy the
  // next time a tense is added, so a full selection is stored as no selection at all.
  const complete = ALL.every(t => tenses.includes(t));
  writePrefsField(FIELD, complete || tenses.length === 0 ? undefined : [...tenses]);
}
