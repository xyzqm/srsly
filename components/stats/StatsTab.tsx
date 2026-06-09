'use client';
import PieChart from './PieChart';

interface Props { onNavigateRead: () => void; }

export default function StatsTab({ onNavigateRead }: Props) {
  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        All-time · vocabulary bank
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 500, letterSpacing: '-.015em', margin: '8px 0 4px', lineHeight: 1.15 }}>
        <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>560</em> words learned.
      </div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14.5, maxWidth: '46ch', lineHeight: 1.55 }}>
        Your complete vocabulary across all sessions, broken down by SRS mastery phase.
      </p>

      <PieChart />

      {/* Stat row */}
      <div
        className="grid mt-8 overflow-hidden rounded-[11px]"
        style={{ gridTemplateColumns: '1.6fr 1fr 1fr', gap: 1, background: 'var(--line-soft)', border: '1px solid var(--line)' }}
      >
        {/* Lead stat */}
        <div
          className="px-5 py-5"
          style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 50%, white), var(--card))' }}
        >
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Today&apos;s queue</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
            8 <small style={{ fontSize: 14, color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontWeight: 400 }}>ready</small>
          </div>
          <button
            onClick={onNavigateRead}
            className="mt-3 flex items-center gap-2 cursor-pointer transition-all duration-150"
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)', display: 'inline-flex',
            }}
          >
            Open today&apos;s passage →
          </button>
        </div>
        <div className="px-5 py-5" style={{ background: 'var(--card)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Day streak</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
            14<small style={{ fontSize: 14, color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontWeight: 400 }}>d</small>
          </div>
        </div>
        <div className="px-5 py-5" style={{ background: 'var(--card)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Total sessions</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
            42
          </div>
        </div>
      </div>

      <div className="text-center mt-6 text-xs" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', letterSpacing: '.04em' }}>
        srsly. · one interval at a time
      </div>
    </div>
  );
}
