'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { isProperNounGloss } from '@/lib/glossQuality';
import { loadHanDecomp, decompose, supportsDecomposition, type Decomposition } from '@/lib/hanDecomp';

/**
 * What the characters in a word are built from — 休 = 亻 person + 木 tree.
 *
 * WHERE THIS IS ALLOWED TO APPEAR. Only where the answer is already known or has been asked
 * for: the lookup popup (you clicked to find out) and a word you have just missed. Never
 * beside a cloze blank or in the pre-reading primer — the components of 休 are a very strong
 * hint about 休, and a mnemonic offered during a recall test stops measuring recall.
 *
 * COLLAPSED BY DEFAULT. It is reference material, not the answer to the question you asked:
 * you clicked a word to find out what it means, and three lines of etymology above the
 * definition is clutter until you want it. Opening it is one click and the choice sticks for
 * as long as the popup is open.
 *
 * WHY IT IS PER CHARACTER RATHER THAN PER WORD. A two-character word is usually two ideas
 * (电 electric + 话 speech), and the useful breakdown is one level down from the word.
 */

interface Props {
  /** The word as displayed. Each Han character in it is broken down in turn. */
  word: string;
  /**
   * The word's definition, used only to recognise a proper noun.
   *
   * A NAME IS NOT BUILT FROM ANYTHING. 李华 is a person; breaking it into "plum = tree +
   * son" and "flowery = change + ten" explains the graphs while saying nothing about the
   * word, and the parts actively mislead — 华 is not "ten" in any sense a reader could use.
   * The characters were chosen for sound, so their meanings are noise here.
   */
  gloss?: string;
  /** Rendered inside the dark lookup popup, which has its own palette. */
  variant?: 'popup' | 'panel';
}

const MAX_CHARS = 3;

export default function CharacterBreakdown({ word, gloss, variant = 'panel' }: Props) {
  const language = useLanguage();
  const [rows, setRows] = useState<Decomposition[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setRows(null);
    setOpen(false);                                   // a new word starts collapsed again
    if (!supportsDecomposition(language) || !word) return;
    if (gloss && isProperNounGloss(gloss)) return;    // names are not built from anything
    const chars = [...word].slice(0, MAX_CHARS);
    void loadHanDecomp().then(table => {
      if (!live || !table) return;
      const out = chars.map(c => decompose(table, c)).filter((d): d is Decomposition => d !== null);
      setRows(out.length ? out : null);
    });
    return () => { live = false; };
  }, [word, gloss, language]);

  if (!rows || rows.length === 0) return null;

  const pop = variant === 'popup';
  const rule = pop ? '1px solid rgba(255,255,255,.1)' : '1px solid var(--line)';
  const han = { fontFamily: 'var(--f-han)', fontWeight: 'var(--han-weight)' as 'bold' };
  const dim = pop ? { opacity: 0.75 } : { color: 'var(--ink-soft)' };
  const faint = pop ? { opacity: 0.45 } : { color: 'var(--ink-faint)' };
  const toggleStyle: React.CSSProperties = {
    fontFamily: 'var(--f-mono)', fontSize: pop ? 9.5 : 10, letterSpacing: '.1em',
    textTransform: 'uppercase', background: 'none', border: 'none', padding: 0,
    cursor: 'pointer', ...(pop ? { color: 'rgba(255,255,255,.45)' } : { color: 'var(--ink-faint)' }),
  };

  return (
    <div className={pop ? 'mt-2 pt-2' : 'mt-3 pt-3'} style={{ borderTop: rule }}>
      <button onClick={() => setOpen(v => !v)} style={toggleStyle} aria-expanded={open}>
        {open ? '− hide radical decomposition' : '+ show radical decomposition'}
      </button>

      {open && (
        <div className="mt-2">
          {rows.map(row => (
            <div key={row.char} className="mb-1.5 last:mb-0">
              {/*
                ONE LINE PER CHARACTER, and it stays one line.
                The equation used to wrap, so "李 plum = 木 tree" sat on one row and
                "+ 子 son" dropped to the next, which read as a separate fact rather than the
                back half of the same sentence. nowrap keeps it together; the rare equation
                too wide for the popup scrolls sideways inside its own row instead of
                reflowing the panel.
              */}
              <div
                className="flex items-baseline gap-1.5"
                style={{ flexWrap: 'nowrap', overflowX: 'auto', whiteSpace: 'nowrap' }}
              >
                <span style={{ ...han, fontSize: pop ? 17 : 20 }}>{row.char}</span>
                <span style={{ fontSize: pop ? 11.5 : 12.5, ...dim }}>{row.gloss}</span>
                {row.components.length >= 2 && (
                  <>
                    <span style={{ fontSize: pop ? 11 : 12, ...faint }}>=</span>
                    {row.components.map((c, i) => (
                      <span key={c.char + i} className="inline-flex items-baseline gap-1" style={{ whiteSpace: 'nowrap' }}>
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
              {/* Only ever a real sentence — see the hint note in lib/hanDecomp.ts. */}
              {row.hint && row.hint.length > 2 && (
                <div style={{ fontSize: pop ? 11 : 12, lineHeight: 1.45, marginTop: 2, ...faint }}>
                  {row.hint}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
