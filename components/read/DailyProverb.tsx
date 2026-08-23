'use client';
import { useEffect, useState } from 'react';
import { loadProverbs, proverbFor, type Proverb } from '@/lib/proverb';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';

/**
 * The day's idiom, shown as a COMPLETION REWARD.
 *
 * It appears in exactly two places, both of them "you have finished" states: under the
 * vocabulary results once a targeted reading is done, and on the session-complete screen
 * after a block of flashcards or cram. Nowhere else.
 *
 * That placement is the whole design. Sitting permanently at the foot of the Read tab it was
 * wallpaper — always there, so never an event. Attached to the end of a study loop it is a
 * small thing you earned, and it lands on a screen that is otherwise just a score.
 *
 * `showRule` is the only difference between the two hosts: the reading page wants a rule
 * separating it from the results above, the centred session screen does not.
 */
export default function DailyProverb({ showRule = true }: { showRule?: boolean }) {
  const language = useLanguage();
  const { scriptIsUnspaced } = getLanguageConfig(language);
  const [proverb, setProverb] = useState<Proverb | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setProverb(null);
    setOpen(false);
    void loadProverbs().then(table => {
      if (live) setProverb(proverbFor(table, language));
    });
    return () => { live = false; };
  }, [language]);

  if (!proverb) return null;

  return (
    <div className={showRule ? 'mt-8 pt-8' : 'mt-8'} style={showRule ? { borderTop: '1px solid var(--line)' } : undefined}>
      <div
        style={{
          fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.2em',
          textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 10,
        }}
      >
        Today&rsquo;s saying
      </div>

      <div
        className="rounded-[11px] px-6 py-5"
        style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
      >
        <div
          style={{
            fontFamily: 'var(--f-han)', fontWeight: 'var(--han-weight)' as 'bold',
            // Unspaced scripts carry the whole saying in a handful of characters and can
            // afford display size; a French proverb is a full clause and cannot.
            fontSize: scriptIsUnspaced ? 27 : 19,
            lineHeight: 1.5, letterSpacing: scriptIsUnspaced ? '.04em' : 0,
          }}
        >
          {proverb.t}
        </div>

        {proverb.r && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--accent)', marginTop: 6 }}>
            {proverb.r}
          </div>
        )}

        <div style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 10 }}>
          {proverb.m}
        </div>

        {/* The literal image is the half worth working out for yourself, so it stays behind a
            tap — "the shrimp that falls asleep is carried off by the current" lands better
            after you have read what it means than printed beside it. */}
        {proverb.l && (
          open ? (
            <div style={{ fontSize: 13.5, color: 'var(--ink-faint)', lineHeight: 1.55, marginTop: 8, fontStyle: 'italic' }}>
              literally: {proverb.l}
            </div>
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="cursor-pointer"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.1em',
                textTransform: 'uppercase', background: 'none', border: 'none', padding: 0,
                color: 'var(--ink-faint)', marginTop: 10,
              }}
            >
              + literally
            </button>
          )
        )}
      </div>
    </div>
  );
}
