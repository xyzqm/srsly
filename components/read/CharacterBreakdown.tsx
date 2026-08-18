'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { loadHanDecomp, decompose, supportsDecomposition, type Decomposition } from '@/lib/hanDecomp';

/**
 * What the characters in a word are built from — 休 = 亻 person + 木 tree.
 *
 * WHERE THIS IS ALLOWED TO APPEAR. Only where the answer is already known or has been asked
 * for: the lookup popup (you clicked to find out), a revealed flashcard, a word you have just
 * missed. Never beside a cloze blank or in the pre-reading primer — the components of 休 are
 * a very strong hint about 休, and a mnemonic offered during a recall test stops measuring
 * recall. That is the same rule the primer and the Hints toggle already follow.
 *
 * WHY IT IS PER CHARACTER RATHER THAN PER WORD. A two-character word is usually two ideas
 * (电 electric + 话 speech), and the useful breakdown is one level down from the word. Words
 * longer than a few characters are skipped: past that the panel is taller than the definition
 * it is supposed to be supporting.
 */

interface Props {
  /** The word as displayed. Each Han character in it is broken down in turn. */
  word: string;
  /** Rendered inside the dark lookup popup, which has its own palette. */
  variant?: 'popup' | 'panel';
}

const MAX_CHARS = 3;

export default function CharacterBreakdown({ word, variant = 'panel' }: Props) {
  const language = useLanguage();
  const [rows, setRows] = useState<Decomposition[] | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    if (!supportsDecomposition(language) || !word) return;
    const chars = [...word].slice(0, MAX_CHARS);
    void loadHanDecomp().then(table => {
      if (!live || !table) return;
      const out = chars.map(c => decompose(table, c)).filter((d): d is Decomposition => d !== null);
      setRows(out.length ? out : null);
    });
    return () => { live = false; };
  }, [word, language]);

  if (!rows || rows.length === 0) return null;

  const pop = variant === 'popup';
  const rule = pop ? '1px solid rgba(255,255,255,.1)' : '1px solid var(--line)';
  const label = pop
    ? { fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase' as const, opacity: 0.4, marginBottom: 5 }
    : { fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', marginBottom: 6 };
  const han = { fontFamily: 'var(--f-han)', fontWeight: 'var(--han-weight)' as 'bold' };
  const dim = pop ? { opacity: 0.75 } : { color: 'var(--ink-soft)' };
  const faint = pop ? { opacity: 0.45 } : { color: 'var(--ink-faint)' };

  return (
    <div className={pop ? 'mt-2 pt-2' : 'mt-3 pt-3'} style={{ borderTop: rule }}>
      <div style={label}>built from</div>
      {rows.map(row => (
        <div key={row.char} className="mb-1.5 last:mb-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span style={{ ...han, fontSize: pop ? 17 : 20 }}>{row.char}</span>
            <span style={{ fontSize: pop ? 11.5 : 12.5, ...dim }}>{row.gloss}</span>
            {row.components.length >= 2 && (
              <>
                <span style={{ fontSize: pop ? 11 : 12, ...faint }}>=</span>
                {row.components.map((c, i) => (
                  <span key={c.char + i} className="inline-flex items-baseline gap-1">
                    {i > 0 && <span style={{ fontSize: pop ? 11 : 12, ...faint, marginRight: 2 }}>+</span>}
                    <span style={{ ...han, fontSize: pop ? 15 : 17 }}>{c.char}</span>
                    <span style={{ fontSize: pop ? 10.5 : 11.5, ...dim }}>{c.gloss}</span>
                    {/* Which half carries the sound is worth naming: it tells the learner
                        this part is NOT a clue to the meaning, which is the single most
                        common way character mnemonics go wrong. */}
                    {c.role && (
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 8.5, letterSpacing: '.06em', textTransform: 'uppercase', ...faint }}>
                        {c.role}
                      </span>
                    )}
                  </span>
                ))}
              </>
            )}
          </div>
          {row.hint && row.hint.length > 2 && (
            <div style={{ fontSize: pop ? 11 : 12, lineHeight: 1.45, marginTop: 2, ...faint }}>
              {row.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
