'use client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { toneNumToMark, checkPinyin } from '@/lib/pinyin';
import { lookupWord } from '@/lib/data/dict';
import { checkCompounds } from '@/lib/compounds';
import { POLYPHONES } from '@/lib/polyphones';
import { todayStr, dateInDays, isDueToday, isActive } from '@/lib/deck';
import { matchesSearch, searchRank } from '@/lib/deckSearch';
import { storage } from '@/lib/storage';
import { RECOMMENDED_POOL_ACTIVATE } from '@/lib/fsrs';
import AddWordForm from './AddWordForm';
import ImportPanel from './ImportPanel';

const UNDO_DURATION_MS = 5000;

/** Sort key: due-now → future dates → paused/snoozed → pool */
function dueSortKey(w: DeckWord, today: string): string {
  if (w.pool)                                        return '\xff\xff';
  if (w.paused)                                      return '\xfe\xfe';
  if (!!w.snoozeUntil && w.snoozeUntil > today)      return '\xfd' + (w.snoozeUntil ?? '');
  if (!w.dueAt || w.dueAt <= today)                  return '';
  return w.dueAt;
}

/** Human label for time to next review, shown inline in the word row. */
function dueLabel(w: DeckWord, today: string): string | null {
  if (w.pool || w.paused)                            return null;
  if (!!w.snoozeUntil && w.snoozeUntil > today)      return null;
  if (!w.dueAt || w.dueAt <= today)                  return 'now';
  // Days difference between dueAt and today
  const ms = new Date(w.dueAt).getTime() - new Date(today).getTime();
  const days = Math.round(ms / 86_400_000);
  return `${days}d`;
}

// ─── Pending-undo union type ──────────────────────────────────────────────────

type PendingUndo =
  | { kind: 'single'; word: DeckWord }
  | { kind: 'clear';  count: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sdm(m: string) {
  // Split on either separator (older cards use commas, newer use semicolons).
  return m.split(/\s*[;,]\s*/).filter(Boolean).map((part, i, arr) => (
    <span key={i}>
      {part}
      {i < arr.length - 1 && (
        <span style={{ fontFamily: 'var(--f-display)', fontSize: '1.15em', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--ink-soft)' }}>; </span>
      )}
    </span>
  ));
}

function ActivatePoolBtn({ poolCount, onActivate, onUndo }: {
  poolCount: number;
  onActivate: (n: number) => Promise<string[]>;
  onUndo: (ids: string[]) => Promise<void>;
}) {
  // Held as a STRING, not a number. Clamping on every keystroke made the field impossible
  // to type into: with `Number(e.target.value) || 1` an empty field snapped back to 1, so
  // you could never clear it to type a new value, and two-digit entries were fought
  // character by character. Validation happens once, on submit.
  // Seeded from the learner's setting (Settings → Activate from pool), read once on mount.
  const [draft, setDraft] = useState(String(RECOMMENDED_POOL_ACTIVATE));
  useEffect(() => {
    void storage.getPrefs().then(p => {
      if (p.poolActivateCount) setDraft(String(p.poolActivateCount));
    });
  }, []);
  const [undo, setUndo] = useState<{ ids: string[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const n = Math.max(1, Math.min(poolCount, parseInt(draft, 10) || 1));

  const activate = () => {
    void onActivate(n).then(ids => {
      if (ids.length === 0) return;
      setUndo({ ids });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndo(null), 8000);
    });
  };

  if (undo) {
    return (
      <span className="inline-flex items-center gap-2" style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.04em' }}>
        <span style={{ color: 'var(--jade)' }}>
          {undo.ids.length} word{undo.ids.length === 1 ? '' : 's'} added to today&apos;s queue
        </span>
        <button
          onClick={() => { void onUndo(undo.ids); setUndo(null); if (timer.current) clearTimeout(timer.current); }}
          className="cursor-pointer"
          style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 7, padding: '4px 10px' }}
        >
          Undo
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <label style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.04em', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 7, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        Activate
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          aria-label={`How many of the ${poolCount} pooled words to activate`}
          onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          onBlur={() => setDraft(String(n))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setDraft(String(n)); activate(); } }}
          // Wide enough for four digits. `type=text` rather than `number` on purpose: the
          // number spinner ate most of the box, which is why a two-digit entry showed only
          // its last character.
          style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)', outline: 'none', color: 'var(--accent)', width: '4.5ch', textAlign: 'center', padding: 0 }}
        />
        <span style={{ color: 'var(--ink-faint)' }}>of {poolCount}</span>
      </label>
      <button
        onClick={activate}
        className="cursor-pointer"
        style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.06em', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 11px' }}
      >
        Add to queue
      </button>
    </span>
  );
}

function BulkBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ml-auto cursor-pointer transition-all duration-150"
      style={{
        fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.04em',
        background: 'none', color: 'var(--accent)',
        border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
        borderRadius: 7, padding: '5px 11px',
      }}
    >
      {label}
    </button>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span style={{ marginLeft: 8, fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', background: 'var(--line-soft)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{label}</span>
  );
}

// ─── Inline edit row ──────────────────────────────────────────────────────────

interface UndoBarProps {
  pending: PendingUndo;
  onUndo: () => void;
  /** 0–1, drives the progress bar */
  progress: number;
}

function UndoBar({ pending, onUndo, progress }: UndoBarProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl mb-1"
      style={{
        background: 'var(--ink)',
        color: 'var(--paper)',
        position: 'relative',
        overflow: 'hidden',
        animation: 'rise .18s cubic-bezier(.2,.8,.3,1)',
      }}
    >
      {/* Progress bar draining across the bottom */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0,
          height: 2,
          width: `${progress * 100}%`,
          background: 'var(--accent)',
          transition: 'width .1s linear',
          borderRadius: 1,
        }}
      />

      {/* Message */}
      <div className="flex items-baseline gap-2 flex-1 min-w-0">
        {pending.kind === 'single' ? (
          <>
            <span style={{ fontFamily: 'var(--f-han)', fontSize: 18, fontWeight: 'var(--han-weight)' as 'bold', opacity: 0.95, flexShrink: 0 }}>
              {pending.word.h}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, opacity: 0.45, letterSpacing: '.03em' }}>
              removed
            </span>
          </>
        ) : (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 500, opacity: 0.8, letterSpacing: '.02em' }}>
            {pending.count} word{pending.count === 1 ? '' : 's'} cleared
          </span>
        )}
      </div>

      <button
        onClick={onUndo}
        className="cursor-pointer transition-all duration-150"
        style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600,
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6,
          padding: '6px 14px', flexShrink: 0,
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        Undo
      </button>
    </div>
  );
}

// ─── Card management panel (Details + Pause / Snooze / Reschedule / Reset) ──────

interface CardManageProps {
  word: DeckWord;
  today: string;
  onPause: (paused: boolean) => void;
  onSnooze: () => void;
  onUnsnooze: () => void;
  onReschedule: (date: string) => void;
  onReset: () => void;
  onRelease?: () => void;
  onClose: () => void;
}

function CardManage({ word, today, onPause, onSnooze, onUnsnooze, onReschedule, onReset, onRelease, onClose }: CardManageProps) {
  const snoozed = !!word.snoozeUntil && word.snoozeUntil > today;
  const status =
    word.pool ? 'In pool'
    : word.paused ? 'Paused'
    : snoozed ? `Snoozed → ${word.snoozeUntil}`
    : word.phase === 'learning' ? 'Learning'
    : (word.reviews ?? 0) === 0 && word.stability === undefined ? 'New'
    : 'In review';

  const stat = (label: string, value: string) => (
    <div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--ink)', marginTop: 2 }}>{value}</div>
    </div>
  );

  const actBtn = (label: string, onClick: () => void, tone: 'normal' | 'danger' | 'ghost' = 'normal') => (
    <button
      onClick={onClick}
      className="cursor-pointer transition-all duration-150 whitespace-nowrap"
      style={{
        fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.06em',
        background: 'none', borderRadius: 7, padding: '7px 12px',
        border: `1px solid ${tone === 'danger' ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--line)'}`,
        color: tone === 'danger' ? 'var(--accent)' : tone === 'ghost' ? 'var(--ink-faint)' : 'var(--ink-soft)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl px-4 py-3.5 mb-1" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(74px, 1fr))', gap: 12, marginBottom: 14 }}>
        {stat('Status', status)}
        {stat('Reviews', String(word.reviews ?? 0))}
        {stat('Lapses', String(word.lapses ?? 0))}
        {stat('Due', word.dueAt ?? 'now')}
        {word.stability !== undefined && stat('Stability', `${word.stability.toFixed(1)}d`)}
        {word.difficulty !== undefined && stat('Difficulty', word.difficulty.toFixed(1))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {word.pool && onRelease && actBtn('Release now', onRelease)}
        {!word.pool && (word.paused ? actBtn('Resume', () => onPause(false)) : actBtn('Pause', () => onPause(true)))}
        {!word.pool && (snoozed ? actBtn('Un-snooze', onUnsnooze) : actBtn('Snooze to tomorrow', onSnooze))}
        <label className="inline-flex items-center gap-1.5" style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 8px' }}>
          Reschedule
          <input
            type="date"
            value={word.dueAt ?? ''}
            min={today}
            onChange={e => { if (e.target.value) onReschedule(e.target.value); }}
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)' }}
          />
        </label>
        {actBtn('Reset progress', onReset, 'danger')}
        <div className="ml-auto">{actBtn('Close', onClose, 'ghost')}</div>
      </div>
    </div>
  );
}

// ─── Cross-fade wrapper ───────────────────────────────────────────────────────
// Keyed by `id` (the selected deck). When the deck changes, the previous render is
// kept mounted underneath, fading out, while the new one fades in on top — so the list
// never blanks. Re-renders with the same id (search/edit) update in place, no fade.

function CrossFade({ id, children }: { id: string; children: React.ReactNode }) {
  // The current layer always renders live `children`. We only snapshot the OUTGOING
  // node tree (from the last committed render) when `id` changes — comparing the string
  // `id`, never `children` identity (which is new every render and would loop forever).
  const [prev, setPrev] = useState<{ id: string; node: React.ReactNode } | null>(null);
  const lastId   = useRef(id);
  const lastNode = useRef<React.ReactNode>(children);

  if (id !== lastId.current) {
    setPrev({ id: lastId.current, node: lastNode.current });
    lastId.current = id;
  }
  lastNode.current = children;

  return (
    <div style={{ position: 'relative' }}>
      {prev && (
        <div key={`prev-${prev.id}`} className="xfade-out" aria-hidden
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {prev.node}
        </div>
      )}
      <div
        key={`cur-${id}`}
        className={prev ? 'xfade-in' : undefined}
        onAnimationEnd={e => { if (e.target === e.currentTarget) setPrev(null); }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface VocabTabProps {
  /** Hand off to the Practice tab. 'flash' reviews what is due; 'cram' drills the whole
   *  deck ignoring due dates. */
  onStudy: (mode: 'flash' | 'cram') => void;
}

export default function VocabTab({ onStudy }: VocabTabProps) {
  const language = useLanguage();
  const {
    deck, addWord, addWords, removeWord, clearDeck,
    toggleFocus, setPaused, snoozeWord, unsnoozeWord, rescheduleWord, resetProgress,
    resumeAll, unsnoozeAll, unfocusAll, releaseFromPool, restoreToPool, releaseWord,
  } = useVocabDeck(language);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'due' | 'soon' | 'new' | 'pool' | 'focus' | 'forgotten' | 'leech' | 'paused' | 'snoozed'>('all');
  const [query, setQuery] = useState('');
  const today = todayStr();

  // ── Unified undo state ──────────────────────────────────────────────────────
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [undoProgress, setUndoProgress] = useState(1); // 1 = full, 0 = expired
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef       = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Keep fresh refs so timer closures never go stale
  const removeWordRef     = useRef(removeWord);
  const clearDeckRef      = useRef(clearDeck);
  const pendingUndoRef    = useRef<PendingUndo | null>(null);
  const deckRef           = useRef(deck);
  useEffect(() => { removeWordRef.current     = removeWord;     }, [removeWord]);
  useEffect(() => { clearDeckRef.current      = clearDeck;      }, [clearDeck]);
  useEffect(() => { pendingUndoRef.current    = pendingUndo;    }, [pendingUndo]);
  useEffect(() => { deckRef.current           = deck;          }, [deck]);

  // Drain the progress bar each animation frame while an undo is pending
  useEffect(() => {
    if (!pendingUndo) { setUndoProgress(1); return; }
    startTimeRef.current = performance.now();
    setUndoProgress(1);

    function tick() {
      const elapsed = performance.now() - startTimeRef.current;
      const remaining = Math.max(0, 1 - elapsed / UNDO_DURATION_MS);
      setUndoProgress(remaining);
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [pendingUndo]);

  /** Commit whatever is pending to storage, then clear pending state. */
  const commitPending = useCallback((pending: PendingUndo) => {
    if (pending.kind === 'single') {
      const idx = deck.findIndex(w => w.id === pending.word.id);
      if (idx !== -1) removeWordRef.current(idx);
    } else {
      clearDeckRef.current();
    }
  }, [deck]);

  /** Start a new undo window, committing any previous pending action first. */
  const startUndo = useCallback((next: PendingUndo) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (pendingUndo) commitPending(pendingUndo);
    }
    setPendingUndo(next);
    timerRef.current = setTimeout(() => {
      commitPending(next);
      setPendingUndo(null);
      timerRef.current = null;
    }, UNDO_DURATION_MS);
  }, [pendingUndo, commitPending]);

  const handleUndo = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPendingUndo(null);
  }, []);

  const handleRemove  = useCallback((word: DeckWord) => startUndo({ kind: 'single', word }), [startUndo]);
  const handleClearAll = useCallback(() => {
    const count = deck.length;
    if (count === 0) return;
    if (!window.confirm(`Delete all ${count} words from your deck? You'll have 5 seconds to undo.`)) return;
    startUndo({ kind: 'clear', count });
  }, [deck, startUndo]);

  // Clean up on unmount — cancel animation frame, and COMMIT any pending deletion
  // so switching tabs before the timer expires still removes the word.
  useEffect(() => () => {
    if (rafRef.current   !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const pending = pendingUndoRef.current;
    if (!pending) return;
    if (pending.kind === 'single') {
      const idx = deckRef.current.findIndex(w => w.id === pending.word.id);
      if (idx !== -1) removeWordRef.current(idx);
    } else {
      clearDeckRef.current();
    }
  }, []);

  // ── Display deck ────────────────────────────────────────────────────────────
  const displayDeck = useMemo(() => {
    if (!pendingUndo) return deck;
    if (pendingUndo.kind === 'single') return deck.filter(w => w.id !== pendingUndo.word.id);
    return []; // pending clear — the whole deck is on its way out
  }, [deck, pendingUndo]);
  const isNewCard = (w: DeckWord) => !w.pool && (w.reviews ?? 0) === 0 && w.stability === undefined;
  const chipFiltered = useMemo(() => {
    switch (filter) {
      case 'due':       return displayDeck.filter(w => isDueToday(w, today));
      case 'soon':      { const lim = dateInDays(7); return displayDeck.filter(w => !!w.dueAt && w.dueAt > today && w.dueAt <= lim && isActive(w, today)); }
      case 'new':       return displayDeck.filter(isNewCard);
      case 'pool':      return displayDeck.filter(w => !!w.pool);
      case 'focus':     return displayDeck.filter(w => w.focus);
      case 'forgotten': return displayDeck.filter(w => (w.lapses ?? 0) > 0);
      case 'leech':     return displayDeck.filter(w => w.leech);
      case 'paused':    return displayDeck.filter(w => w.paused);
      case 'snoozed':   return displayDeck.filter(w => !!w.snoozeUntil && w.snoozeUntil > today);
      default:          return displayDeck;
    }
  }, [displayDeck, filter, today]);

  // The text box narrows further (plain text; power-user operators still parse).
  const visibleDeck = useMemo(() => {
    if (!query.trim()) {
      return [...chipFiltered].sort((a, b) => dueSortKey(a, today).localeCompare(dueSortKey(b, today)));
    }
    // With a query, relevance leads and the due order is only the tiebreak. Sorting purely
    // by due date made the word you actually typed land wherever the scheduler put it.
    const filtered = chipFiltered.filter(w => matchesSearch(w, query, today));
    return filtered
      .map(w => ({ w, rank: searchRank(w, query) }))
      .sort((a, b) => b.rank - a.rank || dueSortKey(a.w, today).localeCompare(dueSortKey(b.w, today)))
      .map(x => x.w);
  }, [chipFiltered, query, today]);

  // Counts for the filter chips (within the selected deck)
  const counts = useMemo(() => {
    const soonLim = dateInDays(7);
    return ({
    due:       displayDeck.filter(w => isDueToday(w, today)).length,
    soon:      displayDeck.filter(w => !!w.dueAt && w.dueAt > today && w.dueAt <= soonLim && isActive(w, today)).length,
    new:       displayDeck.filter(isNewCard).length,
    pool:      displayDeck.filter(w => !!w.pool).length,
    focus:     displayDeck.filter(w => w.focus).length,
    forgotten: displayDeck.filter(w => (w.lapses ?? 0) > 0).length,
    leech:     displayDeck.filter(w => w.leech).length,
    paused:    displayDeck.filter(w => w.paused).length,
    snoozed:   displayDeck.filter(w => !!w.snoozeUntil && w.snoozeUntil > today).length,
    });
  }, [displayDeck, today]);

  // ── Other handlers ──────────────────────────────────────────────────────────
  // A single word typed in by hand is due today (you added it deliberately to study now).
  function handleAdd(word: DeckWord) {
    addWord(word);
    setShowAdd(false);
  }

  // Bulk imports go to the pool — words stay inactive until explicitly released into circulation.
  async function handleBulkImport(words: Array<{ h: string; p: string; m: string }>) {
    await addWords(words.map(w => ({ h: w.h, p: w.p, m: w.m, pool: true })));
    setShowImport(false);
  }

  const btnGhost: React.CSSProperties = {
    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em',
    background: 'none', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--line)', color: 'var(--ink-faint)',
    borderRadius: 7, padding: '5px 11px', cursor: 'pointer',
  };

  // Show clear button only when there are words and no full-deck clear is pending
  const showClearBtn = !showAdd && displayDeck.length > 0 && pendingUndo?.kind !== 'clear';

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        My deck
      </div>
      <div className="flex justify-between items-end flex-wrap gap-3 my-2 mb-6">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>Word deck</span>
            {deck.length > 0 && (
              <>
                <button
                  onClick={() => onStudy('flash')}
                  className="cursor-pointer transition-all duration-150"
                  title="Review the cards that are due"
                  style={{
                    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 500,
                    background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7,
                    padding: '6px 13px', boxShadow: '0 1px 0 var(--accent-deep)',
                  }}
                >
                  ▸ Study
                </button>
                <button
                  onClick={() => onStudy('cram')}
                  className="cursor-pointer transition-all duration-150"
                  title="Drill the whole deck now, ignoring due dates (doesn't change scheduling)"
                  style={{
                    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 500,
                    background: 'none', color: 'var(--accent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)', borderRadius: 7,
                    padding: '6px 13px',
                  }}
                >
                  ⚡ Cram
                </button>
              </>
            )}
          </div>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
            {displayDeck.length} word{displayDeck.length === 1 ? '' : 's'} in your deck
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showClearBtn && (
            <button
              onClick={handleClearAll}
              className="cursor-pointer transition-all duration-150"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
                background: 'none', color: 'var(--ink-faint)', border: '1px solid var(--line)', borderRadius: 8,
                padding: '11px 16px',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink-faint)'; }}
            >
              Clear all
            </button>
          )}
          {!showAdd && !showImport && (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 cursor-pointer transition-all duration-150"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)',
              }}
            >
              Import
            </button>
          )}
          {!showAdd && !showImport && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 cursor-pointer transition-all duration-150"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)',
              }}
            >
              + Add word
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <AddWordForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
      )}

      {showImport && (
        <ImportPanel deck={deck} onImport={handleBulkImport} onCancel={() => setShowImport(false)} />
      )}

      {!showImport && <div style={{ borderTop: '1px solid var(--line-soft)' }}>
        {/* Inline undo bar — appears at the top of the list, never covers other rows */}
        {pendingUndo && (
          <UndoBar
            pending={pendingUndo}
            onUndo={handleUndo}
            progress={undoProgress}
          />
        )}

        {/* Search — text + is:/lapses>/deck: filters */}
        {displayDeck.length > 0 && (
          <div className="relative pt-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search words — ${getLanguageConfig(language).hasReadings ? `word, ${getLanguageConfig(language).readingLabel.toLowerCase()}, or meaning` : 'word or meaning'}`}
              style={{
                width: '100%', fontFamily: 'var(--f-mono)', fontSize: 12.5,
                background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8,
                padding: '9px 30px 9px 12px', color: 'var(--ink)', outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--line)'; }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                title="Clear search"
                className="absolute cursor-pointer"
                style={{ right: 8, top: '50%', transform: 'translateY(-30%)', background: 'none', border: 'none', color: 'var(--ink-faint)', fontSize: 16, lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Filter chips — always shown (when the deck has words) so you can always
            switch back to the full deck, even after emptying a filtered view. */}
        {displayDeck.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            {([
              ['all', `All ${displayDeck.length}`],
              ['due', `Due ${counts.due}`],
              ['soon', `Due soon ${counts.soon}`],
              ['new', `New ${counts.new}`],
              ['pool', `Pool ${counts.pool}`],
              ['focus', `★ Focus ${counts.focus}`],
              ['forgotten', `Forgotten ${counts.forgotten}`],
              ['leech', `Stuck ${counts.leech}`],
              ['paused', `Paused ${counts.paused}`],
              ['snoozed', `Snoozed ${counts.snoozed}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className="cursor-pointer transition-all duration-150"
                style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.04em',
                  background: filter === key ? 'var(--ink)' : 'none',
                  color: filter === key ? 'var(--paper)' : 'var(--ink-faint)',
                  border: `1px solid ${filter === key ? 'var(--ink)' : 'var(--line)'}`,
                  borderRadius: 7, padding: '5px 11px',
                }}
              >
                {label}
              </button>
            ))}
            {/* Bulk action for the active filter */}
            {filter === 'pool'    && counts.pool    > 0 && <ActivatePoolBtn poolCount={counts.pool} onActivate={releaseFromPool} onUndo={restoreToPool} />}
            {filter === 'focus'   && counts.focus   > 0 && <BulkBtn label="Unfocus all"   onClick={unfocusAll} />}
            {filter === 'paused'  && counts.paused  > 0 && <BulkBtn label="Resume all"    onClick={resumeAll} />}
            {filter === 'snoozed' && counts.snoozed > 0 && <BulkBtn label="Un-snooze all" onClick={unsnoozeAll} />}
          </div>
        )}

        {/* Cross-fade the whole list (rows + empty states) when the deck changes. */}
        <CrossFade id={language}>
        {visibleDeck.map((w) => {
          const snoozed  = !!w.snoozeUntil && w.snoozeUntil > today;
          const managing = managingId === w.id;
          return (
            <div key={w.id}>
              <>
                  <div
                    className="grid items-center gap-4 py-3 px-1"
                    style={{ gridTemplateColumns: 'auto 1fr auto', borderBottom: managing ? 'none' : '1px solid var(--line-soft)', opacity: (w.paused || w.pool) ? 0.55 : 1 }}
                  >
                    <span style={{ fontFamily: 'var(--f-han)', fontSize: 23, fontWeight: 'var(--han-weight)' as 'bold', minWidth: 60 }}>
                      {w.h}
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--ink)' }}>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', marginRight: 8 }}>{w.p}</span>
                      {sdm(w.m)}
                      {w.pool && <StatusChip label="pool" />}
                      {w.leech && <StatusChip label="stuck" />}
                      {w.paused && <StatusChip label="paused" />}
                      {snoozed && <StatusChip label={`snoozed → ${w.snoozeUntil}`} />}
                    </span>
                    <div className="flex gap-1.5 items-center">
                      {(() => { const lbl = dueLabel(w, today); return lbl ? (
                        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.04em', color: lbl === 'now' ? 'var(--accent)' : 'var(--ink-faint)', minWidth: 24, textAlign: 'right' }}>
                          {lbl}
                        </span>
                      ) : null; })()}
                      <button
                        onClick={() => w.id && toggleFocus(w.id)}
                        title={w.focus ? 'Remove focus' : 'Mark as focus'}
                        className="cursor-pointer transition-all duration-150"
                        style={{ background: 'none', border: 'none', fontSize: 17, lineHeight: 1, padding: '2px 4px', color: w.focus ? 'var(--gold)' : 'var(--ink-faint)' }}
                      >
                        {w.focus ? '★' : '☆'}
                      </button>
                      <button
                        onClick={() => setManagingId(managing ? null : (w.id ?? null))}
                        className="cursor-pointer transition-all duration-150 whitespace-nowrap"
                        style={managing ? { ...btnGhost, borderColor: 'var(--accent)', color: 'var(--accent)' } : btnGhost}
                        onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; (e.target as HTMLElement).style.color = 'var(--accent)'; }}
                        onMouseLeave={e => { if (!managing) { (e.target as HTMLElement).style.borderColor = 'var(--line)'; (e.target as HTMLElement).style.color = 'var(--ink-faint)'; } }}
                      >
                        Manage
                      </button>
                      <button
                        onClick={() => handleRemove(w)}
                        className="cursor-pointer transition-all duration-150 whitespace-nowrap"
                        style={btnGhost}
                        onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; (e.target as HTMLElement).style.color = 'var(--accent)'; }}
                        onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--line)'; (e.target as HTMLElement).style.color = 'var(--ink-faint)'; }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {managing && w.id && (
                    <CardManage
                      word={w}
                      today={today}
                      onPause={(p) => setPaused(w.id!, p)}
                      onSnooze={() => snoozeWord(w.id!)}
                      onUnsnooze={() => unsnoozeWord(w.id!)}
                      onReschedule={(d) => rescheduleWord(w.id!, d)}
                      onReset={() => resetProgress(w.id!)}
                      onRelease={w.pool ? () => { releaseWord(w.id!); setManagingId(null); } : undefined}
                      onClose={() => setManagingId(null)}
                    />
                  )}
              </>
            </div>
          );
        })}

        {displayDeck.length === 0 && !pendingUndo && (
          <p style={{ color: 'var(--ink-faint)', fontSize: 14, padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
            Your deck is empty. Add words from the Read tab or above.
          </p>
        )}
        {displayDeck.length > 0 && visibleDeck.length === 0 && (
          <p style={{ color: 'var(--ink-faint)', fontSize: 14, padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
            {query.trim() ? `No words match “${query.trim()}”.` : `No ${filter === 'leech' ? 'stuck' : filter} words.`}
          </p>
        )}
        </CrossFade>
      </div>}
    </div>
  );
}
