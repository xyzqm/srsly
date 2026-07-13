import { query, command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import type { DeckWord, Theme } from '$lib/types';
import { loadUserData, saveDeck, savePrefs, saveDaily } from '$lib/server/data';
import { generatePassage as genPassage, type Word } from '$lib/server/generate';
import { newCard, gradeWord, type FsrsGrade } from '$lib/srs';
import { isDueToday, localDateStr, dayOffset } from '$lib/deck';

// All page data + mutations as SvelteKit remote functions (replacing +page.server.ts load /
// actions). Each runs on the server via getRequestEvent().locals — which carries the
// cookie-backed Supabase client from hooks.server.ts. Mutations refresh getData() server-side
// (single-flight), so callers just `await addWord(...)` and the query updates.

const identity = (w: { h: string; m: string }) => `${w.h}${w.m.trim()}`;
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

// ── Query ────────────────────────────────────────────────────────────────────

export const getData = query(async () => {
  const { safeGetSession, supabase } = getRequestEvent().locals;
  const { user } = await safeGetSession();
  if (!user) return { deck: [] as DeckWord[], prefs: { theme: 'paper' as Theme, hskLevel: 3 }, daily: null };
  return loadUserData(supabase, user.id);
});

// ── Commands (each refreshes getData server-side, single-flight) ──────────────

export const addWord = command(
  'unchecked',
  async ({ h, p, m, dueInDays = 0 }: { h: string; p: string; m: string; dueInDays?: number }) => {
    const { user, supabase } = await ctx();
    const { deck } = await loadUserData(supabase, user.id);
    if (!deck.some((w) => identity(w) === identity({ h, m }))) {
      await saveDeck(supabase, user.id, [newCard({ h, p, m, due: dayOffset(dueInDays) }), ...deck]);
    }
    await getData().refresh();
  },
);

export const removeWord = command('unchecked', async ({ id }: { id: string }) => {
  const { user, supabase } = await ctx();
  const { deck } = await loadUserData(supabase, user.id);
  await saveDeck(supabase, user.id, deck.filter((w) => w.id !== id));
  await getData().refresh();
});

// Grade cloze blanks. `grades` maps hanzi → worst rating (computed client-side).
export const gradeCloze = command('unchecked', async ({ grades }: { grades: Record<string, FsrsGrade> }) => {
  const { user, supabase } = await ctx();
  const { deck } = await loadUserData(supabase, user.id);
  await saveDeck(supabase, user.id, deck.map((w) => (grades[w.h] ? gradeWord(w, grades[w.h]) : w)));
  await getData().refresh();
});

export const generatePassage = command(async (): Promise<{ error?: string }> => {
  const { user, supabase } = await ctx();
  const { deck, prefs } = await loadUserData(supabase, user.id);
  try {
    const passages = await genPassage(dueWords(deck), prefs.hskLevel, Math.floor(Math.random() * 12));
    if (!passages.length) return { error: 'generation failed' };
    await saveDaily(supabase, user.id, { date: todayStr(), passages });
    await getData().refresh();
    return {};
  } catch (e) {
    return { error: String(e).includes('no-api-key') ? 'no-api-key' : 'generation failed' };
  }
});

export const saveTheme = command('unchecked', async ({ theme }: { theme: Theme }) => {
  const { user, supabase } = await ctx();
  const { prefs } = await loadUserData(supabase, user.id);
  await savePrefs(supabase, user.id, { ...prefs, theme });
  await getData().refresh();
});

export const saveLevel = command('unchecked', async ({ hskLevel }: { hskLevel: number }) => {
  const { user, supabase } = await ctx();
  const { prefs } = await loadUserData(supabase, user.id);
  await savePrefs(supabase, user.id, { ...prefs, hskLevel });
  await getData().refresh();
});

// Dev convenience: seed a few demo words due today.
export const seedDemo = command(async () => {
  const { user, supabase } = await ctx();
  const { deck } = await loadUserData(supabase, user.id);
  const have = new Set(deck.map(identity));
  const added = DEMO.filter((w) => !have.has(identity(w))).map((w) => newCard(w));
  await saveDeck(supabase, user.id, [...added, ...deck]);
  await getData().refresh();
});

export const clearDeck = command(async () => {
  const { user, supabase } = await ctx();
  await saveDeck(supabase, user.id, []);
  await getData().refresh();
});
