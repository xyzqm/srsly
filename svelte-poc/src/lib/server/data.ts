import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckWord, LanguageCode, Theme } from '../types';
import type { StoredPassage, BlankProgress, RawPassage } from '../tokens';
import { reviveCard } from '../srs';

// PoC storage: `deck_words` and `passages` each hold one row per item (see
// supabase-deck-words.sql / supabase-passages.sql) so add/remove/progress updates are plain SQL
// rather than a read-modify-write over a jsonb array. `poc_user_data` still holds prefs as jsonb,
// one row per user — that isn't queried/mutated word-by-word, so a blob is fine there.

const PREFS_TABLE = 'poc_user_data';
const DECK_TABLE = 'deck_words';
const PASSAGES_TABLE = 'passages';

export interface Prefs { theme: Theme; hskLevel: number; showWordBoundaries: boolean; language: LanguageCode }

export const DEFAULT_PREFS: Prefs = { theme: 'paper', hskLevel: 3, showWordBoundaries: true, language: 'zh' };

export async function loadPrefs(sb: SupabaseClient, userId: string): Promise<Prefs> {
  const { data } = await sb.from(PREFS_TABLE).select('prefs').eq('user_id', userId).maybeSingle();
  return { ...DEFAULT_PREFS, ...(data?.prefs as Partial<Prefs> | null) };
}

function patch(sb: SupabaseClient, userId: string, fields: Record<string, unknown>) {
  return sb
    .from(PREFS_TABLE)
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

export const savePrefs = (sb: SupabaseClient, userId: string, prefs: Prefs) => patch(sb, userId, { prefs });

// ── passages ─────────────────────────────────────────────────────────────────

interface PassageRow {
  id: string;
  date: string;
  passage: RawPassage;
  progress: BlankProgress;
  added_words: string[];
}

const fromRow = (r: PassageRow): StoredPassage =>
  ({ id: r.id, date: r.date, passage: r.passage, progress: r.progress, addedWords: r.added_words });

/** Today's passage for this user + language, if one has been generated yet. */
export async function loadPassage(
  sb: SupabaseClient, userId: string, lang: LanguageCode, date: string,
): Promise<StoredPassage | null> {
  const { data } = await sb
    .from(PASSAGES_TABLE).select('*')
    .eq('user_id', userId).eq('lang', lang).eq('date', date).eq('passage_idx', 0)
    .maybeSingle();
  return data ? fromRow(data as PassageRow) : null;
}

/** Create (or replace, on "+ New passage") today's passage row. Resets progress/added_words. */
export async function createPassage(
  sb: SupabaseClient, userId: string, lang: LanguageCode, date: string, passage: RawPassage,
): Promise<StoredPassage> {
  const { data } = await sb
    .from(PASSAGES_TABLE)
    .upsert(
      { user_id: userId, lang, date, passage_idx: 0, passage, progress: {}, added_words: [] },
      { onConflict: 'user_id,date,lang,passage_idx' },
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

/** A user's deck is partitioned by language — every read/write below is scoped to one. */
export async function loadDeck(sb: SupabaseClient, userId: string, lang: LanguageCode): Promise<DeckWord[]> {
  const { data } = await sb
    .from(DECK_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('lang', lang)
    .order('created_at', { ascending: false });
  return (data ?? []).map(reviveCard);
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
