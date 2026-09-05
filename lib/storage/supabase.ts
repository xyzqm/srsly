import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataService } from './types';
import type { DeckWord, SRSState, UserPrefs, ClaimedWords, DailyContent, LanguageCode, ClozeOccurrenceMap, ShelfEntry } from '@/lib/types';
import { LocalStorage } from './local';
import { mergeShelf } from '@/lib/shelf';
import { todayStr } from '@/lib/deck';
import { getActivityLog, setActivityLog, mergeActivity, type DayActivity } from '@/lib/activityLog';
import { loadDay, saveDay, mergeCounts, type DayCounts } from '@/lib/reviewCounts';
import * as queue from './writeQueue';

/**
 * COLUMNS THIS FILE NAMES ARE CREATED BY `supabase/schema.sql` AND `supabase/migrations/`.
 *
 * They used to be documented here as `alter table` statements in a comment, and that is
 * exactly how sync came to be broken: the live project had them applied by hand, schema.sql
 * never learned about them, and any database built from the repo was missing them. Because
 * `saveVocabDeck` writes `decks` and never the legacy `deck`, the upsert failed, the
 * `missingColumns` guard latched, and every deck write was dropped in silence — for all four
 * languages. A migration that lives in a comment is a migration nobody has run.
 *
 * `tests/sync.test.ts` reads schema.sql and asserts it names every column in `UserDataRow`,
 * so adding one here without adding it there is now a test failure rather than silent
 * data loss. Add new columns in THREE places: this interface, schema.sql, and a migration.
 */
interface UserDataRow {
  deck: DeckWord[] | null;                              // legacy single deck (= Chinese)
  decks: Partial<Record<LanguageCode, DeckWord[]>> | null;
  prefs: UserPrefs | null;
  srs_state: SRSState | null;
  passage_state: Record<string, ClozeOccurrenceMap> | null;
  shelf: Partial<Record<LanguageCode, ShelfEntry[]>> | null;
  activity_log: DayActivity[] | null;
  review_counts: DayCounts | null;
  lessons_done: string[] | null;
}

const SUPPORTED_LANGS: LanguageCode[] = ['zh', 'ja', 'es', 'fr'];

/** Pull a language's deck from a row, falling back to the legacy `deck` column for Chinese. */
function deckFromRow(r: UserDataRow | null, lang: LanguageCode): DeckWord[] | null {
  const fromDecks = r?.decks?.[lang];
  if (fromDecks) return fromDecks;
  if (lang === 'zh' && r?.deck) return r.deck;
  return null;
}

/**
 * JSON with object keys sorted, so two values that differ only in key order compare equal.
 *
 * Postgres round-trips JSONB through its own representation and does not promise to give
 * back the key order it was handed. Comparing raw `JSON.stringify` output would therefore
 * report every column as changed on every read, which is exactly the false positive that
 * would make a skip-if-unchanged check do nothing.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v);
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

  constructor(private sb: SupabaseClient, private userId: string) {
    this.pending = queue.load(userId);
    // Anything still queued was written on a previous visit — closing the app on a train and
    // reopening it at home is the ordinary case, so replay is attempted on construction and
    // not only on an `online` event this tab was never around to hear.
    if (!queue.isEmpty(this.pending)) void this.flush();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
    }
  }

  /**
   * Writes that have not reached the cloud. See lib/storage/writeQueue.ts for why this is a
   * map keyed by column rather than a log of operations.
   */
  private pending: queue.PendingWrites = {};
  private flushing: Promise<void> | null = null;

  private onOnline = () => { void this.flush(); };

  /** Stop listening. Called when the backend is swapped out on sign-out. */
  dispose(): void {
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
  }

  private persistQueue(): void {
    if (queue.save(this.userId, this.pending)) return;
    // Could not be parked — too large, or the origin is out of quota. Local was already
    // written and is the truth, so dropping the queue costs the SYNC of this change and never
    // the change. Saying so is the point: silence here is how the original bug behaved.
    console.warn(
      '[SupabaseStorage] offline write queue could not be saved (quota). ' +
      'Changes are safe on this device but may not reach other devices.',
    );
    this.pending = {};
    queue.drop(this.userId);
  }

  /**
   * Retry everything queued, once, as a single upsert.
   *
   * Serialised through `flushing` so an `online` event landing on top of a focus refresh does
   * not send the same columns twice concurrently — two upserts racing on one row is how a
   * newer value loses to an older one.
   */
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (queue.isEmpty(this.pending)) return;
    this.flushing = (async () => {
      const send = { ...this.pending };
      /**
       * The activity log is RE-MERGED rather than replayed as-is.
       *
       * `mergeActivity` is per-day MAX and idempotent, so folding in whatever the cloud has
       * learned while this device was away is strictly better than overwriting it — and it is
       * free, because the function already exists. Every other column keeps the whole-blob
       * last-writer-wins posture the rest of this file has.
       */
      if ('activity_log' in send) {
        const cloud = (await this.row())?.activity_log ?? [];
        send.activity_log = mergeActivity(send.activity_log as DayActivity[], cloud);
      }
      await this.patch(send);
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  /**
   * The last row we read, kept so a write does not have to fetch one first.
   *
   * Every save used to `select('*')` before its upsert, so grading N cards was 2N round trips
   * carrying the whole user row both ways. That is invisible on a desktop and material on a
   * phone — and it got worse the moment sync started working, because the row grew a shelf,
   * cloze progress and an activity log. `null` means "not fetched yet"; a fetched-but-absent
   * row is cached as `EMPTY_ROW` so the two cases stay distinguishable.
   */
  private cached: UserDataRow | null = null;
  private fetchedAt = 0;

  /**
   * How long a cached row may serve a WRITE's merge base. Reads never use it.
   *
   * The cache was originally a latch — fetch once, serve that snapshot forever — and that
   * silently broke the very feature it shipped with: a second device read the row on load
   * and then could never see anything the first device did, for the whole session, with no
   * error anywhere. Two seconds is long enough to cover a burst of graded cards (the case
   * the cache exists for) and short enough that it cannot stand in for a stale read.
   */
  private static readonly ROW_TTL_MS = 2000;

  /**
   * `fresh` is the default for a REASON. Every read path must see the cloud's current state,
   * because that is what cross-device sync IS; only the pre-write merge base may be reused.
   */
  /**
   * A fetch that has been started but has not come back yet, shared by everyone who asks
   * while it is in the air.
   *
   * WITHOUT THIS, ONE PAGE LOAD ISSUED 52 QUERIES. Every getter above calls `row()` fresh,
   * and `row()` is `select('*')` — the WHOLE row, all four decks, the shelf and the activity
   * log, on every one. Four languages times several mounted copies of `useVocabDeck`, plus
   * prefs, SRS state, lessons, counts and per-passage cloze state, and they all mount at
   * once: measured on the live site, the last of them landed 25.9 SECONDS after navigation,
   * against a page that was itself ready in 468ms. The app was not slow; it was downloading
   * the same row fifty-two times.
   *
   * Sharing the in-flight promise does NOT weaken the freshness rule below. Those callers ran
   * at the same instant, so a single fetch started at that instant is exactly as current as
   * fifty-two would have been — there is no older snapshot being served, only one request
   * where there were dozens. A caller arriving after it resolves still gets its own fetch.
   */
  private inflight: Promise<UserDataRow | null> | null = null;

  private async row(opts?: { cached?: boolean }): Promise<UserDataRow | null> {
    const withinTtl = Date.now() - this.fetchedAt < SupabaseStorage.ROW_TTL_MS;
    if (opts?.cached && this.fetchedAt > 0 && withinTtl) return this.cached;
    if (this.inflight) return this.inflight;
    const pending = (async () => {
      // select('*') so a not-yet-migrated column doesn't error the query.
      const { data, error } = await this.sb
        .from('user_data').select('*').eq('user_id', this.userId).maybeSingle();
      if (error) { console.error('[SupabaseStorage] read', error.message); return null; }
      this.cached = (data as UserDataRow | null) ?? null;
      this.fetchedAt = Date.now();
      return this.cached;
    })();
    this.inflight = pending;
    try {
      return await pending;
    } finally {
      // Only the fetch that is still the current one clears the slot — an `invalidate()`
      // mid-flight replaces it, and that replacement must survive this handler.
      if (this.inflight === pending) this.inflight = null;
    }
  }

  /** Drop the cached row so the next read goes to the network. Called when a tab regains
   *  focus — the moment another device's changes are most likely to be waiting. */
  invalidate(): void {
    this.fetchedAt = 0;
    // Drop the in-flight share too. It was started before the learner came back to the tab,
    // so joining it would hand out exactly the pre-focus snapshot this call exists to discard.
    this.inflight = null;
  }

  /** Fold a landed write into the cache, so the next read does not need the network. */
  private remember(patch: Partial<UserDataRow>): void {
    if (this.fetchedAt === 0) return;   // nothing to merge into; the next row() fetches truth
    this.cached = { ...(this.cached ?? ({} as UserDataRow)), ...patch };
  }

  /**
   * Columns this database turned out not to have. `row()` already tolerates a missing
   * column by selecting `*`, but a WRITE naming one fails the whole upsert — so a user who
   * hasn't run a migration lost the rest of the patch too, and got a console error on every
   * save. A schema error won't fix itself mid-session, so each column is learned once.
   */
  private missingColumns = new Set<string>();

  /**
   * The one place every synced write goes, and therefore the only place a retry belongs.
   *
   * THREE OUTCOMES, and telling them apart is the whole job:
   *   landed          → remember it, and drop those columns from the queue
   *   missing column  → a schema fault; it will NEVER succeed, so queueing it would mean
   *                     retrying forever on every focus. Learned once, as before.
   *   anything else   → network, timeout, 5xx. Retryable, so it is queued.
   *
   * That middle case is why this cannot simply queue on `error`. A database that has not run
   * `supabase/migrations/` would otherwise accumulate a permanent queue that fails on every
   * replay and never drains.
   */
  private async patch(patch: Record<string, unknown>): Promise<void> {
    const send = Object.fromEntries(
      Object.entries(patch).filter(([k]) => !this.missingColumns.has(k)),
    );
    const columns = Object.keys(send);
    if (columns.length === 0) return;

    const { error } = await this.sb.from('user_data')
      .upsert({ user_id: this.userId, ...send, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (!error) {
      this.remember(send as Partial<UserDataRow>);
      // Only now is local no longer the newer copy, so only now may a read mirror the cloud
      // back down over these columns. Checks EVERY column, not just the first: a patch can
      // carry `decks` and `activity_log` together while only one of them was queued.
      if (columns.some(c => queue.isPending(this.pending, c))) {
        this.pending = queue.forget(this.pending, columns);
        this.persistQueue();
      }
      return;
    }

    // "Could not find the 'shelf' column of 'user_data' in the schema cache"
    const missing = /Could not find the '(\w+)' column/.exec(error.message)?.[1];
    if (missing && missing in send) {
      this.missingColumns.add(missing);
      console.warn(
        `[SupabaseStorage] no '${missing}' column — that feature stays on this device. ` +
        'Run supabase/migrations/ against this project to enable syncing it.',
      );
      // A column the schema does not have is not a retry candidate — forget it rather than
      // queueing a write that can only fail again.
      this.pending = queue.forget(this.pending, [missing]);
      this.persistQueue();
      // Land everything else rather than dropping the whole write on the floor.
      const rest = Object.fromEntries(Object.entries(send).filter(([k]) => k !== missing));
      if (Object.keys(rest).length > 0) await this.patch(rest);
      return;
    }

    this.pending = queue.supersede(this.pending, send);
    this.persistQueue();
    console.warn(
      `[SupabaseStorage] write failed, queued for retry (${Object.keys(send).join(', ')}):`,
      error.message,
    );
  }

  /**
   * A merge base built from LOCAL, for when the cloud row cannot be read.
   *
   * ── THE HAZARD THIS EXISTS FOR ──
   * Every whole-column write is built by spreading the cloud's current value —
   * `{ ...(r?.decks ?? {}), [lang]: deck }`. Offline with a cold cache, `row()` returns null,
   * so that `?? {}` produced an object holding ONLY the language being studied. It failed
   * harmlessly at the time, which is what hid it; queue that write and replay it, and it
   * lands, and the other three languages' decks are gone from the cloud.
   *
   * So going offline did not merely fail to save — it assembled a payload that destroys data
   * the moment it succeeds. A retry queue without this fix would faithfully replay the poison.
   */
  private async localDecks(): Promise<Partial<Record<LanguageCode, DeckWord[]>>> {
    const pairs = await Promise.all(
      SUPPORTED_LANGS.map(async l => [l, await this.local.getVocabDeck(l)] as const),
    );
    return Object.fromEntries(pairs.filter(([, d]) => d.length > 0));
  }

  private async localShelves(): Promise<Partial<Record<LanguageCode, ShelfEntry[]>>> {
    const pairs = await Promise.all(
      SUPPORTED_LANGS.map(async l => [l, await this.local.getShelf(l)] as const),
    );
    return Object.fromEntries(pairs.filter(([, e]) => e.length > 0));
  }

  async getVocabDeck(lang: LanguageCode): Promise<DeckWord[]> {
    const r = await this.row();
    const cloudDeck = deckFromRow(r, lang);
    // A pending write means LOCAL is the newer copy — mirroring the cloud down over it is
    // precisely the deletion this queue exists to stop. See writeQueue.isPending.
    if (cloudDeck && !queue.isPending(this.pending, 'decks')) {
      const deck = deduplicateDeck(cloudDeck);
      await this.local.saveVocabDeck(lang, deck);
      return deck;
    }
    return this.local.getVocabDeck(lang);
  }
  async saveVocabDeck(lang: LanguageCode, deck: DeckWord[]): Promise<void> {
    await this.local.saveVocabDeck(lang, deck);
    const r = await this.row({ cached: true });
    const decks = { ...(r?.decks ?? await this.localDecks()), [lang]: deck };
    /**
     * The activity log rides along, rather than getting a write of its own.
     *
     * `logGraded(1)` runs on the line immediately before `commit()` in useVocabDeck.gradeCard,
     * so every graded card already causes this exact upsert. Adding the column here costs
     * nothing; giving the log its own save would double the writes on the one path where
     * round trips are already the thing to watch.
     */
    /**
     * The review counters ride along too, for the same reason the activity log does: every
     * graded card already causes this exact upsert, and giving the budget its own save would
     * double the writes on the one path where round trips are worth watching.
     */
    await this.patch({ decks, activity_log: getActivityLog(), review_counts: loadDay() });
  }

  async getSRSState(): Promise<SRSState> {
    const r = await this.row();
    if (r?.srs_state && !queue.isPending(this.pending, 'srs_state')) {
      await this.local.saveSRSState(r.srs_state); return r.srs_state;
    }
    return this.local.getSRSState();
  }
  async saveSRSState(state: SRSState): Promise<void> { await this.local.saveSRSState(state); await this.patch({ srs_state: state }); }

  async getPrefs(): Promise<UserPrefs> {
    const r = await this.row();
    if (r?.prefs && !queue.isPending(this.pending, 'prefs')) {
      await this.local.savePrefs(r.prefs); return r.prefs;
    }
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
    if (cloud && !queue.isPending(this.pending, 'shelf')) {
      await this.local.saveShelf(lang, cloud); return cloud;
    }
    return this.local.getShelf(lang);
  }
  async saveShelf(lang: LanguageCode, entries: ShelfEntry[]): Promise<void> {
    await this.local.saveShelf(lang, entries);
    const r = await this.row({ cached: true });
    await this.patch({ shelf: { ...(r?.shelf ?? await this.localShelves()), [lang]: entries } });
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
    const r = await this.row({ cached: true });
    /**
     * THE ONE COLUMN THAT IS SKIPPED RATHER THAN QUEUED WHEN THE ROW IS UNREADABLE.
     *
     * The others rebuild their merge base from local — see `localDecks` — but `LocalStorage`
     * keeps cloze progress under one key PER PASSAGE (`clozeStateKey`), so there is no local
     * copy of the whole map to rebuild from. Writing `{ [thisKey]: state }` would drop every
     * other passage's progress from the cloud the moment it landed.
     *
     * Skipping is cheap here in a way it would not be for a deck: `passage_state` is pruned
     * to TODAY on every write, local already has it, and the worst case is that a blank filled
     * offline is not restored on a second device later the same day.
     */
    if (!r) return;
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

  /**
   * The daily budget, merged PER DEVICE — see lib/reviewCounts.ts on why neither a sum nor a
   * plain max will do. Written back locally so the synchronous `getTodayCounts()` that the
   * render paths call sees the cloud's contribution too.
   */
  async getReviewCounts(): Promise<DayCounts> {
    const r = await this.row();
    const merged = mergeCounts(loadDay(), r?.review_counts ?? null);
    saveDay(merged);
    return merged;
  }
  async saveReviewCounts(day: DayCounts): Promise<void> {
    const merged = mergeCounts(day, (await this.row())?.review_counts ?? null);
    saveDay(merged);
    await this.patch({ review_counts: merged });
  }

  /** Cloud and device merged per-day MAX — see mergeActivity on why not a sum. */
  async getActivityLog(): Promise<DayActivity[]> {
    const r = await this.row();
    const merged = mergeActivity(getActivityLog(), r?.activity_log ?? []);
    setActivityLog(merged);
    return merged;
  }
  async saveActivityLog(log: DayActivity[]): Promise<void> {
    const merged = mergeActivity(log, (await this.row())?.activity_log ?? []);
    setActivityLog(merged);
    await this.patch({ activity_log: merged });
  }

  /**
   * CLOUD WINS, rather than a union — because the tick can be taken off again.
   *
   * A union is the obvious merge for a set of "things I finished", and it is wrong here:
   * `LearnTab`'s `mark` TOGGLES, so un-ticking a lesson on one device would be undone the
   * moment the other device's copy was merged back in, and the learner could never un-finish
   * anything. Last-writer-wins is what the rest of this file already does for `prefs` and
   * `srs_state`, and it makes the toggle behave.
   *
   * The union survives in exactly one place — `migrateLocalToCloud` — where it is right: a
   * guest signing in has no cloud list to conflict with, only history to carry over.
   */
  async getLessonsDone(): Promise<string[]> {
    const r = await this.row();
    if (r?.lessons_done && !queue.isPending(this.pending, 'lessons_done')) {
      await this.local.saveLessonsDone(r.lessons_done); return r.lessons_done;
    }
    return this.local.getLessonsDone();
  }
  async saveLessonsDone(ids: string[]): Promise<void> {
    await this.local.saveLessonsDone(ids);
    await this.patch({ lessons_done: ids });
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
  const [localDecks, localPrefs, localSrs, localShelves, localLessons] = await Promise.all([
    Promise.all(SUPPORTED_LANGS.map(l => local.getVocabDeck(l))),
    local.getPrefs(),
    local.getSRSState(),
    Promise.all(SUPPORTED_LANGS.map(l => local.getShelf(l))),
    local.getLessonsDone(),
  ]);

  const { data } = await sb.from('user_data').select('*').eq('user_id', userId).maybeSingle();
  const cloud = (data as UserDataRow | null) ?? null;

  /**
   * THE CLOUD IS TRUTH ONCE IT HAS ANYTHING, and the union runs only on a true first sync.
   *
   * This used to merge local ∪ cloud on EVERY sign-in, cloud winning on conflicts. That
   * reads as safe and quietly makes deletion impossible: a word deleted on device A still
   * exists in device B's local copy, so B's merge adds it back and pushes it up, and the
   * card returns from the dead on both. Removals could never propagate — which is exactly
   * what the two-device test found.
   *
   * A merge cannot distinguish "deleted on the other device" from "not yet synced to this
   * one" without tombstones, so the ambiguity is resolved by declaring an authority: the
   * union carries a guest's local deck up the first time they sign in, and after that the
   * cloud row decides. The cost is that an edit made offline on a second device can be
   * overwritten, which is the same whole-blob last-writer-wins posture `prefs` and
   * `srs_state` already have.
   */
  const anyCloudDeck = SUPPORTED_LANGS.some(l => (deckFromRow(cloud, l)?.length ?? 0) > 0);
  const decks: Partial<Record<LanguageCode, DeckWord[]>> = {};
  SUPPORTED_LANGS.forEach((lang, i) => {
    const cloudDeck = deckFromRow(cloud, lang);
    decks[lang] = anyCloudDeck ? deduplicateDeck(cloudDeck ?? []) : localDecks[i];
  });

  /**
   * The shelf is carried too, and was not before.
   *
   * Without it a new device got `shelf: null` and fell back to a local empty array, so the
   * old device's reading history reached the cloud only when a passage next happened to be
   * finished there. `mergeShelf` already exists, is keyed by stable id and already caps at
   * MAX_ENTRIES — it simply was not reached from here.
   */
  const shelf: Partial<Record<LanguageCode, ShelfEntry[]>> = {};
  SUPPORTED_LANGS.forEach((lang, i) => {
    shelf[lang] = mergeShelf(cloud?.shelf?.[lang] ?? [], localShelves[i]);
  });

  const prefs = anyCloudDeck ? (cloud?.prefs ?? localPrefs) : localPrefs;
  const srs = anyCloudDeck ? (cloud?.srs_state ?? localSrs) : localSrs;
  const activity = mergeActivity(getActivityLog(), cloud?.activity_log ?? []);
  const lessonsDone = [...new Set([...localLessons, ...(cloud?.lessons_done ?? [])])];

  /**
   * COLUMN BY COLUMN, because one missing column must not discard the rest.
   *
   * This used to be a single upsert whose result was thrown away entirely — so on a database
   * without the `decks` column the whole first-sign-in migration failed in silence, and the
   * learner was told they had signed in while their deck stayed on one device. Reusing the
   * same column-learning retry the instance path uses means a project that has run only some
   * migrations still gets everything it can hold, and says what it could not.
   */
  const columns: Record<string, unknown> = {
    decks, prefs, srs_state: srs, shelf, activity_log: activity, lessons_done: lessonsDone,
  };

  /**
   * ONLY SEND WHAT ACTUALLY CHANGED — which on most loads is nothing.
   *
   * This runs on EVERY page load, not only the first sign-in, and it used to upsert all six
   * columns unconditionally: the whole deck, shelf, activity log and lesson list, re-written
   * every time the app opened. AuthProvider blocks the entire UI behind it — the app is a
   * bare "loading…" until it resolves — so that full-row write was sitting between a signed-in
   * learner and their first frame, on cellular as much as on wifi.
   *
   * The block itself stays. Rendering early would let a graded card interleave with this
   * function's read-compute-write and be clobbered by a snapshot taken before it. What can go
   * is the cost: for a returning learner with nothing new locally, every column already
   * matches and the whole thing collapses to one SELECT.
   *
   * Compared through a CANONICAL stringify because Postgres does not preserve JSONB key
   * order — a plain `JSON.stringify` comparison would report every column as changed on every
   * load and quietly restore the behaviour this removes.
   */
  const cloudCols = (cloud ?? {}) as Record<string, unknown>;
  let send = Object.fromEntries(
    Object.entries(columns).filter(([k, v]) => canonicalJson(v) !== canonicalJson(cloudCols[k] ?? null)),
  );
  for (let attempt = 0; Object.keys(send).length > 0 && attempt < Object.keys(columns).length; attempt++) {
    const { error } = await sb.from('user_data').upsert(
      { user_id: userId, ...send, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (!error) break;
    const missing = /Could not find the '(\w+)' column/.exec(error.message)?.[1];
    if (!missing || !(missing in send)) {
      console.error('[migrateLocalToCloud] sign-in migration failed', error.message);
      break;
    }
    console.warn(
      `[migrateLocalToCloud] no '${missing}' column — it stays on this device. ` +
      'Run supabase/migrations/ against this project.',
    );
    send = Object.fromEntries(Object.entries(send).filter(([k]) => k !== missing));
    if (Object.keys(send).length === 0) break;
  }

  await Promise.all([
    ...SUPPORTED_LANGS.map(l => local.saveVocabDeck(l, decks[l] ?? [])),
    ...SUPPORTED_LANGS.map(l => local.saveShelf(l, shelf[l] ?? [])),
    local.savePrefs(prefs),
    local.saveSRSState(srs),
    local.saveLessonsDone(lessonsDone),
  ]);
  setActivityLog(activity);
}
