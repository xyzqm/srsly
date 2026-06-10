'use client';
import { useState, useCallback } from 'react';
import type { DeckWord } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { toneNumToMark } from '@/lib/pinyin';
import AddWordForm from './AddWordForm';

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function VocabTab() {
  const { deck, addWord, removeWord, updateWord } = useVocabDeck();
  const [showAdd, setShowAdd] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

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
            {deck.length} word{deck.length === 1 ? '' : 's'} in your deck
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
        {deck.map((w, i) => (
          <div key={i}>
            {editingIdx === i ? (
              <div className="py-2">
                <EditRow
                  word={w}
                  onSave={update => handleSaveEdit(i, update)}
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
                    onClick={() => setEditingIdx(i)}
                    className="cursor-pointer transition-all duration-150 whitespace-nowrap"
                    style={btnGhost}
                    onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; (e.target as HTMLElement).style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--line)'; (e.target as HTMLElement).style.color = 'var(--ink-faint)'; }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeWord(i)}
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
        ))}
      </div>
    </div>
  );
}
