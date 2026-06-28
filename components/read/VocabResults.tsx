'use client';

interface WordResult { word: string; pinyin?: string; status: 'up' | 'down' | 'stable'; msg: string; }

interface Props { results: WordResult[]; }

export default function VocabResults({ results }: Props) {
  return (
    <div className="mt-8 pt-8 animate-rise" style={{ borderTop: '2px solid var(--line)' }}>
      <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginBottom: 4 }}>
        Reading session — vocabulary updates
      </h3>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 22, lineHeight: 1.55 }}>
        Words you typed correctly earn a longer interval. Words typed incorrectly or not used return sooner.
      </p>

      {results.length === 0 ? (
        <div
          className="text-center py-10 rounded-xl"
          style={{ border: '1px dashed var(--line)', color: 'var(--ink-soft)', fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.04em' }}
        >
          No deck words in this passage yet.{' '}
          <span style={{ color: 'var(--ink-faint)' }}>
            Click any underlined word while reading to add it to your deck.
          </span>
        </div>
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {results.map(r => {
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
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.04em' }}>{r.pinyin}</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.04em', marginTop: 2, color }}>{r.msg}</div>
                </div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 18, color, lineHeight: 1, transform: r.status === 'down' ? 'rotate(180deg)' : undefined }}>
                  {r.status === 'stable' ? '→' : '↑'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
