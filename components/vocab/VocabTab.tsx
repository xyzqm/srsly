'use client';
import { useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import AddWordForm from './AddWordForm';

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

export default function VocabTab() {
  const { deck, addWord, removeWord } = useVocabDeck();
  const [showAdd, setShowAdd] = useState(false);

  function handleAdd(word: DeckWord) {
    addWord(word);
    setShowAdd(false);
  }

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
          <div
            key={i}
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
            <button
              onClick={() => removeWord(i)}
              className="cursor-pointer transition-all duration-150 whitespace-nowrap"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em',
                background: 'none', border: '1px solid var(--line)', color: 'var(--ink-faint)',
                borderRadius: 7, padding: '6px 12px',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent)'; (e.target as HTMLElement).style.color = 'var(--accent)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--line)'; (e.target as HTMLElement).style.color = 'var(--ink-faint)'; }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="text-center mt-6 text-xs" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', letterSpacing: '.04em' }}>
        srsly. · one interval at a time
      </div>
    </div>
  );
}
