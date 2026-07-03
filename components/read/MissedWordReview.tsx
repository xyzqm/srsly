'use client';
import { useState, useRef } from 'react';
import type { LanguageCode } from '@/lib/types';

export interface MissedWord { h: string; p: string; m: string; }

interface Props {
  words: MissedWord[];
  language: LanguageCode;
  level: number;
}

function ClozeSentence({ sentence, targetWord }: { sentence: string; targetWord: string }) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const idx = sentence.indexOf(targetWord);
  const hasCloze = idx >= 0;
  const before = hasCloze ? sentence.slice(0, idx) : sentence;
  const after  = hasCloze ? sentence.slice(idx + targetWord.length) : '';
  const isCorrect = value.trim() === targetWord;

  function submit() {
    if (!value.trim() || submitted) return;
    setSubmitted(true);
  }

  const inputWidth = `${Math.max(targetWord.length * 1.4, 3)}em`;

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', fontFamily: 'var(--f-han)', fontSize: 18, lineHeight: 1.9 }}
    >
      {before}
      {hasCloze && (
        <span className="inline-flex items-baseline gap-1.5">
          <input
            ref={inputRef}
            value={value}
            onChange={e => { if (!submitted) setValue(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="　"
            style={{
              width: inputWidth,
              fontFamily: 'var(--f-han)',
              fontSize: 17,
              background: submitted
                ? isCorrect
                  ? 'color-mix(in srgb, var(--jade) 15%, transparent)'
                  : 'color-mix(in srgb, var(--accent) 12%, transparent)'
                : 'var(--paper)',
              border: '1px solid',
              borderColor: submitted
                ? isCorrect ? 'var(--jade)' : 'var(--accent)'
                : 'var(--line)',
              borderRadius: 6,
              padding: '1px 5px',
              color: 'var(--ink)',
              outline: 'none',
              textAlign: 'center',
              transition: 'border-color .15s, background .15s',
            }}
          />
          {submitted && !isCorrect && (
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--jade)', whiteSpace: 'nowrap' }}>
              → {targetWord}
            </span>
          )}
        </span>
      )}
      {after}
      {hasCloze && !submitted && (
        <button
          onClick={submit}
          className="ml-3 cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase',
            background: 'none', border: '1px solid var(--line)', borderRadius: 5,
            color: 'var(--ink-faint)', padding: '2px 8px', verticalAlign: 'middle',
          }}
        >
          Check
        </button>
      )}
      {submitted && (
        <span style={{ marginLeft: 8, fontSize: 14, color: isCorrect ? 'var(--jade)' : 'var(--accent)', verticalAlign: 'middle' }}>
          {isCorrect ? '✓' : '✗'}
        </span>
      )}
    </div>
  );
}

function WordSection({ word, sentences }: { word: MissedWord; sentences: string[] }) {
  return (
    <div className="mt-6">
      {/* Word header */}
      <div className="flex items-baseline gap-3 mb-3">
        <span style={{ fontFamily: 'var(--f-han)', fontSize: 26, fontWeight: 'var(--han-weight)' as 'bold' }}>{word.h}</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--accent)' }}>{word.p}</span>
        <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{word.m}</span>
      </div>
      {/* Sentences */}
      {sentences.length === 0 ? (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)', fontStyle: 'italic' }}>
          No sentences generated.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sentences.map((s, i) => (
            <ClozeSentence key={i} sentence={s} targetWord={word.h} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MissedWordReview({ words, language, level }: Props) {
  const [open, setOpen] = useState(false);
  const [sentences, setSentences] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  if (words.length === 0) return null;

  async function fetchAndOpen() {
    if (!open && !fetched) {
      setLoading(true);
      try {
        const res = await fetch('/api/missed-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ words, language, level }),
        });
        const data = await res.json();
        setSentences(data.sentences ?? {});
        setFetched(true);
      } catch { /* show empty state */ }
      setLoading(false);
    }
    setOpen(v => !v);
  }

  return (
    <div className="mt-8 pt-8 animate-rise" style={{ borderTop: '2px solid var(--line)' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginBottom: 4 }}>
            Missed {words.length} word{words.length !== 1 ? 's' : ''}
          </h3>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.55 }}>
            Practice typing {words.length === 1 ? 'it' : 'them'} in context — no effect on review timing.
          </p>
        </div>
        <button
          onClick={fetchAndOpen}
          className="cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500,
            background: open ? 'var(--accent)' : 'none',
            color: open ? '#fff' : 'var(--ink)',
            border: '1px solid',
            borderColor: open ? 'var(--accent)' : 'var(--line)',
            borderRadius: 8, padding: '10px 18px',
            whiteSpace: 'nowrap',
            transition: 'all .15s',
          }}
          onMouseEnter={e => { if (!open) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; } }}
          onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'; } }}
        >
          {open ? 'Hide review' : 'Review missed words'}
        </button>
      </div>

      {open && (
        loading ? (
          <div
            className="mt-6 py-10 rounded-xl text-center"
            style={{ border: '1px dashed var(--line)', fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.06em', color: 'var(--ink-faint)' }}
          >
            Generating sentences…
          </div>
        ) : (
          <div>
            {words.map(w => (
              <WordSection key={w.h} word={w} sentences={sentences[w.h] ?? []} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
