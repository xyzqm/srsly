import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent } from '@/lib/types';
import { LocalStorage } from './local';

interface UserDataRow {
  deck: DeckWord[] | null;
  prefs: UserPrefs | null;
  srs_state: SRSState | null;
}

/** Dedup key for merging decks: stable id when present, else character + meaning. */
function wordKey(w: DeckWord): string {
  return w.id ?? `${w.h}|${(w.m ?? '').trim()}`;
}

/**
 * DataService backed by the user's `user_data` row (deck / prefs / SRS state as JSONB).
 * Ephemeral, per-device data (claimed words, the daily-content cache) stays in a composed
 * LocalStorage, which also acts as an offline read cache + write-through for the synced
 * fields so the app keeps working without a connection.
 */
export class SupabaseStorage implements DataService {
  private local = new LocalStorage();
  constructor(private sb: SupabaseClient, private userId: string) {}

  private async row(): Promise<UserDataRow | null> {
    const { data, error } = await this.sb
      .from('user_data').select('deck, prefs, srs_state').eq('user_id', this.userId).maybeSingle();
    if (error) { console.error('[SupabaseStorage] read', error.message); return null; }
    return (data as UserDataRow | null) ?? null;
  }

  private async patch(patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.sb.from('user_data')
      .upsert({ user_id: this.userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) console.error('[SupabaseStorage] write', error.message);
  }

  async getVocabDeck(): Promise<DeckWord[]> {
    const r = await this.row();
    if (r?.deck) { await this.local.saveVocabDeck(r.deck); return r.deck; }
    return this.local.getVocabDeck();
  }
  async saveVocabDeck(deck: DeckWord[]): Promise<void> { await this.local.saveVocabDeck(deck); await this.patch({ deck }); }

  async getSRSState(): Promise<SRSState> {
    const r = await this.row();
    if (r?.srs_state) { await this.local.saveSRSState(r.srs_state); return r.srs_state; }
    return this.local.getSRSState();
  }
  async saveSRSState(state: SRSState): Promise<void> { await this.local.saveSRSState(state); await this.patch({ srs_state: state }); }

  async getPrefs(): Promise<UserPrefs> {
    const r = await this.row();
    if (r?.prefs) { await this.local.savePrefs(r.prefs); return r.prefs; }
    return this.local.getPrefs();
  }
  async savePrefs(prefs: UserPrefs): Promise<void> { await this.local.savePrefs(prefs); await this.patch({ prefs }); }

  // Ephemeral / per-device — never synced.
  getClaimedWords(): Promise<ClaimedWords> { return this.local.getClaimedWords(); }
  saveClaimedWords(claimed: ClaimedWords): Promise<void> { return this.local.saveClaimedWords(claimed); }
  getDailyContent(hskLevel: number, deck?: string): Promise<DailyContent | null> { return this.local.getDailyContent(hskLevel, deck); }
  saveDailyContent(content: DailyContent): Promise<void> { return this.local.saveDailyContent(content); }
}

/**
 * First-sign-in migration: push the guest's local deck/prefs/SRS into the cloud. If the
 * account already has a deck (returning user on a new device), merge decks by id/identity
 * (cloud wins on conflict) and keep cloud prefs/SRS. Mirrors the result into the local
 * cache. Safe to call on every sign-in.
 */
export async function migrateLocalToCloud(sb: SupabaseClient, userId: string): Promise<void> {
  const local = new LocalStorage();
  const [localDeck, localPrefs, localSrs] = await Promise.all([
    local.getVocabDeck(), local.getPrefs(), local.getSRSState(),
  ]);

  const { data } = await sb.from('user_data').select('deck, prefs, srs_state').eq('user_id', userId).maybeSingle();
  const cloud = (data as UserDataRow | null) ?? null;
  const cloudDeck = cloud?.deck ?? null;

  let deck = localDeck;
  let prefs = localPrefs;
  let srs = localSrs;

  if (cloudDeck && cloudDeck.length) {
    const byKey = new Map<string, DeckWord>();
    for (const w of localDeck) byKey.set(wordKey(w), w);
    for (const w of cloudDeck) byKey.set(wordKey(w), w); // cloud wins
    deck = [...byKey.values()];
    prefs = cloud?.prefs ?? localPrefs;
    srs = cloud?.srs_state ?? localSrs;
  }

  await sb.from('user_data').upsert(
    { user_id: userId, deck, prefs, srs_state: srs, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  await Promise.all([local.saveVocabDeck(deck), local.savePrefs(prefs), local.saveSRSState(srs)]);
}
