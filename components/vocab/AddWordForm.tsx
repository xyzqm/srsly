'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { toneNumToMark, checkPinyin } from '@/lib/pinyin';
import { lookupWord } from '@/lib/data/dict';
import { checkCompounds } from '@/lib/compounds';
import { POLYPHONES } from '@/lib/polyphones';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { useWordLookup, splitSenses } from '@/hooks/useWordLookup';

interface Props {
  onAdd: (word: DeckWord) => void;
  onCancel: () => void;
  deckOptions?: string[];  // existing deck names, for autocomplete
  defaultDeck?: string;    // pre-fill (e.g. the currently-selected study deck)
}

export default function AddWordForm({ onAdd, onCancel, deckOptions = [], defaultDeck = '' }: Props) {
  const language = useLanguage();
  const langConfig = getLanguageConfig(language);
  const isZh = language === 'zh';
  const [hanzi, setHanzi] = useState('');
  const [deckName, setDeckName] = useState(defaultDeck);
  const [pinyin, setPinyin] = useState('');
  const [pinHint, setPinHint] = useState(langConfig.readingHint);
  // Compound words that carry the chosen reading — surfaced in generated passages
  // for readings that don't stand alone (行 háng → 银行, 行业).
  const [compounds, setCompounds] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  // Detected after mount to avoid SSR/hydration mismatch
  const [hasSpeech, setHasSpeech] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognizerRef = useRef<any>(null);

  const trimmed = hanzi.trim();
  const lookup = useWordLookup(hanzi, language);

  // A Chinese polyphone carries a DIFFERENT meaning per reading (行 xíng "to walk" vs háng
  // "a row"), and the dictionary returns one merged gloss covering all of them. So for
  // these the senses come from the selected reading, not from the lookup — otherwise every
  // reading of a polyphone would show the same conflated definition.
  const polyReadings = isZh ? POLYPHONES[trimmed] : undefined;
  const activeReading = useMemo(
    () => polyReadings?.find(r => r.p === pinyin) ?? polyReadings?.[0],
    [polyReadings, pinyin],
  );

  /** The senses that will be stored, shown read-only below. */
  const definitions = activeReading ? splitSenses(activeReading.m) : lookup.definitions;
  /** POLYPHONES is a curated list of real characters, so a hit there is authoritative even
   *  if the merged dictionary entry didn't resolve. */
  const status = polyReadings?.length ? 'found' : lookup.status;
  /** Dictionary form to file the card under — the lemma for inflecting languages. */
  const canonicalWord = activeReading ? trimmed : (lookup.word || trimmed);
  const canAdd = status === 'found' && definitions.length > 0;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setHasSpeech(!!(( window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  }, []);

  // Polyphone: default to the most frequent reading when the WORD changes.
  //
  // Deliberately keyed on the word alone, not on the lookup state. The lookup is debounced,
  // so if this also re-ran when the result landed it would reset the reading out from under
  // someone who had already clicked a different chip in the meantime — silently filing 行
  // under xíng when they picked háng.
  useEffect(() => {
    const poly = isZh ? POLYPHONES[trimmed] : undefined;
    if (!poly?.length) return;
    setPinyin(poly[0].p);
    setCompounds(poly[0].compounds ?? []);
    setPinHint('auto-filled — tap to edit');
  }, [trimmed, isZh]);

  // Everything else: the reading follows whatever the dictionary resolved.
  useEffect(() => {
    if (isZh && POLYPHONES[trimmed]) return;  // handled above
    setCompounds([]);
    if (!langConfig.hasReadings) return;
    if (lookup.status === 'found') {
      setPinyin(lookup.reading);
      setPinHint(lookup.reading ? 'auto-filled — tap to edit' : langConfig.readingHint);
    } else if (lookup.status !== 'loading') {
      setPinyin('');
      setPinHint(langConfig.readingHint);
    }
  }, [trimmed, isZh, lookup.status, lookup.reading, langConfig.hasReadings, langConfig.readingHint]);

  function handleHanziChange(val: string) {
    setHanzi(val);
  }

  function handlePinyinBlur(val: string) {
    // Tone-number → diacritic conversion is Chinese-only; Japanese readings are kana.
    if (isZh && /[1-5]/.test(val)) setPinyin(toneNumToMark(val));
  }

  function addCompound() { setCompounds(c => [...c, '']); }
  function removeCompound(i: number) { setCompounds(c => c.filter((_, j) => j !== i)); }
  function setCompound(i: number, val: string) {
    setCompounds(c => c.map((v, j) => j === i ? val : v));
  }

  async function submit() {
    // The dictionary is the only source of words and meanings now — nothing here is
    // free text, so there is no unvalidated input to guard against.
    if (!canAdd) return;
    const h = canonicalWord;
    const m = definitions.join('; ');
    const p = pinyin.trim();
    const deck = deckName.trim();

    if (isZh) {
      // Chinese-only validation: warn on a wrong reading, and check compound sanity.
      // The reading stays editable because for a polyphone it is the user's choice of
      // WHICH card this is (行 xíng and 行 háng are separate cards).
      const known = [lookupWord(h).pinyin, ...(POLYPHONES[h]?.map(r => r.p) ?? [])].filter(Boolean);
      const warn = checkPinyin(p, h, known);
      if (warn && !window.confirm(warn)) return;
      const cleanCompounds = compounds.map(c => c.trim()).filter(Boolean);
      const compWarn = await checkCompounds(h, cleanCompounds);
      if (compWarn && !window.confirm(compWarn)) return;
      onAdd({ h, p, m, ...(deck ? { decks: [deck] } : {}), ...(cleanCompounds.length ? { compounds: cleanCompounds } : {}) });
      return;
    }

    // For inflecting languages `canonicalWord` is already the lemma the lookup resolved
    // (먹었어요 → 먹다), so no second round-trip is needed here.
    onAdd({ h, p, m, ...(deck ? { decks: [deck] } : {}) });
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
    r.lang = getLanguageConfig(language).bcp47;
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

  /** Shared frame for the idle / loading / not-found / error states of the lookup. */
  const statusBoxStyle = {
    background: 'var(--paper-2)', border: '1px dashed var(--line)', borderRadius: 9,
    padding: '11px 14px', fontSize: 13.5, lineHeight: 1.5,
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
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>{langConfig.wordFieldLabel}</div>
          <input
            value={hanzi}
            onChange={e => handleHanziChange(e.target.value)}
            placeholder={langConfig.wordFieldPlaceholder}
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

        {/* Reading — not rendered at all for languages with no reading layer (es). */}
        {langConfig.hasReadings && (
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              {langConfig.readingLabel}{' '}
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)', fontFamily: 'var(--f-ui)', fontSize: 10 }}>
                {langConfig.readingHelp}
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
        )}
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
                    // Selecting a reading is enough — the displayed definitions derive from
                    // whichever reading is active (see `activeReading`).
                    setPinyin(r.p);
                    setPinHint('auto-filled — tap to edit');
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

      {/* Definitions — read-only, straight from the dictionary. Cards can only be created
          from real dictionary entries, so there is nothing to type here. */}
      <div className="mb-2.5">
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
          Definition{' '}
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-soft)' }}>
            — from the {langConfig.dictName.replace(/\s*\(.*\)$/, '')} dictionary
          </span>
        </div>

        {status === 'idle' && (
          <div style={statusBoxStyle} >
            <span style={{ color: 'var(--ink-faint)' }}>
              Type a word above to look it up.
            </span>
          </div>
        )}

        {status === 'loading' && (
          <div style={statusBoxStyle}>
            <span className="playing-pulse" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--ink-faint)', marginRight: 9 }} />
            <span style={{ color: 'var(--ink-soft)' }}>looking up…</span>
          </div>
        )}

        {status === 'not-found' && (
          <div style={{ ...statusBoxStyle, borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 7%, transparent)' }}>
            <div style={{ color: 'var(--accent)', fontWeight: 500 }}>
              Not found in the {langConfig.name} dictionary
            </div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
              Only words with a dictionary entry can be added.
              {langConfig.usesBaseForms && ' Conjugated forms are fine — they resolve to their dictionary form.'}
            </div>
          </div>
        )}

        {status === 'error' && (
          <div style={{ ...statusBoxStyle, borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 7%, transparent)' }}>
            <div style={{ color: 'var(--accent)', fontWeight: 500 }}>Couldn&apos;t reach the dictionary</div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
              This is a connection problem, not a verdict on the word — edit the word to try again.
            </div>
          </div>
        )}

        {status === 'found' && (
          <>
            {/* Typing an inflected form files the card under its dictionary form; say so
                rather than silently storing something the user didn't type. */}
            {canonicalWord !== trimmed && (
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 8, letterSpacing: '.02em' }}>
                <span style={{ fontFamily: 'var(--f-han)', fontSize: 14 }}>{trimmed}</span>
                {' → saved as '}
                <span style={{ fontFamily: 'var(--f-han)', fontSize: 14, color: 'var(--jade)', fontWeight: 500 }}>{canonicalWord}</span>
              </div>
            )}
            <ol
              className="flex flex-col gap-1.5"
              style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 9, padding: '11px 14px 11px 30px', margin: 0, listStyle: definitions.length > 1 ? 'decimal' : 'none' }}
            >
              {definitions.map((d, i) => (
                <li key={i} style={{ fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.5, marginLeft: definitions.length > 1 ? 0 : -16 }}>
                  {d}
                </li>
              ))}
            </ol>
          </>
        )}
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
          disabled={!canAdd}
          title={canAdd ? undefined : 'Look up a word in the dictionary first'}
          className="transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '12px 20px', boxShadow: canAdd ? '0 2px 0 var(--accent-deep)' : 'none',
            cursor: canAdd ? 'pointer' : 'not-allowed',
            opacity: canAdd ? 1 : 0.45,
          }}
        >
          {status === 'loading' ? 'Looking up…' : 'Add to deck'}
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
