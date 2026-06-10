'use client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { toneNumToMark } from '@/lib/pinyin';
import AddWordForm from './AddWordForm';

const UNDO_DURATION_MS = 5000;

// ─── Pending-undo union type ──────────────────────────────────────────────────

type PendingUndo =
  | { kind: 'single'; word: DeckWord }
  | { kind: 'clear';  count: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sdm(m: string) {
  return m.split(', ').map((part, i, arr) => (
    <span key={i}>
      {part}
      {i < arr.length - 1 && (
        <span style={{ fontFamily: 'var(--f-display)', fontSize: '1.15em', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--ink-soft)' }}>, </span>
      )}
    </span>
  ));
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

  function handlePinyinBlur(val: string) {
    if (/[1-5]/.test(val)) setPinyin(toneNumToMark(val));
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--f-mono)', fontSize: 13,
    background: 'var(--paper-2)', border: '1px solid var(--line)',
    borderRadius: 7, padding: '7px 10px', color: 'var(--ink)',
    width: '100%', outline: 'none', transition: 'border-color .15s',
  };

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
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ p: pinyin.trim(), m: meaning.trim() })}
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
  const label = pending.kind === 'clear'
    ? `${pending.count} word${pending.count === 1 ? '' : 's'} cleared`
    : `${pending.word.h} removed`;

  return (
    <div
      className="flex items-center gap-3 px-3 py-3 rounded-xl mb-1"
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
      <span style={{
        fontFamily: pending.kind === 'clear' ? 'var(--f-mono)' : 'var(--f-han)',
        fontSize: pending.kind === 'clear' ? 13 : 20,
        fontWeight: pending.kind === 'clear' ? 500 : ('var(--han-weight)' as 'bold'),
        opacity: 0.9,
        letterSpacing: pending.kind === 'clear' ? '.02em' : undefined,
      }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, opacity: 0.45, flex: 1 }}>
        — undo?
      </span>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function VocabTab() {
  const { deck, addWord, removeWord, updateWord, clearDeck } = useVocabDeck();
  const [showAdd, setShowAdd] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // ── Unified undo state ──────────────────────────────────────────────────────
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [undoProgress, setUndoProgress] = useState(1); // 1 = full, 0 = expired
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef       = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Keep fresh refs so timer closures never go stale
  const removeWordRef = useRef(removeWord);
  const clearDeckRef  = useRef(clearDeck);
  useEffect(() => { removeWordRef.current = removeWord; }, [removeWord]);
  useEffect(() => { clearDeckRef.current  = clearDeck;  }, [clearDeck]);

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
      const idx = deck.findIndex(w => w.h === pending.word.h);
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
    const count = deck.length;
    if (count === 0) return;
    if (!window.confirm(`Remove all ${count} words from your deck? You'll have 5 seconds to undo.`)) return;
    startUndo({ kind: 'clear', count });
  }, [deck.length, startUndo]);

  // Clean up timer on unmount
  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  // ── Display deck ────────────────────────────────────────────────────────────
  const displayDeck = useMemo(() => {
    if (!pendingUndo) return deck;
    if (pendingUndo.kind === 'single') return deck.filter(w => w.h !== pendingUndo.word.h);
    return []; // pending clear — show empty
  }, [deck, pendingUndo]);

  // ── Other handlers ──────────────────────────────────────────────────────────
  function handleAdd(word: DeckWord) {
    addWord(word);
    setShowAdd(false);
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
  const showClearBtn = !showAdd && deck.length > 0 && pendingUndo?.kind !== 'clear';

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
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>Word deck</div>
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
          {!showAdd && (
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

      <div style={{ borderTop: '1px solid var(--line-soft)' }}>
        {/* Inline undo bar — appears at the top of the list, never covers other rows */}
        {pendingUndo && (
          <UndoBar
            pending={pendingUndo}
            onUndo={handleUndo}
            progress={undoProgress}
          />
        )}

        {displayDeck.map((w) => {
          // Map display index back to real deck index for editing/saving
          const realIdx = deck.findIndex(d => d.h === w.h);
          return (
            <div key={w.h}>
              {editingIdx === realIdx ? (
                <div className="py-2">
                  <EditRow
                    word={w}
                    onSave={update => handleSaveEdit(realIdx, update)}
                    onCancel={() => setEditingIdx(null)}
                  />
                </div>
              ) : (
                <div
                  className="grid items-center gap-4 py-3 px-1"
                  style={{ gridTemplateColumns: 'auto 1fr auto', borderBottom: '1px solid var(--line-soft)' }}
                >
                  <span style={{ fontFamily: 'var(--f-han)', fontSize: 23, fontWeight: 'var(--han-weight)' as 'bold', minWidth: 60 }}>
                    {w.h}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--ink)' }}>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', marginRight: 8 }}>{w.p}</span>
                    {sdm(w.m)}
                  </span>
                  <div className="flex gap-1.5">
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
              )}
            </div>
          );
        })}

        {displayDeck.length === 0 && !pendingUndo && (
          <p style={{ color: 'var(--ink-faint)', fontSize: 14, padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
            Your deck is empty. Add words from the Read tab or above.
          </p>
        )}
      </div>
    </div>
  );
}
