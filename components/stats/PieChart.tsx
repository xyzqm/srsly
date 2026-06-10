'use client';
import type { DeckWord } from '@/lib/types';

function computeSegments(deck: DeckWord[]) {
  let newW = 0, reviewed = 0, proficient = 0, mastered = 0;
  for (const w of deck) {
    const r = w.reviews ?? 0;
    if (r === 0) newW++;
    else if (r <= 2) reviewed++;
    else if (r <= 5) proficient++;
    else mastered++;
  }
  return [
    { label: 'New',               count: newW,       color: '#94A3B8', cls: 'new' },
    { label: 'Reviewed · 1–2×',   count: reviewed,   color: '#EAB308', cls: 'rev' },
    { label: 'Proficient · 3–5×', count: proficient, color: '#4ADE80', cls: 'pro' },
    { label: 'Mastered · 6×+',    count: mastered,   color: '#2563EB', cls: 'mas' },
  ];
}

interface Props { deck: DeckWord[]; }

export default function PieChart({ deck }: Props) {
  const segments = computeSegments(deck);
  const total = deck.length;

  let gradientBg: string;
  if (total === 0) {
    gradientBg = 'var(--line-soft)';
  } else {
    let cum = 0;
    const parts: string[] = [];
    for (const s of segments) {
      const pct = (s.count / total) * 100;
      if (pct > 0) {
        parts.push(`${s.color} ${cum.toFixed(2)}% ${(cum + pct).toFixed(2)}%`);
        cum += pct;
      }
    }
    gradientBg = `conic-gradient(${parts.join(', ')})`;
  }

  return (
    <div className="grid gap-9 mt-7 items-center" style={{ gridTemplateColumns: '200px 1fr' }}>
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
        <div className="w-full h-full rounded-full" style={{ background: gradientBg, filter: 'drop-shadow(0 3px 14px rgba(0,0,0,.08))' }} />
        {/* Hole */}
        <div className="absolute rounded-full" style={{ top: '27%', right: '27%', bottom: '27%', left: '27%', background: 'var(--card)' }} />
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ zIndex: 1 }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 500, color: 'var(--ink)', lineHeight: 1 }}>{total}</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.12em', color: 'var(--ink-faint)', marginTop: 4 }}>WORDS</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-4">
        {segments.map(s => (
          <div key={s.cls} className="grid items-center gap-3.5" style={{ gridTemplateColumns: '12px 1fr 80px' }}>
            <span className="w-[11px] h-[11px] rounded-[3px] shrink-0" style={{ background: s.color }} />
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 500, lineHeight: 1 }}>{s.count}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 2 }}>{s.label}</div>
            </div>
            <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: total > 0 ? `${(s.count / total * 100)}%` : '0%', background: s.color, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
