import { query, command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import type { DeckWord, LanguageCode, Theme } from '$lib/types';
import type { BlankProgress } from '$lib/tokens';
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
  clearDeckWords,
  savePrefs,
  type Prefs,
  DEFAULT_PREFS,
} from '$lib/server/data';
import { generatePassage as genPassage, type Word } from '$lib/server/generate';
import { getDefinition } from '$lib/server/definitions';
import { newCard, gradeWord, type FsrsGrade } from '$lib/srs';
import { isDueToday, localDateStr, dayOffset } from '$lib/deck';
import { levelFor } from '$lib/languageConfig';

// All page data + mutations as SvelteKit remote functions (replacing +page.server.ts load /
// actions). Each runs on the server via getRequestEvent().locals — which carries the
// cookie-backed Supabase client from hooks.server.ts. Deck/prefs/daily are separate queries so
// a mutation to one doesn't force the others to refetch; each mutation already computes the new
// value, so it calls `.set(...)` on its own query directly instead of `.refresh()`. Deck words
// live one-per-row in `deck_words` (see supabase-deck-words.sql), so add/remove are plain SQL
// insert/delete rather than a read-modify-write over a jsonb array.

const todayStr = () => localDateStr(new Date());
const dueWords = (deck: DeckWord[]): Word[] => deck.filter((w) => isDueToday(w)).map((w) => ({ h: w.h, p: w.p, m: w.m }));

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
  return loadPassage(supabase, user.id, lang, todayStr());
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
    if (passageId) await addPassageWord(supabase, user.id, passageId, h);
    getDeck(lang).refresh();
  },
);

export const removeWord = command('unchecked', async ({ id, lang }: { id: string; lang: LanguageCode }) => {
  const { user, supabase } = await ctx();
  await deleteWord(supabase, user.id, id);
  getDeck(lang).refresh();
});

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
  async ({ lang }: { lang: LanguageCode }): Promise<{ error?: string }> => {
    const { user, supabase } = await ctx();
    const [deck, prefs] = await Promise.all([loadDeck(supabase, user.id, lang), loadPrefs(supabase, user.id)]);
    try {
      const passage = await genPassage(dueWords(deck), lang, levelFor(lang, prefs), Math.floor(Math.random() * 12));
      const stored = await createPassage(supabase, user.id, lang, todayStr(), passage);
      getPassage(lang).set(stored);
      return {};
    } catch (e) {
      return { error: String(e).includes('no-api-key') ? 'no-api-key' : 'generation failed' };
    }
  },
);

// Persist one cloze blank's answer (read-merge-write on the sparse progress map). Fire-and-forget
// from the client — ReadTab already tracks answers optimistically in local state, so this only
// needs to make them durable across a reload, not stay live-synced to the query cache.
export const saveClozeProgress = command(
  'unchecked',
  async (
    { passageId, occId, correct, lang }: { passageId: string; occId: string; correct: boolean; lang: LanguageCode },
  ) => {
    const { user, supabase } = await ctx();
    const current = await loadPassage(supabase, user.id, lang, todayStr());
    if (!current || current.id !== passageId) return;
    const progress: BlankProgress = { ...current.progress, [occId]: correct ? 1 : 0 };
    await saveProgress(supabase, user.id, passageId, progress);
  },
);

export const saveTheme = command('unchecked', async ({ theme }: { theme: Theme }) => {
  const { user, supabase } = await ctx();
  const prefs = await loadPrefs(supabase, user.id);
  const next = { ...prefs, theme };
  await savePrefs(supabase, user.id, next);
  getPrefs().set(next);
});

export const saveLevel = command('unchecked', async ({ hskLevel }: { hskLevel: number }) => {
  const { user, supabase } = await ctx();
  const prefs = await loadPrefs(supabase, user.id);
  const next = { ...prefs, hskLevel };
  await savePrefs(supabase, user.id, next);
  getPrefs().set(next);
});

export const saveLanguage = command('unchecked', async ({ language }: { language: LanguageCode }) => {
  const { user, supabase } = await ctx();
  const prefs = await loadPrefs(supabase, user.id);
  const next = { ...prefs, language };
  await savePrefs(supabase, user.id, next);
  getPrefs().set(next);
});

export const saveBoundaries = command('unchecked', async ({ showWordBoundaries }: { showWordBoundaries: boolean }) => {
  const { user, supabase } = await ctx();
  const prefs = await loadPrefs(supabase, user.id);
  const next = { ...prefs, showWordBoundaries };
  await savePrefs(supabase, user.id, next);
  getPrefs().set(next);
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
