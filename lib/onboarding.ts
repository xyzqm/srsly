import type { LanguageCode, UserPrefs } from './types';
import { getLanguageConfig, levelNumbers, SUPPORTED_LANGUAGES } from './languageConfig';
import { levelAfter } from './unlock';
import { storage } from './storage';

/**
 * Which languages the learner is actually studying.
 *
 * The app used to present all four at once. That is a worse default than it looks: it makes
 * "what am I studying?" unanswerable, it puts three languages' worth of empty progress in
 * front of someone learning one, and it gives the placement test nowhere natural to happen,
 * so a level could never be established before the first passage was generated.
 *
 * A language is now added deliberately, and adding one places you in it.
 */

/** The easiest level, whichever direction the curriculum numbers run. */
export function easiestLevel(lang: LanguageCode): number {
  return getLanguageConfig(lang).levels[0].level;
}

/**
 * The languages on this account, migrating installs that predate the list.
 *
 * `prefs.languages` absent means the learner started before onboarding existed, and wiping
 * them back to a blank slate would hide decks they have been building for weeks. So the
 * list is derived: whatever they had selected, plus every language that already has cards.
 * Returns [] only for a genuinely new install, which is the one case that should onboard.
 */
export async function resolveLanguages(prefs: UserPrefs): Promise<LanguageCode[]> {
  if (prefs.languages) return prefs.languages;

  const withDecks = await Promise.all(
    SUPPORTED_LANGUAGES.map(async cfg => {
      const deck = await storage.getVocabDeck(cfg.code);
      return deck.length > 0 ? cfg.code : null;
    }),
  );
  const derived = withDecks.filter((c): c is LanguageCode => c !== null);
  if (prefs.language && !derived.includes(prefs.language)) derived.unshift(prefs.language);
  return derived;
}

/**
 * Record a newly added language and where the placement test put the learner.
 *
 * `passedThrough` is the HARDEST LEVEL WHOSE TEST THEY PASSED, so the level they start at is
 * the one ABOVE it — passing A1 means A1 is behind you, not ahead. 0 means they passed
 * nothing, from failing the first block or skipping immediately, and they start at the
 * easiest level with nothing recorded as tested.
 */
export async function addLanguage(lang: LanguageCode, passedThrough: number): Promise<UserPrefs> {
  const prefs = await storage.getPrefs();
  const existing = await resolveLanguages(prefs);
  const cfg = getLanguageConfig(lang);
  const level = passedThrough > 0
    ? (levelAfter(levelNumbers(lang), passedThrough) ?? easiestLevel(lang))
    : easiestLevel(lang);

  const next: UserPrefs = {
    ...prefs,
    languages: existing.includes(lang) ? existing : [...existing, lang],
    language: lang,
    [cfg.levelPrefKey]: level,
    placementSeen: { ...prefs.placementSeen, [lang]: true },
    ...(passedThrough > 0 && {
      testedLevels: { ...prefs.testedLevels, [lang]: passedThrough },
    }),
  };
  await storage.savePrefs(next);
  return next;
}

/**
 * Stop studying a language. The DECK IS KEPT — this is "hide it from the picker", not
 * "throw away three months of cards" — so re-adding it later finds everything intact.
 * That is also why the resolved list must be persisted: the deck-derived migration would
 * otherwise put a removed language straight back on the next load.
 */
export async function removeLanguage(lang: LanguageCode): Promise<UserPrefs> {
  const prefs = await storage.getPrefs();
  const remaining = (await resolveLanguages(prefs)).filter(l => l !== lang);
  const next: UserPrefs = {
    ...prefs,
    languages: remaining,
    // Re-adding should re-place the learner rather than silently reusing an old verdict.
    placementSeen: { ...prefs.placementSeen, [lang]: undefined },
    language: prefs.language === lang ? remaining[0] : prefs.language,
  };
  await storage.savePrefs(next);
  return next;
}

/** Languages not yet added — what the "add a language" picker offers. */
export function availableToAdd(added: LanguageCode[]): typeof SUPPORTED_LANGUAGES {
  return SUPPORTED_LANGUAGES.filter(cfg => !added.includes(cfg.code));
}
