'use client';
import { useMemo } from 'react';
import type { DailyAccuracy } from '@/lib/types';
import { rollingAccuracy } from '@/hooks/useSRS';
import { dateInDays, todayStr } from '@/lib/deck';

/**
 * First-try accuracy on passage cloze blanks, as a 7-day rolling figure with a daily bar.
 *
 * This is the only number in Stats that measures SKILL rather than effort. A streak rewards
 * showing up and a word count rewards importing; this moves only when you recall something
 * you could not recall before. Every blank is one free-typed attempt — ClozeBlank refuses
 * to re-grade — so no "first try" bookkeeping is needed, the figure is first-try by
 * construction.
 *
 * Days with no reading are drawn as empty slots rather than skipped or zeroed. A zero would
 * read as total failure and a skip would hide the gap; an empty slot says "nothing
 * attempted", which is what actually happened.
 */

interface Props { history: DailyAccuracy[] | undefined; }

const DAYS = 7;

export default function AccuracyTrend({ history }: Props) {
  const { rolling, bars } = useMemo(() => {
    const byDate = new Map((history ?? []).map(e => [e.d, e]));
    const today = todayStr();
    const out = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = i === 0 ? today : dateInDays(-i);
      const e = byDate.get(d);
      out.push({ d, pct: e && e.total ? e.right / e.total : null, total: e?.total ?? 0 });
    }
    return { rolling: rollingAccuracy(history, DAYS), bars: out };
  }, [history]);

  // Nothing attempted in the window and nothing ever — no point showing an empty chart.
  if (rolling.total === 0 && !(history ?? []).length) return null;

  const label = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' });

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Reading accuracy · 7 days
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
          {rolling.total > 0 ? `${rolling.right}/${rolling.total} blanks` : 'no blanks yet'}
        </div>
      </div>

      <div className="flex items-end gap-5 mt-3 flex-wrap">
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1 }}>
          {rolling.pct === null ? '—' : <>{rolling.pct}<small style={{ fontSize: 15, color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontWeight: 400 }}>%</small></>}
        </div>
        <div className="flex items-end gap-1.5" style={{ height: 46 }}>
          {bars.map(b => (
            <div key={b.d} className="flex flex-col items-center gap-1" title={b.total ? `${b.d}: ${Math.round((b.pct ?? 0) * 100)}% of ${b.total}` : `${b.d}: no reading`}>
              <div style={{ width: 16, height: 34, display: 'flex', alignItems: 'flex-end', background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
                {b.pct !== null && (
                  <div style={{ width: '100%', height: `${Math.max(8, b.pct * 100)}%`, background: 'var(--accent)', borderRadius: 3 }} />
                )}
              </div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>{label(b.d)}</span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '10px 0 0', maxWidth: '52ch', lineHeight: 1.5 }}>
        Share of passage blanks you filled correctly on the first go. Empty columns are days
        you did not read — they lower nothing.
      </p>
    </div>
  );
}
