'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { useLanguage } from '@/lib/LanguageContext';
import { uiStrings, stateGlyphSize } from '@/lib/uiStrings';
import { useRecorder, recorderMessage } from '@/hooks/useRecorder';
import { loadShadowSentences, type ShadowSentence } from '@/lib/shadowSentences';
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
 * ── TWO SOURCES, BECAUSE A WORD AND A PHRASE TEACH DIFFERENT THINGS ──
 * Words come from your deck and are what you are actually studying; in Chinese a single
 * syllable carries a tone, which is the thing a beginner most needs to hear themselves get
 * wrong. SENTENCES come from `lib/data/lesson-practice.json` and are the half a word cannot
 * reach: shadowing is really about rhythm and intonation across a phrase, and for Spanish and
 * French the hard parts — liaison, nasal vowels, where the stress lands in a group — do not
 * exist inside one word. Neither dominates, so the learner picks rather than the app.
 *
 * `DeckWord.cn` is declared as "example sentence" and would have been the obvious source for
 * the second one. It is written NOWHERE in this repository — a dead field, read in two places
 * and never filled — which is why the sentences come from the lesson corpus instead.
 *
 * The choice is SESSION-LOCAL, not a pref. The flashcard toggles persist and this one
 * deliberately does not: a synced field is stored state, and the one thing this drill claims
 * is that it stores nothing. Reopening into Words costs a tap.
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

/** One thing to shadow, whichever source it came from. */
interface Item { key: string; text: string; sub: string; gloss: string }

export default function ShadowPractice({ deck, deckLoaded = true, active = true }: Props) {
  const language = useLanguage();
  const ui = uiStrings(language);
  const rec = useRecorder();
  const [idx, setIdx] = useState(0);
  const [source, setSource] = useState<'words' | 'sentences'>('words');
  /** null = the chunk has not answered yet; [] = this language genuinely has none. */
  const [sentences, setSentences] = useState<ShadowSentence[] | null>(null);

  // Loaded on mount rather than on the toggle, so switching source is instant and so the
  // toggle can be hidden for a language that really has none instead of offered and empty.
  // The panel only mounts when Shadow is first opened, so nobody else pays for the chunk.
  useEffect(() => {
    let alive = true;
    setSentences(null);
    loadShadowSentences(language).then(rows => { if (alive) setSentences(rows); });
    return () => { alive = false; };
  }, [language]);

  const items: Item[] = useMemo(() => {
    if (source === 'sentences') {
      return (sentences ?? []).map(x => ({ key: x.lesson + '|' + x.text, text: x.text, sub: '', gloss: x.gloss }));
    }
    return deck.map(w => ({ key: w.id ?? w.h, text: w.h, sub: w.p ?? '', gloss: w.m ?? '' }));
  }, [source, sentences, deck]);

  // Shuffled once per (source, length). Keyed on the LENGTH rather than the array so a save
  // elsewhere — grading rewrites the deck's identity — cannot reshuffle a running session.
  const queue = useMemo(() => shuffled(items), [source, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = queue[idx];

  const next = useCallback(() => {
    rec.clear();
    setIdx(i => (queue.length === 0 ? 0 : (i + 1) % queue.length));
  }, [rec, queue.length]);

  const pickSource = useCallback((s: 'words' | 'sentences') => {
    rec.clear();
    setSource(s);
    setIdx(0);
  }, [rec]);

  // Leaving the drill must stop the microphone, not merely hide it. `useRecorder` releases the
  // device on unmount, but this panel is KEPT ALIVE when you switch drills, so there is no
  // unmount to rely on — a live recording would follow you to the flashcards.
  useEffect(() => { if (!active && rec.recording) rec.stop(); }, [active, rec]);

  const hasSentences = (sentences?.length ?? 0) > 0;

  /** The source picker. Absent entirely where there is only one source to pick. */
  const sourceToggle = hasSentences ? (
    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--line)' }}>
      {([['words', 'Words'], ['sentences', 'Sentences']] as const).map(([id, label]) => (
        <button
          key={id}
          onClick={() => pickSource(id)}
          aria-pressed={source === id}
          className="cursor-pointer transition-all duration-150"
          style={{
            ...mono, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase',
            padding: '6px 14px', border: 'none',
            background: source === id ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
            color: source === id ? 'var(--accent)' : 'var(--ink-faint)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  /**
   * ── THREE STATES, NOT TWO, AND THE SOURCE DECIDES WHICH DATA IS EVEN RELEVANT ──
   * The first draft asked `!deckLoaded` and then `deck.length === 0` regardless of source,
   * which is wrong twice over. Shadowing SENTENCES needs no deck at all, so a learner with an
   * empty deck would have been told there was nothing to practise while 87 sentences sat
   * loaded; and a language switch resets `sentences` to null while `source` stays put, so an
   * unloaded list would have rendered as "this language has none" — a value meaning NOT YET
   * shown as a value meaning NONE, which is the mistake CLAUDE.md records more than any other.
   */
  const loading = source === 'sentences' ? sentences === null : !deckLoaded;
  if (loading) return <DrillLoading />;

  if (!card) {
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: stateGlyphSize(ui.empty), color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>{ui.empty}</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>
          {source === 'sentences' ? 'No sentences for this language yet.' : 'No words to practise yet.'}
        </h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px auto 0', maxWidth: '36ch', lineHeight: 1.6 }}>
          {source === 'sentences'
            ? 'The phrase practice comes from the lesson tree, which this language does not have one of yet.'
            : 'Words come from your deck — add one and it appears here, with nothing having to be due first.'}
        </p>
        {/* A DEAD END IS THE THING TO AVOID. An empty deck does not mean an empty drill: the
            sentences need no deck at all, so the way out is offered rather than described. */}
        {source === 'words' && hasSentences && (
          <button
            onClick={() => pickSource('sentences')}
            className="cursor-pointer transition-all duration-150 mt-6"
            style={{ ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '11px 20px' }}
          >
            Shadow sentences instead
          </button>
        )}
      </div>
    );
  }

  const failure = recorderMessage(rec.status);

  return (
    <div className="text-center">
      {sourceToggle && <div className="flex justify-center mb-4">{sourceToggle}</div>}
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        Shadowing · {idx + 1} of {queue.length}
      </div>

      {/* Shown, not hidden: this is not a recall test, and withholding it would make it one —
          you cannot imitate a pronunciation you are still trying to remember.

          A SENTENCE IS SET SMALLER THAN A WORD, and that is not decoration. 52px is right for
          朋友 and wraps a Spanish sentence onto four lines, which moves every control below it
          and changes the height of the panel from item to item. */}
      <div
        className="mt-6"
        style={{
          fontFamily: 'var(--f-han)',
          fontSize: source === 'sentences' ? 27 : 52,
          lineHeight: source === 'sentences' ? 1.45 : 1.15,
          fontWeight: 'var(--han-weight)' as 'bold',
          letterSpacing: '.02em',
          maxWidth: source === 'sentences' ? '22ch' : undefined,
          marginInline: 'auto',
        }}
      >
        {card.text}
      </div>
      {card.sub && (
        <div style={{ ...mono, fontSize: 17, color: 'var(--accent)', letterSpacing: '.04em', marginTop: 10 }}>{card.sub}</div>
      )}
      {card.gloss && (
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--ink-soft)', marginTop: 10, maxWidth: '32ch', marginInline: 'auto', lineHeight: 1.5 }}>
          {card.gloss}
        </div>
      )}

      <div className="mt-7">
        <ShadowPlayer text={card.text} takeUrl={rec.takeUrl} muted={rec.recording} />
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
          {source === 'sentences' ? 'Next sentence' : 'Next word'}
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
