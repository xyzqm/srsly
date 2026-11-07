'use client';
import { useState, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

/**
 * The microphone: Web Speech API RECOGNITION, turning what is said into a string.
 *
 * ── IT IS INPUT, AND THE FILENAME SAID OUTPUT ──
 * This lived at `hooks/useSpeech.ts`, one character from `lib/speech.ts`, which is the TTS
 * module and does the opposite job. CLAUDE.md's hook table consequently described this file
 * as "Web Speech API TTS for passage playback" for months — wrong twice over, since it is
 * recognition rather than synthesis AND nothing imports it. Renamed so the two cannot be
 * confused by sight: speech OUT is `lib/speech.ts`, speech IN is here.
 *
 * ── ⚠ IT IS UNUSED, AND `AddWordForm` HAS A SECOND COPY THAT IS NOT EQUIVALENT ──
 * `components/vocab/AddWordForm.tsx` recognises speech with its own inline `toggleVoice`, and
 * that one is the copy that actually runs. The contracts are DIFFERENT, so this is not a
 * duplicate waiting to be swapped in:
 *
 *   this hook          `interimResults: true`,  APPENDS to the current input, and emits
 *                      partial text decorated as ` […interim]`
 *   AddWordForm        `interimResults: false`, one shot, REPLACES the field, and hands the
 *                      result to `handleHanziChange`, which fires a dictionary lookup
 *
 * Wiring this hook into that caller would therefore send `食べ […たべる]` to a dictionary
 * lookup. Unifying them is a rewrite, not a refactor, and the LIVE contract is the one to
 * keep — the appending/interim behaviour here has never run anywhere.
 *
 * ── WHAT SPOKEN RECALL NEEDS, WHEN IT ARRIVES ──
 * One shot, replace, and then POPULATE-THEN-CONFIRM: the transcript goes into the field and
 * the learner presses submit. It must NOT auto-grade, because `gradeTyped` feeds FSRS and a
 * misheard word would write a lapse to the deck with no way to take it back — the failure
 * `components/practice/Flashcards.tsx` already records at its keyboard handler, where two
 * stray Enters graded a card nobody could see and wrote that day's `lastReview` to it.
 *
 * `rec.lang` comes from `bcp47` on the language config, which is already declared for all
 * four languages and commented for exactly this use.
 */
export function useMic(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const language = useLanguage();
  const recRef = useRef<SR | null>(null);
  const lastFinalRef = useRef('');

  const toggle = useCallback((currentInput: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) return;

    if (listening) {
      recRef.current?.stop();
      return;
    }

    lastFinalRef.current = currentInput.trim();
    const rec = new SR();
    rec.lang = getLanguageConfig(language).bcp47;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recRef.current = rec;

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      onResult(lastFinalRef.current.trim());
    };
    rec.onerror = () => {
      setListening(false);
      onResult(lastFinalRef.current.trim());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let finals = lastFinalRef.current;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finals += e.results[i][0].transcript;
        else interim = e.results[i][0].transcript;
      }
      lastFinalRef.current = finals;
      onResult(finals + (interim ? ` […${interim}]` : ''));
    };

    try { rec.start(); } catch { /* already started */ }
  }, [listening, onResult, language]);

  const supported = typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return { listening, toggle, supported };
}
