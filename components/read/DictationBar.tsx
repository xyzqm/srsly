'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sentence } from '@/lib/types';
import type { DictationSentence } from '@/lib/dictation';
import { splitAtBlank, becameComplete, type DictationProgress } from '@/lib/dictation';
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

/**
 * How much slower "Slower" is.
 *
 * A dictation aid, not a preference: the learner's own speed setting still applies and this
 * scales it for one replay. 0.65 is where a word you could not catch becomes separable without
 * the sentence falling apart into disconnected syllables — below about half speed most voices
 * stop sounding like speech at all, which teaches the wrong thing about how the word sounds.
 */
const SLOWER = 0.65;

/**
 * How long the finished sentence stays on screen before the run moves on.
 *
 * A sentence is revealed the moment its last blank is answered, deliberately: seeing the
 * sentence you just heard is where the learning lands. Advancing instantly would take it away
 * in the same frame it appeared, which is the reveal cancelling itself.
 */
const REVEAL_PAUSE_MS = 1700;

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

  /**
   * Has the learner actually asked for audio in this run?
   *
   * `/api/tts` is a paid call, so nothing here speaks on mount or on a guess — see the
   * docstring above and `PassagePlayer`, which learned it expensively. The auto-advance below
   * plays without a fresh click, and this is what makes that legitimate rather than a
   * regression: pressing Play starts a RUN, and carrying on through it is the same intent.
   * Until that first press, finishing a sentence advances silently.
   */
  const startedRef = useRef(false);
  /** Set just before an automatic step, so the effect on `stopIdx` knows to speak. */
  const autoPlayRef = useRef(false);

  const playAt = useCallback((rateScale: number) => {
    if (!sentence?.plainText) return;
    primeTTS();
    stopAll();
    setSpeaking(true);
    void speak(sentence.plainText, () => setSpeaking(false), rateScale);
  }, [sentence]);

  const play = useCallback(() => { startedRef.current = true; playAt(1); }, [playAt]);
  const playSlower = useCallback(() => { startedRef.current = true; playAt(SLOWER); }, [playAt]);

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

  /**
   * ── THE RUN CARRIES ON BY ITSELF ─────────────────────────────────────────
   *
   * Reported as "I don't like how the listening thing pauses at every sentence", and it is a
   * fair description of what it did: every sentence needed two clicks that carried no
   * information — › then Play — so the learner spent the exercise operating a transport
   * instead of listening. Filling the last blank in a sentence already SAYS you are done with
   * it; asking again is a control that can only ever be pressed one way.
   *
   * It fires on the TRANSITION to nothing-unanswered, not on the state, which is the part that
   * is easy to get wrong: reading "no blanks left" as the trigger would also fire when the
   * learner steps BACK to a sentence they finished earlier, and the run would shunt them
   * forwards again out of a sentence they had deliberately returned to. So the previous count
   * is remembered per stop, and a stop that was already complete when arrived at does nothing.
   *
   * Manual ‹ › are untouched. This removes a press nobody could disagree with, not the ability
   * to disagree.
   */
  const prevProgressRef = useRef<DictationProgress | null>(null);
  useEffect(() => {
    const prev = prevProgressRef.current;
    const now = { stop: stopIdx, unanswered: unanswered.length };
    prevProgressRef.current = now;
    if (!becameComplete(prev, now)) return;
    if (stopIdx >= stops.length - 1) return;          // the last one simply ends
    const t = setTimeout(() => {
      autoPlayRef.current = startedRef.current;
      onStepTo(stopIdx + 1);
    }, REVEAL_PAUSE_MS);
    return () => clearTimeout(t);
  }, [unanswered.length, stopIdx, stops.length, onStepTo]);

  /** The other half: having stepped automatically, speak the sentence it stepped to. */
  useEffect(() => {
    if (!autoPlayRef.current) return;
    autoPlayRef.current = false;
    playAt(1);
  }, [stopIdx, playAt]);

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

      {/*
        THE ANSWER TO "it is still way too hard to guess the blank from just listening".
        The audio is complete and the text is what has gaps, so the word IS spoken — the
        difficulty is catching it at conversational speed in a language you are learning,
        which is a different problem from not being able to hear it. Every dictation exercise
        ever set has answered that the same way, by playing it again more slowly, and this is
        the one control the bar was missing. "With the gap" beside it answers the other
        question — WHERE the word goes — which is not the same thing and was doing duty for
        both.
      */}
      <button onClick={playSlower} style={btn(false)} aria-label="Play this sentence more slowly" {...warmHandlers}>
        ▶ Slower
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
