import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode, ClozeOccurrenceMap, ShelfEntry } from '@/lib/types';
import { LocalStorage } from './local';
import { todayStr } from '@/lib/deck';

// Multi-language support stores per-language decks in a `decks jsonb` column:
//   alter table user_data add column if not exists decks jsonb;
// `decks` is shaped { zh: DeckWord[], ja: DeckWord[] }. The legacy single `deck` column
// is treated as the Chinese deck and folded into `decks.zh` on read/migration.
//
// The passage shelf requires:
//   alter table user_data add column if not exists shelf jsonb;
// `shelf` is shaped { es: ShelfEntry[], fr: ShelfEntry[] } — per language, like `decks`.
//
// Cloze blank progress requires:
//   alter table user_data add column if not exists passage_state jsonb;
// `passage_state` is shaped { "${contentKey}|${passageIdx}": ClozeOccurrenceMap }.
// Only today's entries are kept; stale ones are pruned on each write.
interface UserDataRow {
  deck: DeckWord[] | null;                              // legacy single deck (= Chinese)
  decks: Partial<Record<LanguageCode, DeckWord[]>> | null;
  prefs: UserPrefs | null;
  srs_state: SRSState | null;
  passage_state: Record<string, ClozeOccurrenceMap> | null;
  shelf: Partial<Record<LanguageCode, ShelfEntry[]>> | null;
}

const SUPPORTED_LANGS: LanguageCode[] = ['zh', 'ja', 'es', 'fr'];

/** Pull a language's deck from a row, falling back to the legacy `deck` column for Chinese. */
function deckFromRow(r: UserDataRow | null, lang: LanguageCode): DeckWord[] | null {
  const fromDecks = r?.decks?.[lang];
  if (fromDecks) return fromDecks;
  if (lang === 'zh' && r?.deck) return r.deck;
  return null;
}

/** Semantic identity: same character + same meaning = same card, regardless of id. */
function semanticKey(w: DeckWord): string {
  return `${w.h}|${(w.m ?? '').trim()}`;
}

/** Remove semantic duplicates from a deck, keeping the last occurrence (cloud wins when iterating cloud after local). */
function deduplicateDeck(deck: DeckWord[]): DeckWord[] {
  const seen = new Map<string, DeckWord>();
  for (const w of deck) seen.set(semanticKey(w), w);
  return [...seen.values()];
}

/**
 * DataService backed by the user's `user_data` row (decks / prefs / SRS state as JSONB).
 * Ephemeral, per-device data (claimed words, the daily-content cache) stays in a composed
 * LocalStorage, which also acts as an offline read cache + write-through for the synced
 * fields so the app keeps working without a connection.
 */
export class SupabaseStorage implements DataService {
  private local = new LocalStorage();
  constructor(private sb: SupabaseClient, private userId: string) {}

  private async row(): Promise<UserDataRow | null> {
    // select('*') so a not-yet-migrated `decks` column doesn't error the query.
    const { data, error } = await this.sb
      .from('user_data').select('*').eq('user_id', this.userId).maybeSingle();
    if (error) { console.error('[SupabaseStorage] read', error.message); return null; }
    return (data as UserDataRow | null) ?? null;
  }

  /**
   * Columns this database turned out not to have. `row()` already tolerates a missing
   * column by selecting `*`, but a WRITE naming one fails the whole upsert — so a user who
   * hasn't run a migration lost the rest of the patch too, and got a console error on every
   * save. A schema error won't fix itself mid-session, so each column is learned once.
   */
  private missingColumns = new Set<string>();

  private async patch(patch: Record<string, unknown>): Promise<void> {
    const send = Object.fromEntries(
      Object.entries(patch).filter(([k]) => !this.missingColumns.has(k)),
    );
    if (Object.keys(send).length === 0) return;

    const { error } = await this.sb.from('user_data')
      .upsert({ user_id: this.userId, ...send, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (!error) return;

    // "Could not find the 'shelf' column of 'user_data' in the schema cache"
    const missing = /Could not find the '(\w+)' column/.exec(error.message)?.[1];
    if (missing && missing in send) {
      this.missingColumns.add(missing);
      console.warn(
        `[SupabaseStorage] no '${missing}' column — that feature stays on this device. ` +
        'See the migrations at the top of lib/storage/supabase.ts to enable syncing it.',
      );
      // Land everything else rather than dropping the whole write on the floor.
      const rest = Object.fromEntries(Object.entries(send).filter(([k]) => k !== missing));
      if (Object.keys(rest).length > 0) await this.patch(rest);
      return;
    }
    console.error('[SupabaseStorage] write', error.message);
  }

  async getVocabDeck(lang: LanguageCode): Promise<DeckWord[]> {
    const r = await this.row();
    const cloudDeck = deckFromRow(r, lang);
    if (cloudDeck) {
      const deck = deduplicateDeck(cloudDeck);
      await this.local.saveVocabDeck(lang, deck);
      return deck;
    }
    return this.local.getVocabDeck(lang);
  }
  async saveVocabDeck(lang: LanguageCode, deck: DeckWord[]): Promise<void> {
    await this.local.saveVocabDeck(lang, deck);
    const r = await this.row();
    const decks = { ...(r?.decks ?? {}), [lang]: deck };
    await this.patch({ decks });
  }

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
  getDailyContent(lang: LanguageCode, level: number): Promise<DailyContent | null> { return this.local.getDailyContent(lang, level); }
  async saveDailyContent(content: DailyContent): Promise<void> {
    // LocalStorage.saveDailyContent also archives finished passages onto the LOCAL shelf,
    // writing straight to localStorage — it has no way to reach this backend. Mirror the
    // result up afterwards, or a signed-in user's shelf would never leave their device.
    await this.local.saveDailyContent(content);
    const lang = content.language ?? 'zh';
    await this.saveShelf(lang, await this.local.getShelf(lang));
  }

  async getShelf(lang: LanguageCode): Promise<ShelfEntry[]> {
    const r = await this.row();
    const cloud = r?.shelf?.[lang];
    if (cloud) { await this.local.saveShelf(lang, cloud); return cloud; }
    return this.local.getShelf(lang);
  }
  async saveShelf(lang: LanguageCode, entries: ShelfEntry[]): Promise<void> {
    await this.local.saveShelf(lang, entries);
    const r = await this.row();
    await this.patch({ shelf: { ...(r?.shelf ?? {}), [lang]: entries } });
  }

  async getPassageState(contentKey: string, passageIdx: number): Promise<ClozeOccurrenceMap | null> {
    // Fast path: local cache (same device, reload)
    const cached = await this.local.getPassageState(contentKey, passageIdx);
    if (cached) return cached;
    // Slow path: fetch from cloud (new device sign-in)
    const r = await this.row();
    const key = `${contentKey}|${passageIdx}`;
    const state = r?.passage_state?.[key];
    if (state) { await this.local.savePassageState(contentKey, passageIdx, state); return state; }
    return null;
  }

  async savePassageState(contentKey: string, passageIdx: number, state: ClozeOccurrenceMap): Promise<void> {
    await this.local.savePassageState(contentKey, passageIdx, state);
    const r = await this.row();
    const today = todayStr();
    // Prune stale entries (different dates) and write the updated state.
    // Key format: "${date}|{level}|{deck}|{passageIdx}" — date is the first segment.
    const pruned: Record<string, ClozeOccurrenceMap> = {};
    for (const [k, v] of Object.entries(r?.passage_state ?? {})) {
      const date = k.split('|')[0];
      if (date === today) pruned[k] = v;
    }
    pruned[`${contentKey}|${passageIdx}`] = state;
    await this.patch({ passage_state: pruned });
  }
}

/**
 * First-sign-in migration: push the guest's local decks/prefs/SRS into the cloud. For each
 * language, if the account already has a deck (returning user on a new device), merge by
 * semantic identity (cloud wins on conflict). Keeps cloud prefs/SRS when cloud has data.
 * Mirrors the result into the local cache. Safe to call on every sign-in.
 */
export async function migrateLocalToCloud(sb: SupabaseClient, userId: string): Promise<void> {
  const local = new LocalStorage();
  const [localDecks, localPrefs, localSrs] = await Promise.all([
    Promise.all(SUPPORTED_LANGS.map(l => local.getVocabDeck(l))),
    local.getPrefs(),
    local.getSRSState(),
  ]);

  const { data } = await sb.from('user_data').select('*').eq('user_id', userId).maybeSingle();
  const cloud = (data as UserDataRow | null) ?? null;

  const decks: Partial<Record<LanguageCode, DeckWord[]>> = {};
  let anyCloudDeck = false;
  SUPPORTED_LANGS.forEach((lang, i) => {
    const localDeck = localDecks[i];
    const cloudDeck = deckFromRow(cloud, lang);
    if (cloudDeck && cloudDeck.length) {
      anyCloudDeck = true;
      const byKey = new Map<string, DeckWord>();
      for (const w of localDeck) byKey.set(semanticKey(w), w);
      for (const w of cloudDeck) byKey.set(semanticKey(w), w); // cloud wins
      decks[lang] = [...byKey.values()];
    } else {
      decks[lang] = localDeck;
    }
  });

  const prefs = anyCloudDeck ? (cloud?.prefs ?? localPrefs) : localPrefs;
  const srs = anyCloudDeck ? (cloud?.srs_state ?? localSrs) : localSrs;

  await sb.from('user_data').upsert(
    { user_id: userId, decks, prefs, srs_state: srs, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  await Promise.all([
    ...SUPPORTED_LANGS.map(l => local.saveVocabDeck(l, decks[l] ?? [])),
    local.savePrefs(prefs),
    local.saveSRSState(srs),
  ]);
}
