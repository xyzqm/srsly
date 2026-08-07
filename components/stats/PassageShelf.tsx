'use client';
import { useEffect, useMemo, useState } from 'react';
import type { LanguageCode, ShelfEntry } from '@/lib/types';
import { storage } from '@/lib/storage';
import { getLanguageConfig, levelLabel } from '@/lib/languageConfig';
import { lengthOf } from '@/lib/shelf';

/**
 * Everything you've actually read, kept.
 *
 * The rest of Stats is numbers about the work. This is the work — the real texts, with the
 * date and the score. It is the one panel that gets better simply by existing for longer,
 * and it costs nothing to produce: the passages were already being generated and cached,
 * then deleted the next day (lib/shelf.ts).
 */

interface Props { language: LanguageCode; }

const PAGE = 6;

export default function PassageShelf({ language }: Props) {
  const [entries, setEntries] = useState<ShelfEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let live = true;
    setEntries(null);
    setShown(PAGE);
    setOpen(null);
    storage.getShelf(language).then(e => { if (live) setEntries(e); });
    return () => { live = false; };
  }, [language]);

  const cfg = getLanguageConfig(language);
  const stats = useMemo(() => {
    if (!entries?.length) return null;
    const words = entries.reduce((n, e) => n + lengthOf(e, cfg.scriptIsUnspaced), 0);
    const scored = entries.filter(e => e.score && e.score.total > 0);
    const correct = scored.reduce((n, e) => n + (e.score!.correct), 0);
    const total   = scored.reduce((n, e) => n + (e.score!.total), 0);
    return { words, accuracy: total ? Math.round((correct / total) * 100) : null };
  }, [entries, cfg.scriptIsUnspaced]);

  // Nothing read yet is the normal state on day one — say so rather than showing an empty box.
  if (!entries) return null;
  if (entries.length === 0) {
    return (
      <div className="mt-8">
        <SectionHead count={0} stats={null} unit={cfg.countUnit} />
        <p style={{ color: 'var(--ink-faint)', fontSize: 13.5, fontStyle: 'italic', lineHeight: 1.5, maxWidth: '52ch' }}>
          Passages you finish are kept here. Read today&apos;s and it becomes the first one.
        </p>
      </div>
    );
  }

  const visible = entries.slice(0, shown);

  return (
    <div className="mt-8">
      <SectionHead count={entries.length} stats={stats} unit={cfg.countUnit} />

      <div className="flex flex-col gap-1.5">
        {visible.map(e => {
          const isOpen = open === e.id;
          const len = lengthOf(e, cfg.scriptIsUnspaced);
          return (
            <div key={e.id} className="rounded-[10px] overflow-hidden"
              style={{ border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--paper-2)', transition: 'border-color .15s' }}>
              <button
                onClick={() => setOpen(isOpen ? null : e.id)}
                className="w-full text-left cursor-pointer flex items-center gap-3 px-4 py-3"
                style={{ background: 'none', border: 'none' }}
                aria-expanded={isOpen}
              >
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-faint)', minWidth: 74, letterSpacing: '.03em' }}>
                  {e.date}
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '.06em', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 5px' }}>
                  {levelLabel(e.language, e.level)}
                </span>
                <span className="flex-1 truncate"
                  style={{ fontFamily: cfg.scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)', fontSize: 15, color: 'var(--ink)' }}>
                  {e.title || '(untitled)'}
                </span>
                {e.score && e.score.total > 0 && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: e.score.correct === e.score.total ? 'var(--jade)' : 'var(--ink-faint)' }}>
                    {e.score.correct}/{e.score.total}
                  </span>
                )}
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-faint)', minWidth: 56, textAlign: 'right' }}>
                  {len} {cfg.countUnit}
                </span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--line)' }}>
                  <p style={{
                    fontFamily: cfg.scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)',
                    fontSize: 16, lineHeight: 1.85, color: 'var(--ink)', marginTop: 14, whiteSpace: 'pre-wrap',
                  }}>
                    {e.text}
                  </p>
                  {e.vocabWords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', alignSelf: 'center' }}>
                        Built around
                      </span>
                      {e.vocabWords.map(w => (
                        <span key={w} style={{ fontFamily: 'var(--f-han)', fontSize: 13, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 9%, transparent)', borderRadius: 5, padding: '2px 7px' }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {shown < entries.length && (
        <button onClick={() => setShown(s => s + PAGE * 2)} className="cursor-pointer mt-3"
          style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 8, padding: '8px 14px' }}>
          Show {Math.min(PAGE * 2, entries.length - shown)} more
        </button>
      )}
    </div>
  );
}

function SectionHead({ count, stats, unit }: {
  count: number;
  stats: { words: number; accuracy: number | null } | null;
  unit: string;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Passage shelf
        </div>
        {stats && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
            {count} read · {stats.words.toLocaleString()} {unit}
            {stats.accuracy !== null && <> · {stats.accuracy}% first try</>}
          </div>
        )}
      </div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: '6px 0 14px', maxWidth: '52ch', lineHeight: 1.5 }}>
        Every passage you&apos;ve finished, kept. Click one to read it again.
      </p>
    </>
  );
}
