'use client';
import { useEffect, useMemo, useState } from 'react';
import type { DeckWord, LanguageCode } from '@/lib/types';
import { storage } from '@/lib/storage';
import { loadLevelTable, cachedLevelTable } from '@/lib/curriculum';
import { levelLabel, levelNumbers, levelFor } from '@/lib/languageConfig';
import { levelStandings, RETAINED_DAYS } from '@/lib/unlock';

/**
 * The milestone for the level you are ACTUALLY ON, as a ring.
 *
 * LevelProgress below already draws every band, and this deliberately does not repeat it —
 * the full table answers "where am I in the curriculum", which is a browsing question, and
 * answers it in a shape you have to scan. This answers the one question you have on arrival:
 * how far through my current level am I. Same numbers, from the same `levelStandings` call,
 * so the two cannot disagree; only the framing differs.
 *
 * It counts RETAINED words — ones the scheduler will hold for {RETAINED_DAYS} days or more —
 * not words in the deck. Importing a level would otherwise complete the ring instantly while
 * teaching nothing, which is the same hollow-progress trap LevelProgress refuses.
 */

interface Props { deck: DeckWord[]; language: LanguageCode; }

const SIZE = 132;
const STROKE = 11;

export default function MilestoneRing({ deck, language }: Props) {
  // Seeded from the cache so a revisit draws on the first frame — see cachedLevelTable.
  const [table, setTable] = useState<Record<number, string[]> | null>(() => cachedLevelTable(language));
  const [testedLevel, setTestedLevel] = useState(0);
  /**
   * THE LEVEL IS SEEDED SYNCHRONOUSLY, and that is the whole reason this card stopped popping in.
   *
   * It used to start at 0 and wait for `storage.getPrefs()`. Signed in, that is a Supabase
   * round trip — so `row` stayed null, `if (!row) return null` rendered NOTHING, and about a
   * second later the entire card appeared out of nowhere and shoved the Milestones panel down
   * the page.
   *
   * That is the sixth failure mode in CLAUDE.md wearing its fifth face: a value meaning "not
   * here yet" rendered as one meaning "there is none". `app/page.tsx` already fixed exactly
   * this for the study language, with exactly this fix and for exactly this reason —
   * localStorage is synchronous underneath, so the right answer is available on the first
   * frame and the async read below still resolves authoritatively behind it.
   */
  const [selected, setSelected] = useState(() => cachedSelectedLevel(language));

  useEffect(() => {
    let live = true;
    setTable(cachedLevelTable(language));
    loadLevelTable(language).then(t => { if (live) setTable(t); });
    storage.getPrefs().then(p => {
      if (!live) return;
      setTestedLevel(p.testedLevels?.[language] ?? 0);
      setSelected(levelFor(language, p));
    });
    return () => { live = false; };
  }, [language]);

  const row = useMemo(() => {
    if (!table || !selected) return null;
    const rows = levelStandings(deck, table, levelNumbers(language), { testedLevel, selectedLevel: selected });
    return rows.find(r => r.level === selected) ?? null;
  }, [table, deck, language, testedLevel, selected]);

  /**
   * NOT `return null`. An absent card and a card that has not loaded look identical to the
   * layout, and the difference is a second of the page jumping. The skeleton holds exactly
   * the space the real card will take, so nothing moves when the numbers arrive.
   *
   * It deliberately shows no percentage. Rendering "0%" here would be the same mistake in the
   * other direction — a loading state printed as an answer, and a discouraging one.
   */
  if (!row) return <RingSkeleton />;

  const pct = row.total > 0 ? row.retained / row.total : 0;
  const r = (SIZE - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const done = row.retained >= row.total && row.total > 0;
  // The paler arc: in the deck but not yet held. Drawn beyond the solid arc so the two read
  // as one bar bent into a circle rather than as competing values.
  const startedPct = row.total > 0 ? Math.min(1 - pct, row.started / row.total) : 0;

  return (
    <div className="mt-8 rounded-[11px] px-6 py-6 flex items-center gap-7 flex-wrap"
         style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
      <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }} role="img"
             aria-label={`${levelLabel(language, row.level)}: ${row.retained} of ${row.total} words retained`}>
          <circle cx={SIZE/2} cy={SIZE/2} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={STROKE} />
          {startedPct > 0 && (
            <circle cx={SIZE/2} cy={SIZE/2} r={r} fill="none"
                    stroke="color-mix(in srgb, var(--accent) 28%, transparent)" strokeWidth={STROKE}
                    strokeDasharray={`${circ * startedPct} ${circ}`}
                    strokeDashoffset={-circ * pct} />
          )}
          <circle cx={SIZE/2} cy={SIZE/2} r={r} fill="none"
                  stroke={done ? 'var(--jade, #4a9d6e)' : 'var(--accent)'} strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${circ * pct} ${circ}`}
                  style={{ transition: 'stroke-dasharray .5s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 27, fontWeight: 500, letterSpacing: '-.02em', lineHeight: 1 }}>
            {Math.round(pct * 100)}%
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '.1em', marginTop: 3 }}>
            {levelLabel(language, row.level)}
          </div>
        </div>
      </div>

      <div style={{ minWidth: 200, flex: 1 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {/* NOT "milestone". This sits directly above the Milestones panel, which is about
              earned badges — two adjacent headings using one word for two unrelated things.
              This ring is simply where you are in the level you are studying. */}
          Current level
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.015em', margin: '6px 0 4px', lineHeight: 1.2 }}>
          <em style={{ fontStyle: 'normal', color: done ? 'var(--jade, #4a9d6e)' : 'var(--accent)' }}>
            {row.retained.toLocaleString()}
          </em>
          {' '}of {row.total.toLocaleString()} {levelLabel(language, row.level)} words retained
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.55, maxWidth: '44ch', margin: 0 }}>
          {done
            ? `Every word at this level will hold for ${RETAINED_DAYS} days or more. Move up in Settings.`
            : row.started > 0
              ? <>{row.started.toLocaleString()} more {row.started === 1 ? 'is' : 'are'} in your deck but not yet held for {RETAINED_DAYS} days — keep reviewing and they cross over.</>
              : <>Retained means the scheduler will hold it for {RETAINED_DAYS} days or more. Adding words does not move this; reviewing them does.</>}
        </p>
      </div>
    </div>
  );
}

/**
 * The level this learner is on, read straight off localStorage.
 *
 * The same synchronous seed `app/page.tsx` and `ReadTab` already do for their own prefs, and
 * for the same reason: `storage.getPrefs()` is async and, signed in, is a network round trip.
 * Returns 0 when there is nothing stored, which the caller reads as "still unknown" and
 * renders as a skeleton rather than as a level.
 */
function cachedSelectedLevel(language: LanguageCode): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem('srsly-prefs');
    if (!raw) return 0;
    return levelFor(language, JSON.parse(raw));
  } catch {
    return 0;
  }
}

/** The card's exact footprint, with nothing in it that could be mistaken for a number. */
function RingSkeleton() {
  const r = (SIZE - STROKE) / 2;
  return (
    <div className="mt-8 rounded-[11px] px-6 py-6 flex items-center gap-7 flex-wrap"
         style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
         aria-hidden="true">
      <div style={{ width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg width={SIZE} height={SIZE}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={STROKE} />
        </svg>
      </div>
      <div style={{ minWidth: 200, flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ height: 11, width: 96, borderRadius: 3, background: 'var(--line-soft)' }} />
        <div style={{ height: 26, width: '78%', borderRadius: 5, background: 'var(--line-soft)' }} />
        <div style={{ height: 13, width: '62%', borderRadius: 4, background: 'var(--line-soft)' }} />
      </div>
    </div>
  );
}
