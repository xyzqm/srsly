'use client';
import { useCallback, useEffect, useState } from 'react';
import { storage } from '@/lib/storage';
import { useAuth } from '@/lib/auth/AuthProvider';
import { SUPPORTED_LANGUAGES, getLanguageConfig } from '@/lib/languageConfig';
import { isMastered } from '@/lib/achievements';
import { isActive } from '@/lib/deck';
import { loadUserKey, loadProvider, maskKey, type ProviderId } from '@/lib/userApiKey';
import { providerOrDefault } from '@/lib/aiProviders';
import type { LanguageCode } from '@/lib/types';

/**
 * WHO YOU ARE, WHAT IS ON THIS DEVICE, AND WHETHER ANY OF IT IS STUCK.
 *
 * This replaced a single sentence — "Signed in as you — synced across devices" — which is the
 * one claim on the screen that a learner has no way to check and every reason to want to.
 * "Synced" was printed whether or not anything had ever reached the cloud, so it read as
 * reassurance rather than as a report, and would have said exactly the same thing on a device
 * with a week of reviews queued behind a dead connection.
 *
 * **EVERYTHING HERE IS DERIVED, AND NOTHING IS NEW STATE.** The counts are the decks the app
 * already holds, the sync line is `storage.pendingColumns()` reading a queue that already
 * exists, and the key row is the same `loadUserKey()` the panel below it reads. Nothing is
 * stored to render this screen, which is why it cannot drift out of agreement with the things
 * it describes.
 *
 * ONE READ SHOWN TWICE IS NOT TWO RECORDS. The key appears here as a status and in
 * `ApiKeyPanel` as a control, both from `loadUserKey()`. An overview that stayed silent about
 * the one setting most likely to be the reason someone opened this screen would be a worse
 * overview, and a second STORED copy is what the rule in CLAUDE.md is actually about.
 *
 * They still had to be told when to look. One source cannot make them disagree about what is
 * true, but reading it at two different moments can: this panel reads on mount, so connecting
 * a key in the control below left the summary an inch above it still saying "No key" for the
 * rest of the visit — which is not distinguishable, from the outside, from a save that failed.
 * `keySeq` is the nudge, and it is a signal rather than a second copy of the value.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED: there is no "last synced at". The storage layer records
 * no such timestamp, and inventing one would mean writing a new field on every save — a
 * second record of a fact, to decorate a screen. "Nothing is waiting" is the honest and
 * genuinely useful form of the same reassurance, and it is derived.
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;

/**
 * Column names as a learner would say them. The keys are the jsonb columns in
 * `supabase/schema.sql`; an unmapped one falls back to its own name rather than vanishing,
 * because a queue entry nobody can read is still better evidence than no line at all.
 */
const COLUMN_NAMES: Record<string, string> = {
  deck: 'vocabulary',
  decks: 'vocabulary',
  prefs: 'settings',
  srs_state: 'streak and scheduling',
  passage_state: "today's blanks",
  shelf: 'book shelf',
  activity_log: 'review history',
  review_counts: "today's totals",
  lessons_done: 'finished lessons',
  drill_state: 'handwriting and conjugation',
};

interface DeckLine {
  code: LanguageCode;
  name: string;
  total: number;
  active: number;
  mastered: number;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2" style={{ borderBottom: '1px solid var(--line-soft)' }}>
      <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', minWidth: 104 }}>
        {label}
      </span>
      <span className="flex-1" style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
        {children}
      </span>
    </div>
  );
}

interface Props {
  languages: LanguageCode[];
  /** Opens the sign-in modal. Only reachable while signed out. */
  onSignIn: () => void;
  /**
   * Bumped by `ApiKeyPanel` whenever the connected key changes, which re-reads this panel.
   *
   * The key row here and the control below it read the same `loadUserKey()`, so they cannot
   * be wrong about different things — but this one reads it on mount, so without a nudge they
   * disagree for the rest of the visit the moment a key is connected.
   */
  keySeq?: number;
}

export default function AccountPanel({ languages, onSignIn, keySeq = 0 }: Props) {
  const { enabled: authEnabled, signedIn, user, signOut } = useAuth();
  const [decks, setDecks] = useState<DeckLine[] | null>(null);
  const [streak, setStreak] = useState<{ streak: number; sessions: number } | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyProvider, setKeyProvider] = useState<ProviderId>('anthropic');
  const [pending, setPending] = useState<string[]>([]);
  const [flushing, setFlushing] = useState(false);

  /**
   * Counted across EVERY supported language, not just the ones currently added.
   *
   * Removing a language in Settings hides it and deliberately keeps its deck — the copy two
   * sections down promises that re-adding it "finds everything where you left it". A summary
   * that counted only the added ones would quietly contradict that promise for anyone who had
   * ever removed one, and this screen is exactly where someone goes to check.
   */
  const load = useCallback(async () => {
    const lines: DeckLine[] = [];
    for (const cfg of SUPPORTED_LANGUAGES) {
      try {
        const deck = await storage.getVocabDeck(cfg.code);
        if (!deck.length) continue;
        lines.push({
          code: cfg.code,
          name: cfg.name,
          total: deck.length,
          // NOT point-free: `isActive(w, today)` takes a date second, and `.filter(isActive)`
          // hands it the array index instead — every word after the first compared against
          // "1", "2", "3". It typechecks in plain JS and silently miscounts.
          active: deck.filter(w => isActive(w)).length,
          mastered: deck.filter(isMastered).length,
        });
      } catch { /* a language that cannot be read is left out rather than shown as empty */ }
    }
    setDecks(lines);
    const srs = await storage.getSRSState();
    setStreak({ streak: srs.streak ?? 0, sessions: srs.sessions ?? 0 });
    setApiKey(loadUserKey());
    setKeyProvider(loadProvider());
    setPending(storage.pendingColumns());
  }, []);

  /**
   * Re-read when the set of languages changes, keyed on the JOINED list rather than the array.
   *
   * `languages` is rebuilt on every render of the parent, so the array itself is a new
   * reference each time and would re-run this on every keystroke elsewhere in Settings.
   * Extracted to a variable because a dependency array cannot be checked statically when it
   * holds an expression.
   */
  const languageKey = languages.join(',');
  useEffect(() => { void load(); }, [load, languageKey, keySeq]);

  async function retrySync() {
    setFlushing(true);
    try {
      await storage.flush();
    } finally {
      setPending(storage.pendingColumns());
      setFlushing(false);
    }
  }

  const totalWords = decks?.reduce((n, d) => n + d.total, 0) ?? 0;
  const totalMastered = decks?.reduce((n, d) => n + d.mastered, 0) ?? 0;

  return (
    <div className="mb-10" style={{ maxWidth: 560 }}>
      {/*
        THE SPACE BESIDE THE HEADING NOW CARRIES THE ACTION.
        The rows below are a two-column table — label left, value right — and the heading sat
        above them with the same rule under it and nothing on its right, so it read as a table
        header with an empty cell. Reported as "how come to the right of Account there's
        nothing". The sign in / sign out control was at the very BOTTOM of a long panel, which
        is the other half of the same problem: the one thing anybody comes to this section to
        do was the last thing they could reach. One move fixes both.
      */}
      {/*
        IT LINES UP WITH THE COLUMN BELOW IT, NOT WITH THE RIGHT EDGE.
        The first pass used `justify-between`, which flung the button to the far side of a
        560px panel — technically "beside the heading" and visually a lone control adrift from
        everything it belongs to. The rows underneath are label / value at a fixed 104px
        gutter, so giving the heading the SAME gutter puts the button at the head of the value
        column: directly above "a guest", reading down with the answers rather than across an
        empty gap. `minWidth` is the shared number, matching `Row` exactly.
      */}
      <div className="flex items-baseline gap-3" style={{ marginBottom: 12 }}>
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', minWidth: 104 }}>
          Account
        </span>
        {authEnabled && (
          <button
            onClick={signedIn ? signOut : onSignIn}
            className="cursor-pointer transition-all duration-150 rounded-[9px]"
            style={signedIn
              ? { ...mono, fontSize: 11.5, letterSpacing: '.04em', background: 'var(--card)', color: 'var(--ink-soft)', border: '1px solid var(--line)', padding: '7px 12px' }
              : { ...mono, fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 14px', boxShadow: '0 2px 0 var(--accent-deep)' }}
          >
            {signedIn ? 'Sign out' : 'Sign in'}
          </button>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--line-soft)' }}>
        <Row label={signedIn ? 'Signed in' : 'Studying as'}>
          {signedIn
            ? <strong style={{ fontWeight: 500 }}>{user?.email ?? 'your account'}</strong>
            : <>a guest — everything works, and it all lives on this device</>}
        </Row>

        {/* ── Sync ──────────────────────────────────────────────────────────
            Three genuinely different states, said differently. A guest is not "out of sync";
            they have nothing to sync to, which is a choice rather than a fault. */}
        <Row label="Sync">
          {!authEnabled ? (
            <span style={{ color: 'var(--ink-soft)' }}>Off in this build — nothing leaves the device.</span>
          ) : !signedIn ? (
            <span style={{ color: 'var(--ink-soft)' }}>
              Not syncing. Sign in and this deck comes with you to your other devices.
            </span>
          ) : pending.length === 0 ? (
            <span style={{ color: 'var(--jade)' }}>Up to date — nothing is waiting to be sent.</span>
          ) : (
            <span className="flex items-center gap-2 flex-wrap">
              <span style={{ color: 'var(--gold)' }}>
                Waiting to send: {pending.map(c => COLUMN_NAMES[c] ?? c).join(', ')}. Safe on this
                device, and sent automatically when the connection returns.
              </span>
              <button
                onClick={retrySync}
                disabled={flushing}
                className="cursor-pointer disabled:opacity-40 disabled:cursor-default"
                style={{ ...mono, fontSize: 11, background: 'none', border: '1px solid var(--line)', borderRadius: 7, padding: '5px 10px', color: 'var(--ink-soft)' }}
              >
                {flushing ? 'Sending…' : 'Try now'}
              </button>
            </span>
          )}
        </Row>

        <Row label="AI passages">
          {apiKey === null ? (
            <span style={{ color: 'var(--ink-faint)' }}>—</span>
          ) : apiKey ? (
            <>
              <span style={{ color: 'var(--jade)' }}>
                {providerOrDefault(keyProvider).name}
                {providerOrDefault(keyProvider).freeTier ? ' — free tier, no bill' : ' — billed to you'}
              </span>
              <span style={{ ...mono, fontSize: 12, color: 'var(--ink-faint)', marginLeft: 8 }}>
                {maskKey(apiKey, keyProvider)}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--ink-soft)' }}>
              No key — everything except writing a new passage still works. Google and Groq
              both give one out free; add it below.
            </span>
          )}
        </Row>

        {/* ── Decks ─────────────────────────────────────────────────────────
            `decks === null` is "not read yet" and `[]` is "genuinely nothing saved". Rendering
            one as the other is the mistake CLAUDE.md names four times over, and here it would
            tell a learner holding 500 words that they hold none. */}
        <Row label="Vocabulary">
          {decks === null ? (
            <span style={{ color: 'var(--ink-faint)' }}>Counting…</span>
          ) : decks.length === 0 ? (
            <span style={{ color: 'var(--ink-soft)' }}>
              Nothing saved yet. Tap a word while reading and press Add to deck.
            </span>
          ) : (
            <span className="flex flex-col gap-1">
              {decks.map(d => (
                <span key={d.code} style={{ fontSize: 13 }}>
                  <span style={{ fontFamily: 'var(--f-han)', marginRight: 6 }}>
                    {getLanguageConfig(d.code).nativeName}
                  </span>
                  <span style={{ color: 'var(--ink-soft)' }}>{d.name}</span>
                  <span style={{ ...mono, fontSize: 12, marginLeft: 8 }}>
                    {d.total} word{d.total === 1 ? '' : 's'}
                  </span>
                  <span style={{ ...mono, fontSize: 11.5, color: 'var(--ink-faint)', marginLeft: 8 }}>
                    {d.active} in circulation · {d.mastered} held
                  </span>
                </span>
              ))}
              {decks.length > 1 && (
                <span style={{ ...mono, fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>
                  {totalWords} in total, {totalMastered} held for a month or more
                </span>
              )}
            </span>
          )}
        </Row>

        <Row label="Record">
          {streak === null ? (
            <span style={{ color: 'var(--ink-faint)' }}>—</span>
          ) : (
            /* "review sessions" was the SECOND copy of a label Stats has already had to fix.
               `useSRS` bumps this only on the first score of a day, so it counts days studied
               and never sessions — and a number that means one thing in two places under two
               names is how a reader stops trusting either. */
            <span style={{ ...mono, fontSize: 12.5 }}>
              {streak.streak} day streak · {streak.sessions} day
              {streak.sessions === 1 ? '' : 's'} studied
            </span>
          )}
        </Row>
      </div>

      {/* ── What travels and what does not ────────────────────────────────────
          Stated because two of these surprise people, and a missing book reads as a bug
          rather than as a decision. The reasons are in CLAUDE.md; the short forms are here. */}
      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.6, marginTop: 14, maxWidth: '54ch' }}>
        Syncing covers your words, scheduling, settings, shelf, finished lessons and handwriting
        progress. Three things stay on this device on purpose:{' '}
        <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>book files</strong>, because
        an EPUB is someone else&apos;s copyrighted file and uploading it would break the promise
        the reader makes;{' '}
        <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>your API key</strong>, which
        belongs to the browser it was typed into; and{' '}
        <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>your chosen voice</strong>,
        because installed voices differ from device to device.
      </p>

      {/* The BUTTON moved to the heading; the reassurance that makes signing out safe to press
          stays here, where it is read rather than where it would crowd the control. */}
      {authEnabled && signedIn && (
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 14 }}>
          Signing out leaves your deck in the cloud; it comes back when you sign in again.
        </p>
      )}
    </div>
  );
}
