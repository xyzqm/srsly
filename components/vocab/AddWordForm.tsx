'use client';
import { useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { autoFillPinyin, toneNumToMark } from '@/lib/pinyin';

interface Props { onAdd: (word: DeckWord) => void; onCancel: () => void; }

export default function AddWordForm({ onAdd, onCancel }: Props) {
  const [hanzi, setHanzi] = useState('');
  const [pinyin, setPinyin] = useState('');
  const [pinHint, setPinHint] = useState('type with tone numbers e.g. shui3bei1');
  const [defs, setDefs] = useState<string[]>(['']);

  function handleHanziChange(val: string) {
    setHanzi(val);
    const filled = autoFillPinyin(val);
    if (filled) { setPinyin(filled); setPinHint('auto-filled — tap to edit'); }
    else { setPinyin(''); setPinHint('type with tone numbers e.g. shui3bei1'); }
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

  function submit() {
    const h = hanzi.trim();
    const m = defs.map(d => d.trim()).filter(Boolean).join(', ');
    if (!h || !m) return;
    onAdd({ h, p: pinyin.trim(), m });
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
        {/* Hanzi */}
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

      {/* Definitions */}
      <div className="mb-2.5">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
          Definitions{' '}
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>
            — add one or more, shown comma-separated
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
