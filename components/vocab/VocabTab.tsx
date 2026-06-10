'use client';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { toneNumToMark } from '@/lib/pinyin';
import AddWordForm from './AddWordForm';

const UNDO_DURATION_MS = 5000;

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

// ─── Undo toast ───────────────────────────────────────────────────────────────

interface UndoToastProps {
  word: DeckWord;
  onUndo: () => void;
  /** 0–1, drives the progress bar */
  progress: number;
}

function UndoToast({ word, onUndo, progress }: UndoToastProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 mt-6"
      style={{
        background: 'var(--ink)',
        color: 'var(--paper)',
        boxShadow: '0 4px 16px rgba(0,0,0,.18)',
        animation: 'rise .2s cubic-bezier(.2,.8,.3,1)',
        position: 'relative',
        overflow: 'hidden',
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

      <span style={{ fontFamily: 'var(--f-han)', fontSize: 20, fontWeight: 'var(--han-weight)' as 'bold', opacity: 0.9 }}>
        {word.h}
      </span>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, opacity: 0.55, flex: 1 }}>
        removed from deck
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
  const { deck, addWord, removeWord, updateWord } = useVocabDeck();
  const [showAdd, setShowAdd] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // ── Undo state ──────────────────────────────────────────────────────────────
  // `pendingRemoval`: the word soft-deleted from the UI but not yet removed from storage.
  const [pendingRemoval, setPendingRemoval] = useState<DeckWord | null>(null);
  const [undoProgress, setUndoProgress] = useState(1); // 1 = full, 0 = expired
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef      = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  // Always-fresh reference to removeWord so the timeout closure doesn't go stale
  const removeWordRef = useRef(removeWord);
  useEffect(() => { removeWordRef.current = removeWord; }, [removeWord]);

  // Drain the progress bar each animation frame while a removal is pending
  useEffect(() => {
    if (!pendingRemoval) { setUndoProgress(1); return; }
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
  }, [pendingRemoval]);

  /** Actually commit the pending deletion to storage. */
  const commitRemoval = useCallback((word: DeckWord) => {
    // Find by hanzi — works even if deck shifted (words added/removed elsewhere)
    const idx = (deck).findIndex(w => w.h === word.h);
    if (idx !== -1) removeWordRef.current(idx);
  }, [deck]);

  const handleRemove = useCallback((word: DeckWord) => {
    // If there's already a pending removal, commit it immediately before starting a new one
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (pendingRemoval) commitRemoval(pendingRemoval);
    }

    setPendingRemoval(word);
    // Cancel any in-progress edit
    setEditingIdx(null);

    timerRef.current = setTimeout(() => {
      commitRemoval(word);
      setPendingRemoval(null);
      timerRef.current = null;
    }, UNDO_DURATION_MS);
  }, [pendingRemoval, commitRemoval]);

  const handleUndo = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPendingRemoval(null);
  }, []);

  // Clean up timer on unmount
  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  // ── Display deck (hide the pending removal) ────────────────────────────────
  const displayDeck = useMemo(
    () => pendingRemoval ? deck.filter(w => w.h !== pendingRemoval.h) : deck,
    [deck, pendingRemoval],
  );

  // ── Other handlers ─────────────────────────────────────────────────────────
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

      {showAdd && (
        <AddWordForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
      )}

      <div style={{ borderTop: '1px solid var(--line-soft)' }}>
        {displayDeck.map((w, i) => {
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

        {displayDeck.length === 0 && !pendingRemoval && (
          <p style={{ color: 'var(--ink-faint)', fontSize: 14, padding: '24px 0', textAlign: 'center', fontStyle: 'italic' }}>
            Your deck is empty. Add words from the Read tab or above.
          </p>
        )}
      </div>

      {/* Undo toast */}
      {pendingRemoval && (
        <UndoToast
          word={pendingRemoval}
          onUndo={handleUndo}
          progress={undoProgress}
        />
      )}
    </div>
  );
}
