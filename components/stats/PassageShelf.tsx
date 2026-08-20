'use client';
import { useEffect, useMemo, useState } from 'react';
import type { LanguageCode, ShelfEntry } from '@/lib/types';
import { storage } from '@/lib/storage';
import { getLanguageConfig, levelLabel } from '@/lib/languageConfig';
import { lengthOf } from '@/lib/shelf';
import { needsSpaceBefore } from '@/lib/tokenText';
import ClickableWord from '@/components/shared/ClickableWord';
import WordPopup from '@/components/read/WordPopup';
import { useWordPopup } from '@/hooks/useWordPopup';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { Fragment } from 'react';

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

/**
 * Is this stored body unreadable — words run together with no spaces?
 *
 * Only ever true for OLD entries. Everything shelved since ShelfEntry gained `sentences`
 * renders from tokens and cannot lose its spacing; this covers the ones that kept only text,
 * written before 8c87283 (2026-08-16) with a flush join instead of `tokensToText`, which in
 * a spaced language produced "¿Quétalelclimahoy?Sí,esundíamuybonito." There is no way back
 * for those — recovering the word boundaries would mean re-segmenting prose against a
 * dictionary.
 *
 * So the body is hidden and the rest of the entry kept. The date, title, score and per-word
 * verdicts were never affected and are the parts worth looking back at; the run-together
 * prose is the only casualty, and showing it is worse than saying it is gone. Entries are
 * capped at 200, so waiting for these to age out is not a plan.
 *
 * Unspaced scripts are exempt: zh and ja have no spaces to be missing. The threshold sits far
 * below real prose — Spanish and French average a space every five or six characters, so one
 * in twenty is not a near miss.
 */
function isRunTogether(text: string, scriptIsUnspaced: boolean): boolean {
  if (scriptIsUnspaced || text.length < 40) return false;
  const spaces = (text.match(/\s/g) ?? []).length;
  return spaces / text.length < 0.05;
}

export default function PassageShelf({ language }: Props) {
  const [entries, setEntries] = useState<ShelfEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  /**
   * Looking a word up from the shelf, and adding it, is the point of keeping tokens.
   *
   * The deck is passed so an already-known word is marked as such rather than offered again,
   * exactly as it behaves in the reading tab — a shelved passage should not invite you to
   * re-add half your deck.
   */
  const { deck, addWord } = useVocabDeck(language);
  const deckWords = useMemo(() => new Set(deck.map(d => d.h)), [deck]);
  const popup = useWordPopup(
    (word, pinyin, meaning) => { void addWord({ h: word, p: pinyin, m: meaning }); },
    deckWords,
  );

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
                  {/* Rendered from TOKENS when the entry has them, so every word is still
                      clickable — look one up a month later and add it to your deck from
                      here. Older entries kept only flattened text and fall through to the
                      paragraph below. */}
                  {e.sentences?.length ? (
                    <p style={{
                      fontFamily: cfg.scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)',
                      fontSize: 16, lineHeight: 1.85, color: 'var(--ink)', marginTop: 14,
                    }}>
                      {e.sentences.map((sent, si) => (
                        <Fragment key={si}>
                          {si > 0 && (cfg.scriptIsUnspaced ? '' : ' ')}
                          {sent.tokens.map((t, ti) => (
                            <Fragment key={ti}>
                              {needsSpaceBefore(sent.tokens, ti, cfg.scriptIsUnspaced)}
                              <ClickableWord token={t} onOpen={popup.openPopup} />
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
                    </p>
                  ) : isRunTogether(e.text, cfg.scriptIsUnspaced) ? (
                    <p style={{
                      fontFamily: 'var(--f-mono)', fontSize: 12, lineHeight: 1.6,
                      color: 'var(--ink-faint)', marginTop: 14, fontStyle: 'italic',
                    }}>
                      The text of this one was saved without its spacing and can&apos;t be
                      recovered. Your score and words below are intact.
                    </p>
                  ) : (
                    <p style={{
                      fontFamily: cfg.scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)',
                      fontSize: 16, lineHeight: 1.85, color: 'var(--ink)', marginTop: 14, whiteSpace: 'pre-wrap',
                    }}>
                      {e.text}
                    </p>
                  )}
                  {/* What you got right and what you missed, not just how many — and in the
                      same red/green the passage used, so the record reads the same way the
                      exercise did. Words with no recorded answer (never blanked, or the
                      passage was left unfinished) stay neutral rather than being coloured
                      as though they had been judged. */}
                  {e.vocabWords.length > 0 && (() => {
                    const verdict = new Map((e.results ?? []).map(r => [r.word, r.correct]));
                    return (
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', alignSelf: 'center' }}>
                          {verdict.size > 0 ? 'Your answers' : 'Built around'}
                        </span>
                        {e.vocabWords.map(w => {
                          const ok = verdict.get(w);
                          const hue = ok === undefined ? 'var(--ink-soft)' : ok ? 'var(--right)' : 'var(--wrong)';
                          return (
                            <span
                              key={w}
                              title={ok === undefined ? 'Not answered' : ok ? 'Correct first try' : 'Missed'}
                              style={{
                                fontFamily: 'var(--f-han)', fontSize: 13, color: hue,
                                background: `color-mix(in srgb, ${hue} 10%, transparent)`,
                                border: `1px solid color-mix(in srgb, ${hue} 28%, transparent)`,
                                borderRadius: 5, padding: '2px 7px',
                              }}
                            >
                              {ok === undefined ? '' : ok ? '\u2713 ' : '\u2717 '}{w}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
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
      <WordPopup
        data={popup.popup}
        onClose={popup.closePopup}
        onAddVocab={popup.handleAddVocab}
      />
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
