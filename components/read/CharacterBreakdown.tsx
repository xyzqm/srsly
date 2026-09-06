'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { isProperNounGloss } from '@/lib/glossQuality';
import { loadHanDecomp, decompose, supportsDecomposition, type Decomposition, type HanEntry } from '@/lib/hanDecomp';
import { seriesFor, examples, type PhoneticSeries } from '@/lib/phoneticSeries';
import { lookupWord } from '@/lib/data/dict';

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
  /** The raw table too: `ph`/`se` are on `HanEntry` and `decompose` deliberately drops them. */
  const [table, setTable] = useState<Record<string, HanEntry> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setRows(null);
    setTable(null);
    setOpen(false);                                   // a new word starts collapsed again
    if (!supportsDecomposition(language) || !word) return;
    if (gloss && isProperNounGloss(gloss)) return;    // names are not built from anything
    // Deduped, and only then capped. 越来越 is 越 twice, and a second identical row says
    // nothing the first did not — it also collided in React's key space, since the row key
    // is the character itself.
    const chars = [...new Set([...word])].slice(0, MAX_CHARS);
    void loadHanDecomp().then(t => {
      if (!live || !t) return;
      const out = chars.map(c => decompose(t, c)).filter((d): d is Decomposition => d !== null);
      setRows(out.length ? out : null);
      setTable(t);
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
                        {/* A part the source never glossed shows as the shape alone, rather
                            than an empty span opening a gap where a word should be. */}
                        {c.gloss && <span style={{ fontSize: pop ? 10.5 : 11.5, ...dim }}>{c.gloss}</span>}
                        {/* No SOUND / MEANING tags.
                            They were meant to warn that a phonetic component is not a clue to
                            the meaning, but they read as claims about the component itself —
                            "孝 filial piety SOUND" invites the question "sound of what?" and
                            answers nothing. The gloss beside each part is what a learner
                            actually uses; the rest was jargon in the way. */}
                      </span>
                    ))}
                  </>
                )}
              </div>
              {/*
                WHAT THE SOUND HALF ACTUALLY SOUNDS LIKE.

                SOUND / MEANING tags on the components were tried here once and removed,
                because "孝 filial piety SOUND" invites "sound of what?" and answers nothing.
                This is the answer that was missing: the family, its shared reading, and how
                far it can be trusted — see lib/phoneticSeries.ts for how that is measured.

                The examples carry the tone caveat themselves. Printed with their real marks
                and side by side, 清 qīng · 情 qíng · 请 qǐng shows three tones on one
                syllable, so nothing has to say "tones vary" and be read past.
              */}
              {table && <PhoneticLine char={row.char} table={table} pop={pop} dim={dim} faint={faint} han={han} />}

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

/**
 * One line: which part gives the sound, what that sound is, and whether to trust it.
 *
 * SHOWN FOR UNRELIABLE FAMILIES TOO, deliberately. 者 covers fourteen characters and predicts
 * none of them; hiding it would leave the learner to discover that by guessing wrong. Shown as
 * three clusters that disagree, it teaches the one thing this feature most needs to teach —
 * that a phonetic narrows the sound and does not settle it.
 */
function PhoneticLine({ char, table, pop, dim, faint, han }: {
  char: string;
  table: Record<string, HanEntry>;
  pop: boolean;
  dim: React.CSSProperties;
  faint: React.CSSProperties;
  han: React.CSSProperties;
}) {
  const series: PhoneticSeries | null = seriesFor(char, table, c => lookupWord(c).pinyin || undefined);
  if (!series) return null;

  const shown = examples(series, 3, char);
  if (shown.length < 2) return null;   // one example demonstrates nothing either way

  const n = series.members.length;
  const share = Math.round(series.reliability * n);

  return (
    <div
      className="flex items-baseline gap-1.5 mt-1"
      style={{ flexWrap: 'nowrap', overflowX: 'auto', whiteSpace: 'nowrap',
               fontSize: pop ? 11 : 12, ...dim }}
    >
      <span style={{ ...han, fontSize: pop ? 14 : 16 }}>{series.phonetic}</span>
      {/*
        The low end says "only N of M sound alike" rather than "no single sound", because the
        second is often false. 艮 has 7 of its 11 on "-en" — a real majority that simply does
        not clear the bar — and flatly denying a pattern the learner can see in the examples
        below teaches them to distrust the label instead of the phonetic.
      */}
      <span style={{ ...faint }}>
        {series.predictive ? 'sounds like' : `only ${share} of ${n} sound alike —`}
      </span>
      {shown.map(m => (
        <span key={m.char} className="inline-flex items-baseline gap-1">
          <span style={{ ...han, fontSize: pop ? 13 : 15 }}>{m.char}</span>
          <span>{lookupWord(m.char).pinyin}</span>
        </span>
      ))}
      {series.predictive && <span style={{ ...faint }}>{`· ${share} of ${n}`}</span>}
    </div>
  );
}
