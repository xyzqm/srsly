'use client';
import { useState } from 'react';
import type { PracticeMode } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import Flashcards from './Flashcards';
import FillInBlank from './FillInBlank';
import Conversation from './Conversation';

const MODES: { id: PracticeMode; label: string }[] = [
  { id: 'flash', label: 'Flashcards' },
  { id: 'fill',  label: 'Fill-in-the-blank' },
  { id: 'convo', label: 'Conversation' },
];

interface Props { onScore: (score: number) => void; }

export default function ExtrasTab({ onScore }: Props) {
  const { deck, updateWordReview } = useVocabDeck();
  const [mode, setMode] = useState<PracticeMode>('flash');
  const [showPinyin, setShowPinyin] = useState(false);

  const toggleStyle = (on: boolean) => ({
    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' as const,
    background: on ? 'var(--card)' : 'none',
    color: on ? 'var(--accent)' : 'var(--ink-soft)',
    boxShadow: on ? '0 1px 3px rgba(0,0,0,.07)' : 'none',
    border: 'none', borderRadius: 7, padding: '9px 15px', cursor: 'pointer', fontWeight: on ? 500 : undefined,
    transition: 'all .15s',
  });

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      {/* Mode switcher */}
      <div className="inline-flex gap-1 p-[5px] rounded-[11px] mb-6 flex-wrap" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={toggleStyle(mode === m.id)}>{m.label}</button>
        ))}
        {mode !== 'convo' && (
          <button
            onClick={() => setShowPinyin(v => !v)}
            style={{
              ...toggleStyle(showPinyin),
              marginLeft: 4,
              background: showPinyin ? 'var(--ink)' : 'none',
              color: showPinyin ? 'var(--paper)' : 'var(--ink-soft)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontFamily: 'var(--f-han)', fontSize: 13 }}>拼</span> Pinyin
          </button>
        )}
      </div>

      {mode === 'flash' && <Flashcards deck={deck} onDone={() => setMode('fill')} onGrade={updateWordReview} />}
      {mode === 'fill'  && <FillInBlank onDone={() => setMode('convo')} showPinyin={showPinyin} deck={deck} />}
      {mode === 'convo' && <Conversation showPinyin={showPinyin} onScore={onScore} deck={deck} />}
    </div>
  );
}
