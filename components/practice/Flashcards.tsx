'use client';
import { useState, useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { speak } from '@/lib/speech';

interface Props {
  deck: DeckWord[];
  onDone: () => void;
  onGrade?: (hanzi: string, delta: number) => void;
}

/**
 * Determine if a word is "due" based on when it was last reviewed.
 * We use `reviews` as a rough proxy. Words with no `lastSeen` date fall back
 * to always-due so they're always surfaced for new users.
 */
function isDue(word: DeckWord): boolean {
  const reviews = word.reviews ?? 0;
  // Treat words with 0-1 reviews as always due
  if (reviews <= 1) return true;
  // Without a lastSeen timestamp we can't be precise — treat as due
  return true; // TODO: add lastSeen field to DeckWord for precise scheduling
}

const MAX_SESSION = 20; // cap cards per session so it doesn't feel endless

function sdm(m: string) {
  return m.split(', ').map((part, i, arr) => (
    <span key={i}>{part}{i < arr.length - 1 && <span style={{ fontFamily: 'var(--f-display)', fontSize: '1.15em', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--ink-soft)' }}>, </span>}</span>
  ));
}

export default function Flashcards({ deck, onDone, onGrade }: Props) {
  // Build the session queue once: due words first (sorted fewest reviews → most),
  // then any non-due words if the total queue is very small.
  const sessionQueue = useMemo(() => {
    if (deck.length === 0) return [];
    const due    = deck.filter(isDue).sort((a, b) => (a.reviews ?? 0) - (b.reviews ?? 0));
    const notDue = deck.filter(w => !isDue(w));
    // Fill up to MAX_SESSION: prioritise due, then pad with non-due
    const combined = [...due, ...notDue].slice(0, MAX_SESSION);
    return combined;
  }, [deck]); // intentionally only recomputes when deck changes (not on grade)

  const [idx, setIdx]         = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone]        = useState(false);
  // Track results within this session for the summary screen
  const [results, setResults]  = useState<{ label: string; color: string }[]>([]);

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

  if (done) {
    const okCount = results.filter(r => r.label === 'Good' || r.label === 'Easy').length;
    const total   = results.length;
    return (
      <div className="text-center py-10">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 60, color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>完</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, marginTop: 8 }}>Session complete.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 4px' }}>
          {okCount} / {total} recalled · {deck.length - total > 0 ? `${deck.length - total} more word${deck.length - total === 1 ? '' : 's'} in your deck` : 'all words reviewed'}
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

  const grade = (delta: number, label: string, color: string) => {
    onGrade?.(card.h, delta);
    setResults(prev => [...prev, { label, color }]);
    if (idx + 1 >= totalInSession) { setDone(true); return; }
    setIdx(i => i + 1);
    setRevealed(false);
  };

  const grades = [
    { label: 'Again',  interval: 'retry soon',  color: 'var(--accent)',    delta: -1 },
    { label: 'Hard',   interval: '1 day',        color: 'var(--gold)',      delta: 0  },
    { label: 'Good',   interval: '3–7 days',     color: 'var(--jade)',      delta: 1  },
    { label: 'Easy',   interval: '2+ weeks',     color: 'var(--ink-soft)',  delta: 2  },
  ];

  const dueCount = deck.filter(isDue).length;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Vocabulary review
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)' }}>
            Card {idx + 1} of {totalInSession}
            {dueCount > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 500 }}>· {dueCount} due</span>
            )}
          </div>
        </div>
        <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden', flex: 1, maxWidth: 240 }}>
          <div style={{ height: '100%', background: 'var(--accent)', width: `${progress}%`, transition: 'width .4s cubic-bezier(.2,.7,.3,1)', borderRadius: 4 }} />
        </div>
      </div>

      {/* Review count badge */}
      <div className="flex justify-end mb-2">
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em',
          background: 'var(--line-soft)', color: 'var(--ink-faint)',
          borderRadius: 4, padding: '2px 6px',
        }}>
          reviewed {card.reviews ?? 0}×
          {(card.reviews ?? 0) >= 5 && ' · mature'}
          {(card.reviews ?? 0) === 0 && ' · new'}
        </span>
      </div>

      {/* Card */}
      <div
        className="relative flex flex-col items-center justify-center text-center rounded-[14px] min-h-[330px] px-10 py-14"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 40%, white), var(--card))',
          border: '1px solid var(--line)', boxShadow: '0 1px 0 #fff inset, 0 10px 30px rgba(34,32,28,.05)',
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
            {grades.map(g => (
              <button
                key={g.label}
                onClick={() => grade(g.delta, g.label, g.color)}
                className="cursor-pointer transition-all duration-150 hover:-translate-y-0.5"
                style={{
                  background: 'var(--card)', border: `1px solid var(--line)`, borderBottom: `2px solid ${g.color}`,
                  borderRadius: 10, padding: '13px 8px', textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500, color: g.color }}>{g.label}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: 3 }}>{g.interval}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Session info footer */}
      <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '.05em', textAlign: 'center' }}>
          Reviewing {totalInSession} of {deck.length} word{deck.length !== 1 ? 's' : ''} this session (max {MAX_SESSION}/session)
        </div>
      </div>
    </div>
  );
}
