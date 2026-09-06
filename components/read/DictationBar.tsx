'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sentence } from '@/lib/types';
import type { DictationSentence } from '@/lib/dictation';
import { splitAtBlank } from '@/lib/dictation';
import { speak, speakWithBlank, stopAll, primeTTS, prefetchAudio } from '@/lib/speech';
import Mark from '@/components/shared/Mark';

/**
 * Stepping through a dictation run, one sentence at a time.
 *
 * The passage is unchanged underneath: these are the same cloze blanks, graded the same way.
 * This only decides WHICH sentence is being asked and plays it — see lib/dictation.ts.
 *
 * ── AUDIO ONLY ON PHYSICAL INTENT ──
 * `/api/tts` is a paid call when a key is set, so nothing here speaks or prefetches on
 * mount, on a sentence becoming active, or on a guess about what this learner usually does.
 * `PassagePlayer` learned that the expensive way and its docstring is the long version: an
 * earlier build warmed audio for anyone who had played before, which is the same mistake one
 * step removed, since having used audio on a previous passage does not mean using it here.
 * Warming happens on hover, pointer-down and focus of the controls themselves.
 */

interface Props {
  sentences: Sentence[];
  /** The sentences carrying blanks, in order — the only ones worth stopping on. */
  stops: DictationSentence[];
  /** Index INTO `stops`, not into `sentences`. */
  stopIdx: number;
  onStepTo: (stopIdx: number) => void;
  scriptIsUnspaced: boolean;
  /** Token indices in the current sentence still unanswered — the hint targets the first. */
  unanswered: number[];
}

const mono = { fontFamily: 'var(--f-mono)' } as const;

const btn = (disabled: boolean) => ({
  ...mono,
  fontSize: 11,
  letterSpacing: '.08em',
  padding: '6px 11px',
  borderRadius: 7,
  border: '1px solid var(--line)',
  background: 'var(--card)',
  color: disabled ? 'var(--ink-faint)' : 'var(--ink)',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
});

export default function DictationBar({
  sentences, stops, stopIdx, onStepTo, scriptIsUnspaced, unanswered,
}: Props) {
  const [speaking, setSpeaking] = useState(false);
  const stop = stops[stopIdx];
  const sentence = stop ? sentences[stop.index] : undefined;

  // Leaving the run must not leave a voice talking over the next thing on screen.
  useEffect(() => () => stopAll(), []);

  /** Warm THIS sentence, on a gesture that says the learner is reaching for play. */
  const warm = useCallback(() => {
    if (sentence?.plainText) void prefetchAudio(sentence.plainText);
  }, [sentence]);

  const play = useCallback(() => {
    if (!sentence?.plainText) return;
    primeTTS();
    stopAll();
    setSpeaking(true);
    void speak(sentence.plainText, () => setSpeaking(false));
  }, [sentence]);

  /**
   * The fallback hint: the sentence with a deliberate silence where the word goes.
   *
   * This is what `speakWithBlank` is for, and it is a HINT rather than the exercise. The run
   * itself plays the sentence whole, because the learner is asked to type what they heard and
   * a word that was never spoken cannot be heard. Once they have heard it and still cannot
   * place the word, hearing the shape of the gap is the useful next thing.
   *
   * It takes one gap, so it targets the first blank still unanswered — which is also the one
   * the learner is working on.
   */
  const playGap = useCallback(() => {
    if (!sentence || unanswered.length === 0) return;
    primeTTS();
    stopAll();
    const { before, after } = splitAtBlank(sentence.tokens, unanswered[0], scriptIsUnspaced);
    speakWithBlank(before, after);
  }, [sentence, unanswered, scriptIsUnspaced]);

  const warmHandlers = { onPointerEnter: warm, onPointerDown: warm, onFocus: warm };
  const prevRef = useRef<HTMLButtonElement>(null);

  if (!stop || !sentence) return null;
  const atFirst = stopIdx <= 0;
  const atLast = stopIdx >= stops.length - 1;

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      style={{ padding: '10px 0 2px' }}
      {...warmHandlers}
    >
      <button
        ref={prevRef}
        onClick={() => { stopAll(); onStepTo(stopIdx - 1); }}
        disabled={atFirst}
        style={btn(atFirst)}
        aria-label="Previous sentence"
      >
        ‹
      </button>

      <button onClick={play} style={btn(false)} aria-label="Play this sentence" {...warmHandlers}>
        {speaking ? '❙❙' : '▶'} {speaking ? 'Playing' : 'Play sentence'}
      </button>

      <button
        onClick={playGap}
        disabled={unanswered.length === 0}
        style={btn(unanswered.length === 0)}
        aria-label="Play with a gap where the word is"
        {...warmHandlers}
      >
        <Mark name="spark" size={11} inline /> With the gap
      </button>

      <button
        onClick={() => { stopAll(); onStepTo(stopIdx + 1); }}
        disabled={atLast}
        style={btn(atLast)}
        aria-label="Next sentence"
      >
        ›
      </button>

      <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>
        {stopIdx + 1} / {stops.length}
      </span>
    </div>
  );
}
