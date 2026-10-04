'use client';
import { useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { summarise, fmtDays, DECAY_DAYS, MIN_MODELLED } from '@/lib/retention';
import { getSrsSettings } from '@/lib/fsrs';

/**
 * What the scheduler believes about the whole deck, drawn.
 *
 * `cardInsight` has always been able to say why ONE card is due; this is the deck-wide
 * version, and it is the first screen in the app that shows FSRS as a model rather than as a
 * date. Three things, in the order the questions get asked:
 *
 *   1. How much of what I have would I recall right now?
 *   2. How durable is it — am I building memory or churning?
 *   3. What is already slipping?
 *
 * ── IT SAYS "PREDICTED" EVERYWHERE, BECAUSE THAT IS WHAT IT IS ──
 *
 * Every number here is the model's own forecast. The app does not keep a review log, so it
 * CANNOT check the forecast against what actually happened — "of the cards it put at 90%, how
 * many did I really recall" needs an outcome paired with the probability predicted at the
 * time, and the next review overwrites both. Labelling a prediction as a measurement is the
 * one way a dashboard like this becomes a lie, so the copy never does.
 *
 * ── NO CHART LIBRARY ──
 *
 * One line and six bars, inheriting ten themes through CSS variables — which is exactly what
 * a charting library's own palette would fight. Same judgement as lib/fsrs.ts implementing
 * FSRS directly and the absent `openai` SDK. `FutureLoad` and `AccuracyTrend` are drawn the
 * same way, so this is the house pattern rather than a new one.
 *
 * ── `null` IS NOT `[]` ──
 *
 * `deck` is `[]` until storage answers, and this file's most-repeated bug is rendering that
 * as an answer. The caller passes `deckLoaded`; before it is true the panel renders NOTHING
 * rather than "you have no durable memory", which is what a learner holding 500 words would
 * otherwise be told.
 */

interface Props {
  deck: DeckWord[];
  /** False until the deck in hand actually belongs to the current language. */
  deckLoaded: boolean;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;
const label = {
  ...mono, fontSize: 11, letterSpacing: '.2em',
  textTransform: 'uppercase' as const, color: 'var(--ink-faint)',
};

export default function RetentionPanel({ deck, deckLoaded }: Props) {
  const settings = getSrsSettings();
  const r = useMemo(
    () => (deckLoaded ? summarise(deck, settings) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck, deckLoaded, settings.desiredRetention],
  );

  if (!r) return null;                       // not counted yet — say nothing, not "none"

  if (r.sparse) {
    // Deliberately not a wall of empty bars: the reason `npm run seed:dev` exists is that a
    // panel of zeroes is a list of things you have failed to do.
    return (
      <div className="mt-8">
        <div style={label}>Memory · predicted</div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 0', maxWidth: '54ch', lineHeight: 1.5 }}>
          {r.modelled === 0 && r.unmodelled === 0
            ? 'Nothing to model yet. Cards appear here once they have graduated out of the learning steps.'
            : <>FSRS can model {r.modelled} of your cards so far. This needs {MIN_MODELLED} before the
               numbers mean anything — below that it would be describing noise.</>}
        </p>
      </div>
    );
  }

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const peakBand = Math.max(...r.bands.map(b => b.count), 1);
  const H = 96;

  // The decay curve, as one path. y is inverted (SVG origin is top-left) and the vertical
  // range is clamped to 0–100% rather than fitted, so two decks are comparable by eye.
  const W = 320, CH = 90;
  const x = (d: number) => (d / DECAY_DAYS) * W;
  const y = (v: number) => CH - v * CH;
  const line = r.decay.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.recall).toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${CH} L0 ${CH} Z`;

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={label}>Memory · predicted</div>
        <div style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)' }}>
          {r.modelled.toLocaleString()} card{r.modelled === 1 ? '' : 's'} modelled
          {r.unmodelled > 0 && <> · {r.unmodelled.toLocaleString()} still learning</>}
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 16px', maxWidth: '58ch', lineHeight: 1.5 }}>
        What the scheduler <em>expects</em> — not a measurement. srsly keeps no review history,
        so it can show you the forecast and cannot check it against what you actually recalled.
      </p>

      {/* ── The two headline figures ── */}
      <div className="flex flex-wrap gap-x-10 gap-y-4 mb-6">
        <div>
          <div style={{ ...mono, fontSize: 28, color: 'var(--ink)', lineHeight: 1.1 }}>{pct(r.recallToday)}</div>
          <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 2 }}>
            you&rsquo;d recall today · aiming at {pct(r.target)}
          </div>
        </div>
        <div>
          <div style={{ ...mono, fontSize: 28, color: 'var(--ink)', lineHeight: 1.1 }}>{fmtDays(r.medianStability)}</div>
          <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 2 }}>
            typical card holds {/* median, not mean — see lib/retention.ts */}
          </div>
        </div>
      </div>

      {/* ── If you stopped: the decay curve ── */}
      <div style={label}>If you reviewed nothing for {DECAY_DAYS} days</div>
      <svg
        viewBox={`0 0 ${W} ${CH}`}
        width="100%"
        height={CH}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Predicted recall falls from ${pct(r.decay[0].recall)} today to ${pct(r.decay[DECAY_DAYS].recall)} in ${DECAY_DAYS} days with no reviews`}
        style={{ display: 'block', marginTop: 8, overflow: 'visible' }}
      >
        {/* The retention you are aiming at, so the curve crossing it is legible. */}
        <line
          x1="0" x2={W} y1={y(r.target)} y2={y(r.target)}
          stroke="color-mix(in srgb, var(--accent) 45%, transparent)"
          strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
        />
        <path d={area} fill="color-mix(in srgb, var(--accent) 12%, transparent)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between" style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 4 }}>
        <span>today · {pct(r.decay[0].recall)}</span>
        <span style={{ color: 'var(--accent)' }}>dashed: your {pct(r.target)} target</span>
        <span>day {DECAY_DAYS} · {pct(r.decay[DECAY_DAYS].recall)}</span>
      </div>

      {/* ── How durable the deck is ── */}
      <div style={{ ...label, marginTop: 26 }}>How long each card holds</div>
      <div className="flex items-end gap-2" style={{ height: H, marginTop: 10 }}>
        {r.bands.map(b => {
          const h = Math.max(b.count > 0 ? 3 : 1, (b.count / peakBand) * H);
          return (
            <div key={b.label} className="flex-1 flex flex-col items-center justify-end" style={{ height: H }}>
              <div style={{ ...mono, fontSize: 10, color: b.count ? 'var(--ink-soft)' : 'var(--ink-faint)', marginBottom: 3 }}>
                {b.count || ''}
              </div>
              <div
                title={`${b.count} card${b.count === 1 ? '' : 's'} hold ${b.label}`}
                style={{
                  width: '100%', height: h, borderRadius: '4px 4px 2px 2px',
                  background: b.count === 0 ? 'var(--line-soft)' : 'var(--accent)',
                  opacity: b.count === 0 ? 1 : 0.9, transition: 'height .4s ease',
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1.5">
        {r.bands.map(b => (
          <div key={b.label} className="flex-1 text-center" style={{ ...mono, fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.04em' }}>
            {b.label}
          </div>
        ))}
      </div>

      {/* ── What is slipping ── */}
      <div style={{ ...label, marginTop: 26 }}>
        Slipping{r.atRiskTotal > 0 && <> · {r.atRiskTotal}</>}
      </div>
      {r.atRiskTotal === 0 ? (
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 0', maxWidth: '54ch', lineHeight: 1.5 }}>
          Nothing below your {pct(r.target)} target. Every modelled card is where the schedule wants it.
        </p>
      ) : (
        <>
          <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 10px', maxWidth: '58ch', lineHeight: 1.5 }}>
            Already under {pct(r.target)}. This is not the same as <em>due</em> — a card can be due
            and still solid, or slipping and not scheduled for days.
          </p>
          <div className="flex flex-col gap-1.5">
            {r.atRisk.map(c => (
              <div key={c.id} className="flex items-baseline gap-3" style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--ink)', minWidth: '4.5ch' }}>{c.h}</span>
                <span style={{ ...mono, fontSize: 11, color: 'var(--accent)', minWidth: '4ch' }}>{pct(c.recall)}</span>
                <span style={{ color: 'var(--ink-soft)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.m}
                </span>
                <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {fmtDays(c.daysSince)} ago
                </span>
              </div>
            ))}
          </div>
          {r.atRiskTotal > r.atRisk.length && (
            <p style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)', marginTop: 10 }}>
              and {r.atRiskTotal - r.atRisk.length} more
            </p>
          )}
        </>
      )}
    </div>
  );
}
