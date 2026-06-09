'use client';

const SEGMENTS = [
  { label: 'New',         count: 18,  pct: 3.2,  color: 'var(--gold)',     cls: 'new' },
  { label: 'Reviewed · 1–2×', count: 87,  pct: 15.5, color: 'var(--accent)',  cls: 'rev' },
  { label: 'Proficient · 3–5×', count: 143, pct: 25.5, color: 'var(--jade)',   cls: 'pro' },
  { label: 'Mastered · 6×+',    count: 312, pct: 55.7, color: 'var(--ink-soft)', cls: 'mas' },
];

const TOTAL = SEGMENTS.reduce((a, b) => a + b.count, 0);

export default function PieChart() {
  return (
    <div className="grid gap-9 mt-7 items-center" style={{ gridTemplateColumns: '200px 1fr' }}>
      {/* SVG donut */}
      <div className="shrink-0">
        <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 3px 14px rgba(0,0,0,.08))' }}>
          <path fill="var(--gold)"     stroke="var(--card)" strokeWidth="3" d="M 120 20 A 100 100 0 0 1 139.85 21.99 L 130.92 66.09 A 55 55 0 0 0 120 65 Z"/>
          <path fill="var(--accent)"   stroke="var(--card)" strokeWidth="3" d="M 139.85 21.99 A 100 100 0 0 1 212.39 81.73 L 170.81 98.95 A 55 55 0 0 0 130.92 66.09 Z"/>
          <path fill="var(--jade)"     stroke="var(--card)" strokeWidth="3" d="M 212.39 81.73 A 100 100 0 0 1 155.14 213.62 L 139.33 171.49 A 55 55 0 0 0 170.81 98.95 Z"/>
          <path fill="var(--ink-soft)" stroke="var(--card)" strokeWidth="3" d="M 155.14 213.62 A 100 100 0 1 1 120 20 L 120 65 A 55 55 0 1 0 139.33 171.49 Z"/>
          <text x="120" y="117" textAnchor="middle" style={{ fontSize: 28, fontWeight: 500, fill: 'var(--ink)', fontFamily: 'var(--f-display)' }}>{TOTAL}</text>
          <text x="120" y="134" textAnchor="middle" style={{ fontSize: 10, letterSpacing: '.12em', fill: 'var(--ink-faint)', fontFamily: 'var(--f-mono)' }}>WORDS</text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-4">
        {SEGMENTS.map(s => (
          <div key={s.cls} className="grid items-center gap-3.5" style={{ gridTemplateColumns: '12px 1fr 80px' }}>
            <span className="w-[11px] h-[11px] rounded-[3px] shrink-0" style={{ background: s.color }} />
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 500, lineHeight: 1 }}>{s.count}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 2 }}>{s.label}</div>
            </div>
            <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
