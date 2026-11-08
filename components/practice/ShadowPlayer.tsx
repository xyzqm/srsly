'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { speakLocal, stopAll } from '@/lib/speech';

/**
 * The transport: the reference, your take, and the two back to back.
 *
 * ── BACK-TO-BACK IS THE WHOLE FEATURE ──
 * Hearing the model and hearing yourself are each easy and neither teaches much; the
 * difference only becomes audible when they are a beat apart. So the compare control is one
 * button that plays both with a short gap, rather than two buttons the learner alternates
 * between while the first one fades from memory.
 *
 * ── THE REFERENCE IS `speakLocal`, NEVER `speak` ──
 * `speak()` reaches for the paid `/api/tts` first. This drill is pressed over and over by
 * design — that is what shadowing IS — so the ordinary path would bill a round trip per
 * press. `tests/shadowFirewall.test.ts` asserts this module cannot call the other one.
 *
 * ── ⚠ THE SECOND HALF OF A CHAIN IS NOT A USER GESTURE, AND iOS CARES ──
 * `playBoth` starts the take from the reference's `onEnd`, which is a timer rather than a tap.
 * Mobile Safari may refuse `play()` there, and a refusal arrives as a rejected promise with
 * nothing on screen — a dead button, which is the bug this codebase names most often. So the
 * rejection is caught and rendered as an explicit "tap to hear yours" affordance rather than
 * being swallowed. The learner loses one tap; they do not lose the feature.
 *
 * ── ONE GENERATION COUNTER, BECAUSE A CHAIN CAN BE INTERRUPTED MID-GAP ──
 * Pressing Stop, recording again, or advancing to the next word while the gap timer is
 * pending must not have the take start playing a moment later over the top of whatever
 * replaced it. Everything async checks the generation it was issued in.
 */

/** Long enough to hear the join as two things, short enough to still be a comparison. */
const GAP_MS = 420;

const mono = { fontFamily: 'var(--f-mono)' } as const;

type Playing = 'reference' | 'take' | null;

interface Props {
  /** What the reference voice says — the word, or in a later phase a sentence. */
  text: string;
  /** The learner's take as an object URL, or null when they have not recorded one yet. */
  takeUrl: string | null;
  /** True while the microphone is live: everything here must be quiet and unavailable. */
  muted?: boolean;
}

export default function ShadowPlayer({ text, takeUrl, muted = false }: Props) {
  const [playing, setPlaying] = useState<Playing>(null);
  const [blockedTake, setBlockedTake] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genRef = useRef(0);

  const halt = useCallback(() => {
    genRef.current++;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    try { stopAll(); } catch { /* no synthesis here */ }
    setPlaying(null);
  }, []);

  // Nothing may outlive this component: a pending gap timer would fire into a dead tree and a
  // playing take would keep sounding over the next word.
  useEffect(() => () => {
    genRef.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (audioRef.current) audioRef.current.pause();
    try { stopAll(); } catch { /* ignore */ }
  }, []);

  // A new take, or a new word, invalidates anything in flight.
  useEffect(() => { halt(); setBlockedTake(false); }, [takeUrl, text, halt]);
  useEffect(() => { if (muted) halt(); }, [muted, halt]);

  const playTake = useCallback((gen: number, onDone?: () => void) => {
    if (!takeUrl || gen !== genRef.current) return;
    const audio = new Audio(takeUrl);
    audioRef.current = audio;
    audio.onended = () => {
      if (gen !== genRef.current) return;
      audioRef.current = null;
      setPlaying(null);
      onDone?.();
    };
    setPlaying('take');
    audio.play().catch(() => {
      // Refused — almost always iOS declining audio that did not start from a tap.
      if (gen !== genRef.current) return;
      audioRef.current = null;
      setPlaying(null);
      setBlockedTake(true);
    });
  }, [takeUrl]);

  const playReference = useCallback((onDone?: () => void) => {
    halt();
    const gen = ++genRef.current;
    setPlaying('reference');
    const started = speakLocal(text, () => {
      if (gen !== genRef.current) return;
      setPlaying(null);
      onDone?.();
    });
    // `speakLocal` returns false rather than pretending: no synthesis means no reference, and
    // chaining a recording off a sound that never played would be a lie about what happened.
    if (!started) { setPlaying(null); }
    return started;
  }, [text, halt]);

  const playBoth = useCallback(() => {
    const ok = playReference(() => {
      const gen = genRef.current;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        playTake(gen);
      }, GAP_MS);
    });
    if (!ok && takeUrl) playTake(++genRef.current);
  }, [playReference, playTake, takeUrl]);

  const btn = (active: boolean, disabled: boolean) => ({
    ...mono, fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase' as const,
    background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
    color: disabled ? 'var(--ink-faint)' : active ? 'var(--accent)' : 'var(--ink-soft)',
    borderRadius: 8, padding: '9px 16px',
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          onClick={() => (playing === 'reference' ? halt() : playReference())}
          disabled={muted}
          style={btn(playing === 'reference', muted)}
          className="transition-all duration-150"
        >
          {playing === 'reference' ? 'Playing' : 'Reference'}
        </button>
        <button
          onClick={() => (playing === 'take' ? halt() : playTake(++genRef.current))}
          disabled={muted || !takeUrl}
          style={btn(playing === 'take', muted || !takeUrl)}
          className="transition-all duration-150"
        >
          Yours
        </button>
        <button
          onClick={playBoth}
          disabled={muted || !takeUrl}
          style={btn(false, muted || !takeUrl)}
          className="transition-all duration-150"
        >
          Both
        </button>
      </div>
      {blockedTake && (
        /* Not silence: a refused `play()` is a real outcome and gets a sentence. */
        <div style={{ ...mono, fontSize: 10, color: 'var(--accent)', letterSpacing: '.05em' }}>
          Your browser wouldn’t play that automatically — tap “Yours”.
        </div>
      )}
    </div>
  );
}
