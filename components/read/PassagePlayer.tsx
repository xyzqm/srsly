'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Sentence } from '@/lib/types';
import { speakSequence, primeTTS, prefetchAudio } from '@/lib/speech';

interface Props {
  sentences: Sentence[];
  onSentenceChange: (idx: number) => void;
  /** False when the Read tab is hidden. Playback stops rather than following the reader. */
  active?: boolean;
}

export default function PassagePlayer({ sentences, onSentenceChange, active = true }: Props) {
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  /**
   * Warm the FIRST sentence so pressing play starts it immediately.
   *
   * Without this, `speakAt` awaits a round trip to /api/tts before a sound comes out — and
   * that gap sits precisely where the learner is least willing to wait, having just pressed
   * play. Every LATER sentence was already covered: speakSequence fetches idx+1 while idx is
   * still speaking, so only the cold start was ever slow.
   *
   * ONLY ON PHYSICAL INTENT — pointer over the controls, pointer down, or focus. Never on
   * mount, and never on a guess about what this learner usually does.
   *
   * /api/tts is a paid OpenAI call and the reading tab loads a passage on every visit, so
   * anything that fires without the reader reaching for the button is buying speech nobody
   * requested. An earlier version warmed on arrival for anyone who had played audio before,
   * which is the same mistake one step removed: having used audio on a previous passage does
   * not mean using it on this one, and the wasted call is just as paid for.
   *
   * Hover-to-click is a few hundred milliseconds, which is most of a short sentence's fetch,
   * and pointerDown buys the finger-down-to-click gap on touch. `prefetchAudio` is
   * idempotent, so firing on all three and on every hover is free after the first.
   */
  const warmFirst = useCallback(() => {
    const first = sentences[0]?.plainText;
    if (first) void prefetchAudio(first);
  }, [sentences]);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback((startIdx: number) => {
    primeTTS();
    stop();
    setPlaying(true);
    const stopFn = speakSequence(
      sentences.map(s => s.plainText),
      startIdx,
      (i) => { setIdx(i); onSentenceChange(i); },
      () => { setPlaying(false); },
    );
    stopRef.current = stopFn;
  }, [sentences, onSentenceChange, stop]);

  /**
   * Stop when the tab is hidden, and when this really does unmount.
   *
   * `speakSequence` returns a stop function and speaks through the global
   * `speechSynthesis` queue — dropping the reference does not silence it. Before the Read
   * tab was kept alive this leaked on unmount too; now that it survives a tab switch, the
   * audio would simply carry on over whatever you switched to.
   */
  useEffect(() => {
    if (!active) stop();
    return () => { stopRef.current?.(); stopRef.current = null; };
  }, [active, stop]);

  const toggle = useCallback(() => {
    if (playing) stop();
    else play(idx);
  }, [playing, play, stop, idx]);

  const prev = useCallback(() => {
    const ni = Math.max(0, idx - 1);
    setIdx(ni);
    onSentenceChange(ni);
    if (playing) play(ni);
  }, [idx, playing, play, onSentenceChange]);

  const next = useCallback(() => {
    // Wrap back to the start when already on the last sentence
    const ni = idx >= sentences.length - 1 ? 0 : idx + 1;
    setIdx(ni);
    onSentenceChange(ni);
    if (playing) play(ni);
  }, [idx, sentences.length, playing, play, onSentenceChange]);

  const btnStyle = {
    width: 38, height: 38, borderRadius: '50%',
    border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)',
    display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 13, lineHeight: 1,
    transition: 'all .15s',
  };

  return (
    // The only triggers there are. They sit on the whole control cluster, not just play:
    // reaching for ⏭ is the same signal. pointerEnter covers mouse and pen; pointerDown
    // covers touch, where it buys the gap between finger-down and the click firing.
    <div
      className="flex items-center gap-2"
      onPointerEnter={warmFirst}
      onPointerDown={warmFirst}
      onFocusCapture={warmFirst}
    >
      <button onClick={prev} style={btnStyle} title="Previous sentence">⏮</button>
      <button
        onClick={toggle}
        className={playing ? 'playing-pulse' : ''}
        style={{
          ...btnStyle,
          width: 44, height: 44, fontSize: 15,
          background: 'var(--accent)', color: '#fff',
          border: '1px solid var(--accent)',
          boxShadow: '0 2px 0 var(--accent-deep)',
        }}
        title="Play / pause"
      >
        {playing ? '⏸' : '▶'}
      </button>
      <button onClick={next} style={btnStyle} title="Next sentence">⏭</button>
      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em', marginLeft: 6 }}>
        Sentence {idx + 1} / {sentences.length}
      </span>
    </div>
  );
}
