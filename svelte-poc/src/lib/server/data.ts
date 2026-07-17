import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckWord, LanguageCode, Theme } from '../types';
import type { StoredPassage, BlankProgress, RawPassage } from '../tokens';
import { reviveCard } from '../srs';

// PoC storage: `deck_words` and `passages` each hold one row per item (see
// supabase-deck-words.sql / supabase-passages.sql) so add/remove/progress updates are plain SQL
// rather than a read-modify-write over a jsonb array. `poc_user_data` holds prefs as one row per
// user, one column per setting (see supabase-flatten-prefs.sql) — direct column reads/writes,
// not a jsonb blob.

const PREFS_TABLE = 'poc_user_data';
const DECK_TABLE = 'deck_words';
const PASSAGES_TABLE = 'passages';

export interface Prefs {
  theme: Theme;
  hskLevel: number;
  showWordBoundaries: boolean;
  language: LanguageCode;
  wordsPerPassage: number;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'paper',
  hskLevel: 3,
  showWordBoundaries: true,
  language: 'zh',
  wordsPerPassage: 8,
};

interface PrefsRow {
  theme: Theme;
  hsk_level: number;
  show_word_boundaries: boolean;
  language: LanguageCode;
  words_per_passage: number;
}

const fromPrefsRow = (r: PrefsRow): Prefs => ({
  theme: r.theme,
  hskLevel: r.hsk_level,
  showWordBoundaries: r.show_word_boundaries,
  language: r.language,
  wordsPerPassage: r.words_per_passage,
});

const toPrefsRow = (p: Prefs): PrefsRow => ({
  theme: p.theme,
  hsk_level: p.hskLevel,
  show_word_boundaries: p.showWordBoundaries,
  language: p.language,
  words_per_passage: p.wordsPerPassage,
});

export async function loadPrefs(sb: SupabaseClient, userId: string): Promise<Prefs> {
  const { data } = await sb
    .from(PREFS_TABLE)
    .select('theme, hsk_level, show_word_boundaries, language, words_per_passage')
    .eq('user_id', userId)
    .maybeSingle();
  return data ? fromPrefsRow(data as PrefsRow) : DEFAULT_PREFS;
}

export async function savePrefs(sb: SupabaseClient, userId: string, prefs: Prefs): Promise<void> {
  await sb
    .from(PREFS_TABLE)
    .upsert(
      { user_id: userId, ...toPrefsRow(prefs), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

// ── passages ─────────────────────────────────────────────────────────────────

// `quizWords` rides inside the `passage` jsonb column (alongside title/body) rather than as its
// own DB column — no migration needed, and it's only ever read/written together with the passage.
interface PassageRow {
  id: string;
  date: string;
  passage: RawPassage & { quizWords?: string[] };
  progress: BlankProgress;
  added_words: string[];
}

const fromRow = (r: PassageRow): StoredPassage => ({
  id: r.id,
  date: r.date,
  passage: { title: r.passage.title, body: r.passage.body },
  quizWords: r.passage.quizWords ?? [],
  progress: r.progress,
  addedWords: r.added_words,
});

/** The user's one current passage for this language, if one has been generated yet. Not scoped
 *  to "today" — there's only ever one passage per (user, lang) at a time (see supabase-passages.sql),
 *  so a passage generated at 11:59pm is still the current one at 12:01am, not hidden until a new
 *  one is generated. `date` is kept only as display metadata (when it was generated). */
export async function loadPassage(
  sb: SupabaseClient, userId: string, lang: LanguageCode,
): Promise<StoredPassage | null> {
  const { data } = await sb
    .from(PASSAGES_TABLE).select('*')
    .eq('user_id', userId).eq('lang', lang).eq('passage_idx', 0)
    .maybeSingle();
  return data ? fromRow(data as PassageRow) : null;
}

/** Create (or replace, on "+ New passage") the user's one passage for this language. Resets
 *  progress/added_words. `quizWords` are whichever words the passage was built around — persisted
 *  so blanks stay fixed for the life of this passage regardless of later due-status changes. */
export async function createPassage(
  sb: SupabaseClient, userId: string, lang: LanguageCode, date: string, passage: RawPassage, quizWords: string[],
): Promise<StoredPassage> {
  const { data } = await sb
    .from(PASSAGES_TABLE)
    .upsert(
      { user_id: userId, lang, date, passage_idx: 0, passage: { ...passage, quizWords }, progress: {}, added_words: [] },
      { onConflict: 'user_id,lang,passage_idx' },
    )
    .select()
    .single();
  return fromRow(data as PassageRow);
}

export async function saveProgress(
  sb: SupabaseClient, userId: string, passageId: string, progress: BlankProgress,
): Promise<void> {
  await sb.from(PASSAGES_TABLE).update({ progress }).eq('id', passageId).eq('user_id', userId);
}

/** Overwrite a stored passage's tokens — used when a deck word's definition is user-edited
 *  (WordPopup/VocabTab): each occurrence of that word in today's passage had its reading/meaning
 *  baked in at generation time (see generatePassage), so the edit has to be re-applied here too
 *  or the passage would keep showing the old definition until it's regenerated. `quizWords` rides
 *  inside the same jsonb column (see createPassage), so it must be passed through unchanged. */
export async function updatePassageTokens(
  sb: SupabaseClient, userId: string, passageId: string, passage: RawPassage & { quizWords: string[] },
): Promise<void> {
  await sb.from(PASSAGES_TABLE).update({ passage }).eq('id', passageId).eq('user_id', userId);
}

/** Record that `hanzi` was added to the deck while reading this passage (deduped). */
export async function addPassageWord(
  sb: SupabaseClient, userId: string, passageId: string, hanzi: string,
): Promise<void> {
  const { data } = await sb
    .from(PASSAGES_TABLE).select('added_words').eq('id', passageId).eq('user_id', userId).maybeSingle();
  const words = Array.from(new Set([...(data?.added_words ?? []), hanzi]));
  await sb.from(PASSAGES_TABLE).update({ added_words: words }).eq('id', passageId).eq('user_id', userId);
}

// ── deck_words ────────────────────────────────────────────────────────────────

/** DeckWord <-> deck_words row, minus `id`/`user_id` (DB-assigned / query-scoped). */
function toRow(card: Omit<DeckWord, 'id'>) {
  return {
    h: card.h,
    p: card.p,
    m: card.m,
    pool: card.pool ?? false,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** A user's deck is partitioned by language — every read/write below is scoped to one. Pool
 *  (staged) words are excluded and due-ascending is the sort order: PostgREST caps unbounded
 *  selects at 1000 rows, and with pool words in the mix a user's active/due cards can get
 *  silently truncated past that line — ordering by due date keeps whatever's soonest (i.e.
 *  already overdue) safely inside the cap. */
export async function loadDeck(sb: SupabaseClient, userId: string, lang: LanguageCode): Promise<DeckWord[]> {
  const { data } = await sb
    .from(DECK_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('lang', lang)
    .eq('pool', false)
    .order('due', { ascending: true });
  return (data ?? []).map(reviveCard);
}

/** All staged (pool) words for this user+lang — loaded once (alongside loadDeck) so ReadTab can
 *  recognize a pool word at click time synchronously, instead of a per-click round trip that
 *  would otherwise show the wrong "Add to vocab" button color for a moment before upgrading.
 *  Kept as its own query, separate from loadDeck's row-cap-safe active-only one above: pool
 *  counts aren't bounded the same way active/due cards need to be. */
export async function loadPoolWords(sb: SupabaseClient, userId: string, lang: LanguageCode): Promise<DeckWord[]> {
  const { data } = await sb
    .from(DECK_TABLE).select('*')
    .eq('user_id', userId).eq('lang', lang).eq('pool', true);
  return (data ?? []).map(reviveCard);
}

/** Release a pool word into circulation: no longer staged, due starting now like any other
 *  freshly-added word. */
export async function releasePoolWord(
  sb: SupabaseClient, userId: string, id: string, due: Date,
): Promise<void> {
  await sb.from(DECK_TABLE).update({ pool: false, due: due.toISOString() }).eq('user_id', userId).eq('id', id);
}

/** Insert one card unless a word with the same (hanzi, meaning, language) already exists for
 *  this user — a single atomic upsert (`ON CONFLICT DO NOTHING`), no read-modify-write.
 *  Returns the new row, or null if it already existed. */
export async function insertWord(
  sb: SupabaseClient,
  userId: string,
  card: Omit<DeckWord, 'id'>,
  lang: LanguageCode,
): Promise<DeckWord | null> {
  const { data } = await sb
    .from(DECK_TABLE)
    .upsert({ user_id: userId, lang, ...toRow(card) }, { onConflict: 'user_id,h,m,lang', ignoreDuplicates: true })
    .select()
    .maybeSingle();
  return data ? reviveCard(data) : null;
}

/** Bulk-insert several cards, skipping any that already exist. Returns the ones actually inserted. */
export async function insertWords(
  sb: SupabaseClient,
  userId: string,
  cards: Omit<DeckWord, 'id'>[],
  lang: LanguageCode,
): Promise<DeckWord[]> {
  if (!cards.length) return [];
  const { data } = await sb
    .from(DECK_TABLE)
    .upsert(
      cards.map((c) => ({ user_id: userId, lang, ...toRow(c) })),
      { onConflict: 'user_id,h,m,lang', ignoreDuplicates: true },
    )
    .select();
  return (data ?? []).map(reviveCard);
}

export async function deleteWord(sb: SupabaseClient, userId: string, id: string): Promise<void> {
  await sb.from(DECK_TABLE).delete().eq('user_id', userId).eq('id', id);
}

/** User-edited reading/meaning for one deck word — e.g. correcting a bad dictionary/LLM lookup.
 *  Narrower than updateWords: touches only p/m, never the FSRS scheduling fields. */
export async function updateWordDefinition(
  sb: SupabaseClient, userId: string, id: string, p: string, m: string,
): Promise<void> {
  await sb.from(DECK_TABLE).update({ p, m }).eq('user_id', userId).eq('id', id);
}

/** Persist FSRS-graded scheduling fields for a batch of cards — one UPDATE per row (each row
 *  gets a different grade, so this can't collapse into a single statement). Grading never
 *  changes a card's language, so `lang` is left untouched. */
export async function updateWords(sb: SupabaseClient, userId: string, cards: DeckWord[]): Promise<void> {
  await Promise.all(
    cards.map((c) => sb.from(DECK_TABLE).update(toRow(c)).eq('user_id', userId).eq('id', c.id)),
  );
}

export async function clearDeckWords(sb: SupabaseClient, userId: string, lang: LanguageCode): Promise<void> {
  await sb.from(DECK_TABLE).delete().eq('user_id', userId).eq('lang', lang);
}
