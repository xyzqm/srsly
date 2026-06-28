'use client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { toneNumToMark, checkPinyin } from '@/lib/pinyin';
import { lookupWord } from '@/lib/data/dict';
import { checkCompounds } from '@/lib/compounds';
import { POLYPHONES } from '@/lib/polyphones';
import { todayStr, dateInDays, deckNames, inSelectedDecks, decksSignature, isDueToday, isActive } from '@/lib/deck';
import { matchesSearch } from '@/lib/deckSearch';
import { storage } from '@/lib/storage';
import AddWordForm from './AddWordForm';
import ImportPanel from './ImportPanel';
import DeckSelector from '@/components/shared/DeckSelector';

const UNDO_DURATION_MS = 5000;

// ─── Pending-undo union type ──────────────────────────────────────────────────

type PendingUndo =
  | { kind: 'single'; word: DeckWord }
  | { kind: 'clear';  count: number; decks: string[] | null }; // null = delete all; [...] = untag these decks

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

function ActivatePoolBtn({ poolCount, onActivate }: { poolCount: number; onActivate: (n: number) => Promise<number> }) {
  const [n, setN] = useState(Math.min(5, poolCount));
  const [msg, setMsg] = useState('');
  return msg ? (
    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--jade)', letterSpacing: '.04em' }}>{msg}</span>
  ) : (
    <span className="inline-flex items-center gap-1.5">
      <label style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.04em', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 7, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        Activate
        <input
          type="number"
          value={n}
          min={1}
          max={poolCount}
          onChange={e => setN(Math.max(1, Math.min(poolCount, Number(e.target.value) || 1)))}
          style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)', outline: 'none', color: 'var(--accent)', width: '3.5ch', textAlign: 'center', padding: 0 }}
        />
      </label>
      <button
        onClick={() => onActivate(Math.min(n, poolCount)).then(released => {
          setMsg(`${released} word${released === 1 ? '' : 's'} added to today's queue`);
          setTimeout(() => setMsg(''), 2500);
        })}
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

interface EditRowProps {
  word: DeckWord;
  onSave: (update: Partial<DeckWord>) => void;
  onCancel: () => void;
}

function EditRow({ word, onSave, onCancel }: EditRowProps) {
  const [pinyin, setPinyin] = useState(word.p);
  const [meaning, setMeaning] = useState(word.m);
  const [compounds, setCompounds] = useState<string[]>(word.compounds ?? []);

  function handlePinyinBlur(val: string) {
    if (/[1-5]/.test(val)) setPinyin(toneNumToMark(val));
  }

  function addCompound() { setCompounds(c => [...c, '']); }
  function removeCompound(i: number) { setCompounds(c => c.filter((_, j) => j !== i)); }
  function setCompound(i: number, val: string) { setCompounds(c => c.map((v, j) => j === i ? val : v)); }

  async function handleSave() {
    const p = pinyin.trim();
    const known = [lookupWord(word.h).pinyin, ...(POLYPHONES[word.h]?.map(r => r.p) ?? [])].filter(Boolean);
    const warn = checkPinyin(p, word.h, known);
    if (warn && !window.confirm(warn)) return;
    const clean = compounds.map(c => c.trim()).filter(Boolean);
    const compWarn = await checkCompounds(word.h, clean);
    if (compWarn && !window.confirm(compWarn)) return;
    onSave({ p, m: meaning.trim(), compounds: clean.length ? clean : undefined });
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--f-mono)', fontSize: 13,
    background: 'var(--paper-2)', border: '1px solid var(--line)',
    borderRadius: 7, padding: '7px 10px', color: 'var(--ink)',
    width: '100%', outline: 'none', transition: 'border-color .15s',
  };

  const showCompounds = !!POLYPHONES[word.h] || compounds.length > 0;

  return (
    <div
      className="py-3 px-3 rounded-xl"
      style={{ background: 'var(--paper-2)', border: '1px dashed var(--line)', marginBottom: 4 }}
    >
      <div className="flex items-center gap-3 mb-2.5">
        <span style={{ fontFamily: 'var(--f-han)', fontSize: 26, fontWeight: 'var(--han-weight)' as 'bold', minWidth: 48 }}>
          {word.h}
        </span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          editing
        </span>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: '140px 1fr' }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 5 }}>
            Pinyin
          </div>
          <input
            value={pinyin}
            onChange={e => setPinyin(e.target.value)}
            onBlur={e => handlePinyinBlur(e.target.value)}
            style={{ ...inputStyle, letterSpacing: '.04em' }}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 5 }}>
            Meaning
          </div>
          <input
            value={meaning}
            onChange={e => setMeaning(e.target.value)}
            placeholder="shown separated by semicolons"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          />
        </div>
      </div>

      {/* Compounds — words that surface this reading in generated passages */}
      {showCompounds && (
        <div className="mt-2.5">
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 5 }}>
            Compounds{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>
              — words that use this reading; generated passages can use these to show it in context
            </span>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {compounds.map((c, i) => (
              <div key={i} className="flex items-center gap-1" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 7, padding: '3px 5px 3px 9px' }}>
                <input
                  value={c}
                  onChange={e => setCompound(i, e.target.value)}
                  placeholder=""
                  style={{ fontFamily: 'var(--f-han)', fontSize: 14, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', width: `${Math.max(c.length, 2) + 1}ch` }}
                />
                <button
                  onClick={() => removeCompound(i)}
                  className="shrink-0 cursor-pointer"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 13, background: 'none', border: 'none', color: 'var(--ink-faint)', width: 18, height: 18, borderRadius: 5 }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addCompound}
              className="cursor-pointer transition-all duration-150"
              style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.04em', background: 'none', border: '1px dashed var(--line)', color: 'var(--ink-faint)', borderRadius: 7, padding: '6px 10px' }}
            >
              + add compound
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          className="cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7,
            padding: '8px 16px', boxShadow: '0 1px 0 var(--accent-deep)',
          }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
            background: 'none', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 16px',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Inline undo bar ──────────────────────────────────────────────────────────

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
  deckOptions: string[];
  onPause: (paused: boolean) => void;
  onSnooze: () => void;
  onUnsnooze: () => void;
  onReschedule: (date: string) => void;
  onReset: () => void;
  onAddDeck: (deck: string) => void;
  onRemoveDeck: (deck: string) => void;
  onRelease?: () => void;
  onClose: () => void;
}

function CardManage({ word, today, deckOptions, onPause, onSnooze, onUnsnooze, onReschedule, onReset, onAddDeck, onRemoveDeck, onRelease, onClose }: CardManageProps) {
  const [addingDeck, setAddingDeck] = useState(false);
  const [deckDraft, setDeckDraft] = useState('');
  const wordDecks = word.decks ?? [];
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
        {/* Decks — a word can belong to several at once; chips remove, the input adds. */}
        <div className="inline-flex items-center gap-1.5 flex-wrap" style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.06em', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 6px' }}>
          <span style={{ marginRight: 1 }}>Decks</span>
          {wordDecks.map(d => (
            <span key={d} className="inline-flex items-center gap-1" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 5, padding: '2px 4px 2px 7px' }}>
              {d}
              <button onClick={() => onRemoveDeck(d)} title={`Remove from ${d}`} className="cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
          {wordDecks.length === 0 && !addingDeck && <span style={{ color: 'var(--ink-faint)' }}>none</span>}
          {addingDeck ? (
            <input
              autoFocus
              list="srsly-deck-names"
              value={deckDraft}
              placeholder="deck name"
              onChange={e => setDeckDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { onAddDeck(deckDraft); setDeckDraft(''); setAddingDeck(false); }
                if (e.key === 'Escape') { setDeckDraft(''); setAddingDeck(false); }
              }}
              onBlur={() => { if (deckDraft.trim()) onAddDeck(deckDraft); setDeckDraft(''); setAddingDeck(false); }}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 11, background: 'var(--paper-2)', border: '1px solid var(--accent)', borderRadius: 5, outline: 'none', color: 'var(--ink)', width: '11ch', padding: '1px 5px' }}
            />
          ) : (
            <button onClick={() => setAddingDeck(true)} title="Add to a deck" className="cursor-pointer" style={{ background: 'none', border: '1px dashed var(--line)', color: 'var(--ink-faint)', borderRadius: 5, padding: '2px 6px', fontSize: 11 }}>+</button>
          )}
          <datalist id="srsly-deck-names">{deckOptions.map(d => <option key={d} value={d} />)}</datalist>
        </div>
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

// ─── Bulk "add visible words to a deck" ───────────────────────────────────────
// Lets you tag everything currently shown into another deck (e.g. AP Chinese → Food,
// or All → AP Chinese) without leaving the view.

function AddToDeckButton({ count, options, onAdd }: {
  count: number;
  options: string[]; // decks the words aren't already all in
  onAdd: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (count === 0) return null;

  return (
    <div ref={ref} className="ml-auto" style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer transition-all duration-150"
        style={{
          fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.04em',
          background: 'none', color: 'var(--accent)',
          border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
          borderRadius: 7, padding: '5px 11px',
        }}
      >
        + Add {count} to deck ▾
      </button>
      {open && (
        <div className="vocab-menu" style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 30,
          minWidth: 160, background: 'var(--card)', border: '1px solid var(--line)',
          borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,.14)', padding: 4, transformOrigin: 'top right',
        }}>
          {options.map(d => (
            <button key={d} onClick={() => { onAdd(d); setOpen(false); }}
              className="cursor-pointer" style={{
                display: 'block', width: '100%', textAlign: 'left',
                fontFamily: 'var(--f-mono)', fontSize: 11.5, background: 'none', color: 'var(--ink)',
                border: 'none', borderRadius: 6, padding: '7px 9px',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => { const n = window.prompt('New deck name'); if (n && n.trim()) onAdd(n.trim()); setOpen(false); }}
            className="cursor-pointer" style={{
              display: 'block', width: '100%', textAlign: 'left',
              fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)',
              background: 'none', border: 'none', borderTop: options.length ? '1px solid var(--line-soft)' : 'none',
              borderRadius: 6, padding: '7px 9px', marginTop: options.length ? 2 : 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            + New deck…
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface VocabTabProps {
  /** Launch a focused, session-only study session scoped to these decks (routes to Practice).
   *  'flash' reviews due cards; 'cram' drills the whole deck ignoring due dates. */
  onStudyDeck: (decks: string[], mode: 'flash' | 'cram') => void;
}

export default function VocabTab({ onStudyDeck }: VocabTabProps) {
  const {
    deck, addWord, addWords, removeWord, updateWord, clearDeck,
    toggleFocus, setPaused, snoozeWord, unsnoozeWord, rescheduleWord, resetProgress,
    addWordToDeck, removeWordFromDeck, addWordsToDeck,
    resumeAll, unsnoozeAll, unfocusAll, clearWordsDeck, releaseFromPool,
  } = useVocabDeck();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'due' | 'soon' | 'new' | 'pool' | 'focus' | 'forgotten' | 'leech' | 'paused' | 'snoozed'>('all');
  const [query, setQuery] = useState('');
  const today = todayStr();

  // BROWSE-ONLY deck filter — scopes this management list only. It deliberately does NOT
  // touch study state (Read/Practice always pull the global queue unless you hit "Study this
  // deck"). Kept local + ephemeral: starts at "all decks" each visit. null = all · [] = none.
  const [studyDecks, setStudyDecks] = useState<string[] | null>(null);
  const [customDecks, setCustomDecks] = useState<string[]>([]);
  const [addingDeck, setAddingDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  useEffect(() => { storage.getPrefs().then(p => setCustomDecks(p.decks ?? [])); }, []);

  const changeStudyDecks = useCallback((next: string[] | null) => setStudyDecks(next), []);

  // The one specific deck when exactly one real deck is selected (else null). Drives
  // single-deck affordances: import tagging, delete-deck, "add to THIS deck" defaults.
  const singleDeck = studyDecks && studyDecks.length === 1 && studyDecks[0] ? studyDecks[0] : null;
  // Real decks (drop the '' default) currently filtered to — the target of "Study this deck".
  const browsingDecks = (studyDecks ?? []).filter(Boolean);

  // All deck names = explicitly-created decks ∪ decks derived from words.
  const allDeckNames = useMemo(
    () => [...new Set([...customDecks, ...deckNames(deck)])].sort((a, b) => a.localeCompare(b)),
    [customDecks, deck],
  );

  // Persist the explicit deck-name list (so empty decks survive a reload) and set the local
  // browse selection. The selection itself is not persisted — it's a browse filter.
  const saveDeckState = useCallback((names: string[], selected: string[] | null) => {
    setCustomDecks(names);
    setStudyDecks(selected);
    storage.getPrefs().then(p => storage.savePrefs({ ...p, decks: names.length ? names : undefined }));
  }, []);

  const createDeck = useCallback((raw: string) => {
    const name = raw.trim();
    setAddingDeck(false);
    setNewDeckName('');
    if (!name) return;
    const names = allDeckNames.includes(name) ? customDecks : [...customDecks, name];
    saveDeckState(names, [name]); // select just the new deck
  }, [allDeckNames, customDecks, saveDeckState]);

  const deleteDeck = useCallback(async (name: string) => {
    if (!name) return;
    if (!window.confirm(`Delete the deck “${name}”? Its words stay in your collection but lose this deck tag.`)) return;
    await clearWordsDeck(name);
    saveDeckState(customDecks.filter(d => d !== name), null); // back to all decks
  }, [clearWordsDeck, customDecks, saveDeckState]);

  // ── Unified undo state ──────────────────────────────────────────────────────
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [undoProgress, setUndoProgress] = useState(1); // 1 = full, 0 = expired
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef       = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Keep fresh refs so timer closures never go stale
  const removeWordRef     = useRef(removeWord);
  const clearDeckRef      = useRef(clearDeck);
  const clearWordsDeckRef = useRef(clearWordsDeck);
  const pendingUndoRef    = useRef<PendingUndo | null>(null);
  const deckRef           = useRef(deck);
  useEffect(() => { removeWordRef.current     = removeWord;     }, [removeWord]);
  useEffect(() => { clearDeckRef.current      = clearDeck;      }, [clearDeck]);
  useEffect(() => { clearWordsDeckRef.current = clearWordsDeck; }, [clearWordsDeck]);
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
    } else if (pending.decks) {
      // scoped clear — untag each selected deck (cards stay in your collection)
      pending.decks.forEach(d => clearWordsDeckRef.current(d));
    } else {
      clearDeckRef.current(); // all decks → delete everything
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
    setEditingIdx(null);
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
    // Scope the clear to the selected deck(s). "All decks" deletes the cards outright;
    // a specific deck selection only removes those deck tags (cards stay).
    const scoped = deck.filter(w => inSelectedDecks(w, studyDecks));
    const count = scoped.length;
    if (count === 0) return;
    const isAll = studyDecks == null;
    const realDecks = isAll ? null : studyDecks.filter(Boolean); // drop the '' default
    if (!isAll && (!realDecks || realDecks.length === 0)) return; // nothing to untag (default-only)
    const where = realDecks
      ? (realDecks.length === 1 ? `the “${realDecks[0]}” deck` : `${realDecks.length} decks`)
      : '';
    const msg = isAll
      ? `Delete all ${count} words from your collection? You'll have 5 seconds to undo.`
      : `Remove all ${count} words from ${where}? They stay in your collection. 5 seconds to undo.`;
    if (!window.confirm(msg)) return;
    startUndo({ kind: 'clear', count, decks: realDecks });
  }, [deck, studyDecks, startUndo]);

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
    } else if (pending.decks) {
      pending.decks.forEach(d => clearWordsDeckRef.current(d));
    } else {
      clearDeckRef.current();
    }
  }, []);

  // ── Display deck ────────────────────────────────────────────────────────────
  const displayDeck = useMemo(() => {
    if (!pendingUndo) return deck;
    if (pendingUndo.kind === 'single') return deck.filter(w => w.id !== pendingUndo.word.id);
    // pending clear — hide words in the cleared decks (or everything for an all-decks clear)
    if (pendingUndo.decks) return deck.filter(w => !inSelectedDecks(w, pendingUndo.decks));
    return [];
  }, [deck, pendingUndo]);

  // Scope to the selected deck(s) first, then apply the focus/paused/snoozed chip filter.
  const deckScoped = useMemo(
    () => displayDeck.filter(w => inSelectedDecks(w, studyDecks)),
    [displayDeck, studyDecks],
  );
  const isNewCard = (w: DeckWord) => !w.pool && (w.reviews ?? 0) === 0 && w.stability === undefined;
  const chipFiltered = useMemo(() => {
    switch (filter) {
      case 'due':       return deckScoped.filter(w => isDueToday(w, today));
      case 'soon':      { const lim = dateInDays(7); return deckScoped.filter(w => !!w.dueAt && w.dueAt > today && w.dueAt <= lim && isActive(w, today)); }
      case 'new':       return deckScoped.filter(isNewCard);
      case 'pool':      return deckScoped.filter(w => !!w.pool);
      case 'focus':     return deckScoped.filter(w => w.focus);
      case 'forgotten': return deckScoped.filter(w => (w.lapses ?? 0) > 0);
      case 'leech':     return deckScoped.filter(w => w.leech);
      case 'paused':    return deckScoped.filter(w => w.paused);
      case 'snoozed':   return deckScoped.filter(w => !!w.snoozeUntil && w.snoozeUntil > today);
      default:          return deckScoped;
    }
  }, [deckScoped, filter, today]);

  // The text box narrows further (plain text; power-user operators still parse).
  const visibleDeck = useMemo(
    () => (query.trim() ? chipFiltered.filter(w => matchesSearch(w, query, today)) : chipFiltered),
    [chipFiltered, query, today],
  );

  // Counts for the filter chips (within the selected deck)
  const counts = useMemo(() => {
    const soonLim = dateInDays(7);
    return ({
    due:       deckScoped.filter(w => isDueToday(w, today)).length,
    soon:      deckScoped.filter(w => !!w.dueAt && w.dueAt > today && w.dueAt <= soonLim && isActive(w, today)).length,
    new:       deckScoped.filter(isNewCard).length,
    pool:      deckScoped.filter(w => !!w.pool).length,
    focus:     deckScoped.filter(w => w.focus).length,
    forgotten: deckScoped.filter(w => (w.lapses ?? 0) > 0).length,
    leech:     deckScoped.filter(w => w.leech).length,
    paused:    deckScoped.filter(w => w.paused).length,
    snoozed:   deckScoped.filter(w => !!w.snoozeUntil && w.snoozeUntil > today).length,
    });
  }, [deckScoped, today]);

  // ── Other handlers ──────────────────────────────────────────────────────────
  // A single word typed in by hand is due today (you added it deliberately to study now).
  function handleAdd(word: DeckWord) {
    addWord(word);
    setShowAdd(false);
  }

  // Bulk imports go to the pool — words stay inactive until explicitly released into circulation.
  async function handleBulkImport(words: Array<{ h: string; p: string; m: string }>) {
    // Staged in the pool AND tagged with the deck you're focused on (only when exactly one
    // deck is selected); existing words just gain the tag (no dupes). Otherwise untagged.
    await addWords(words.map(w => ({ h: w.h, p: w.p, m: w.m, pool: true })), singleDeck ?? undefined);
    setShowImport(false);
  }

  const handleSaveEdit = useCallback((idx: number, update: Partial<DeckWord>) => {
    updateWord(idx, update);
    setEditingIdx(null);
  }, [updateWord]);

  const btnGhost: React.CSSProperties = {
    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em',
    background: 'none', border: '1px solid var(--line)', color: 'var(--ink-faint)',
    borderRadius: 7, padding: '5px 11px', cursor: 'pointer',
  };

  // Show clear button only when there are words and no full-deck clear is pending
  const showClearBtn = !showAdd && deckScoped.length > 0 && pendingUndo?.kind !== 'clear';

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
            {allDeckNames.length > 0 && (
              <DeckSelector deck={deck} customDecks={customDecks} selected={studyDecks} onChange={changeStudyDecks} />
            )}
            {addingDeck ? (
              <input
                autoFocus
                value={newDeckName}
                onChange={e => setNewDeckName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createDeck(newDeckName); if (e.key === 'Escape') { setAddingDeck(false); setNewDeckName(''); } }}
                onBlur={() => createDeck(newDeckName)}
                placeholder="deck name"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 11, background: 'var(--paper-2)', border: '1px solid var(--accent)', borderRadius: 7, padding: '5px 9px', color: 'var(--ink)', outline: 'none', width: 130 }}
              />
            ) : (
              <button onClick={() => { setAddingDeck(true); setNewDeckName(''); }} style={btnGhost} title="Create a new deck">
                + New deck
              </button>
            )}
            {singleDeck && !addingDeck && (
              <button
                onClick={() => deleteDeck(singleDeck)}
                style={{ ...btnGhost }}
                title={`Delete deck ${singleDeck}`}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink-faint)'; }}
              >
                Delete deck
              </button>
            )}
            {browsingDecks.length > 0 && !addingDeck && (() => {
              const label = singleDeck ?? `${browsingDecks.length} decks`;
              return (
                <>
                  <button
                    onClick={() => onStudyDeck(browsingDecks, 'flash')}
                    className="cursor-pointer transition-all duration-150"
                    title="Review this deck's due cards in a focused session"
                    style={{
                      fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 500,
                      background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7,
                      padding: '6px 13px', boxShadow: '0 1px 0 var(--accent-deep)',
                    }}
                  >
                    ▸ Study {label}
                  </button>
                  <button
                    onClick={() => onStudyDeck(browsingDecks, 'cram')}
                    className="cursor-pointer transition-all duration-150"
                    title="Drill the whole deck now, ignoring due dates (doesn't change scheduling)"
                    style={{
                      fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 500,
                      background: 'none', color: 'var(--accent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)', borderRadius: 7,
                      padding: '6px 13px',
                    }}
                  >
                    ⚡ Cram {label}
                  </button>
                </>
              );
            })()}
          </div>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
            {deckScoped.length} word{deckScoped.length === 1 ? '' : 's'}
            {singleDeck ? <> in <strong>{singleDeck}</strong></>
              : studyDecks == null ? ' in your deck'
              : studyDecks.length === 0 ? ' — no decks selected'
              : <> in <strong>{studyDecks.filter(Boolean).length} decks</strong></>}
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
        <AddWordForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} deckOptions={allDeckNames} defaultDeck={singleDeck ?? ''} />
      )}

      {showImport && (
        <ImportPanel deck={deck} studyDeck={singleDeck ?? ''} onImport={handleBulkImport} onCancel={() => setShowImport(false)} />
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
        {deckScoped.length > 0 && (
          <div className="relative pt-3">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search words — hanzi, pinyin, or meaning"
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
        {deckScoped.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 py-3" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            {([
              ['all', `All ${deckScoped.length}`],
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
            {filter === 'pool'    && counts.pool    > 0 && <ActivatePoolBtn poolCount={counts.pool} onActivate={releaseFromPool} />}
            {filter === 'focus'   && counts.focus   > 0 && <BulkBtn label="Unfocus all"   onClick={unfocusAll} />}
            {filter === 'paused'  && counts.paused  > 0 && <BulkBtn label="Resume all"    onClick={resumeAll} />}
            {filter === 'snoozed' && counts.snoozed > 0 && <BulkBtn label="Un-snooze all" onClick={unsnoozeAll} />}
            {/* Add everything currently shown to another deck */}
            <AddToDeckButton
              count={visibleDeck.length}
              options={allDeckNames.filter(d => !(studyDecks ?? []).includes(d))}
              onAdd={name => addWordsToDeck(visibleDeck.map(w => w.id!).filter(Boolean), name)}
            />
          </div>
        )}

        {/* Cross-fade the whole list (rows + empty states) when the deck changes. */}
        <CrossFade id={decksSignature(studyDecks) || 'all'}>
        {visibleDeck.map((w) => {
          // Map display index back to real deck index for editing/saving
          const realIdx = deck.findIndex(d => d.id === w.id);
          const snoozed  = !!w.snoozeUntil && w.snoozeUntil > today;
          const managing = managingId === w.id;
          return (
            <div key={w.id}>
              {editingIdx === realIdx ? (
                <div className="py-2">
                  <EditRow
                    word={w}
                    onSave={update => handleSaveEdit(realIdx, update)}
                    onCancel={() => setEditingIdx(null)}
                  />
                </div>
              ) : (
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
                      {!singleDeck && w.decks?.map(d => <StatusChip key={d} label={d} />)}
                      {w.pool && <StatusChip label="pool" />}
                      {w.leech && <StatusChip label="stuck" />}
                      {w.paused && <StatusChip label="paused" />}
                      {snoozed && <StatusChip label={`snoozed → ${w.snoozeUntil}`} />}
                    </span>
                    <div className="flex gap-1.5 items-center">
                      <button
                        onClick={() => w.id && toggleFocus(w.id)}
                        title={w.focus ? 'Remove focus' : 'Mark as focus'}
                        className="cursor-pointer transition-all duration-150"
                        style={{ background: 'none', border: 'none', fontSize: 17, lineHeight: 1, padding: '2px 4px', color: w.focus ? 'var(--gold)' : 'var(--ink-faint)' }}
                      >
                        {w.focus ? '★' : '☆'}
                      </button>
                      <button
                        onClick={() => setEditingIdx(realIdx)}
                        className="cursor-pointer transition-all duration-150 whitespace-nowrap"
                        style={btnGhost}
                        onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; (e.target as HTMLElement).style.color = 'var(--accent)'; }}
                        onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--line)'; (e.target as HTMLElement).style.color = 'var(--ink-faint)'; }}
                      >
                        Edit
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
                      deckOptions={allDeckNames}
                      onPause={(p) => setPaused(w.id!, p)}
                      onSnooze={() => snoozeWord(w.id!)}
                      onUnsnooze={() => unsnoozeWord(w.id!)}
                      onReschedule={(d) => rescheduleWord(w.id!, d)}
                      onReset={() => resetProgress(w.id!)}
                      onAddDeck={(d) => addWordToDeck(w.id!, d)}
                      onRemoveDeck={(d) => removeWordFromDeck(w.id!, d)}
                      onRelease={w.pool ? () => { releaseFromPool(1); setManagingId(null); } : undefined}
                      onClose={() => setManagingId(null)}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}

        {displayDeck.length === 0 && !pendingUndo && (
          <p style={{ color: 'var(--ink-faint)', fontSize: 14, padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
            Your deck is empty. Add words from the Read tab or above.
          </p>
        )}
        {displayDeck.length > 0 && deckScoped.length === 0 && studyDecks != null && (
          <p style={{ color: 'var(--ink-faint)', fontSize: 14, padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
            {singleDeck
              ? <>No words in <strong>{singleDeck}</strong> yet — add a word above (it&apos;ll default to this deck), or assign one via Manage.</>
              : 'No words in the selected decks. Pick different decks above, or assign words via Manage.'}
          </p>
        )}
        {deckScoped.length > 0 && visibleDeck.length === 0 && (
          <p style={{ color: 'var(--ink-faint)', fontSize: 14, padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
            {query.trim() ? `No words match “${query.trim()}”.` : `No ${filter === 'leech' ? 'stuck' : filter} words.`}
          </p>
        )}
        </CrossFade>
      </div>}
    </div>
  );
}
