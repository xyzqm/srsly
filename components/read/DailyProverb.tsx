'use client';
import { useEffect, useState } from 'react';
import { loadProverbs, proverbFor, type Proverb } from '@/lib/proverb';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';

/**
 * The day's idiom, under the passage.
 *
 * Placed at the END of the reading page on purpose. It is a small pleasure, not a task —
 * putting it above the passage would give the day's first screen two things asking to be
 * read, and the passage is the one with the deck riding on it.
 *
 * Collapsed to a single line until opened, for the same reason: it should be noticeable and
 * skippable in the same glance.
 */
export default function DailyProverb() {
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
    <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--line)' }}>
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
