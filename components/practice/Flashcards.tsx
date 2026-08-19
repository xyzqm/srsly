'use client';
import { useState, useEffect, useRef } from 'react';
import type { DeckWord } from '@/lib/types';
import { useLanguage } from '@/lib/LanguageContext';
import { uiStrings, stateGlyphSize } from '@/lib/uiStrings';
import { isDueToday, isActive, todayStr } from '@/lib/deck';
import { getTodayCounts, bumpCount } from '@/lib/reviewCounts';
import { getReverseCards, setReverseCards } from '@/lib/flashcardPrefs';
import { speak, prefetchAudio } from '@/lib/speech';
import { POLYPHONES } from '@/lib/polyphones';
import DailyProverb from '@/components/read/DailyProverb';
import {
  fsrsSchedule, fsrsNextInterval, fmtInterval, getSrsSettings, isLearningCard,
  DEFAULT_SRS_SETTINGS, type FsrsGrade, type SrsSettings,
} from '@/lib/fsrs';

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Text to speak for a card. A bare polyphone character is ambiguous to TTS — with no
 * surrounding words it just reads the most common pronunciation (e.g. 行 → xíng even on
 * a háng card). Passages avoid this because the sentence supplies context; here we give
 * the same context by speaking the example sentence (if it contains the character) or a
 * compound that does, so the intended reading is voiced. Non-polyphones read the
 * character directly.
 */
function cardSpeechText(card: DeckWord): string {
  const isPoly = !!POLYPHONES[card.h] || !!(card.compounds && card.compounds.length);
  if (isPoly) {
    const cn = card.cn ? stripHtml(card.cn) : '';
    if (cn && cn.includes(card.h)) return cn;
    const comp = card.compounds?.find(c => c.includes(card.h));
    if (comp) return comp;
  }
  return card.h;
}

interface Props {
  deck: DeckWord[];
  deckLoaded?: boolean;
  /** Optional next-step CTA shown when the session ends. Omitted = no button. */
  onDone?: () => void;
  onGrade?: (cardId: string, grade: number) => void; // receives the card's stable id
  /** Reports the session's recall rate (0–1) once, when it completes, to extend the daily
   *  streak. Fill-in-the-blank and Conversation used to be what marked Practice as "studied
   *  today"; with those gone, flashcards are the only thing left that can. Withheld for cram,
   *  same as onGrade — a stateless drill should not move the streak either. */
  onScore?: (score: number) => void;
  /** Cram mode: drill the given words regardless of due date or daily limits, and
   *  WITHOUT changing their schedule (Again re-queues within the session; safe before a test). */
  cram?: boolean;
}

function sdm(m: string) {
  // Split on either separator (older cards use commas, newer use semicolons).
  return m.split(/\s*[;,]\s*/).filter(Boolean).map((part, i, arr) => (
    <span key={i}>{part}{i < arr.length - 1 && <span style={{ fontFamily: 'var(--f-display)', fontSize: '1.15em', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--ink-soft)' }}>; </span>}</span>
  ));
}

const GRADES: { label: string; grade: FsrsGrade; color: string }[] = [
  { label: 'Again', grade: 1, color: 'var(--accent)' },
  { label: 'Hard',  grade: 2, color: 'var(--gold)' },
  { label: 'Good',  grade: 3, color: 'var(--jade)' },
  { label: 'Easy',  grade: 4, color: 'var(--ink-soft)' },
];

export default function Flashcards({ deck, deckLoaded = true, onDone, onGrade, onScore, cram = false }: Props) {
  const language = useLanguage();
  const ui = uiStrings(language);
  const [settings, setSettings] = useState<SrsSettings>(DEFAULT_SRS_SETTINGS);
  useEffect(() => { setSettings(getSrsSettings()); }, []);

  // queue: null = not yet initialised; [] = session done or no due cards
  const [queue, setQueue] = useState<DeckWord[] | null>(null);
  const [totalInitial, setTotalInitial] = useState(0);
  const [hiddenByLimit, setHiddenByLimit] = useState(0);
  const [results, setResults] = useState<{ label: string; color: string }[]>([]);
  const [revealed, setRevealed] = useState(false);
  // Bumped once a second while waiting on a learning card; its only job is to re-render so
  // the countdown advances, so it is read for its side effect rather than its value.
  const [, setTick] = useState(0);
  /** Cards the user explicitly chose to study before their delay elapsed, by stable key.
   *  Cleared for a card as soon as it is graded, so pulling one forward is a one-off
   *  decision and never turns the delay off for the rest of the session. */
  const [aheadKeys, setAheadKeys] = useState<Set<string>>(new Set());

  // "Flip cards" / reverse study: show the meaning on the front, recall the word on the
  // back. Persisted (localStorage prefs) so it survives across sessions/days.
  const [reverse, setReverse] = useState(false);
  useEffect(() => { setReverse(getReverseCards()); }, []);
  const toggleReverse = () => {
    setReverse(prev => { const next = !prev; setReverseCards(next); return next; });
    setRevealed(false); // re-hide so the new orientation's answer isn't already showing
  };

  // Build session queue once when deck loads
  useEffect(() => {
    if (queue !== null) return;
    if (!deckLoaded) return;
    if (deck.length === 0) { setQueue([]); return; }
    // Cram: drill the given subset as-is — no due/limit filtering, no scheduling.
    if (cram) {
      const q = deck.slice();
      setQueue(q);
      setTotalInitial(q.length);
      setHiddenByLimit(0);
      return;
    }
    const today = todayStr();
    const due = deck
      .filter(w => isDueToday(w, today))
      .sort((a, b) => {
        if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
        return (a.reviews ?? 0) - (b.reviews ?? 0);
      });

    // Apply the daily new-cards/reviews limits (counting across sessions). Learning
    // cards are time-critical and never capped; new and review cards each have a
    // remaining daily budget.
    const s = getSrsSettings();
    const counts = getTodayCounts();
    const isNew = (w: DeckWord) => (w.reviews ?? 0) === 0 && w.stability === undefined && w.phase !== 'learning';
    const learningDue = due.filter(w => w.phase === 'learning');
    const newDue      = due.filter(isNew);
    const reviewDue   = due.filter(w => !isNew(w) && w.phase !== 'learning');

    const cappedReview = reviewDue.slice(0, Math.max(0, s.reviewsPerDay - counts.reviewCount));
    const cappedNew    = newDue.slice(0, Math.max(0, s.newPerDay - counts.newCount));
    const q = [...learningDue, ...cappedReview, ...cappedNew];
    const hidden = (reviewDue.length - cappedReview.length) + (newDue.length - cappedNew.length);

    setQueue(q);
    setTotalInitial(q.length);
    setHiddenByLimit(hidden);
  }, [deck, deckLoaded, queue, cram]);

  // Report the session once, on completion. Guarded by a ref so a later re-render (a hover,
  // a settings read) cannot extend the streak a second time.
  const scored = useRef(false);
  useEffect(() => {
    if (scored.current || !onScore || cram) return;
    if (queue === null || queue.length > 0 || results.length === 0) return;
    scored.current = true;
    onScore(results.filter(r => r.label === 'Good' || r.label === 'Easy').length / results.length);
  }, [queue, results, onScore, cram]);

  // Re-render once a second ONLY while every remaining card is still on its delay, so the
  // countdown stays live without costing a render per second during normal grading.
  const waiting = queue !== null && queue.length > 0 &&
    !cram && queue.every(c => c.dueAtMs && c.dueAtMs > Date.now() && !aheadKeys.has(c.id ?? c.h));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  // Keyboard shortcuts: Space/Enter reveals the answer, then grades Good; 1–4 pick a
  // grade directly. A single listener reads live handlers from a ref so it always
  // acts on the current card without re-binding every render.
  const kbd = useRef<{
    canAct: boolean; revealed: boolean; cram: boolean;
    reveal: () => void; grade: (g: FsrsGrade) => void; replay: () => void;
    cramAgain: () => void; cramGot: () => void;
  }>({
    canAct: false, revealed: false, cram: false,
    reveal: () => {}, grade: () => {}, replay: () => {}, cramAgain: () => {}, cramGot: () => {},
  });
  const lastPrefetch = useRef<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = kbd.current;
      if (!k.canAct) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); k.replay(); return; }
      if (k.cram) {
        // Quizlet-style: space/click reveals, then ←/1 = again, →/2 = got it.
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!k.revealed) k.reveal(); return; }
        if (!k.revealed) return;
        if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); k.cramAgain(); }
        else if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); k.cramGot(); }
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!k.revealed) k.reveal(); else k.grade(3);
      } else if (k.revealed && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        k.grade(Number(e.key) as FsrsGrade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Disabled by default each render; the card render path below re-enables it.
  kbd.current.canAct = false;

  if (!deckLoaded || queue === null) {
    return <div className="py-14 text-center" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>Loading…</div>;
  }

  if (deck.length === 0) {
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: stateGlyphSize(ui.empty), color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>{ui.empty}</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>No words in your deck yet.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0', maxWidth: '34ch', marginInline: 'auto', lineHeight: 1.6 }}>
          Go to the <strong>Read</strong> tab and click any underlined word to add it, or add words manually in the <strong>Vocab</strong> tab.
        </p>
      </div>
    );
  }

  // A learning card re-queued with `dueAtMs` is NOT ready until that moment arrives.
  // This partition is the whole point of the learning steps: without it a card graded
  // "Good (10m)" came straight back round, so nothing ever graduated and the interval
  // growth the scheduler was computing was never visible.
  const nowMs = Date.now();
  const keyOf = (c: DeckWord) => c.id ?? c.h;
  const isReady = (c: DeckWord) => cram || !c.dueAtMs || c.dueAtMs <= nowMs || aheadKeys.has(keyOf(c));
  const readyCards  = queue.filter(isReady);
  const futureCards = queue.filter(c => !isReady(c));

  // All caught up — no cards were due today
  if (queue.length === 0 && results.length === 0) {
    const nextDue = deck.reduce<string | null>((earliest, w) => {
      if (!w.dueAt || !isActive(w)) return earliest;
      return earliest === null || w.dueAt < earliest ? w.dueAt : earliest;
    }, null);
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: stateGlyphSize(ui.caughtUp), color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>{ui.caughtUp}</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>
          {hiddenByLimit > 0 ? "That's your limit for today" : 'All caught up!'}
        </h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0', maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.6 }}>
          {hiddenByLimit > 0
            ? <>{hiddenByLimit} more card{hiddenByLimit === 1 ? '' : 's'} held back by today&apos;s daily limit. Raise it in <strong>Settings</strong> if you have time.</>
            : <>No cards are due for review right now.{nextDue && <> Next review scheduled for <strong>{nextDue}</strong>.</>}</>
          }
        </p>
        {onDone && (
          <button
            onClick={onDone}
            className="cursor-pointer transition-all duration-150 mt-6 inline-block"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)' }}
          >
            Cram instead →
          </button>
        )}
      </div>
    );
  }

  // Session complete — all cards reviewed
  if (queue.length === 0 && results.length > 0) {
    const okCount = results.filter(r => r.label === 'Good' || r.label === 'Easy').length;
    const total   = results.length;
    const dueNow  = deck.filter(w => isDueToday(w)).length;
    return (
      <div className="text-center py-10">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: stateGlyphSize(ui.complete), color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>{ui.complete}</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, marginTop: 8 }}>Session complete.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 4px' }}>
          {okCount} / {total} recalled
          {dueNow > 0
            ? <> · <span style={{ color: 'var(--accent)' }}>{dueNow} still due</span></>
            : ' · all reviewed for today'
          }
        </p>
        {hiddenByLimit > 0 && (
          <p style={{ color: 'var(--gold)', fontFamily: 'var(--f-mono)', fontSize: 12, margin: '0 0 4px' }}>
            {hiddenByLimit} more held back by today&apos;s limit — raise it in Settings.
          </p>
        )}
        <div className="flex justify-center gap-1 mt-3 mb-6">
          {results.map((r, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: r.color }} title={r.label} />
          ))}
        </div>
        {onDone && (
          <button
            onClick={onDone}
            className="cursor-pointer transition-all duration-150"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)', display: 'inline-flex', alignItems: 'center', gap: 10 }}
          >
            Done
          </button>
        )}

        {/* Earned, not decorative. This screen is otherwise a score and a row of squares;
            one idiom is the thing you take away from having finished. Constrained and
            left-aligned inside the centred block, because a proverb is a sentence and
            centred sentences are hard to read. */}
        <div className="mx-auto text-left" style={{ maxWidth: 440 }}>
          <DailyProverb showRule={false} />
        </div>
      </div>
    );
  }


  // Every remaining card is still counting down. Show the wait rather than silently
  // serving a card early — but never trap the user: they can pull the next one forward.
  if (readyCards.length === 0 && futureCards.length > 0) {
    const soonest = futureCards.reduce((a, b) => ((a.dueAtMs ?? 0) < (b.dueAtMs ?? 0) ? a : b));
    const secs = Math.max(0, Math.ceil(((soonest.dueAtMs ?? 0) - Date.now()) / 1000));
    const mm = Math.floor(secs / 60), ss = secs % 60;
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 40, fontWeight: 500, letterSpacing: '.02em', color: 'var(--accent)' }}>
          {mm}:{String(ss).padStart(2, '0')}
        </div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 21, fontWeight: 500, marginTop: 10 }}>
          {futureCards.length} card{futureCards.length === 1 ? '' : 's'} coming back
        </h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px auto 0', maxWidth: '38ch', lineHeight: 1.6 }}>
          Learning cards return after a short gap — that spacing is what makes them stick.
          {results.length > 0 && <> You&apos;ve graded {results.length} so far.</>}
        </p>
        <button
          onClick={() => setAheadKeys(prev => new Set(prev).add(soonest.id ?? soonest.h))}
          className="cursor-pointer transition-all duration-150 mt-6"
          style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '11px 20px' }}
        >
          Study the next one now
        </button>
      </div>
    );
  }

  const card          = readyCards[0];
  const progress      = totalInitial > 0 ? Math.max(0, Math.min(100, (results.length / (results.length + readyCards.length)) * 100)) : 0;
  const dueCount      = deck.filter(w => isDueToday(w)).length;
  const cardIsLearning = isLearningCard(card);

  function handleGrade(fsrsGrade: FsrsGrade, label: string, color: string) {
    // Cram is STATELESS, and this early return is the whole mechanism: it lands before
    // onGrade (the only FSRS write) and before bumpCount (the only daily-limit write), so a
    // crammed card keeps its stability, its due date, its review count and its status.
    // ExtrasTab also declines to pass onGrade for the cram instance, so it is guarded twice.
    // "Again" re-drills at the end of this session and nothing else changes.
    if (cram) {
      setResults(prev => [...prev, { label, color }]);
      setQueue(prev => {
        if (!prev) return prev;
        const without = prev.filter(c => c !== card);
        return fsrsGrade === 1 ? [...without, card] : without;
      });
      setRevealed(false);
      return;
    }
    onGrade?.(card.id ?? card.h, fsrsGrade);
    // Count toward the daily limits: a first-ever grade introduces a new card; a
    // graduated card being reviewed counts as a review. Learning repeats don't count.
    if (card.phase === undefined && (card.reviews ?? 0) === 0 && card.stability === undefined) bumpCount('new');
    else if (card.phase === 'review') bumpCount('review');
    setResults(prev => [...prev, { label, color }]);

    setAheadKeys(prev => {
      const k = card.id ?? card.h;
      if (!prev.has(k)) return prev;
      const next = new Set(prev); next.delete(k); return next;
    });

    const newState    = fsrsSchedule(card, fsrsGrade, settings);
    const updatedCard: DeckWord = { ...card, ...newState };
    const stillLearning = newState.phase !== 'review';

    setQueue(prev => {
      if (!prev) return prev;
      // Remove this card instance (reference equality is safe here)
      const without = prev.filter(c => c !== card);
      if (stillLearning) {
        // Re-insert with updated dueAtMs; shown only when dueAtMs <= Date.now()
        return [...without, updatedCard];
      }
      return without;
    });

    setRevealed(false);
  }

  // Audio: warm the cache when a new card appears so the first replay is instant.
  const speechText = cardSpeechText(card);
  const cardKey = card.id ?? card.h;
  if (lastPrefetch.current !== cardKey) {
    lastPrefetch.current = cardKey;
    void prefetchAudio(speechText);
  }

  // Enable keyboard shortcuts for the card currently on screen.
  kbd.current = {
    canAct: true,
    revealed,
    cram,
    reveal: () => setRevealed(true),
    grade: (g) => { const m = GRADES.find(x => x.grade === g)!; handleGrade(m.grade, m.label, m.color); },
    replay: () => { void speak(speechText); },
    cramAgain: () => handleGrade(1, 'Again', 'var(--accent)'),
    cramGot: () => handleGrade(3, 'Got it', 'var(--jade)'),
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-end mb-6 gap-4">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            {cram ? 'Cram · not scheduled' : 'Vocabulary review · FSRS'}
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)' }}>
            {results.length + 1} of {results.length + readyCards.length + futureCards.length}
            {!cram && dueCount > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 500 }}>· {dueCount} due today</span>
            )}
          </div>
        </div>
        <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden', flex: 1, maxWidth: 240 }}>
          <div style={{ height: '100%', background: 'var(--accent)', width: `${progress}%`, transition: 'width .4s cubic-bezier(.2,.7,.3,1)', borderRadius: 4 }} />
        </div>
      </div>

      {/* Flip-cards (reverse study) toggle — persists across sessions */}
      <div className="flex justify-end mb-3">
        <button
          onClick={toggleReverse}
          role="switch"
          aria-checked={reverse}
          className="inline-flex items-center gap-2 cursor-pointer"
          title="Flip cards — show the meaning first and recall the word"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: reverse ? 'var(--accent)' : 'var(--ink-faint)' }}>
            Flip cards
          </span>
          <span style={{ position: 'relative', width: 34, height: 19, borderRadius: 10, background: reverse ? 'var(--accent)' : 'var(--line)', transition: 'background .15s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: reverse ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.25)' }} />
          </span>
        </button>
      </div>

      {/* Card state badge — hidden in cram (no scheduling, Quizlet-style clean face) */}
      {!cram && <div className="flex justify-end mb-2 gap-2">
        {cardIsLearning ? (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em', background: 'color-mix(in srgb, var(--gold) 15%, var(--paper))', color: 'var(--gold)', border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)', borderRadius: 4, padding: '2px 6px' }}>
            {card.stability !== undefined ? '↺ relearning' : '✦ learning'} · step {(card.learningStep ?? 0) + 1}/{LEARNING_STEP_COUNT}
          </span>
        ) : card.stability !== undefined ? (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em', background: 'var(--line-soft)', color: 'var(--ink-faint)', borderRadius: 4, padding: '2px 6px' }}>
            S={card.stability.toFixed(1)}d · D={card.difficulty?.toFixed(1) ?? '?'}
          </span>
        ) : null}
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em', background: 'var(--line-soft)', color: 'var(--ink-faint)', borderRadius: 4, padding: '2px 6px' }}>
          reviewed {card.reviews ?? 0}×
          {(card.lapses ?? 0) > 0 && ` · ${card.lapses} lapse${card.lapses === 1 ? '' : 's'}`}
          {(card.reviews ?? 0) === 0 && !card.stability && ' · new'}
          {(card.reviews ?? 0) >= 5 && (card.lapses ?? 0) === 0 && ' · mature'}
        </span>
      </div>}

      {/* Card face — in cram, the whole card flips on click (Quizlet-style) */}
      <div
        onClick={cram && !revealed ? () => setRevealed(true) : undefined}
        className="relative flex flex-col items-center justify-center text-center rounded-[14px] min-h-[330px] px-10 py-14"
        style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 55%, var(--paper)), var(--card))', border: '1px solid var(--line)', boxShadow: '0 10px 30px rgba(34,32,28,.06)', cursor: cram && !revealed ? 'pointer' : 'default' }}
      >
        <div className="absolute left-6 right-6 top-3.5 h-px" style={{ background: 'var(--line-soft)' }} />
        <div className="absolute" style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', top: 18 }}>
          {reverse ? "What's the word?" : 'What does this mean?'}
        </div>
        {/* Audio plays the word — in reverse it'd give the answer away, so hide until revealed */}
        {(!reverse || revealed) && (
          <button
            onClick={(e) => { e.stopPropagation(); void speak(speechText); }}
            title="Play audio (R)"
            className="absolute cursor-pointer transition-all duration-150 hover:-translate-y-0.5"
            style={{ top: 12, right: 14, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)' }}
          >
            <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" />
            </svg>
          </button>
        )}

        {/* Front: the word (normal) or its meaning (reverse) */}
        {reverse ? (
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 34, fontWeight: 500, lineHeight: 1.3, maxWidth: '22ch' }}>
            {sdm(card.m)}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--f-han)', fontSize: 88, fontWeight: 'var(--han-weight)' as 'bold', lineHeight: 1, letterSpacing: '.02em' }}>
            {card.h}
          </div>
        )}
        <div style={{ marginTop: 24, fontSize: 14, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: 'var(--f-display)' }}>
          {cram
            ? (revealed ? 'Did you know it?' : 'Click to reveal')
            : (revealed ? 'How well did you remember?' : (reverse ? 'Recall the word, then reveal' : 'Think of the meaning, then reveal'))}
        </div>

        {/* Back (revealed): the answer — the word + pinyin (reverse) or pinyin + meaning (normal) */}
        <div style={{ opacity: revealed ? 1 : 0, maxHeight: revealed ? 300 : 0, overflow: 'hidden', transition: '.4s', marginTop: revealed ? 18 : 0 }}>
          {reverse ? (
            <>
              <div style={{ fontFamily: 'var(--f-han)', fontSize: 56, fontWeight: 'var(--han-weight)' as 'bold', lineHeight: 1, letterSpacing: '.02em' }}>{card.h}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, color: 'var(--accent)', letterSpacing: '.04em', marginTop: 12 }}>{card.p}</div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, color: 'var(--accent)', letterSpacing: '.04em' }}>{card.p}</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, marginTop: 6 }}>{sdm(card.m)}</div>
            </>
          )}
          {card.cn && (
            <div style={{ marginTop: 18, fontSize: 15, color: 'var(--ink-soft)', maxWidth: '34ch', lineHeight: 1.6 }}>
              <span style={{ fontFamily: 'var(--f-han)', color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: card.cn }} />
              <br />{card.en}
            </div>
          )}
        </div>
      </div>

      {/* Grade buttons */}
      <div className="text-center mt-5">
        {cram ? (
          // Cram: Quizlet-style two-way outcome — no scheduling, no intervals.
          !revealed ? (
            // A spacer, not a second prompt — the card face already says "Click to reveal".
            // It holds the grade buttons' height so revealing doesn't shift the layout.
            <div style={{ height: 39 }} aria-hidden />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 22 }}>
              {([
                // No `sub` hint text: the cram face stays clean. The ←/1 and →/2 bindings
                // are still live — see the `kbd` handler, which is deliberately untouched.
                { label: 'Again',  color: 'var(--accent)', onClick: () => handleGrade(1, 'Again', 'var(--accent)') },
                { label: 'Got it', color: 'var(--jade)',   onClick: () => handleGrade(3, 'Got it', 'var(--jade)') },
              ]).map(b => (
                <button
                  key={b.label}
                  onClick={b.onClick}
                  className="cursor-pointer transition-all duration-150 hover:-translate-y-0.5"
                  style={{ background: 'var(--card)', border: `1px solid var(--line)`, borderBottom: `2px solid ${b.color}`, borderRadius: 10, padding: '13px 8px', textAlign: 'center' }}
                >
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: b.color }}>{b.label}</div>
                </button>
              ))}
            </div>
          )
        ) : !revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="cursor-pointer transition-all duration-150"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '11px 22px' }}
          >
            Show answer
          </button>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 22 }}>
            {GRADES.map(g => {
              const days = fsrsNextInterval(card, g.grade, settings);
              const sub = fmtInterval(days);
              return (
                <button
                  key={g.label}
                  onClick={() => handleGrade(g.grade, g.label, g.color)}
                  className="cursor-pointer transition-all duration-150 hover:-translate-y-0.5"
                  style={{ background: 'var(--card)', border: `1px solid var(--line)`, borderBottom: `2px solid ${g.color}`, borderRadius: 10, padding: '13px 8px', textAlign: 'center' }}
                >
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: g.color }}>{g.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 3 }}>{sub}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '.05em', textAlign: 'center' }}>
          {totalInitial} card{totalInitial !== 1 ? 's' : ''} in today&apos;s session · {deck.length} total in deck
          {settings.desiredRetention !== DEFAULT_SRS_SETTINGS.desiredRetention && (
            <span style={{ marginLeft: 8 }}>· {Math.round(settings.desiredRetention * 100)}% retention target</span>
          )}
        </div>
      </div>
    </div>
  );
}

const LEARNING_STEP_COUNT = 2;
