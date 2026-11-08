'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LanguageCode } from '@/lib/types';
import { gradeTyped, canSpeak, type TypedResult } from '@/lib/typedAnswer';
import { useMic, type MicStatus } from '@/hooks/useMic';

/**
 * The typed-answer field on a flashcard — which can also be ANSWERED ALOUD.
 *
 * ── THE APP DOES NOT TOUCH THE FIELD, AND THAT IS THE POINT ──
 * This used to bind `wanakana`, which rewrote `element.value` in place to turn romaji into
 * kana. It is gone: a learner typing Chinese or Japanese is using their OS IME, which
 * transforms the same keystrokes, and two things rewriting one field fight over every
 * character. The browser and the IME own the input now.
 *
 * ── THE INPUT IS STILL UNCONTROLLED, FOR THE IME'S SAKE ──
 * A controlled React input re-renders mid-composition and can drop the candidate window or
 * jump the caret. The element owns its value and `submit()` reads it off the ref, which is
 * authoritative whatever the IME did to it; `value` in state is only a mirror for the hint
 * line below.
 *
 * ── `isComposing` IS LOAD-BEARING, NOT DEFENSIVE ──
 * Enter during composition COMMITS the IME's candidate — 朋友 out of `pengyou` — and must not
 * also submit the card. Without that guard the first Enter of every Chinese and Japanese
 * answer would grade a half-finished string.
 *
 * ── AUTOCORRECT OFF, FOR THE REASON THE CLOZE BLANK ALREADY GIVES ──
 * iOS rewrites a typed word on blur or space — `pero` becomes `Pero`, `casa` becomes `case` —
 * and then the app grades what the keyboard decided rather than what the learner typed. Grading
 * ignores case, so autocapitalisation is survivable; autocorrect is not, because it produces a
 * wrong answer the learner never gave and cannot appeal.
 *
 * ── ONE GRADE PER CARD, AND SUBMITTING IS THE ONLY WAY TO IT ──
 * The parent unmounts this on the next card (it is keyed by the card), so there is no path
 * where a stale answer is graded against a new word.
 *
 * ══════════════════ SPEAKING ══════════════════
 *
 * ── ⚠ IT POPULATES, THEN THE LEARNER CONFIRMS. IT NEVER AUTO-GRADES ──
 * A transcript goes into the field and stops there. Submitting stays a thing the learner does,
 * because `submit()` runs `gradeTyped`, whose verdict suggests the grade the next Enter takes —
 * so auto-submitting on speech end would let a MISHEARD word write an FSRS lapse nobody chose
 * and nobody can take back. `components/practice/Flashcards.tsx` records what that looks like
 * at its keyboard handler: two stray Enters graded a card nobody could see and `hablar` came
 * back carrying that day's `lastReview`. A recognizer is a stranger's guess at what was said;
 * it may fill the box and may not press the button.
 *
 * The transcript is also EDITABLE once it lands, which is the other half of the same decision.
 * Fixing one character and pressing Check is strictly better than appealing a wrong verdict
 * afterwards, and it costs nothing — the field was already a field.
 *
 * ── IT SAYS WHAT IT TESTS AND WHERE THE AUDIO GOES, PERMANENTLY ──
 * Two claims a learner cannot check for themselves, so neither is left to a docstring. The
 * recording is transcribed by the BROWSER'S OWN cloud service (Google's on Chrome, Apple's on
 * Safari), which this app otherwise never does with anything — and what comes back is checked
 * for being the right WORD, not for sounding good. Calling that pronunciation practice would
 * take credit for something no part of this measures. See `hooks/useMic.ts`.
 *
 * ── A FAILED MICROPHONE GETS A SENTENCE, NOT AN EMPTY BOX ──
 * `MicStatus` arrives already separated into the five things that can go wrong, and each gets
 * its own line here. Only `denied` is fixable by the learner, so only it says how. An empty
 * answer is a legitimate "I don't know" that grades Again, which is exactly why a dead
 * microphone must never look like one.
 *
 * ── THE KEYDOWN GUARD IS NOT COSMETIC ──
 * `Flashcards` listens on `window` and ignores keys only while focus is in an INPUT. A focused
 * BUTTON is not covered, so Space or Enter on Speak — or on Check, reachable by Tab long
 * before this existed — would ALSO reach that handler and reveal the card without an answer.
 * One `stopPropagation` on the wrapper covers the field and both buttons.
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;

/** One sentence per state. `idle` and `listening` are not failures and say nothing here. */
function micLine(s: MicStatus): string | null {
  switch (s.kind) {
    case 'denied':    return 'Microphone blocked — allow it in your browser’s site settings to answer aloud.';
    case 'no-device': return 'No microphone found. Type the answer instead.';
    case 'offline':   return 'Speech needs a connection: the recording is transcribed off this device.';
    case 'unheard':   return 'Didn’t catch that. Try again, or type it.';
    case 'failed':    return 'The microphone stopped. Try again, or type it.';
    default:          return null;
  }
}

/** A drawn mic, not an emoji — geometry on `currentColor`, the rule `Mark.tsx` sets out. */
function MicGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  );
}

interface Props {
  /** The answer to grade against: the word itself, in every language. */
  expected: string;
  /**
   * The card's reading, if it has one. Only ever produces a `close` — typing `pengyou` with
   * the IME switched off, or leaving たべる unconverted, is "knew the word, missed the script".
   */
  reading?: string;
  language: LanguageCode;
  /** What to type, in the learner's words. The UI must not overclaim what is being tested. */
  placeholder: string;
  onSubmit: (result: TypedResult, typed: string) => void;
}

export default function TypedAnswer({ expected, reading = '', language, placeholder, onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => { inputRef.current?.focus(); }, []);

  /**
   * WRITE THE ELEMENT, not just the mirror. The input is uncontrolled, so `setValue` alone
   * would update the hint line and leave the box empty — and `submit()` reads the element.
   */
  const receive = useCallback((text: string) => {
    const el = inputRef.current;
    if (el) { el.value = text; el.focus(); }
    setValue(text);
  }, []);

  const mic = useMic(receive);
  // Measured per language and per word length — see `canSpeak` in lib/typedAnswer.ts.
  const speakable = useMemo(() => canSpeak({ h: expected }, language), [expected, language]);
  const offerMic = speakable && mic.supported;

  const submit = useCallback(() => {
    // Stop first: a recognizer still listening would deliver a transcript into a card that has
    // already been graded, where the field is gone and the answer is on screen.
    mic.stop();
    // READ FROM THE ELEMENT, not from state: an IME commits its candidate straight onto the
    // input, and a composition event React did not surface would leave the mirror behind.
    const typed = inputRef.current?.value ?? value;
    // Blur first, or the card's keyboard shortcuts stay dead — the global handler ignores keys
    // while focus is in an input, which is what stops 1–4 being typed into this box.
    inputRef.current?.blur();
    onSubmit(gradeTyped(typed, expected, language, reading), typed);
  }, [expected, reading, language, onSubmit, value, mic]);

  const status = micLine(mic.status);

  return (
    <div
      className="flex flex-col items-center gap-3"
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation(); }}
    >
      <input
        ref={inputRef}
        type="text"
        defaultValue=""
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          // `isComposing` guards the IME a learner may still be using on top of ours — a
          // Japanese or Chinese keyboard's Enter commits a candidate and must not also submit.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
        }}
        placeholder={placeholder}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="done"
        aria-label={placeholder}
        className="rounded-[10px] px-4 py-3 text-center"
        style={{
          ...mono, fontSize: 17, width: 'min(300px, 80vw)',
          background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)',
          outline: 'none', letterSpacing: '.03em',
        }}
      />
      <div className="flex items-center gap-2">
        {offerMic && (
          <button
            onClick={mic.toggle}
            aria-pressed={mic.listening}
            className={`cursor-pointer transition-all duration-150 inline-flex items-center gap-2${mic.listening ? ' playing-pulse' : ''}`}
            title="Say the answer — it fills the box, you still press Check"
            style={{
              ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
              background: 'none', borderRadius: 8, padding: '11px 18px',
              border: `1px solid ${mic.listening ? 'var(--accent)' : 'var(--line)'}`,
              color: mic.listening ? 'var(--accent)' : 'var(--ink-soft)',
            }}
          >
            <MicGlyph />
            {mic.listening ? 'Listening' : 'Speak'}
          </button>
        )}
        <button
          onClick={submit}
          className="cursor-pointer transition-all duration-150"
          style={{
            ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
            background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)',
            borderRadius: 8, padding: '11px 22px',
          }}
        >
          Check
        </button>
      </div>
      {/* Submitting an empty box is a legitimate "I don't know" and grades Again, so the button
          is never disabled — a dead button on a card you cannot answer is a dead end. */}
      <div style={{ ...mono, fontSize: 10.5, color: status ? 'var(--accent)' : 'var(--ink-faint)', letterSpacing: '.06em', maxWidth: '34ch', textAlign: 'center', lineHeight: 1.5 }}>
        {status ?? (value.trim() ? 'Enter to check' : 'Enter to give up')}
      </div>
      {offerMic && (
        /* PERMANENT, not dismissable. Where the audio goes and what is being judged are both
           facts the learner has no way to verify, and this app states that class of thing
           plainly everywhere else — see the paste panel's "stays on this device". */
        <div style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.04em', maxWidth: '36ch', textAlign: 'center', lineHeight: 1.6, opacity: 0.85 }}>
          Spoken answers go to your browser&apos;s speech service. It checks the word, not your accent.
        </div>
      )}
    </div>
  );
}
