'use client';
import { useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { speak } from '@/lib/speech';

interface Props { deck: DeckWord[]; onDone: () => void; onGrade?: (hanzi: string, delta: number) => void; }

function sdm(m: string) {
  return m.split(', ').map((part, i, arr) => (
    <span key={i}>{part}{i < arr.length - 1 && <span style={{ fontFamily: 'var(--f-display)', fontSize: '1.15em', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--ink-soft)' }}>, </span>}</span>
  ));
}

export default function Flashcards({ deck, onDone, onGrade }: Props) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);

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
    return (
      <div className="text-center py-10">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 60, color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>完</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 500, marginTop: 8 }}>Queue cleared.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 20px' }}>{deck.length} word{deck.length === 1 ? '' : 's'} scheduled. Now reinforce them with a drill or a chat.</p>
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

  const card = deck[idx];
  const progress = (idx / deck.length) * 100;

  const grade = (delta: number) => {
    onGrade?.(card.h, delta);
    if (idx + 1 >= deck.length) { setDone(true); return; }
    setIdx(i => i + 1);
    setRevealed(false);
  };

  const grades = [
    { label: 'Again', interval: '< 1 day', color: 'var(--accent)',   delta: 0  },
    { label: 'Hard',  interval: '1 day',   color: 'var(--gold)',     delta: 0  },
    { label: 'Good',  interval: '3 days',  color: 'var(--jade)',     delta: 1  },
    { label: 'Easy',  interval: '7 days',  color: 'var(--ink-soft)', delta: 2  },
  ];

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Vocabulary review</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)' }}>Card {idx + 1} of {deck.length}</div>
        </div>
        <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden', flex: 1, maxWidth: 240 }}>
          <div style={{ height: '100%', background: 'var(--accent)', width: `${progress}%`, transition: 'width .4s cubic-bezier(.2,.7,.3,1)', borderRadius: 4 }} />
        </div>
      </div>

      <div
        className="relative flex flex-col items-center justify-center text-center rounded-[14px] min-h-[330px] px-10 py-14"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 40%, white), var(--card))',
          border: '1px solid var(--line)', boxShadow: '0 1px 0 #fff inset, 0 10px 30px rgba(34,32,28,.05)',
        }}
      >
        <div className="absolute left-6 right-6 top-3.5 h-px" style={{ background: 'var(--line-soft)' }} />
        <div className="absolute" style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', top: 18 }}>
          Recall the meaning
        </div>

        <div style={{ fontFamily: 'var(--f-han)', fontSize: 88, fontWeight: 'var(--han-weight)' as 'bold', lineHeight: 1, letterSpacing: '.02em' }}>
          {card.h}
        </div>
        <div style={{ marginTop: 24, fontSize: 14, color: 'var(--ink-faint)', fontStyle: 'italic', fontFamily: 'var(--f-display)' }}>
          {revealed ? 'How well did you remember?' : 'What does this mean?'}
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
                onClick={() => grade(g.delta)}
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

    </div>
  );
}
