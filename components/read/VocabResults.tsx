'use client';
import { DEFAULT_DECK } from '@/lib/data/deck';

interface WordResult { word: string; status: 'up' | 'down' | 'stable'; msg: string; }

interface Props { results: WordResult[]; }

const deckByH = Object.fromEntries(DEFAULT_DECK.map(d => [d.h, d]));

export default function VocabResults({ results }: Props) {
  return (
    <div className="mt-8 pt-8 animate-rise" style={{ borderTop: '2px solid var(--line)' }}>
      <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginBottom: 4 }}>
        Reading session — vocabulary updates
      </h3>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 22, lineHeight: 1.55 }}>
        Words you recalled in your answers without peeking earn a longer interval. Words you peeked at — or kept avoiding — return sooner.
      </p>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {results.map(r => {
          const d = deckByH[r.word];
          const color = r.status === 'up' ? 'var(--jade)' : r.status === 'down' ? 'var(--accent)' : 'var(--gold)';
          return (
            <div
              key={r.word}
              className="flex items-center gap-3 rounded-[11px] px-4 py-3.5 relative overflow-hidden"
              style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
            >
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[11px]" style={{ background: color }} />
              <div style={{ fontFamily: 'var(--f-han)', fontSize: 22, fontWeight: 'var(--han-weight)' as 'bold' }}>{r.word}</div>
              <div className="flex-1 min-w-0">
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.04em' }}>{d?.p}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.04em', marginTop: 2, color }}>{r.msg}</div>
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, color, lineHeight: 1, transform: r.status === 'down' ? 'rotate(180deg)' : undefined }}>
                {r.status === 'stable' ? '→' : '↑'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
