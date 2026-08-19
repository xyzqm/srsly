'use client';
import CharacterBreakdown from './CharacterBreakdown';
import { useState, useEffect, useRef } from 'react';
import type { LanguageCode } from '@/lib/types';

export interface MissedWord { h: string; p: string; m: string; }

/** One practice answer: what was typed (`v`) and whether it has been checked (`s`). */
interface Answer { v: string; s: boolean }
type AnswerMap = Record<string, Answer>;
const EMPTY_ANSWER: Answer = { v: '', s: false };

interface Props {
  words: MissedWord[];
  missedCount?: number;
  cacheKey?: string;
  language: LanguageCode;
  level: number;
}

/**
 * One practice sentence. Deliberately CONTROLLED — the answer and whether it has been
 * checked are owned by MissedWordReview, not by this component.
 *
 * They used to be local `useState`, which meant switching tabs threw them away: the Read tab
 * unmounts when you leave it, so a reader who answered three sentences, glanced at Stats and
 * came back found every input empty again.
 */
function ClozeSentence({
  sentence, targetWord, answer, onChange, onSubmit,
}: {
  sentence: string;
  targetWord: string;
  answer: Answer;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const { v: value, s: submitted } = answer;
  const inputRef = useRef<HTMLInputElement>(null);

  const idx = sentence.indexOf(targetWord);
  const hasCloze = idx >= 0;
  const before = hasCloze ? sentence.slice(0, idx) : sentence;
  const after  = hasCloze ? sentence.slice(idx + targetWord.length) : '';
  const isCorrect = value.trim() === targetWord;

  function submit() {
    if (!value.trim() || submitted) return;
    onSubmit();
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
            onChange={e => { if (!submitted) onChange(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
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

function WordSection({
  word, sentences, answers, setAnswer,
}: {
  word: MissedWord;
  sentences: string[];
  answers: AnswerMap;
  setAnswer: (key: string, next: Answer) => void;
}) {
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
          {sentences.map((s, i) => {
            const key = `${word.h}|${i}`;
            const answer = answers[key] ?? EMPTY_ANSWER;
            return (
              <ClozeSentence
                key={i}
                sentence={s}
                targetWord={word.h}
                answer={answer}
                onChange={v => setAnswer(key, { v, s: false })}
                onSubmit={() => setAnswer(key, { v: answer.v, s: true })}
              />
            );
          })}
        </div>
      )}
      {/* The breakdown sits BELOW the practice, not between the header and it.
          You have just failed to recall this word, so the answer is already on screen and a
          mnemonic costs nothing — but a collapsed toggle wedged under the header split the
          word from the sentences it belongs to and read as an interruption. As a footer it
          is where you reach for it: after the attempt. */}
      <div className="mt-2">
        <CharacterBreakdown word={word.h} gloss={word.m} />
      </div>
    </div>
  );
}

export default function MissedWordReview({ words, missedCount = 0, cacheKey, language, level }: Props) {
  const [open, setOpen] = useState(false);
  const [sentences, setSentences] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [answers, setAnswers] = useState<AnswerMap>({});

  /**
   * Everything here is derived from `cacheKey`, which already identifies the passage —
   * `srsly-missed-sentences|{contentKey}|{passageIdx}`. Keeping the suffixes under that same
   * prefix is what lets the day-rollover sweep in lib/storage/local.ts drop them with the
   * sentences they belong to, instead of leaving orphaned answers behind forever.
   */
  const openKey    = cacheKey ? `${cacheKey}|open` : '';
  const answersKey = cacheKey ? `${cacheKey}|answers` : '';

  // Restore cached sentences, whether the section was open, and any answers already typed.
  // All three are lost on unmount — the Read tab is torn down when you switch tabs — so
  // without this, coming back closed the review and blanked every input.
  useEffect(() => {
    if (!cacheKey) return;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        setSentences(JSON.parse(raw));
        setFetched(true);
        // Only meaningful once the sentences exist: reopening with nothing to show would
        // fire a fresh generation on mount, which is not what the reader asked for.
        setOpen(localStorage.getItem(openKey) === '1');
      }
      const savedAnswers = localStorage.getItem(answersKey);
      if (savedAnswers) setAnswers(JSON.parse(savedAnswers));
    } catch { /* ignore */ }
  }, [cacheKey, openKey, answersKey]);

  function setAnswer(key: string, next: Answer) {
    setAnswers(prev => {
      const merged = { ...prev, [key]: next };
      if (answersKey) {
        try { localStorage.setItem(answersKey, JSON.stringify(merged)); } catch { /* ignore */ }
      }
      return merged;
    });
  }

  function setOpenPersisted(next: boolean) {
    setOpen(next);
    if (openKey) {
      try { localStorage.setItem(openKey, next ? '1' : '0'); } catch { /* ignore */ }
    }
  }

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
        const s = data.sentences ?? {};
        setSentences(s);
        setFetched(true);
        if (cacheKey) {
          try { localStorage.setItem(cacheKey, JSON.stringify(s)); } catch { /* ignore */ }
        }
      } catch { /* show empty state */ }
      setLoading(false);
    }
    setOpenPersisted(!open);
  }

  return (
    <div className="mt-8 pt-8 animate-rise" style={{ borderTop: '2px solid var(--line)' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginBottom: 4 }}>
            {(() => {
              const newCount = words.length - missedCount;
              if (missedCount > 0 && newCount > 0) return `${missedCount} missed · ${newCount} new`;
              if (missedCount > 0) return `Missed ${missedCount} word${missedCount !== 1 ? 's' : ''}`;
              return `${newCount} new word${newCount !== 1 ? 's' : ''} added`;
            })()}
          </h3>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.55 }}>
            Practice typing {words.length === 1 ? 'it' : 'them'} in context — no effect on review timing.
          </p>
        </div>
        <button
          onClick={fetchAndOpen}
          disabled={loading}
          className="cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-default"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500,
            background: open ? 'var(--accent)' : 'none',
            color: open ? '#fff' : loading ? 'var(--ink-faint)' : 'var(--ink)',
            border: '1px solid',
            borderColor: open ? 'var(--accent)' : 'var(--line)',
            borderRadius: 8, padding: '10px 18px',
            whiteSpace: 'nowrap',
            transition: 'all .15s',
          }}
          onMouseEnter={e => { if (!open && !loading) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; } }}
          onMouseLeave={e => { if (!open && !loading) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'; } }}
        >
          {loading ? 'Generating…' : open ? 'Hide review' : 'Review new/missed words'}
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
              <WordSection key={w.h} word={w} sentences={sentences[w.h] ?? []} answers={answers} setAnswer={setAnswer} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
