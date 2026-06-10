'use client';
import { useState, useCallback, useEffect } from 'react';
import type { PracticeMode } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { useDailyContent } from '@/hooks/useDailyContent';
import { storage } from '@/lib/storage';
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
  const { deck, addWord, updateWordReview } = useVocabDeck();
  const [mode, setMode] = useState<PracticeMode>('flash');

  // HSK level — start at 0 (same as ReadTab) so we don't load the wrong
  // level's cache before prefs arrive; useDailyContent skips when hskLevel=0
  const [hskLevel, setHskLevel] = useState(0);
  useEffect(() => {
    storage.getPrefs().then(p => setHskLevel(p.hskLevel ?? 4));
  }, []);

  // Daily AI-generated content
  const { dailyContent } = useDailyContent(hskLevel, deck);

  const handleAddVocab = useCallback((word: string, pinyin: string, meaning: string) => {
    addWord({ h: word, p: pinyin, m: meaning });
  }, [addWord]);

  // Stable key for the Conversation so it remounts when turns change
  const convoKey = dailyContent
    ? `ai-${dailyContent.date}-${hskLevel}`
    : `static-${hskLevel}`;

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
      </div>

      {mode === 'flash' && <Flashcards deck={deck} onDone={() => setMode('fill')} onGrade={updateWordReview} />}
      {mode === 'fill'  && (
        <FillInBlank
          onDone={() => setMode('convo')}
          deck={deck}
          onAddVocab={handleAddVocab}
          items={dailyContent?.fillItems}
        />
      )}
      {mode === 'convo' && (
        <Conversation
          key={convoKey}
          onScore={onScore}
          deck={deck}
          onAddVocab={handleAddVocab}
          turns={dailyContent?.conversation}
        />
      )}
    </div>
  );
}
