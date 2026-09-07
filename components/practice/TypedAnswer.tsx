'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LanguageCode } from '@/lib/types';
import { gradeTyped, type TypedResult } from '@/lib/typedAnswer';

/**
 * The typed-answer field on a flashcard.
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
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;

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

  const submit = useCallback(() => {
    // READ FROM THE ELEMENT, not from state: an IME commits its candidate straight onto the
    // input, and a composition event React did not surface would leave the mirror behind.
    const typed = inputRef.current?.value ?? value;
    // Blur first, or the card's keyboard shortcuts stay dead — the global handler ignores keys
    // while focus is in an input, which is what stops 1–4 being typed into this box.
    inputRef.current?.blur();
    onSubmit(gradeTyped(typed, expected, language, reading), typed);
  }, [expected, reading, language, onSubmit, value]);

  return (
    <div className="flex flex-col items-center gap-3">
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
      {/* Submitting an empty box is a legitimate "I don't know" and grades Again, so the button
          is never disabled — a dead button on a card you cannot answer is a dead end. */}
      <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '.06em' }}>
        {value.trim() ? 'Enter to check' : 'Enter to give up'}
      </div>
    </div>
  );
}
