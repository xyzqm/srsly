'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { useLanguage } from '@/lib/LanguageContext';
import { uiStrings, stateGlyphSize } from '@/lib/uiStrings';
import { speakLocal, stopAll } from '@/lib/speech';
import { loadListenSentences, type ListenSentence } from '@/lib/listenSentences';
import DrillLoading from './DrillLoading';

/**
 * Listen & repeat: hear it in the target language, say it back, move on.
 *
 * ── IT USED TO RECORD YOU, AND THE RECORDING WAS REMOVED ON PURPOSE ──
 * This shipped as "Shadowing", with `getUserMedia` + `MediaRecorder` behind a Record button and
 * a Reference / Yours / Both transport so the two could be heard a beat apart. All of it worked
 * and all of it is gone (`hooks/useRecorder.ts`, `components/practice/ShadowPlayer.tsx`).
 *
 * The argument for removing it is that the comparison was asking the learner to do the one part
 * nothing here could help with. Hearing your own voice tells you that it differs from the model;
 * it does not tell you WHICH of pitch, vowel length, stress or rhythm differs, and this app
 * deliberately refuses to guess — a recognizer reports whether its language model matched, not
 * whether an accent is good, which is why the drill never scored anything. So the recording
 * bought a confrontation without a diagnosis, at the cost of a microphone permission, a
 * five-case `DOMException` map, MIME negotiation, object-URL lifetime, track release on three
 * exit paths, and an iOS autoplay rejection that could only ever be apologised for.
 *
 * What is left is the part that was always doing the work: a native-rate model sentence, on tap,
 * as many times as you like, free. The learner repeats it aloud and judges with their own ear,
 * which is how shadowing is actually taught and is what the old version's own copy said.
 *
 * ── WHAT THE REMOVAL BOUGHT, BEYOND THE SIMPLICITY ──
 * Nothing here touches a device permission any more, so there is no prompt to decline, no
 * blocked-microphone state, and nothing that behaves differently on iOS. The firewall test
 * (`tests/listenFirewall.test.ts`) gets stricter rather than looser: with no recorder, the
 * drill cannot capture audio at all, so "nothing leaves this device" stops being a property of
 * how the code is written and becomes a property of which APIs it can reach.
 *
 * ── IT STILL SCORES NOTHING, AND THAT IS STILL THE DESIGN ──
 * No FSRS, no streak, no activity log, no counters — the posture `lib/practiceSheet.ts`,
 * `lib/writingState.ts` and `lib/pact.ts` each take. A pronunciation drill that wrote to the
 * schedule would be scoring an accent, which nothing available here can honestly do.
 *
 * ── THE WHOLE DECK, NOT THE DUE CARDS ──
 * Due-ness is a scheduling idea and nothing here schedules, so filtering by it would borrow a
 * meaning this drill does not have — and it would empty the screen exactly when somebody has
 * caught up on their reviews, which is the worst possible moment to say there is nothing to
 * practise. Shuffled once per mount; not persisted, because a position would be stored state on
 * a drill whose whole claim is that it stores nothing.
 *
 * ── TWO SOURCES, BECAUSE A WORD AND A PHRASE TEACH DIFFERENT THINGS ──
 * Words come from your deck and are what you are actually studying; in Chinese a single syllable
 * carries a tone, which is the thing a beginner most needs to hear. SENTENCES come from
 * `lib/data/lesson-practice.json` and are the half a word cannot reach: rhythm and intonation
 * across a phrase, and for Spanish and French the hard parts — liaison, nasal vowels, where the
 * stress lands in a group — do not exist inside one word. Neither dominates, so the learner
 * picks. The choice is SESSION-LOCAL rather than a pref, for the stored-state reason above.
 *
 * ── THE VOICE IS `speakLocal`, NEVER `speak` ──
 * `speak()` reaches for the paid `/api/tts` first. This drill is pressed over and over by
 * design — that is the entire exercise — so the ordinary path would bill a round trip per press.
 * `tests/listenFirewall.test.ts` asserts this module cannot call the other one.
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

/** One thing to say out loud, whichever source it came from. */
interface Item { key: string; text: string; sub: string; gloss: string }

export default function ListenRepeat({ deck, deckLoaded = true, active = true }: Props) {
  const language = useLanguage();
  const ui = uiStrings(language);
  const [idx, setIdx] = useState(0);
  const [source, setSource] = useState<'words' | 'sentences'>('words');
  const [playing, setPlaying] = useState(false);
  /** null = the chunk has not answered yet; [] = this language genuinely has none. */
  const [sentences, setSentences] = useState<ListenSentence[] | null>(null);
  /**
   * Bumped by anything that invalidates a play in flight. `speakLocal`'s `onEnd` fires on a
   * timer the component does not control, so without this an utterance ending after the learner
   * has already advanced would clear the NEXT item's playing state.
   */
  const genRef = useRef(0);

  // Loaded on mount rather than on the toggle, so switching source is instant and so the toggle
  // can be hidden for a language that really has none instead of offered and empty. The panel
  // only mounts when this drill is first opened, so nobody else pays for the chunk.
  useEffect(() => {
    let alive = true;
    setSentences(null);
    loadListenSentences(language).then(rows => { if (alive) setSentences(rows); });
    return () => { alive = false; };
  }, [language]);

  const halt = useCallback(() => {
    genRef.current++;
    try { stopAll(); } catch { /* no synthesis on this platform */ }
    setPlaying(false);
  }, []);

  // Nothing may outlive this panel, and `SrsTab` keeps it MOUNTED when you switch drills — so
  // there is no unmount to rely on and a sentence would keep speaking over the flashcards.
  useEffect(() => { if (!active) halt(); }, [active, halt]);
  useEffect(() => () => { genRef.current++; try { stopAll(); } catch { /* ignore */ } }, []);

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

  const play = useCallback(() => {
    if (!card) return;
    halt();
    const gen = ++genRef.current;
    setPlaying(true);
    // `speakLocal` returns false rather than pretending: no synthesis means no model to copy,
    // and leaving the button lit would be a claim that something was said.
    const started = speakLocal(card.text, () => {
      if (gen !== genRef.current) return;
      setPlaying(false);
    });
    if (!started) setPlaying(false);
  }, [card, halt]);

  const next = useCallback(() => {
    halt();
    setIdx(i => (queue.length === 0 ? 0 : (i + 1) % queue.length));
  }, [halt, queue.length]);

  const pickSource = useCallback((s: 'words' | 'sentences') => {
    halt();
    setSource(s);
    setIdx(0);
  }, [halt]);

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
   * Sentences need no deck at all, so asking `!deckLoaded` regardless of source would tell a
   * learner with an empty deck there was nothing to practise while 87 sentences sat loaded; and
   * a language switch resets `sentences` to null while `source` stays put, so an unloaded list
   * would render as "this language has none" — NOT YET shown as NONE, the mistake CLAUDE.md
   * records more often than any other.
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
            Listen to sentences instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="text-center">
      {sourceToggle && <div className="flex justify-center mb-4">{sourceToggle}</div>}
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        Listen &amp; repeat · {idx + 1} of {queue.length}
      </div>

      {/* Shown, not hidden: this is not a recall test, and withholding it would make it one —
          you cannot copy a pronunciation you are still trying to remember.

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

      {/* One control, pressed as often as the learner likes. Tapping it while it speaks stops
          it — the same button, because a separate Stop is a second control for the state you
          are already looking at. */}
      <div className="mt-8">
        <button
          onClick={() => (playing ? halt() : play())}
          aria-pressed={playing}
          className={`cursor-pointer transition-all duration-150${playing ? ' playing-pulse' : ''}`}
          style={{
            ...mono, fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase',
            background: playing ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
            border: `1px solid ${playing ? 'var(--accent)' : 'var(--line)'}`,
            color: playing ? 'var(--accent)' : 'var(--ink)',
            borderRadius: 10, padding: '14px 32px',
          }}
        >
          {playing ? 'Playing' : 'Play'}
        </button>
      </div>

      <div className="mt-6">
        {/* Never gated on having played. A drill that scores nothing must not block either. */}
        <button
          onClick={next}
          className="cursor-pointer transition-all duration-150"
          style={{ ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '11px 24px' }}
        >
          {source === 'sentences' ? 'Next sentence' : 'Next word'}
        </button>
      </div>

      {/* It says what the drill IS, because a drill that grades nothing looks broken otherwise —
          there is no score, no streak and no "correct", and a learner is entitled to know that
          is deliberate. The old copy here promised that a RECORDING stayed on the device; there
          is no recording to promise anything about now, so the sentence is shorter and true. */}
      <div className="mt-7" style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.04em', maxWidth: '38ch', marginInline: 'auto', lineHeight: 1.6, opacity: 0.85 }}>
        Play it, say it out loud, move on. Nothing here is recorded, saved or scored — the ear
        doing the judging is yours.
      </div>
    </div>
  );
}
