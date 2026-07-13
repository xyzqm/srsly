import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckWord, Theme } from '../types';
import type { StoredDaily } from '../tokens';
import { reviveCard } from '../srs';

// PoC storage: `deck_words` holds one row per vocab card (see supabase-deck-words.sql) so
// add/remove are plain SQL insert/delete. `poc_user_data` still holds prefs/daily as jsonb,
// one row per user — those aren't queried/mutated word-by-word, so a blob is fine there.

const PREFS_TABLE = 'poc_user_data';
const DECK_TABLE = 'deck_words';

export interface Prefs { theme: Theme; hskLevel: number }

const DEFAULT_PREFS: Prefs = { theme: 'paper', hskLevel: 3 };

export async function loadPrefs(sb: SupabaseClient, userId: string): Promise<Prefs> {
  const { data } = await sb.from(PREFS_TABLE).select('prefs').eq('user_id', userId).maybeSingle();
  return { ...DEFAULT_PREFS, ...(data?.prefs as Partial<Prefs> | null) };
}

export async function loadDaily(sb: SupabaseClient, userId: string): Promise<StoredDaily | null> {
  const { data } = await sb.from(PREFS_TABLE).select('daily').eq('user_id', userId).maybeSingle();
  return (data?.daily as StoredDaily | null) ?? null;
}

function patch(sb: SupabaseClient, userId: string, fields: Record<string, unknown>) {
  return sb
    .from(PREFS_TABLE)
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

export const savePrefs = (sb: SupabaseClient, userId: string, prefs: Prefs) => patch(sb, userId, { prefs });
export const saveDaily = (sb: SupabaseClient, userId: string, daily: StoredDaily | null) => patch(sb, userId, { daily });

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

export async function loadDeck(sb: SupabaseClient, userId: string): Promise<DeckWord[]> {
  const { data } = await sb
    .from(DECK_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []).map(reviveCard);
}

/** Insert one card unless a word with the same (hanzi, meaning) already exists for this user —
 *  a single atomic upsert (`ON CONFLICT DO NOTHING`), no read-modify-write. Returns the new row,
 *  or null if it already existed. */
export async function insertWord(
  sb: SupabaseClient,
  userId: string,
  card: Omit<DeckWord, 'id'>,
): Promise<DeckWord | null> {
  const { data } = await sb
    .from(DECK_TABLE)
    .upsert({ user_id: userId, ...toRow(card) }, { onConflict: 'user_id,h,m', ignoreDuplicates: true })
    .select()
    .maybeSingle();
  return data ? reviveCard(data) : null;
}

/** Bulk-insert several cards, skipping any that already exist. Returns the ones actually inserted. */
export async function insertWords(
  sb: SupabaseClient,
  userId: string,
  cards: Omit<DeckWord, 'id'>[],
): Promise<DeckWord[]> {
  if (!cards.length) return [];
  const { data } = await sb
    .from(DECK_TABLE)
    .upsert(
      cards.map((c) => ({ user_id: userId, ...toRow(c) })),
      { onConflict: 'user_id,h,m', ignoreDuplicates: true },
    )
    .select();
  return (data ?? []).map(reviveCard);
}

export async function deleteWord(sb: SupabaseClient, userId: string, id: string): Promise<void> {
  await sb.from(DECK_TABLE).delete().eq('user_id', userId).eq('id', id);
}

/** Persist FSRS-graded scheduling fields for a batch of cards — one UPDATE per row (each row
 *  gets a different grade, so this can't collapse into a single statement). */
export async function updateWords(sb: SupabaseClient, userId: string, cards: DeckWord[]): Promise<void> {
  await Promise.all(
    cards.map((c) => sb.from(DECK_TABLE).update(toRow(c)).eq('user_id', userId).eq('id', c.id)),
  );
}

export async function clearDeckWords(sb: SupabaseClient, userId: string): Promise<void> {
  await sb.from(DECK_TABLE).delete().eq('user_id', userId);
}
