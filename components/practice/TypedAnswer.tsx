'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LanguageCode } from '@/lib/types';
import { loadKana } from '@/lib/kana';
import { answerScript, gradeTyped, type TypedResult } from '@/lib/typedAnswer';

/**
 * The typed-answer field on a flashcard.
 *
 * ── THE INPUT IS UNCONTROLLED, AND THAT IS NOT LAZINESS ──
 * `wanakana.bind` attaches its own listener and REWRITES `element.value` in place as you type,
 * turning `ta` into た before React ever hears about it. A controlled input fights that: React
 * re-renders with the value from state, wanakana rewrites it again, and the caret jumps. So the
 * element owns its value and `submit()` reads it off the ref, which is authoritative whatever
 * the library did to it. `value` in state is only a mirror, kept so the button can be disabled.
 *
 * ── THE IME MODE IS CHOSEN FROM THE ANSWER'S OWN SCRIPT ──
 * Bound to hiragana, `ko-hi-` gives こーひー and never reaches コーヒー. Bound to KATAKANA the
 * same keystrokes give コーヒー exactly. We know the answer's script from the card, so the app
 * makes that choice instead of asking the learner to. See lib/typedAnswer.ts.
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
  /** The answer to grade against — the reading (zh/ja) or the word itself (es/fr). */
  expected: string;
  language: LanguageCode;
  /** What to type, in the learner's words. The UI must not overclaim what is being tested. */
  placeholder: string;
  onSubmit: (result: TypedResult, typed: string) => void;
}

export default function TypedAnswer({ expected, language, placeholder, onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [kanaReady, setKanaReady] = useState(language !== 'ja');

  /**
   * Bind romaji→kana for Japanese only, and unbind on the way out.
   *
   * `bind` throws on an element that is already bound, so the cleanup is load-bearing rather
   * than tidiness — without it, remounting for the next card would throw on the second card.
   * The `cancelled` flag covers the import resolving after this card has already gone.
   */
  useEffect(() => {
    if (language !== 'ja') { setKanaReady(true); return; }
    let cancelled = false;
    let release: (() => void) | undefined;
    void loadKana().then(wk => {
      const el = inputRef.current;
      if (cancelled || !wk || !el) return;
      wk.bind(el, { IMEMode: answerScript(expected) === 'katakana' ? 'toKatakana' : 'toHiragana' });
      release = () => { try { wk.unbind(el); } catch { /* already gone */ } };
      setKanaReady(true);
    });
    return () => { cancelled = true; release?.(); };
  }, [language, expected]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = useCallback(() => {
    // READ FROM THE ELEMENT, not from state: wanakana writes the kana directly onto it, and
    // an input event it did not re-dispatch would leave the mirror one keystroke behind.
    const typed = inputRef.current?.value ?? value;
    // Blur first, or the card's keyboard shortcuts stay dead — the global handler ignores keys
    // while focus is in an input, which is what stops 1–4 being typed into this box.
    inputRef.current?.blur();
    onSubmit(gradeTyped(typed, expected, language), typed);
  }, [expected, language, onSubmit, value]);

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
        placeholder={kanaReady ? placeholder : 'Loading…'}
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
