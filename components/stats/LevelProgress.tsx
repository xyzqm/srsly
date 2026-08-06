'use client';
import { useEffect, useMemo, useState } from 'react';
import type { DeckWord, LanguageCode } from '@/lib/types';
import { loadLevelTable } from '@/lib/curriculum';
import { levelLabel, levelNumbers } from '@/lib/languageConfig';

/**
 * How much of each proficiency band the learner actually holds.
 *
 * Completion against a fixed denominator is the strongest pull in the app that costs
 * nothing to compute — the level tables ARE the denominator, and the deck is the numerator.
 *
 * Two bars per level, not one. "Retained" counts only cards the scheduler will hold for a
 * week or more; "started" counts everything else in the deck for that band. Collapsing
 * them into a single number would let a learner import all 506 A1 words and read 100%
 * having learnt nothing, which is exactly the kind of hollow progress this should refuse
 * to show.
 */

/** Stability (days) a card must hold before it counts as retained rather than merely met. */
const RETAINED_DAYS = 7;

interface Props { deck: DeckWord[]; language: LanguageCode; }

interface Row { level: number; label: string; total: number; retained: number; started: number }

export default function LevelProgress({ deck, language }: Props) {
  const [table, setTable] = useState<Record<number, string[]> | null>(null);

  useEffect(() => {
    let live = true;
    loadLevelTable(language).then(t => { if (live) setTable(t); });
    return () => { live = false; };
  }, [language]);

  const rows = useMemo<Row[]>(() => {
    if (!table) return [];
    const byWord = new Map<string, DeckWord>();
    for (const w of deck) {
      const k = w.h.trim().toLowerCase();
      const prev = byWord.get(k);
      // A character can hold several readings; credit the strongest of them.
      if (!prev || (w.stability ?? 0) > (prev.stability ?? 0)) byWord.set(k, w);
    }
    return levelNumbers(language).map(level => {
      const words = table[level] ?? [];
      let retained = 0, started = 0;
      for (const word of words) {
        const card = byWord.get(word.trim().toLowerCase());
        if (!card || card.pool) continue;
        if ((card.stability ?? 0) >= RETAINED_DAYS) retained++;
        else started++;
      }
      return { level, label: levelLabel(language, level), total: words.length, retained, started };
    }).filter(r => r.total > 0);
  }, [table, deck, language]);

  if (!table || rows.length === 0) return null;

  const grand = rows.reduce((a, r) => ({ retained: a.retained + r.retained, total: a.total + r.total }), { retained: 0, total: 0 });

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Curriculum progress
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
          {grand.retained} of {grand.total.toLocaleString()} retained
        </div>
      </div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 14px', maxWidth: '52ch', lineHeight: 1.5 }}>
        Solid means the word will hold for a week or more. The paler slice is in your deck
        but not there yet — importing a level fills that, not this.
      </p>

      <div className="flex flex-col gap-2.5">
        {rows.map(r => {
          const pr = (r.retained / r.total) * 100;
          const ps = (r.started / r.total) * 100;
          const done = r.retained === r.total;
          return (
            <div key={r.level} className="flex items-center gap-3">
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-soft)', minWidth: 58, letterSpacing: '.04em' }}>
                {r.label}
              </div>
              <div
                className="flex-1 overflow-hidden"
                style={{ height: 9, borderRadius: 5, background: 'var(--line-soft)' }}
                role="img"
                aria-label={`${r.label}: ${r.retained} of ${r.total} retained, ${r.started} in progress`}
              >
                <div style={{ display: 'flex', height: '100%' }}>
                  <div style={{ width: `${pr}%`, background: done ? 'var(--jade, #4a9d6e)' : 'var(--accent)', transition: 'width .4s ease' }} />
                  <div style={{ width: `${ps}%`, background: 'color-mix(in srgb, var(--accent) 28%, transparent)', transition: 'width .4s ease' }} />
                </div>
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-faint)', minWidth: 92, textAlign: 'right' }}>
                {r.retained}<span style={{ opacity: 0.6 }}>/{r.total}</span>
                {done && <span style={{ color: 'var(--jade, #4a9d6e)', marginLeft: 5 }}>✓</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
