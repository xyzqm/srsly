'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { useLanguage } from '@/lib/LanguageContext';
import { storage } from '@/lib/storage';
import { getSrsSettings, DEFAULT_SRS_SETTINGS, type SrsSettings } from '@/lib/fsrs';
import {
  writableChars, dueWritingChars, gradeFromStrokes, scheduleWriting, isWritingDue,
  type WritingCards,
} from '@/lib/writingState';
import WritingCanvas from './WritingCanvas';

/**
 * A handwriting session — one character at a time, graded by the strokes.
 *
 * ── IT IS A GYM, NOT A DAILY REQUIREMENT ──
 * Nothing here touches the reading streak, `isDueToday`, the daily new-card budget or the
 * activity heatmap; `lib/writingState.ts` carries the argument and `tests/writingState.test.ts`
 * pins it. Someone a month behind on writing has an intact reading streak, because they are
 * different skills and only one of them is what this app is for.
 *
 * ── THE QUEUE IS LATCHED, FOR THE REASON FLASHCARDS LATCHES ITS OWN ──
 * Built once when the cards arrive and never rebuilt, so answering a character cannot reshuffle
 * the session underneath the learner. Practising 好 must not make 妈 appear or vanish.
 *
 * ── AN EMPTY VALUE IS NOT AN ANSWER ──
 * `cards` is `null` until storage replies, and this renders a loading line rather than "nothing
 * to practise" — the sixth failure mode in CLAUDE.md, which has already worn four faces in this
 * codebase. A learner with 500 words must never be told they have nothing to write.
 */

interface Props {
  deck: DeckWord[];
  deckLoaded?: boolean;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function WritingPractice({ deck, deckLoaded = true }: Props) {
  const language = useLanguage();
  const [cards, setCards] = useState<WritingCards | null>(null);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ mistakes: number; usedHint: boolean } | null>(null);
  const [settings, setSettings] = useState<SrsSettings>(DEFAULT_SRS_SETTINGS);

  useEffect(() => { setSettings(getSrsSettings()); }, []);

  useEffect(() => {
    let alive = true;
    void storage.getWritingCards(language).then(c => { if (alive) setCards(c); });
    return () => { alive = false; };
  }, [language]);

  /** Every Han character the deck contains. Derived, never stored — see writableChars. */
  const chars = useMemo(() => writableChars(deck), [deck]);

  // Latched once, when both the deck and the stored cards are actually here.
  useEffect(() => {
    if (queue !== null || !deckLoaded || cards === null) return;
    setQueue(dueWritingChars(chars, cards));
    setIndex(0);
  }, [queue, deckLoaded, cards, chars]);

  const commit = useCallback(async (mistakes: number, usedHint: boolean, char: string) => {
    const grade = gradeFromStrokes(mistakes, usedHint);
    const next = { ...(cards ?? {}), [char]: scheduleWriting(cards?.[char], grade, settings) };
    setCards(next);
    await storage.saveWritingCards(language, next);
  }, [cards, language, settings]);

  const onDone = useCallback((r: { mistakes: number; usedHint: boolean }) => {
    const char = queue?.[index];
    if (!char) return;
    setResult(r);
    void commit(r.mistakes, r.usedHint, char);
  }, [queue, index, commit]);

  const advance = useCallback(() => {
    setResult(null);
    setIndex(i => i + 1);
  }, []);

  /** No stroke data — drop it from this session silently and move on. */
  const onUnavailable = useCallback(() => {
    setResult(null);
    setIndex(i => i + 1);
  }, []);

  if (!deckLoaded || cards === null || queue === null) {
    return (
      <div className="py-10 text-center" style={{ ...mono, fontSize: 12, color: 'var(--ink-faint)' }}>
        Loading…
      </div>
    );
  }

  if (chars.length === 0) {
    return (
      <div className="py-10 text-center">
        <p style={{ color: 'var(--ink-soft)', maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.6 }}>
          Nothing to write yet. Characters come from the words in your deck — read something and
          tap a word to add it.
        </p>
      </div>
    );
  }

  if (index >= queue.length) {
    const remaining = chars.filter(c => isWritingDue(cards[c])).length;
    return (
      <div className="py-10 text-center">
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {queue.length > 0 ? 'Done for now' : 'Nothing due'}
        </div>
        <p style={{ color: 'var(--ink-soft)', marginTop: 10, maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.6 }}>
          {queue.length > 0
            ? `${queue.length} character${queue.length === 1 ? '' : 's'} practised.`
            : 'Every character you own is scheduled ahead. Writing has its own schedule — it does not affect your reading streak.'}
          {remaining > 0 && ` ${remaining} still due — reopen to carry on.`}
        </p>
      </div>
    );
  }

  const char = queue[index];
  const card = cards[char];

  return (
    <div>
      <div className="flex justify-between items-end mb-5 gap-4">
        <div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Handwriting · FSRS
          </div>
          <div style={{ ...mono, fontSize: 12, color: 'var(--ink-faint)' }}>
            {index + 1} of {queue.length}
            <span style={{ marginLeft: 8 }}>
              · {(card?.reviews ?? 0) === 0 ? 'new' : `written ${card?.reviews}×`}
            </span>
          </div>
        </div>
        <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden', flex: 1, maxWidth: 240 }}>
          <div style={{
            height: '100%', background: 'var(--accent)', borderRadius: 4,
            width: `${(index / queue.length) * 100}%`, transition: 'width .4s cubic-bezier(.2,.7,.3,1)',
          }} />
        </div>
      </div>

      {/* The prompt is the MEANING and the reading, never the character — the character is the
          answer. Drawn from the deck words this character appears in, so the learner has
          something to aim at rather than an abstract shape. */}
      <WritingPrompt deck={deck} char={char} reveal={result !== null} />

      {/* Keyed by the character: a fresh HanziWriter per card, no state carried across. */}
      <WritingCanvas key={char} char={char} onDone={onDone} onUnavailable={onUnavailable} />

      {result && (
        <div className="text-center mt-5">
          <div style={{ ...mono, fontSize: 12.5, color: verdictColor(result), letterSpacing: '.04em' }}>
            {verdictLine(result)}
          </div>
          <button
            onClick={advance}
            className="cursor-pointer transition-all duration-150"
            style={{
              ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '11px 22px', marginTop: 14,
              boxShadow: '0 2px 0 var(--accent-deep)',
            }}
          >
            {index + 1 >= queue.length ? 'Finish' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
}

/** What the learner is being asked to write, without showing them the shape. */
function WritingPrompt({ deck, char, reveal }: { deck: DeckWord[]; char: string; reveal: boolean }) {
  // The shortest word containing this character reads best as a prompt — a two-character word
  // gives context, a six-character one is a sentence to read before the exercise starts.
  const word = useMemo(
    () => deck.filter(w => w.h.includes(char)).sort((a, b) => a.h.length - b.h.length)[0],
    [deck, char],
  );
  return (
    <div className="text-center mb-4">
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 21, fontWeight: 500, lineHeight: 1.35, maxWidth: '30ch', marginInline: 'auto' }}>
        {word?.m?.split(/\s*[;,]\s*/)[0] ?? 'Write this character'}
      </div>
      {word?.p && (
        <div style={{ ...mono, fontSize: 14, color: 'var(--accent)', letterSpacing: '.04em', marginTop: 5 }}>
          {word.p}
        </div>
      )}
      <div style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)', marginTop: 7, letterSpacing: '.05em' }}>
        {reveal
          ? <span style={{ fontFamily: 'var(--f-han)', fontSize: 17, color: 'var(--ink)' }}>{char}</span>
          : word && word.h.length > 1
            ? `the ${ordinal(word.h.indexOf(char) + 1)} character of ${word.h.length}`
            : 'one character'}
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n - 1] ?? `${n}th`;
}

function verdictLine(r: { mistakes: number; usedHint: boolean }): string {
  if (r.usedHint) return 'Shown — it will come back soon.';
  if (r.mistakes === 0) return 'Clean.';
  if (r.mistakes < 3) return `${r.mistakes} stroke${r.mistakes === 1 ? '' : 's'} off.`;
  return 'That one needs more work.';
}

function verdictColor(r: { mistakes: number; usedHint: boolean }): string {
  if (r.usedHint || r.mistakes >= 3) return 'var(--accent)';
  return r.mistakes === 0 ? 'var(--jade)' : 'var(--gold)';
}
