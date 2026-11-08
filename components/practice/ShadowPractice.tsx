'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { useLanguage } from '@/lib/LanguageContext';
import { uiStrings, stateGlyphSize } from '@/lib/uiStrings';
import { useRecorder, recorderMessage } from '@/hooks/useRecorder';
import Mark from '@/components/shared/Mark';
import ShadowPlayer from './ShadowPlayer';
import DrillLoading from './DrillLoading';

/**
 * Shadowing: hear it, say it, hear both. Nothing is graded and nothing is kept.
 *
 * ── IT SCORES NOTHING, AND THAT IS THE DESIGN RATHER THAN A LIMITATION ──
 * The obvious build runs the take through speech-to-text and marks the pronunciation. That
 * would be a confident number this app cannot honestly produce: a recognizer reports whether
 * its language model matched, not whether an accent is good, and `canSpeak` already measures
 * how often it cannot even tell two words apart. Spoken recall says on screen that it checks
 * the word and not the accent; inventing a score here would take back that sentence. The ear
 * doing the judging is the learner's, which is also how shadowing is actually taught.
 *
 * So this writes no FSRS, no streak, no activity log, no counters — the posture
 * `lib/practiceSheet.ts`, `lib/writingState.ts` and `lib/pact.ts` each take, pinned a fourth
 * time by `tests/shadowFirewall.test.ts`.
 *
 * ── THE WHOLE DECK, NOT THE DUE CARDS ──
 * Due-ness is a scheduling idea and nothing here schedules, so filtering by it would borrow
 * a meaning this drill does not have — and it would empty the screen exactly when somebody
 * has caught up on their reviews, which is the worst possible moment to tell them there is
 * nothing to practise. The order is shuffled once per mount so a long deck is not always
 * drilled from its first word; it is not persisted, because a position would be stored state
 * on a drill whose entire claim is that it stores nothing.
 *
 * ── ⚠ PHASE 2 SPEAKS SINGLE WORDS, WHICH IS HALF OF WHAT SHADOWING IS FOR ──
 * Stated plainly so it is not mistaken for finished. Shadowing is about rhythm and intonation
 * ACROSS A PHRASE, and for Spanish and French the hard parts — liaison, nasal vowels, where
 * the stress lands in a group — do not exist inside one word. Chinese is the exception that
 * makes this worth shipping alone: a single syllable carries a tone, and tones are exactly
 * what a beginner needs to hear themselves get wrong.
 *
 * `DeckWord.cn` is declared as "example sentence" and would have been the obvious source. It
 * is written NOWHERE in this repository — a dead field, read in two places and never filled —
 * so the sentences have to come from `lib/data/lesson-practice.json` instead. That is phase 3.
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;

interface Props {
  deck: DeckWord[];
  /** False while storage has not answered. `[]` means an empty deck; this means "not yet". */
  deckLoaded?: boolean;
  /** False while the drill is mounted but hidden — see components/TabPanel.tsx. */
  active?: boolean;
}

/** Fisher–Yates on a copy. Pure given its input; called once per mount via useMemo. */
function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function ShadowPractice({ deck, deckLoaded = true, active = true }: Props) {
  const language = useLanguage();
  const ui = uiStrings(language);
  const rec = useRecorder();
  const [idx, setIdx] = useState(0);

  // Shuffled once per mount. `deck.length` rather than `deck` so a save that rewrites the
  // array identity — which grading elsewhere does — cannot reshuffle the running session.
  const queue = useMemo(() => shuffled(deck), [deck.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = queue[idx];

  const next = useCallback(() => {
    rec.clear();
    setIdx(i => (queue.length === 0 ? 0 : (i + 1) % queue.length));
  }, [rec, queue.length]);

  // Leaving the drill must stop the microphone, not merely hide it. `useRecorder` releases the
  // device on unmount, but this panel is KEPT ALIVE when you switch drills, so there is no
  // unmount to rely on — a live recording would follow you to the flashcards.
  useEffect(() => { if (!active && rec.recording) rec.stop(); }, [active, rec]);

  if (!deckLoaded) return <DrillLoading />;

  if (deck.length === 0 || !card) {
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: stateGlyphSize(ui.empty), color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>{ui.empty}</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>No words to practise yet.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px auto 0', maxWidth: '34ch', lineHeight: 1.6 }}>
          Shadowing reads from your deck. Add a word and it will show up here — nothing has to
          be due first.
        </p>
      </div>
    );
  }

  const failure = recorderMessage(rec.status);

  return (
    <div className="text-center">
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        Shadowing · {idx + 1} of {queue.length}
      </div>

      {/* The word. Shown, not hidden: this is not a recall test and withholding it would make
          it one — you cannot imitate a pronunciation you are still trying to remember. */}
      <div className="mt-6" style={{ fontFamily: 'var(--f-han)', fontSize: 52, lineHeight: 1.15, fontWeight: 'var(--han-weight)' as 'bold', letterSpacing: '.02em' }}>
        {card.h}
      </div>
      {card.p && (
        <div style={{ ...mono, fontSize: 17, color: 'var(--accent)', letterSpacing: '.04em', marginTop: 10 }}>{card.p}</div>
      )}
      {card.m && (
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink-soft)', marginTop: 8, maxWidth: '32ch', marginInline: 'auto', lineHeight: 1.5 }}>
          {card.m}
        </div>
      )}

      <div className="mt-7">
        <ShadowPlayer text={card.h} takeUrl={rec.takeUrl} muted={rec.recording} />
      </div>

      {rec.supported ? (
        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            onClick={() => (rec.recording ? rec.stop() : void rec.start())}
            aria-pressed={rec.recording}
            className={`cursor-pointer transition-all duration-150 inline-flex items-center gap-2${rec.recording ? ' playing-pulse' : ''}`}
            style={{
              ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
              background: rec.recording ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
              border: `1px solid ${rec.recording ? 'var(--accent)' : 'var(--line)'}`,
              color: rec.recording ? 'var(--accent)' : 'var(--ink-soft)',
              borderRadius: 9, padding: '12px 24px',
            }}
          >
            <Mark name="mic" size={13} inline />
            {rec.recording ? 'Stop' : rec.takeUrl ? 'Record again' : 'Record'}
          </button>
          {failure && (
            <div style={{ ...mono, fontSize: 10.5, color: 'var(--accent)', letterSpacing: '.05em', maxWidth: '34ch', lineHeight: 1.5 }}>
              {failure}
            </div>
          )}
        </div>
      ) : (
        /* Not a disabled button. There is nothing to press and nothing the learner can do
           about it, so it says which of the two it is instead of looking broken. */
        <div className="mt-5" style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '.05em', maxWidth: '34ch', marginInline: 'auto', lineHeight: 1.6 }}>
          This browser can’t record audio. You can still play the reference.
        </div>
      )}

      <div className="mt-7">
        {/* Never gated on having recorded. A drill that scores nothing must not block either. */}
        <button
          onClick={next}
          className="cursor-pointer transition-all duration-150"
          style={{ ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '11px 24px' }}
        >
          Next word
        </button>
      </div>

      {/* PERMANENT, and the counterpart to the line spoken recall shows. There it had to admit
          the audio leaves; here it can say the opposite, and the firewall test is what makes
          that a fact about the code rather than a promise. */}
      <div className="mt-6" style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.04em', maxWidth: '38ch', marginInline: 'auto', lineHeight: 1.6, opacity: 0.85 }}>
        Your recording stays on this device. Nothing is sent anywhere, nothing is saved, and
        nothing here is scored — you are the judge.
      </div>
    </div>
  );
}
