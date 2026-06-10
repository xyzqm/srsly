'use client';
import { useEffect } from 'react';

interface Metrics { vocab: number; relevance: number; fluency: number; overall: number; }

interface Props {
  metrics: Metrics;
  used: string[];
  missed: string[];
  onScore: (score: number) => void;
}

function MetricBar({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-[13px] mb-1">
        <b>{label}</b>
        <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--ink-soft)', fontSize: 12 }}>{val} / 100</span>
      </div>
      <div style={{ height: 7, background: 'var(--line-soft)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${val}%`, background: color, borderRadius: 5, transition: 'width .7s cubic-bezier(.2,.7,.3,1)' }} />
      </div>
    </div>
  );
}

export default function ConvoReport({ metrics, used, missed, onScore }: Props) {
  const { vocab, relevance, fluency, overall } = metrics;
  const band = overall >= 90 ? 'Excellent' : overall >= 75 ? 'Strong' : overall >= 60 ? 'Solid' : overall >= 40 ? 'Developing' : 'Keep practicing';
  const tip = missed.length
    ? `Next time, try working in ${missed.slice(0, 3).join('、')} to stretch your range.`
    : 'You worked in every target word from today — excellent range.';
  const srs = used.length
    ? `${used.length} word${used.length === 1 ? '' : 's'} earned credit — interval nudged forward: ${used.join('、')}. ${missed.length ? `The remaining ${missed.length} stay due on their normal schedule.` : ''}`
    : 'No target words used this round — all eight stay due as scheduled.';

  // Report score once on mount — not on every render
  useEffect(() => { onScore(overall); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-5 rounded-[14px] px-6 py-6 animate-rise" style={{ border: '1px solid var(--line)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 40%, white), var(--card))' }}>
      <div className="flex justify-between items-start gap-3 mb-4">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Conversation report</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 500, color: 'var(--accent)', lineHeight: 1.05, marginTop: 4 }}>{band}</div>
        </div>
        <div className="text-right shrink-0">
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 40, fontWeight: 600, lineHeight: 1 }}>{overall}</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)' }}>/ 100</div>
        </div>
      </div>

      <MetricBar label="Vocabulary use" val={vocab} color="var(--accent)" />
      <MetricBar label="Relevance" val={relevance} color="var(--jade)" />
      <MetricBar label="Fluency" val={fluency} color="var(--gold)" />

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 9 }}>Today&apos;s words you used ({used.length} / {used.length + missed.length})</div>
        <div>
          {[...used].map(w => (
            <span key={w} className="inline-block rounded-full px-3 py-1 mr-1.5 mb-1.5" style={{ fontFamily: 'var(--f-han)', fontSize: 14, background: 'var(--jade-soft)', color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>{w}</span>
          ))}
          {missed.map(w => (
            <span key={w} className="inline-block rounded-full px-3 py-1 mr-1.5 mb-1.5 line-through" style={{ fontFamily: 'var(--f-han)', fontSize: 14, background: 'var(--paper-2)', color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>{w}</span>
          ))}
        </div>
      </div>

      <div className="mt-3.5" style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
        <b>Tip:</b> {tip}
      </div>
      <div className="mt-3.5 pt-3.5 text-[13px]" style={{ borderTop: '1px solid var(--line-soft)', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--jade)' }}>{srs}</b>
      </div>
    </div>
  );
}
