import { query, command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import type { DeckWord, LanguageCode } from '$lib/types';
import type { BlankProgress, RawTok } from '$lib/tokens';
import {
  loadDeck,
  loadPrefs,
  loadPassage,
  createPassage,
  saveProgress,
  addPassageWord,
  insertWord,
  insertWords,
  deleteWord,
  updateWords,
  updateWordDefinition,
  updatePassageTokens,
  loadPoolWords,
  releasePoolWord,
  clearDeckWords,
  savePrefs,
  type Prefs,
  DEFAULT_PREFS,
} from '$lib/server/data';
import { generatePassage as genPassage, type Word } from '$lib/server/generate';
import { getDefinition } from '$lib/server/definitions';
import { newCard, gradeWord, type FsrsGrade } from '$lib/srs';
import { localDateStr, dayOffset } from '$lib/deck';
import { levelFor } from '$lib/languageConfig';

// All page data + mutations as SvelteKit remote functions (replacing +page.server.ts load /
// actions). Each runs on the server via getRequestEvent().locals — which carries the
// cookie-backed Supabase client from hooks.server.ts. Deck/prefs/daily are separate queries so
// a mutation to one doesn't force the others to refetch; each mutation already computes the new
// value, so it calls `.set(...)` on its own query directly instead of `.refresh()`. Deck words
// live one-per-row in `deck_words` (see supabase-deck-words.sql), so add/remove are plain SQL
// insert/delete rather than a read-modify-write over a jsonb array.

const todayStr = () => localDateStr(new Date());

/** The acting user + request-scoped Supabase client, or 401. */
async function ctx() {
  const { safeGetSession, supabase } = getRequestEvent().locals;
  const { user } = await safeGetSession();
  if (!user) error(401, 'not signed in');
  return { user, supabase };
}

const DEMO: Word[] = [
  { h: '经济', p: 'jīngjì', m: 'economy' },
  { h: '城市', p: 'chéngshì', m: 'city' },
  { h: '科技', p: 'kējì', m: 'technology; science and technology' },
  { h: '环境', p: 'huánjìng', m: 'environment' },
  { h: '健康', p: 'jiànkāng', m: 'health; healthy' },
];

// ── Queries ──────────────────────────────────────────────────────────────────

export const getDeck = query('unchecked', async (lang: LanguageCode) => {
  const { safeGetSession, supabase } = getRequestEvent().locals;
  const { user } = await safeGetSession();
  if (!user) return [] as DeckWord[];
  return loadDeck(supabase, user.id, lang);
});

export const getPrefs = query(async () => {
  const { safeGetSession, supabase } = getRequestEvent().locals;
  const { user } = await safeGetSession();
  if (!user) return DEFAULT_PREFS;
  return loadPrefs(supabase, user.id);
});

export const getPassage = query('unchecked', async (lang: LanguageCode) => {
  const { safeGetSession, supabase } = getRequestEvent().locals;
  const { user } = await safeGetSession();
  if (!user) return null;
  return loadPassage(supabase, user.id, lang);
});

// Loaded once alongside the deck (see +page.svelte) so ReadTab can recognize a pool word at
// click time synchronously — see loadPoolWords in server/data.ts for why this isn't just folded
// into getDeck.
export const getPoolWords = query('unchecked', async (lang: LanguageCode) => {
  const { safeGetSession, supabase } = getRequestEvent().locals;
  const { user } = await safeGetSession();
  if (!user) return [] as DeckWord[];
  return loadPoolWords(supabase, user.id, lang);
});

// ── Commands (each `.set()`s the query(ies) it affects with the value it just wrote) ──────────

// Look up a word's reading + meaning (centralized dictionary -> Supabase cache -> LLM). Used by
// VocabTab when manually adding a word not already resolved from a passage.
export const lookupWord = command('unchecked', async ({ word, lang }: { word: string; lang: LanguageCode }) => {
  return getDefinition(word, lang);
});


export const addWord = command(
  'unchecked',
  async (
    { h, p, m, lang, dueInDays = 0, passageId }:
      { h: string; p: string; m: string; lang: LanguageCode; dueInDays?: number; passageId?: string },
  ) => {
    const { user, supabase } = await ctx();
    await insertWord(supabase, user.id, newCard({ h, p, m, due: dayOffset(dueInDays) }), lang);
    if (passageId) {
      await addPassageWord(supabase, user.id, passageId, h);
      getPassage(lang).refresh();
    }
    getDeck(lang).refresh();
  },
);

// Release a pool word into circulation: due starting now, like any other freshly-added word —
// `loadDeck`'s pool exclusion means it'll show up in the active deck as soon as this lands.
export const releaseFromPool = command('unchecked', async ({ id, lang }: { id: string; lang: LanguageCode }) => {
  const { user, supabase } = await ctx();
  await releasePoolWord(supabase, user.id, id, dayOffset(0));
  getDeck(lang).refresh();
  getPoolWords(lang).refresh();
});

export const removeWord = command('unchecked', async ({ id, lang }: { id: string; lang: LanguageCode }) => {
  const { user, supabase } = await ctx();
  await deleteWord(supabase, user.id, id);
  getDeck(lang).refresh();
});

// User-edited reading/meaning for a word already in the deck — from WordPopup (clicking a word
// in a passage that's already in the deck) or VocabTab (clicking a row directly). `h` (the word's
// text) is needed to also patch the user's current passage, if it's in there — see updatePassageTokens.
export const editWordDefinition = command(
  'unchecked',
  async ({ id, h, p, m, lang }: { id: string; h: string; p: string; m: string; lang: LanguageCode }) => {
    // A word with no meaning falls out of the 'vocab' token type (see rawToToken in tokens.ts),
    // which silently breaks cloze-blank detection for every occurrence of it in a passage.
    if (!m.trim()) error(400, 'Meaning cannot be empty.');
    const { user, supabase } = await ctx();
    await updateWordDefinition(supabase, user.id, id, p, m);
    const deck = await loadDeck(supabase, user.id, lang);
    getDeck(lang).set(deck.map((w) => (w.id === id ? { ...w, p, m } : w)));

    const current = await loadPassage(supabase, user.id, lang);
    if (!current) return;
    const patch = (toks: RawTok[]) => toks.map((t): RawTok => (t.text === h ? { text: h, reading: p, meaning: m } : t));
    const appears = current.passage.title.some((t) => t.text === h) || current.passage.body.some((t) => t.text === h);
    if (!appears) return;
    const passage = { title: patch(current.passage.title), body: patch(current.passage.body) };
    await updatePassageTokens(supabase, user.id, current.id, { ...passage, quizWords: current.quizWords });
    getPassage(lang).set({ ...current, passage });
  },
);

// Grade cloze blanks. `grades` maps hanzi → worst rating (computed client-side).
export const gradeCloze = command(
  'unchecked',
  async ({ grades, lang }: { grades: Record<string, FsrsGrade>; lang: LanguageCode }) => {
    const { user, supabase } = await ctx();
    const deck = await loadDeck(supabase, user.id, lang);
    const graded = deck.filter((w) => grades[w.h]).map((w) => gradeWord(w, grades[w.h]));
    await updateWords(supabase, user.id, graded);
    getDeck(lang).set(deck.map((w) => graded.find((g) => g.id === w.id) ?? w));
  },
);

export const generatePassage = command(
  'unchecked',
  // `words` (the words to build the passage around) is computed client-side from ReadTab's
  // already-loaded deck — no need to refetch it here just to re-derive what's due.
  async ({ lang, words }: { lang: LanguageCode; words: Word[] }): Promise<{ error?: string }> => {
    const { user, supabase } = await ctx();
    const prefs = await loadPrefs(supabase, user.id);
    try {
      const passage = await genPassage(words, lang, levelFor(lang, prefs), Math.floor(Math.random() * 1000));
      const stored = await createPassage(supabase, user.id, lang, todayStr(), passage, words.map((w) => w.h));
      getPassage(lang).set(stored);
      return {};
    } catch (e) {
      return { error: String(e).includes('no-api-key') ? 'no-api-key' : 'generation failed' };
    }
  },
);

// Persist one cloze blank's answer (read-merge-write on the sparse progress map), and update the
// query cache to match. ReadTab tracks answers optimistically in its own local state too, but
// that state doesn't survive a remount — switching tabs and back destroys/recreates ReadTab (see
// +page.svelte's {#if tab === 'read'}), at which point it rebuilds clozeAnswers from
// storedPassage.progress. If this command only wrote the DB, that rebuild would read whatever
// progress was cached before this session's answers — i.e. stale/empty — and blanks would
// appear to revert until a full reload re-fetched the real state.
export const saveClozeProgress = command(
  'unchecked',
  async (
    { passageId, occId, correct, lang }: { passageId: string; occId: string; correct: boolean; lang: LanguageCode },
  ) => {
    const { user, supabase } = await ctx();
    const current = await loadPassage(supabase, user.id, lang);
    if (!current || current.id !== passageId) return;
    const progress: BlankProgress = { ...current.progress, [occId]: correct ? 1 : 0 };
    await saveProgress(supabase, user.id, passageId, progress);
    getPassage(lang).set({ ...current, progress });
  },
);

// Every prefs mutation (theme, level, language, boundaries, words-per-passage) is this same
// shape — persist the full next Prefs object and push it straight into the cache. The caller
// already has the current prefs (it's a query result they hold), so it computes `next` itself
// (`{ ...prefs, theme: t }` etc.) rather than this command re-reading the row from the DB just
// to merge in one changed field.
export const updatePrefs = command('unchecked', async ({ prefs }: { prefs: Prefs }) => {
  const { user, supabase } = await ctx();
  await savePrefs(supabase, user.id, prefs);
  getPrefs().set(prefs);
});

// Dev convenience: seed a few demo words due today. DEMO is Chinese, so always tagged 'zh'
// regardless of the currently selected study language.
export const seedDemo = command(async () => {
  const { user, supabase } = await ctx();
  await insertWords(supabase, user.id, DEMO.map((w) => newCard(w)), 'zh');
  getDeck('zh').refresh();
});

export const clearDeck = command('unchecked', async ({ lang }: { lang: LanguageCode }) => {
  const { user, supabase } = await ctx();
  await clearDeckWords(supabase, user.id, lang);
  getDeck(lang).set([]);
});
