'use client';
import { useState, useEffect } from 'react';
import type { DeckWord } from '@/lib/types';
import { speak } from '@/lib/speech';
import { fsrsNextInterval, fmtInterval, type FsrsGrade } from '@/lib/fsrs';

interface Props {
  deck: DeckWord[];
  onDone: () => void;
  onGrade?: (hanzi: string, grade: number) => void;
}

/** A word is due when its dueAt date is today or earlier, or when dueAt is absent (new word). */
function isDue(word: DeckWord): boolean {
  if (!word.dueAt) return true;
  const today = new Date().toISOString().slice(0, 10);
  return word.dueAt <= today;
}

function sdm(m: string) {
  return m.split(', ').map((part, i, arr) => (
    <span key={i}>{part}{i < arr.length - 1 && <span style={{ fontFamily: 'var(--f-display)', fontSize: '1.15em', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--ink-soft)' }}>, </span>}</span>
  ));
}

const GRADES: { label: string; grade: FsrsGrade; color: string }[] = [
  { label: 'Again', grade: 1, color: 'var(--accent)' },
  { label: 'Hard',  grade: 2, color: 'var(--gold)' },
  { label: 'Good',  grade: 3, color: 'var(--jade)' },
  { label: 'Easy',  grade: 4, color: 'var(--ink-soft)' },
];

export default function Flashcards({ deck, onDone, onGrade }: Props) {
  // Freeze the session queue once the deck first loads (deck is [] at mount
  // because useVocabDeck loads async). The null→array transition happens
  // exactly once; subsequent deck changes (FSRS updates) don't rebuild it.
  const [sessionQueue, setSessionQueue] = useState<DeckWord[] | null>(null);

  useEffect(() => {
    if (sessionQueue !== null) return; // already frozen — don't rebuild mid-session
    if (deck.length === 0) return;     // deck not loaded yet — wait
    const today = new Date().toISOString().slice(0, 10);
    const q = deck
      .filter(w => !w.dueAt || w.dueAt <= today)
      .sort((a, b) => {
        // Most overdue first, then fewest reviews
        if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
        return (a.reviews ?? 0) - (b.reviews ?? 0);
      });
    setSessionQueue(q);
  }, [deck, sessionQueue]);

  const [idx, setIdx]           = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone]         = useState(false);
  // Track results within this session for the summary screen
  const [results, setResults]   = useState<{ label: string; color: string }[]>([]);

  if (deck.length === 0) {
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 52, color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>空</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>No words in your deck yet.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0', maxWidth: '34ch', marginInline: 'auto', lineHeight: 1.6 }}>
          Go to the <strong>Read</strong> tab and click any underlined word to add it, or add words manually in the <strong>Vocab</strong> tab.
        </p>
      </div>
    );
  }

  // Queue still building (deck loads async — null for one render)
  if (sessionQueue === null) {
    return <div className="py-14 text-center" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>Loading…</div>;
  }

  // No cards due today
  if (sessionQueue.length === 0) {
    const nextDue = deck.reduce<string | null>((earliest, w) => {
      if (!w.dueAt) return earliest;
      return earliest === null || w.dueAt < earliest ? w.dueAt : earliest;
    }, null);
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 52, color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>好</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>All caught up!</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0', maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.6 }}>
          No cards are due for review right now.
          {nextDue && (
            <> Next review scheduled for <strong>{nextDue}</strong>.</>
          )}
        </p>
        <button
          onClick={onDone}
          className="cursor-pointer transition-all duration-150 mt-6 inline-block"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px',
            boxShadow: '0 2px 0 var(--accent-deep)',
          }}
        >
          Go to fill-in-blank →
        </button>
      </div>
    );
  }

  if (done) {
    const okCount = results.filter(r => r.label === 'Good' || r.label === 'Easy').length;
    const total   = results.length;
    const dueNow  = deck.filter(isDue).length;
    return (
      <div className="text-center py-10">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 60, color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>完</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, marginTop: 8 }}>Session complete.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 4px' }}>
          {okCount} / {total} recalled
          {dueNow > 0
            ? <> · <span style={{ color: 'var(--accent)' }}>{dueNow} still due</span></>
            : ' · all reviewed for today'
          }
        </p>
        {/* Mini result bar */}
        <div className="flex justify-center gap-1 mt-3 mb-6">
          {results.map((r, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: r.color }} title={r.label} />
          ))}
        </div>
        <button
          onClick={onDone}
          className="cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px',
            boxShadow: '0 2px 0 var(--accent-deep)', display: 'inline-flex', alignItems: 'center', gap: 10,
          }}
        >
          Continue to fill-in →
        </button>
      </div>
    );
  }

  const card = sessionQueue[idx];
  const totalInSession = sessionQueue.length;
  const progress = (idx / totalInSession) * 100;
  const dueCount = deck.filter(isDue).length;

  const grade = (fsrsGrade: FsrsGrade, label: string, color: string) => {
    onGrade?.(card.h, fsrsGrade);
    setResults(prev => [...prev, { label, color }]);
    if (idx + 1 >= totalInSession) { setDone(true); return; }
    setIdx(i => i + 1);
    setRevealed(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Vocabulary review · FSRS
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)' }}>
            Card {idx + 1} of {totalInSession}
            {dueCount > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 500 }}>· {dueCount} due today</span>
            )}
          </div>
        </div>
        <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden', flex: 1, maxWidth: 240 }}>
          <div style={{ height: '100%', background: 'var(--accent)', width: `${progress}%`, transition: 'width .4s cubic-bezier(.2,.7,.3,1)', borderRadius: 4 }} />
        </div>
      </div>

      {/* FSRS state badge */}
      <div className="flex justify-end mb-2 gap-2">
        {card.stability !== undefined && (
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em',
            background: 'var(--line-soft)', color: 'var(--ink-faint)',
            borderRadius: 4, padding: '2px 6px',
          }}>
            S={card.stability.toFixed(1)}d · D={card.difficulty?.toFixed(1) ?? '?'}
          </span>
        )}
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em',
          background: 'var(--line-soft)', color: 'var(--ink-faint)',
          borderRadius: 4, padding: '2px 6px',
        }}>
          reviewed {card.reviews ?? 0}×
          {(card.lapses ?? 0) > 0 && ` · ${card.lapses} lapse${card.lapses === 1 ? '' : 's'}`}
          {(card.reviews ?? 0) === 0 && card.stability === undefined && ' · new'}
          {(card.reviews ?? 0) >= 5 && (card.lapses ?? 0) === 0 && ' · mature'}
        </span>
      </div>

      {/* Card */}
      <div
        className="relative flex flex-col items-center justify-center text-center rounded-[14px] min-h-[330px] px-10 py-14"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 55%, var(--paper)), var(--card))',
          border: '1px solid var(--line)', boxShadow: '0 10px 30px rgba(34,32,28,.06)',
        }}
      >
        <div className="absolute left-6 right-6 top-3.5 h-px" style={{ background: 'var(--line-soft)' }} />
        <div className="absolute" style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', top: 18 }}>
          What does this mean?
        </div>

        <div style={{ fontFamily: 'var(--f-han)', fontSize: 88, fontWeight: 'var(--han-weight)' as 'bold', lineHeight: 1, letterSpacing: '.02em' }}>
          {card.h}
        </div>
        <div style={{ marginTop: 24, fontSize: 14, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: 'var(--f-display)' }}>
          {revealed ? 'How well did you remember?' : 'Think of the meaning, then reveal'}
        </div>

        <div style={{ opacity: revealed ? 1 : 0, maxHeight: revealed ? 300 : 0, overflow: 'hidden', transition: '.4s', marginTop: revealed ? 18 : 0 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, color: 'var(--accent)', letterSpacing: '.04em' }}>{card.p}</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, marginTop: 6 }}>{sdm(card.m)}</div>
          {card.cn && (
            <div style={{ marginTop: 18, fontSize: 15, color: 'var(--ink-soft)', maxWidth: '34ch', lineHeight: 1.6 }}>
              <span style={{ fontFamily: 'var(--f-han)', color: 'var(--ink)' }} dangerouslySetInnerHTML={{ __html: card.cn }} />
              <br />
              {card.en}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="text-center mt-5">
        {!revealed ? (
          <button
            onClick={() => { setRevealed(true); speak(card.h); }}
            className="cursor-pointer transition-all duration-150"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '11px 22px' }}
          >
            Show answer
          </button>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 22 }}>
            {GRADES.map(g => {
              const days = fsrsNextInterval(card, g.grade);
              return (
                <button
                  key={g.label}
                  onClick={() => grade(g.grade, g.label, g.color)}
                  className="cursor-pointer transition-all duration-150 hover:-translate-y-0.5"
                  style={{
                    background: 'var(--card)', border: `1px solid var(--line)`, borderBottom: `2px solid ${g.color}`,
                    borderRadius: 10, padding: '13px 8px', textAlign: 'center',
                  }}
                >
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: g.color }}>{g.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 3 }}>{fmtInterval(days)}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Session info footer */}
      <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '.05em', textAlign: 'center' }}>
          Reviewing {totalInSession} due card{totalInSession !== 1 ? 's' : ''} · {deck.length} total in deck
        </div>
      </div>
    </div>
  );
}
