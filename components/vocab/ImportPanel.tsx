'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { DeckWord } from '@/lib/types';
import { lookupWordAsync } from '@/lib/data/dict';
import { HSK_VOCAB } from '@/lib/data/hsk-vocab';
import { HSK_LEVELS } from '@/lib/data/hsk-levels';
import { toneNumToMark } from '@/lib/pinyin';

interface Props {
  deck: DeckWord[];
  onImport: (words: Array<{ h: string; p: string; m: string }>) => void;
  onCancel: () => void;
}

type ImportMode = 'list' | 'quizlet' | 'csv' | 'hsk';

interface ParsedWord {
  h: string;
  p: string;
  m: string;
  status: 'loading' | 'ready' | 'not-found' | 'in-deck';
  selected: boolean;
}

const MODE_LABELS: Record<ImportMode, string> = {
  list: 'Word list',
  quizlet: 'Quizlet',
  csv: 'CSV',
  hsk: 'HSK levels',
};

const btn = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em',
  textTransform: 'uppercase',
  background: active ? 'var(--card)' : 'none',
  color: active ? 'var(--accent)' : 'var(--ink-soft)',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,.07)' : 'none',
  border: 'none', borderRadius: 7, padding: '7px 13px',
  cursor: 'pointer', fontWeight: active ? 500 : undefined,
  transition: 'all .15s', whiteSpace: 'nowrap',
});

const textarea: React.CSSProperties = {
  width: '100%', minHeight: 140, resize: 'vertical',
  fontFamily: 'var(--f-mono)', fontSize: 13, lineHeight: 1.6,
  background: 'var(--paper-2)', border: '1px solid var(--line)',
  borderRadius: 10, padding: '12px 14px', color: 'var(--ink)',
  outline: 'none',
};

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseWordList(text: string): Array<{ h: string; p: string; m: string }> {
  const lines = text.split(/[\n,，]+/).map(l => l.trim()).filter(Boolean);
  return lines.map(l => ({ h: l, p: '', m: '' }));
}

function parseQuizlet(text: string): Array<{ h: string; p: string; m: string }> {
  // Quizlet export: term\tdefinition\n (tab-separated)
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  return lines.flatMap(line => {
    const parts = line.split(/\t/);
    if (parts.length < 2) return [];
    const term = parts[0].trim();
    const def  = parts[1].trim();
    if (!term) return [];
    // Check if term looks like Chinese (contains CJK characters)
    const isChinese = /[一-鿿]/.test(term);
    if (isChinese) return [{ h: term, p: '', m: def }];
    // Maybe definition is the Chinese side
    const defIsChinese = /[一-鿿]/.test(def);
    if (defIsChinese) return [{ h: def, p: '', m: term }];
    return [];
  });
}

function parseCsv(text: string): Array<{ h: string; p: string; m: string }> {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  return lines.flatMap(line => {
    // Support comma or tab delimited; strip quotes
    const parts = line.split(/,|\t/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    const [h, second, third] = parts;
    if (!h || !/[一-鿿]/.test(h)) return [];
    if (third) return [{ h, p: second || '', m: third }];
    if (second) return [{ h, p: '', m: second }];
    return [{ h, p: '', m: '' }];
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportPanel({ deck, onImport, onCancel }: Props) {
  const [mode, setMode] = useState<ImportMode>('list');
  const [text, setText] = useState('');
  const [words, setWords] = useState<ParsedWord[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const abortRef = useRef(0);

  const deckSet = new Set(deck.map(d => d.h));

  // Parse + lookup when text changes (for text modes)
  useEffect(() => {
    if (mode === 'hsk') return;
    const run = ++abortRef.current;

    if (!text.trim()) { setWords([]); setLookupDone(false); return; }

    let raw: Array<{ h: string; p: string; m: string }> = [];
    if (mode === 'list')    raw = parseWordList(text);
    if (mode === 'quizlet') raw = parseQuizlet(text);
    if (mode === 'csv')     raw = parseCsv(text);

    // Deduplicate by hanzi
    const seen = new Set<string>();
    raw = raw.filter(w => { if (seen.has(w.h)) return false; seen.add(w.h); return true; });

    // Set as loading first
    setWords(raw.map(w => ({
      ...w,
      status: deckSet.has(w.h) ? 'in-deck' : 'loading',
      selected: !deckSet.has(w.h),
    })));
    setLookupDone(false);

    // Async lookup
    Promise.all(raw.map(async (w, i) => {
      if (abortRef.current !== run) return null;
      if (w.p && w.m) {
        // Already have pinyin+meaning (e.g. CSV)
        const p = /[1-5]/.test(w.p) ? toneNumToMark(w.p) : w.p;
        return { ...w, p, status: deckSet.has(w.h) ? 'in-deck' : 'ready', selected: !deckSet.has(w.h) } as ParsedWord;
      }
      const found = await lookupWordAsync(w.h, '', w.m);
      if (abortRef.current !== run) return null;
      const status: ParsedWord['status'] = deckSet.has(w.h) ? 'in-deck' : found.pinyin || found.meaning ? 'ready' : 'not-found';
      return {
        h: w.h,
        p: found.pinyin || w.p,
        m: found.meaning || w.m,
        status,
        selected: status === 'ready',
      } as ParsedWord;
    })).then(results => {
      if (abortRef.current !== run) return;
      setWords(results.filter(Boolean) as ParsedWord[]);
      setLookupDone(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, mode]);

  const toggleWord = useCallback((i: number) => {
    setWords(prev => prev.map((w, j) => j === i ? { ...w, selected: !w.selected } : w));
  }, []);

  const selectedWords = words.filter(w => w.selected && w.h);

  function handleImport() {
    onImport(selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m })));
  }

  // ── HSK level mode ──────────────────────────────────────────────────────────

  function addHskLevel(level: number) {
    const hanziList = HSK_LEVELS[level] ?? [];
    const toAdd = hanziList
      .filter(h => !deckSet.has(h))
      .map(h => {
        const v = HSK_VOCAB[h];
        return { h, p: v?.pinyin ?? '', m: v?.meaning ?? '' };
      });
    if (toAdd.length > 0) onImport(toAdd);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--f-mono)', fontSize: 13, background: 'var(--paper-2)',
    border: '1px solid var(--line)', borderRadius: 7, padding: '7px 10px',
    color: 'var(--ink)', outline: 'none', transition: 'border-color .15s',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Import vocabulary
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 2 }}>
            Add words in bulk
          </div>
        </div>
        <button
          onClick={onCancel}
          style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 7, padding: '7px 14px', cursor: 'pointer' }}
        >
          ← Back
        </button>
      </div>

      {/* Mode switcher */}
      <div className="inline-flex gap-1 p-[5px] rounded-[11px] mb-5 flex-wrap" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
        {(Object.keys(MODE_LABELS) as ImportMode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setText(''); setWords([]); }} style={btn(mode === m)}>
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* ── HSK level mode ── */}
      {mode === 'hsk' && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 18 }}>
            Add all vocabulary words from a specific HSK level. Words already in your deck are skipped.
          </p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {[1, 2, 3, 4, 5, 6].map(level => {
              const all   = HSK_LEVELS[level]?.length ?? 0;
              const inDeck = (HSK_LEVELS[level] ?? []).filter(h => deckSet.has(h)).length;
              const toAdd  = all - inDeck;
              return (
                <button
                  key={level}
                  onClick={() => addHskLevel(level)}
                  disabled={toAdd === 0}
                  className="transition-all duration-150 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                  style={{
                    background: 'var(--card)', border: '1px solid var(--line)',
                    borderBottom: '2px solid var(--accent)', borderRadius: 12,
                    padding: '16px 18px', textAlign: 'left',
                  }}
                >
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 600 }}>HSK {level}</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, letterSpacing: '.04em' }}>
                    {toAdd > 0 ? `+ ${toAdd} new` : 'all added'}
                    <span style={{ color: 'var(--ink-faint)', marginLeft: 6 }}>/ {all} total</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Text paste modes ── */}
      {mode !== 'hsk' && (
        <div>
          {mode === 'list' && (
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 10 }}>
              Paste Chinese words, one per line or comma-separated. Pinyin and meanings are looked up automatically from CC-CEDICT (121k entries).
            </p>
          )}
          {mode === 'quizlet' && (
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 10 }}>
              In Quizlet, open a set → <strong>⋯ More</strong> → <strong>Export</strong>, then paste the text here. Works with Chinese terms or Chinese definitions.
            </p>
          )}
          {mode === 'csv' && (
            <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 10 }}>
              Paste CSV or tab-separated data. Columns: <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--line-soft)', padding: '1px 5px', borderRadius: 4 }}>hanzi, meaning</code> or <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--line-soft)', padding: '1px 5px', borderRadius: 4 }}>hanzi, pinyin, meaning</code>. Compatible with Anki text exports and Pleco exports.
            </p>
          )}

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              mode === 'list'    ? '学习\n工作\n朋友\n...' :
              mode === 'quizlet' ? 'Paste Quizlet export text here…' :
                                   '学习,to study\n工作,gōngzuò,to work\n...'
            }
            style={textarea}
          />

          {/* Preview */}
          {words.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  Preview · {words.length} word{words.length !== 1 ? 's' : ''} parsed
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setWords(prev => prev.map(w => w.status === 'in-deck' ? w : { ...w, selected: true }))}
                    style={{ ...inputStyle, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setWords(prev => prev.map(w => ({ ...w, selected: false })))}
                    style={{ ...inputStyle, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                  >
                    None
                  </button>
                </div>
              </div>

              <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid var(--line)', maxHeight: 320, overflowY: 'auto' }}>
                {words.map((w, i) => (
                  <div
                    key={i}
                    onClick={() => w.status !== 'in-deck' && toggleWord(i)}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                    style={{
                      background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--card)',
                      borderBottom: i < words.length - 1 ? '1px solid var(--line-soft)' : 'none',
                      cursor: w.status === 'in-deck' ? 'default' : 'pointer',
                      opacity: w.status === 'not-found' ? 0.5 : 1,
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `2px solid ${w.selected ? 'var(--accent)' : 'var(--line)'}`,
                      background: w.selected ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {w.selected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                    </div>

                    {/* Hanzi */}
                    <span style={{ fontFamily: 'var(--f-han)', fontSize: 20, minWidth: 56, fontWeight: 'var(--han-weight)' as 'bold' }}>
                      {w.h}
                    </span>

                    {/* Pinyin */}
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', minWidth: 90, letterSpacing: '.03em' }}>
                      {w.status === 'loading' ? '…' : w.p || '—'}
                    </span>

                    {/* Meaning */}
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.status === 'loading' ? 'looking up…' :
                       w.status === 'not-found' ? 'not in dictionary' :
                       w.status === 'in-deck' ? <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontSize: 11 }}>already in deck</span> :
                       w.m || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Import button */}
          {selectedWords.length > 0 && lookupDone && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={handleImport}
                className="cursor-pointer transition-all duration-150"
                style={{
                  fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '11px 22px', boxShadow: '0 2px 0 var(--accent-deep)',
                }}
              >
                Import {selectedWords.length} word{selectedWords.length !== 1 ? 's' : ''}
              </button>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
                {words.filter(w => w.status === 'in-deck').length > 0 &&
                  `${words.filter(w => w.status === 'in-deck').length} already in deck`}
                {words.filter(w => w.status === 'not-found').length > 0 &&
                  ` · ${words.filter(w => w.status === 'not-found').length} not found`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
