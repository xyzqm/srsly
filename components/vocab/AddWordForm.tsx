'use client';
import { useState, useRef, useEffect } from 'react';
import type { DeckWord } from '@/lib/types';
import { autoFillPinyin, toneNumToMark, checkPinyin } from '@/lib/pinyin';
import { lookupWord } from '@/lib/data/dict';
import { checkCompounds } from '@/lib/compounds';
import { POLYPHONES } from '@/lib/polyphones';

interface Props {
  onAdd: (word: DeckWord) => void;
  onCancel: () => void;
  deckOptions?: string[];  // existing deck names, for autocomplete
  defaultDeck?: string;    // pre-fill (e.g. the currently-selected study deck)
}

export default function AddWordForm({ onAdd, onCancel, deckOptions = [], defaultDeck = '' }: Props) {
  const [hanzi, setHanzi] = useState('');
  const [deckName, setDeckName] = useState(defaultDeck);
  const [pinyin, setPinyin] = useState('');
  const [pinHint, setPinHint] = useState('type with tone numbers e.g. shui3bei1');
  const [defs, setDefs] = useState<string[]>(['']);
  // Compound words that carry the chosen reading — surfaced in generated passages
  // for readings that don't stand alone (行 háng → 银行, 行业).
  const [compounds, setCompounds] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  // Detected after mount to avoid SSR/hydration mismatch
  const [hasSpeech, setHasSpeech] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognizerRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setHasSpeech(!!(( window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  }, []);

  function handleHanziChange(val: string) {
    setHanzi(val);
    const trimmed = val.trim();
    // Compounds are reading-specific; reset on any hanzi change (a reading chip re-fills them).
    setCompounds([]);

    if (!trimmed) {
      setPinyin('');
      setPinHint('type with tone numbers e.g. shui3bei1');
      setDefs(['']);
      return;
    }

    // Polyphone: auto-select the most frequent reading (first in POLYPHONES) rather
    // than the dictionary's merged entry, which combines every reading's pinyin and
    // senses. The reading chips let the user switch to another reading.
    const poly = POLYPHONES[trimmed];
    if (poly && poly.length > 0) {
      const top = poly[0];
      setPinyin(top.p);
      setPinHint('auto-filled — tap to edit');
      const parts = top.m.split(/\s*[;·]\s*/).map(s => s.trim()).filter(Boolean);
      setDefs(parts.length > 0 ? parts : ['']);
      setCompounds(top.compounds ?? []);
      return;
    }

    // Non-polyphone: dictionary for pinyin + meaning.
    const entry = lookupWord(trimmed);
    if (entry.pinyin) {
      setPinyin(entry.pinyin);
      setPinHint('auto-filled — tap to edit');
    } else {
      // Fall back to phonetic auto-fill (character-by-character)
      const filled = autoFillPinyin(trimmed);
      if (filled) {
        setPinyin(filled);
        setPinHint('auto-filled — tap to edit');
      } else {
        setPinyin('');
        setPinHint('type with tone numbers e.g. shui3bei1');
      }
    }

    // Auto-fill meaning from dictionary if found. Dictionary sources separate senses
    // with either ';' or a middle dot '·' — split on both so each becomes its own field.
    if (entry.meaning) {
      const parts = entry.meaning.split(/\s*[;·]\s*/).map(s => s.trim()).filter(Boolean);
      setDefs(parts.length > 0 ? parts : [entry.meaning]);
    }
  }

  function handlePinyinBlur(val: string) {
    if (/[1-5]/.test(val)) setPinyin(toneNumToMark(val));
  }

  function addDef() { setDefs(d => [...d, '']); }
  function removeDef(i: number) {
    setDefs(d => {
      const next = d.filter((_, j) => j !== i);
      return next.length ? next : [''];
    });
  }
  function setDef(i: number, val: string) {
    setDefs(d => d.map((v, j) => j === i ? val : v));
  }

  function addCompound() { setCompounds(c => [...c, '']); }
  function removeCompound(i: number) { setCompounds(c => c.filter((_, j) => j !== i)); }
  function setCompound(i: number, val: string) {
    setCompounds(c => c.map((v, j) => j === i ? val : v));
  }

  async function submit() {
    const h = hanzi.trim();
    const m = defs.map(d => d.trim()).filter(Boolean).join('; ');
    if (!h || !m) return;
    const p = pinyin.trim();
    // Warn if the pinyin looks wrong for this character (invalid, or not a known reading)
    const known = [lookupWord(h).pinyin, ...(POLYPHONES[h]?.map(r => r.p) ?? [])].filter(Boolean);
    const warn = checkPinyin(p, h, known);
    if (warn && !window.confirm(warn)) return;
    const cleanCompounds = compounds.map(c => c.trim()).filter(Boolean);
    // Warn if a compound doesn't contain this character or isn't a real word
    const compWarn = await checkCompounds(h, cleanCompounds);
    if (compWarn && !window.confirm(compWarn)) return;
    const deck = deckName.trim();
    onAdd({ h, p, m, ...(deck ? { decks: [deck] } : {}), ...(cleanCompounds.length ? { compounds: cleanCompounds } : {}) });
  }

  function toggleVoice() {
    if (recording) {
      recognizerRef.current?.stop();
      setRecording(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = new SR() as any;
    r.lang = 'zh-CN';
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e: { results: { [n: number]: { [n: number]: { transcript: string } } } }) => {
      const text = e.results[0][0].transcript.trim();
      if (text) handleHanziChange(text);
    };
    r.onend = () => setRecording(false);
    r.onerror = () => setRecording(false);

    recognizerRef.current = r;
    r.start();
    setRecording(true);
  }

  const inputStyle = {
    fontFamily: 'var(--f-han)', fontSize: 16, background: 'var(--paper-2)', border: '1px solid var(--line)',
    borderRadius: 9, padding: '10px 13px', color: 'var(--ink)', width: '100%', transition: 'all .15s',
    outline: 'none',
  };

  return (
    <div
      className="rounded-xl px-6 py-5 mb-6"
      style={{ background: 'var(--paper-2)', border: '1px dashed var(--line)' }}
    >
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 14 }}>
        Add a new word
      </div>

      <div className="grid gap-3.5 mb-3.5" style={{ gridTemplateColumns: '100px 1fr' }}>
        {/* Hanzi + mic button */}
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>Hanzi</div>
          <input
            value={hanzi}
            onChange={e => handleHanziChange(e.target.value)}
            placeholder="垃圾"
            style={{ ...inputStyle, fontSize: 26, textAlign: 'center' }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.background = 'var(--card)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.background = 'var(--paper-2)'; }}
          />
          {hasSpeech && (
            <button
              onClick={toggleVoice}
              title={recording ? 'Stop recording' : 'Speak to fill hanzi'}
              className="mt-1.5 w-full cursor-pointer transition-all duration-150"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 11,
                background: recording ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
                border: `1px solid ${recording ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 7, padding: '5px 0',
                color: recording ? 'var(--accent)' : 'var(--ink-faint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              {recording ? (
                <>
                  <span className="playing-pulse" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                  listening…
                </>
              ) : (
                <>🎤 speak</>
              )}
            </button>
          )}
        </div>

        {/* Pinyin */}
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              Pinyin{' '}
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)', fontFamily: 'var(--f-ui)', fontSize: 10 }}>
                (lv4 for lǜ · no number = neutral tone e.g. le)
              </span>
            </div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.04em' }}>{pinHint}</span>
          </div>
          <input
            value={pinyin}
            onChange={e => setPinyin(e.target.value)}
            onBlur={e => handlePinyinBlur(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--f-mono)', letterSpacing: '.06em', fontSize: 17 }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.background = 'var(--card)'; }}
          />
        </div>
      </div>

      {/* Polyphone reading picker */}
      {POLYPHONES[hanzi.trim()] && (
        <div className="mb-3.5">
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 7 }}>
            Reading
          </div>
          <div className="flex flex-wrap gap-2">
            {POLYPHONES[hanzi.trim()].map(r => {
              const active = pinyin === r.p;
              return (
                <button
                  key={r.p}
                  onClick={() => {
                    setPinyin(r.p);
                    setPinHint('auto-filled — tap to edit');
                    const parts = r.m.split(/\s*[;·]\s*/).map(s => s.trim()).filter(Boolean);
                    setDefs(parts.length > 0 ? parts : [r.m]);
                    setCompounds(r.compounds ?? []);
                  }}
                  className="cursor-pointer transition-all duration-150"
                  style={{
                    fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.04em',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                    background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--paper))' : 'var(--paper-2)',
                    color: active ? 'var(--accent)' : 'var(--ink-soft)',
                    borderRadius: 8, padding: '6px 12px',
                  }}
                >
                  {r.p} · {r.m.split(';')[0].trim()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Definitions */}
      <div className="mb-2.5">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
          Definitions{' '}
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>
            — add one or more, shown separated by semicolons
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {defs.map((d, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={d}
                onChange={e => setDef(i, e.target.value)}
                placeholder="e.g. garbage"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.background = 'var(--card)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.background = 'var(--paper-2)'; }}
              />
              <button
                onClick={() => removeDef(i)}
                className="shrink-0 cursor-pointer"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 16, background: 'none', border: 'none', color: 'var(--ink-faint)', width: 28, height: 28, borderRadius: 6 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addDef}
          className="mt-2 w-full cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em',
            background: 'none', border: '1px dashed var(--line)',
            color: 'var(--ink-faint)', borderRadius: 8, padding: '8px 14px',
          }}
        >
          + add another definition
        </button>
      </div>

      {/* Compound words — surface this reading in generated passages. Shown for
          polyphones (where a reading may not stand alone) or when already set. */}
      {(POLYPHONES[hanzi.trim()] || compounds.length > 0) && (
        <div className="mb-2.5">
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
            Compounds{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>
              — words that use this reading; generated passages can use these to show it in context
            </span>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {compounds.map((c, i) => (
              <div key={i} className="flex items-center gap-1" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 6px 4px 10px' }}>
                <input
                  value={c}
                  onChange={e => setCompound(i, e.target.value)}
                  placeholder=""
                  style={{ fontFamily: 'var(--f-han)', fontSize: 15, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', width: `${Math.max(c.length, 2) + 1}ch` }}
                />
                <button
                  onClick={() => removeCompound(i)}
                  className="shrink-0 cursor-pointer"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 14, background: 'none', border: 'none', color: 'var(--ink-faint)', width: 20, height: 20, borderRadius: 5 }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addCompound}
              className="cursor-pointer transition-all duration-150"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.04em',
                background: 'none', border: '1px dashed var(--line)',
                color: 'var(--ink-faint)', borderRadius: 8, padding: '7px 12px',
              }}
            >
              + add compound
            </button>
          </div>
        </div>
      )}

      {/* Deck — optional; type a new name to create a deck, or pick an existing one */}
      <div className="mt-3.5">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>
          Deck <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>— optional; type a new name to create one</span>
        </div>
        <input
          list="addword-decks"
          value={deckName}
          onChange={e => setDeckName(e.target.value)}
          placeholder="default"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 13, width: 220, maxWidth: '100%',
            background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8,
            padding: '8px 11px', color: 'var(--ink)', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--line)'; }}
        />
        <datalist id="addword-decks">{deckOptions.map(d => <option key={d} value={d} />)}</datalist>
      </div>

      <div className="flex gap-2 mt-3.5">
        <button
          onClick={submit}
          className="cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)',
          }}
        >
          Add to deck
        </button>
        <button
          onClick={onCancel}
          className="cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
            background: 'none', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 20px',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
