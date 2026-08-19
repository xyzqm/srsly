'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Sentence } from '@/lib/types';
import { speakSequence, primeTTS } from '@/lib/speech';

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
    <div className="flex items-center gap-2">
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
