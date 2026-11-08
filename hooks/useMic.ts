'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { stopAll } from '@/lib/speech';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

/**
 * The microphone: Web Speech API RECOGNITION, turning what is said into one string.
 *
 * ── IT IS INPUT, AND THE FILENAME USED TO SAY OUTPUT ──
 * This lived at `hooks/useSpeech.ts`, one character from `lib/speech.ts`, which is the TTS
 * module and does the opposite job. CLAUDE.md's hook table consequently described this file
 * as "Web Speech API TTS for passage playback" for months — wrong twice over, since it is
 * recognition rather than synthesis AND nothing imported it. Speech OUT is `lib/speech.ts`;
 * speech IN is here.
 *
 * ── ONE SHOT, REPLACE, AND `onResult` FIRES ONLY ON A REAL TRANSCRIPT ──
 * The previous version APPENDED to the field and emitted partial text decorated as
 * ` […interim]`. That contract had never run anywhere, and it is the wrong one: a transcript
 * is an answer, not a continuation. More importantly it called `onResult('')` from BOTH
 * `onend` AND `onerror`, so a declined microphone permission, a missing device and a failed
 * network leg all arrived at the caller as an empty string — a value meaning "it did not work"
 * delivered as a value meaning "they said nothing". That is the single mistake CLAUDE.md
 * records more often than any other, and in a grader it is expensive: an empty answer is a
 * legitimate "I don't know" and grades Again, so a denied permission would have written real
 * FSRS lapses. `onResult` is now called from `onresult` and nowhere else.
 *
 * ── FIVE FAILURES, FIVE SENTENCES ──
 * `MicStatus` separates them because they need different answers from the learner, and the one
 * that is actually fixable is the one a boolean would bury:
 *
 *   `unsupported`  no API at all — Firefox has never shipped it. Draw no control.
 *   `denied`       permission declined. The ONLY one the learner can fix, in site settings.
 *   `no-device`    nothing to record with.
 *   `offline`      the recognizer's own network leg failed (see the privacy note below).
 *   `unheard`      it listened and heard nothing. An ANSWER, not a fault — try again.
 *
 * ── ⚠ THE AUDIO LEAVES THE DEVICE, AND THAT HAS TO BE SAID OUT LOUD ──
 * Chrome streams the recording to Google's speech service and Safari to Apple's; neither is
 * local, and `offline` above exists because of it. This repository makes the opposite promise
 * everywhere else — a web clip travels in the URL hash so the page never reaches a server,
 * EPUB files never sync, the API key never goes in a URL — so a feature that uploads the
 * learner's VOICE cannot be the one place that stays quiet about it. The caller is required to
 * say so on screen, not in a docstring. (A service worker cannot see any of this: recognition
 * is internal to the browser rather than a `fetch`, so `public/sw.js` has no opinion on it.)
 *
 * ── IT SILENCES THE SPEAKER FIRST ──
 * `stopAll()` before `start()`, because the flashcard this serves has a play button and a
 * recognizer left listening through TTS transcribes the app reading the answer aloud.
 *
 * ── `maxAlternatives` STAYS AT 1, WHICH WAS A REAL DECISION ──
 * Asking for several candidates and accepting the card if ANY of them matches would absorb
 * exactly the homophone noise `canSpeak` is gating against, and there is a genuine argument
 * for it: in Chinese the learner produces the SOUND and an IME picks the character, so
 * crediting the sound is arguably what spoken recall should test. It is declined because it
 * makes the verdict depend on how many candidates a given browser felt like returning —
 * Chrome commonly returns one whatever you ask for — so the same answer would grade
 * differently on two machines, and `gradeTyped` would stop being the pure, auditable function
 * every other mode is graded by. The gate plus the four grade buttons cover the residue.
 */

export type MicStatus =
  /** No `SpeechRecognition` in this browser at all. Firefox, today. */
  | { kind: 'unsupported' }
  /** Ready, and nothing has happened yet. */
  | { kind: 'idle' }
  | { kind: 'listening' }
  /** Permission declined — the one failure here the learner can undo themselves. */
  | { kind: 'denied' }
  /** No microphone to record from. */
  | { kind: 'no-device' }
  /** The recognizer's network leg failed. It is a cloud service; see the note above. */
  | { kind: 'offline' }
  /** It listened and heard nothing. Not a fault — an answer. */
  | { kind: 'unheard' }
  /** Anything else the browser reported, including a locale it will not accept. */
  | { kind: 'failed' };

/** The spec's error strings, mapped to the sentence each one deserves. */
const FROM_ERROR: Record<string, MicStatus['kind']> = {
  'not-allowed': 'denied',
  'service-not-allowed': 'denied',
  'audio-capture': 'no-device',
  'network': 'offline',
  'no-speech': 'unheard',
};

/**
 * The sentence each failure deserves — here rather than in a component, because BOTH mic
 * callers need it and two copies of a five-branch switch is how they come to disagree about
 * what a denied permission means. `idle`, `listening` and `unsupported` return null: the first
 * two are not failures, and the third draws no control at all, so there is nothing to caption.
 *
 * Wording is kept neutral between the two call sites. Both sit directly beside a text field,
 * so "Type it instead" is true whether the field wants an answer or a word to look up.
 */
export function micMessage(s: MicStatus): string | null {
  switch (s.kind) {
    case 'denied':    return 'Microphone blocked — allow it in your browser’s site settings.';
    case 'no-device': return 'No microphone found. Type it instead.';
    case 'offline':   return 'Speech needs a connection: the recording is transcribed off this device.';
    case 'unheard':   return 'Didn’t catch that. Try again, or type it.';
    case 'failed':    return 'The microphone stopped. Try again, or type it.';
    default:          return null;
  }
}

function recognizer(): SR | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useMic(onResult: (text: string) => void) {
  const language = useLanguage();
  const [status, setStatus] = useState<MicStatus>({ kind: 'idle' });
  const recRef = useRef<SR | null>(null);
  /** Set by `onerror`, read by `onend`, which fires second and must not overwrite it. */
  const settledRef = useRef(false);
  const heardRef = useRef(false);
  /**
   * The callback behind a ref rather than in the dependency list. A stale closure here would
   * deliver one card's transcript to the next card's handler, and `TypedAnswer` is keyed by
   * the card, so the wrong one is always a different word.
   */
  const cbRef = useRef(onResult);
  useEffect(() => { cbRef.current = onResult; }, [onResult]);

  /**
   * MOUNT-GATED, NOT COMPUTED IN RENDER, and that is a hydration rule rather than caution.
   * `app/page.tsx` is a client component that Next still PRERENDERS, where `window` does not
   * exist — so a value read during render is `false` on the server and `true` on the client's
   * first pass, and the trees disagree. `ApiKeyPanel` states the same rule for `CSS.supports`
   * and `AddWordForm` was already doing this by hand. The cost is that the control appears one
   * commit after mount, which is invisible and is the right way round: a button that is there
   * and then vanishes is worse than one that arrives.
   */
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported(recognizer() !== null); }, []);

  // The browser keeps recording until it is told otherwise, and the caller unmounts on every
  // card. Without this the microphone stays live into the next word.
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* not started */ } }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    try { rec.abort(); } catch { /* not started */ }
    setStatus({ kind: 'idle' });
  }, []);

  const start = useCallback(() => {
    const SR = recognizer();
    if (!SR) { setStatus({ kind: 'unsupported' }); return; }
    if (recRef.current) return;

    // Do not transcribe our own text-to-speech.
    try { stopAll(); } catch { /* no synthesis on this platform */ }

    settledRef.current = false;
    heardRef.current = false;
    const rec = new SR();
    // The learner is producing the TARGET language, so this is the study locale and not the
    // interface one. `bcp47` is declared on every language config for exactly this.
    rec.lang = getLanguageConfig(language).bcp47;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;

    rec.onstart = () => setStatus({ kind: 'listening' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0]?.transcript ?? '';
      }
      text = text.trim();
      // A final result carrying nothing is not an answer. Reporting it would be the empty-string
      // bug this hook was rewritten to remove, arriving by the one path still allowed to call.
      if (!text) return;
      heardRef.current = true;
      cbRef.current(text);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      settledRef.current = true;
      const code = typeof e?.error === 'string' ? e.error : '';
      // `abort()` is this component going away, not a failure to report.
      if (code === 'aborted') { setStatus({ kind: 'idle' }); return; }
      setStatus({ kind: FROM_ERROR[code] ?? 'failed' });
    };

    rec.onend = () => {
      recRef.current = null;
      if (settledRef.current) return;
      setStatus({ kind: heardRef.current ? 'idle' : 'unheard' });
    };

    try { rec.start(); } catch { setStatus({ kind: 'failed' }); recRef.current = null; }
  }, [language]);

  const toggle = useCallback(() => {
    if (recRef.current) stop(); else start();
  }, [start, stop]);

  return {
    status: supported ? status : ({ kind: 'unsupported' } as MicStatus),
    listening: status.kind === 'listening',
    supported,
    start,
    stop,
    toggle,
  };
}
