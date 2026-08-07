'use client';
import { useState } from 'react';
import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig, levelLabel } from '@/lib/languageConfig';
import { availableToAdd, easiestLevel } from '@/lib/onboarding';
import LevelTest from './LevelTest';

/**
 * Adding a language, and being placed in it.
 *
 * Two steps, and the second is not optional-by-omission: choosing a language leads straight
 * into its placement test. That is the whole reason this flow exists — a level picked from a
 * dropdown by someone who has not been asked anything is a guess, and it decides which
 * vocabulary every passage is built from. Skipping is allowed and lands at the easiest
 * level, which is the honest answer for a genuine beginner rather than a fallback.
 */

interface Props {
  /** Already-added languages, hidden from the picker. */
  added: LanguageCode[];
  /** Fires with the chosen language and the level the test placed them in (0 = skipped). */
  onDone: (lang: LanguageCode, placedLevel: number) => void;
  /** Absent when the learner has no languages at all — there is then nothing to go back to. */
  onCancel?: () => void;
}

export default function AddLanguage({ added, onDone, onCancel }: Props) {
  const [chosen, setChosen] = useState<LanguageCode | null>(null);
  // LevelTest reports its verdict via onFinish and is dismissed separately via onClose, so
  // the result has to be held here — completing on onClose alone would discard the placement
  // the moment the learner pressed Done.
  const [placed, setPlaced] = useState<number | null>(null);
  const options = availableToAdd(added);

  const mono = { fontFamily: 'var(--f-mono)' as const };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-10 px-5"
      style={{ background: 'color-mix(in srgb, var(--ink) 42%, transparent)', backdropFilter: 'blur(3px)' }}>
      <div className="w-full rounded-[15px] px-8 py-8" style={{ maxWidth: 560, background: 'var(--paper)', border: '1px solid var(--line)', boxShadow: '0 18px 50px rgba(0,0,0,.22)' }}>

        {chosen === null ? (
          <>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              {added.length === 0 ? 'Welcome to srsly' : 'Add a language'}
            </div>
            <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 25, fontWeight: 500, margin: '8px 0 6px', letterSpacing: '-.01em' }}>
              {added.length === 0 ? 'What would you like to learn?' : 'Which language next?'}
            </h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.6, maxWidth: '44ch', marginBottom: 20 }}>
              You&apos;ll take a short placement test so the reading starts at the right level.
              It stops as soon as you miss — a minute if you&apos;re new, a few if you&apos;re not.
            </p>

            <div className="flex flex-col gap-2.5">
              {options.map(cfg => (
                <button
                  key={cfg.code}
                  onClick={() => setChosen(cfg.code)}
                  className="text-left cursor-pointer transition-all duration-150 rounded-[11px] px-5 py-4 flex items-center gap-4"
                  style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; }}
                >
                  <span style={{ fontFamily: 'var(--f-han)', fontSize: 22, color: 'var(--ink)', minWidth: 62 }}>
                    {cfg.nativeName}
                  </span>
                  <span className="flex-1">
                    <span style={{ fontFamily: 'var(--f-display)', fontSize: 16, fontWeight: 500, display: 'block' }}>{cfg.name}</span>
                    <span style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)' }}>
                      {cfg.levels[0].label} – {cfg.levels[cfg.levels.length - 1].label}
                    </span>
                  </span>
                  <span style={{ color: 'var(--ink-faint)', fontSize: 18 }}>→</span>
                </button>
              ))}
              {options.length === 0 && (
                <p style={{ color: 'var(--ink-faint)', fontSize: 14, fontStyle: 'italic' }}>
                  You&apos;ve added every language srsly supports.
                </p>
              )}
            </div>

            {onCancel && (
              <button onClick={onCancel} className="cursor-pointer mt-6"
                style={{ ...mono, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '10px 18px' }}>
                Cancel
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              Placement · {getLanguageConfig(chosen).name}
            </div>
            <h2 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, margin: '8px 0 4px' }}>
              Let&apos;s find your level
            </h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.55, maxWidth: '46ch' }}>
              Pick the meaning of each word. Skip if you&apos;re starting from zero — that puts
              you at {levelLabel(chosen, easiestLevel(chosen))}.
            </p>
            <LevelTest
              language={chosen}
              mode="placement"
              onFinish={setPlaced}
              onClose={() => onDone(chosen, placed ?? 0)}
              onSkip={() => onDone(chosen, 0)}
            />
          </>
        )}
      </div>
    </div>
  );
}
