'use client';
import { useState } from 'react';
import { MIN_LAPSES } from '@/lib/weakWords';
import { LEECH_THRESHOLD } from '@/lib/fsrs';

/**
 * What each filter chip actually selects.
 *
 * ONE SOURCE, TWO ROWS. The Vocab tab and Cram both label sets "Forgotten", "Stuck",
 * "★ Focus" and mean the same thing by them; defining that twice is how two rows that look
 * identical start selecting different cards.
 *
 * A LEGEND RATHER THAN AN ICON PER CHIP. Eight chips with eight ⓘ buttons doubles the row and
 * still answers the wrong question: the confusion these labels cause is not "what is Stuck",
 * it is "how is Trouble different from Forgotten" — which you can only see by reading them
 * side by side. Each chip also carries its own line as a `title`, so hovering one works too.
 */

export const SET_HELP: Record<string, string> = {
  all:       'Every word in the set — nothing filtered out.',
  due:       'Ready to review right now.',
  soon:      'Scheduled within the next 7 days.',
  new:       'Added to your deck but never reviewed.',
  pool:      'Imported but not yet in circulation. Pool words never come up for review, and cram will not offer them either — activate them first.',
  focus:     'Words you starred yourself. Never cleared automatically.',
  weak:      `Words you have failed at least ${MIN_LAPSES} times, worst first by failure RATE — missed 6 of 9 outranks missed 6 of 60. One lapse is a bad day, so it takes two to appear here.`,
  leech:     `Failed ${LEECH_THRESHOLD} or more times. Automatically paused so it stops crowding out the rest of your reviews.`,
  paused:    'Taken out of rotation — by you, or automatically once a word became stuck.',
  snoozed:   'Pushed to a later date without changing its schedule.',
};

/** The ⓘ toggle plus the panel it opens. `keys` is the row's chips, in the row's order. */
export default function SetLegend({ keys, labels }: { keys: string[]; labels: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title={open ? 'Hide what these mean' : 'What do these mean?'}
        aria-expanded={open}
        className="cursor-pointer transition-all duration-150"
        style={{
          fontFamily: 'var(--f-mono)', fontSize: 10.5, lineHeight: 1,
          width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: open ? 'var(--ink)' : 'none',
          color: open ? 'var(--paper)' : 'var(--ink-faint)',
          border: `1px solid ${open ? 'var(--ink)' : 'var(--line)'}`,
        }}
      >
        i
      </button>

      {open && (
        <div
          className="w-full rounded-lg px-4 py-3 mt-1"
          style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
        >
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 14px', margin: 0 }}>
            {keys.filter(k => SET_HELP[k]).map(k => (
              <div key={k} style={{ display: 'contents' }}>
                <dt style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                  {labels[k] ?? k}
                </dt>
                <dd style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
                  {SET_HELP[k]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}
