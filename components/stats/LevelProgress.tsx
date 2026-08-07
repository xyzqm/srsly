'use client';
import { useEffect, useMemo, useState } from 'react';
import type { DeckWord, LanguageCode } from '@/lib/types';
import { storage } from '@/lib/storage';
import { loadLevelTable } from '@/lib/curriculum';
import { levelLabel, levelNumbers, levelFor } from '@/lib/languageConfig';
import { levelStandings, wordsToUnlockNext, gateFor, RETAINED_FRACTION, RETAINED_DAYS, type LevelStanding } from '@/lib/unlock';

/**
 * How much of each proficiency band the learner holds — and which bands that has opened.
 *
 * Two bars per level, not one. "Retained" counts only cards the scheduler will hold for a
 * week or more; "started" counts everything else in the deck for that band. Collapsing them
 * into a single number would let a learner import all 506 A1 words and read 100% having
 * learnt nothing, which is exactly the kind of hollow progress this should refuse to show.
 *
 * The lock state comes from lib/unlock.ts, the same function Settings uses, so the two
 * screens cannot drift into disagreeing about whether a level is open.
 */

interface Props { deck: DeckWord[]; language: LanguageCode; }

export default function LevelProgress({ deck, language }: Props) {
  const [table, setTable] = useState<Record<number, string[]> | null>(null);
  const [testedLevel, setTestedLevel] = useState(0);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let live = true;
    setTable(null);
    loadLevelTable(language).then(t => { if (live) setTable(t); });
    storage.getPrefs().then(p => {
      if (!live) return;
      setTestedLevel(p.testedLevels?.[language] ?? 0);
      setSelected(levelFor(language, p));
    });
    return () => { live = false; };
  }, [language]);

  const rows: LevelStanding[] = useMemo(
    // Never Math.max these two: Japanese counts down, so the bigger number is the EASIER
    // level. levelStandings resolves both by rank.
    () => (table ? levelStandings(deck, table, levelNumbers(language), { testedLevel, selectedLevel: selected }) : []),
    [table, deck, language, testedLevel, selected],
  );

  if (!table || rows.length === 0) return null;

  const grand = rows.reduce((a, r) => ({ retained: a.retained + r.retained, total: a.total + r.total }), { retained: 0, total: 0 });
  const nextLocked = rows.find(r => !r.unlocked);
  const gateRow = nextLocked ? gateFor(rows, nextLocked) : undefined;

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
        Solid means the word will hold for {RETAINED_DAYS} days or more. The paler slice is in
        your deck but not there yet — importing a level fills that, not this. A level opens at{' '}
        {Math.round(RETAINED_FRACTION * 100)}% of the one below.
      </p>

      <div className="flex flex-col gap-2.5">
        {rows.map(r => {
          const pr = (r.retained / r.total) * 100;
          const ps = (r.started / r.total) * 100;
          const done = r.retained === r.total;
          return (
            <div key={r.level} className="flex items-center gap-3" style={{ opacity: r.unlocked ? 1 : 0.5 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-soft)', minWidth: 58, letterSpacing: '.04em' }}>
                {r.unlocked ? levelLabel(language, r.level) : `🔒 ${levelLabel(language, r.level)}`}
              </div>
              <div
                className="flex-1 overflow-hidden"
                style={{ height: 9, borderRadius: 5, background: 'var(--line-soft)' }}
                role="img"
                aria-label={`${levelLabel(language, r.level)}: ${r.unlocked ? 'unlocked' : 'locked'}, ${r.retained} of ${r.total} retained, ${r.started} in progress`}
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

      {nextLocked && gateRow && (
        <p style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 12, lineHeight: 1.5 }}>
          <span style={{ color: 'var(--accent)' }}>{wordsToUnlockNext(gateRow).toLocaleString()}</span>
          {' '}more {levelLabel(language, gateRow.level)} word{wordsToUnlockNext(gateRow) === 1 ? '' : 's'} retained
          unlocks {levelLabel(language, nextLocked.level)} — or take a test to unlock it.
        </p>
      )}
    </div>
  );
}
