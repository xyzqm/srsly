import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeckWord, Theme } from '../types';
import type { StoredDaily } from '../tokens';
import { reviveCard } from '../srs';

// All PoC storage lives in one Supabase row (poc_user_data), one per user. No stores, no
// localStorage — the page's load() reads this, and form actions write it.

const TABLE = 'poc_user_data';

export interface Prefs { theme: Theme; hskLevel: number }
export interface UserData { deck: DeckWord[]; prefs: Prefs; daily: StoredDaily | null }

const DEFAULT_PREFS: Prefs = { theme: 'paper', hskLevel: 3 };

export async function loadUserData(sb: SupabaseClient, userId: string): Promise<UserData> {
  const { data } = await sb.from(TABLE).select('deck, prefs, daily').eq('user_id', userId).maybeSingle();
  return {
    deck: ((data?.deck as DeckWord[]) ?? []).map(reviveCard), // jsonb ISO dates → Date
    prefs: { ...DEFAULT_PREFS, ...(data?.prefs as Partial<Prefs> | null) },
    daily: (data?.daily as StoredDaily | null) ?? null,
  };
}

function patch(sb: SupabaseClient, userId: string, fields: Record<string, unknown>) {
  return sb
    .from(TABLE)
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

export const saveDeck = (sb: SupabaseClient, userId: string, deck: DeckWord[]) => patch(sb, userId, { deck });
export const savePrefs = (sb: SupabaseClient, userId: string, prefs: Prefs) => patch(sb, userId, { prefs });
export const saveDaily = (sb: SupabaseClient, userId: string, daily: StoredDaily | null) => patch(sb, userId, { daily });
