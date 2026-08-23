'use client';
import type { DeckWord } from '@/lib/types';
import { weakestWords, MIN_LAPSES } from '@/lib/weakWords';
import { getLanguageConfig } from '@/lib/languageConfig';
import { useLanguage } from '@/lib/LanguageContext';

/**
 * The words you keep getting wrong, with a way to act on it.
 *
 * The deck has always recorded every lapse and never shown them back — so the one question a
 * learner asks that the app could answer better than they can ("what am I actually bad at?")
 * had no answer anywhere. Ranked by failure RATE rather than count; see lib/weakWords.ts for
 * why, and for why two lapses is the floor.
 *
 * The button is the point. A list of problems you cannot act on is just a scoreboard for
 * losing, so it hands straight off to Cram, which ignores due dates — these words are ones
 * you want now, not whenever the scheduler next offers them.
 */

interface Props {
  deck: DeckWord[];
}

export default function WeakWords({ deck }: Props) {
  const language = useLanguage();
  const { scriptIsUnspaced } = getLanguageConfig(language);
  // Top handful only — the panel is a shortlist, not a browsable list. The Vocab tab's
  // "Trouble" filter shows the whole set.
  const weak = weakestWords(deck, 8);

  // Silence rather than an empty state. "No weak words yet" on a new deck reads as a missing
  // feature; on a deck with no lapses it is bragging about nothing.
  if (weak.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Giving you trouble
        </div>
      </div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 0', maxWidth: '52ch', lineHeight: 1.5 }}>
        Ranked by how often you miss them, not how many times — a word failed six times in nine
        tries is a bigger problem than one failed six times in sixty. The Vocab tab&rsquo;s
        Trouble filter has the full list.
      </p>

      <div className="mt-4 flex flex-col gap-1.5">
        {weak.map(({ word, lapses, encounters, rate }) => (
          <div
            key={word.id ?? word.h}
            className="flex items-center gap-3 rounded-lg px-3.5 py-2.5"
            style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
          >
            <span style={{ fontFamily: scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)', fontSize: scriptIsUnspaced ? 19 : 16, fontWeight: 'var(--han-weight)' as 'bold', minWidth: '4.5em' }}>
              {word.h}
            </span>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {word.m}
            </span>
            {/* The raw record beside the rate, because a bare percentage invites the question
                it is derived from — and at these sample sizes the denominator matters. */}
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>
              missed {lapses} of {encounters}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', minWidth: '3.2em', textAlign: 'right' }}>
              {Math.round(rate * 100)}%
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 8 }}>
        Words with at least {MIN_LAPSES} lapses. One is a bad day.
      </div>
    </div>
  );
}
