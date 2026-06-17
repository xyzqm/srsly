'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import type { PracticeMode, ContentSection } from '@/lib/types';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { useDailyContent } from '@/hooks/useDailyContent';
import { storage } from '@/lib/storage';
import { inStudyDeck } from '@/lib/deck';
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
  const { deck, deckLoaded, addWord, gradeCard, updateWordReview } = useVocabDeck();
  const [mode, setMode] = useState<PracticeMode>('flash');

  // HSK level — start at 0 (same as ReadTab) so we don't load the wrong
  // level's cache before prefs arrive; useDailyContent skips when hskLevel=0
  const [hskLevel, setHskLevel] = useState(0);
  const [studyDeck, setStudyDeck] = useState('');
  useEffect(() => {
    storage.getPrefs().then(p => { setHskLevel(p.hskLevel ?? 4); setStudyDeck(p.studyDeck ?? ''); });
  }, []);

  // Review (flashcards) is scoped to the selected deck. Fill/conversation use the
  // same scoped deck for their due-word checks.
  const scopedDeck = useMemo(() => deck.filter(w => inStudyDeck(w, studyDeck)), [deck, studyDeck]);

  // Generate only the block the active mode needs: Fill → fill, Convo → convo,
  // Flashcards → nothing. The hook generates lazily and caches per day.
  const want = useMemo<ContentSection[]>(
    () => (mode === 'fill' ? ['fill'] : mode === 'convo' ? ['convo'] : []),
    [mode],
  );
  const { dailyContent, generating } = useDailyContent(hskLevel, deck, studyDeck, want);

  const handleAddVocab = useCallback((word: string, pinyin: string, meaning: string) => {
    addWord({ h: word, p: pinyin, m: meaning });
  }, [addWord]);

  // Stable key for the Conversation so it remounts when the turns change — include
  // whether the convo block is AI-generated so it remounts when lazy AI turns arrive.
  const convoKey = dailyContent
    ? `${dailyContent.sections?.convo ? 'ai' : 'static'}-${dailyContent.date}-${hskLevel}`
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

      {mode === 'flash' && <Flashcards deck={scopedDeck} deckLoaded={deckLoaded} onDone={() => setMode('fill')} onGrade={gradeCard} />}
      {mode === 'fill'  && (
        <FillInBlank
          onDone={() => setMode('convo')}
          deck={scopedDeck}
          onAddVocab={handleAddVocab}
          onGrade={updateWordReview}
          items={dailyContent?.fillItems}
          loading={generating.has('fill')}
        />
      )}
      {mode === 'convo' && (
        // Mount only once the convo block is final — Conversation seeds its chat from
        // turn 0 on mount and won't remount, so mounting mid-generation would pin the
        // static first turn.
        generating.has('convo') ? (
          <div className="text-center py-14" style={{ color: 'var(--ink-soft)' }}>
            <div className="animate-pulse" style={{ fontFamily: 'var(--f-han)', fontSize: 52, color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>话</div>
            <p style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, letterSpacing: '.06em', marginTop: 12 }}>
              Generating a conversation for your due words…
            </p>
          </div>
        ) : (
          <Conversation
            key={convoKey}
            onScore={onScore}
            deck={scopedDeck}
            onAddVocab={handleAddVocab}
            onGrade={updateWordReview}
            turns={dailyContent?.conversation}
          />
        )
      )}
    </div>
  );
}
