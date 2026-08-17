'use client';
import { useCallback, useMemo, useState } from 'react';
import type { DailyPassage, DeckWord, LanguageCode } from '@/lib/types';
import { getLanguageConfig, RECOMMENDED_BLANK_DENSITY } from '@/lib/languageConfig';
import { buildPastedPassage, type RawTok } from '@/hooks/useDailyContent';
import { selectClozeTargets, type ClozeTargetResult } from '@/lib/clozeTargets';
import { analyzeCoverage, verdictFor, type TextCoverage } from '@/lib/coverage';
import { getSrsSettings } from '@/lib/fsrs';
import { getTodayCounts } from '@/lib/reviewCounts';
import { MAX_PASTE_CHARS } from '@/lib/server/sentenceSplit';

interface Props {
  language: LanguageCode;
  deck: DeckWord[];
  /** Words ready for review right now — the blank candidates, keyed as tokens resolve. */
  dueWords: Set<string>;
  blankDensity?: number;
  onCommit: (passage: DailyPassage) => void;
}

interface Analysis {
  passage: DailyPassage;
  coverage: TextCoverage;
  targets: ClozeTargetResult;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;
const label: React.CSSProperties = {
  ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)',
};

/** The first line, when it reads like a headline: short, and not a sentence. */
function guessTitle(text: string): string {
  const first = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).find(Boolean) ?? '';
  if (!first || first.length > 60) return '';
  return /[.!?。！？…]$/.test(first) ? '' : first;
}

export default function PasteTextPanel({ language, deck, dueWords, blankDensity, onCommit }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const cfg = getLanguageConfig(language);
  const tooLong = text.length > MAX_PASTE_CHARS;

  // Any edit invalidates a readout that was computed from the previous text. Showing a
  // coverage figure for text that is no longer in the box is the one failure mode this
  // panel must not have — the whole point of it is to be trusted before you commit.
  const edit = useCallback(<T,>(set: (v: T) => void) => (v: T) => { set(v); setAnalysis(null); setError(''); }, []);

  const analyze = useCallback(async () => {
    if (!text.trim() || tooLong) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/segment-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          title: title.trim() || guessTitle(text),
          language,
          words: deck.map(w => ({ h: w.h, p: w.p, m: w.m })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      const raw = await res.json() as { title: RawTok[]; sentences: RawTok[][] };
      const built = buildPastedPassage(raw, deck, language, []);
      // Chosen here, once, against the ledger as it stands right now — and then RECORDED on
      // the passage. The readout below and the blanks you will see are therefore the same
      // computation, not two that are supposed to agree.
      const targets = selectClozeTargets(
        built.sentences, deck, dueWords, blankDensity,
        getSrsSettings().newPerDay - getTodayCounts().newCount,
      );
      setAnalysis({
        passage: { ...built, vocabWords: [...targets.words] },
        coverage: analyzeCoverage(built.sentences, new Set(deck.map(d => d.h)), dueWords),
        targets,
      });
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }, [text, title, tooLong, language, deck, dueWords, blankDensity]);

  const commit = useCallback(() => {
    if (!analysis) return;
    onCommit(analysis.passage);
    setText('');
    setTitle('');
    setAnalysis(null);
    setOpen(false);
  }, [analysis, onCommit]);

  const density = blankDensity ?? RECOMMENDED_BLANK_DENSITY;

  const btn = (primary: boolean): React.CSSProperties => ({
    ...mono, fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500,
    background: primary ? 'var(--accent)' : 'none',
    color: primary ? '#fff' : 'var(--ink-soft)',
    border: primary ? 'none' : '1px solid var(--line)',
    borderRadius: 8, padding: '10px 18px',
    boxShadow: primary ? '0 2px 0 var(--accent-deep)' : undefined,
    cursor: 'pointer',
  });

  if (!open) {
    return (
      <div className="mb-4">
        <button
          onClick={() => setOpen(true)}
          className="cursor-pointer transition-all duration-150"
          style={{ ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', background: 'none', border: '1px dashed var(--line)', borderRadius: 8, padding: '9px 15px', color: 'var(--ink-soft)' }}
        >
          + Read your own text
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[11px] px-5 py-4 mb-4" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span style={label}>Read your own text</span>
        <button
          onClick={() => { setOpen(false); setAnalysis(null); setError(''); }}
          className="cursor-pointer"
          style={{ ...mono, fontSize: 11, background: 'none', border: 'none', color: 'var(--ink-faint)' }}
        >
          close
        </button>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.55, margin: '0 0 12px', maxWidth: '60ch' }}>
        Paste an article in {cfg.name}. It is segmented against {cfg.dictName}, cross-referenced
        with your deck, and your due words become blanks — at the same {density}% density and
        under the same daily new-card limit as a generated passage. No AI generation is spent.
      </p>

      <input
        type="text"
        value={title}
        onChange={e => edit(setTitle)(e.target.value)}
        placeholder="Title (optional — the first line is used if you leave this blank)"
        style={{
          width: '100%', fontSize: 13.5, color: 'var(--ink)', background: 'var(--card)',
          border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', outline: 'none',
          marginBottom: 8,
        }}
      />

      <textarea
        value={text}
        onChange={e => edit(setText)(e.target.value)}
        rows={7}
        placeholder={`${cfg.sampleWords.join('… ')}…`}
        style={{
          width: '100%', fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', background: 'var(--card)',
          border: `1px solid ${tooLong ? 'var(--wrong)' : 'var(--line)'}`, borderRadius: 7,
          padding: '10px 12px', outline: 'none', resize: 'vertical',
          fontFamily: cfg.scriptIsUnspaced ? 'var(--f-han)' : 'inherit',
        }}
      />

      <div className="flex items-center gap-3 flex-wrap mt-2.5">
        <button
          onClick={analyze}
          disabled={busy || !text.trim() || tooLong}
          className="transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          style={btn(!analysis)}
        >
          {busy ? 'Reading…' : analysis ? 'Re-check' : 'Check coverage'}
        </button>
        {analysis && (
          <button onClick={commit} className="transition-all duration-150" style={btn(true)}>
            Read this
          </button>
        )}
        <span style={{ ...mono, fontSize: 11, color: tooLong ? 'var(--wrong)' : 'var(--ink-faint)', marginLeft: 'auto' }}>
          {text.length.toLocaleString()} / {MAX_PASTE_CHARS.toLocaleString()} characters
        </span>
      </div>

      {error && (
        <p style={{ ...mono, fontSize: 11.5, color: 'var(--wrong)', marginTop: 10 }}>{error}</p>
      )}

      {analysis && <CoverageReadout {...analysis} language={language} density={density} />}
    </div>
  );
}

/**
 * The readout. Its job is to be believed, so it reports what it can actually see — how much
 * of the text your DECK covers — and never dresses that up as what you know.
 */
function CoverageReadout({ coverage, targets, language, density }: Analysis & { language: LanguageCode; density: number }) {
  const cfg = getLanguageConfig(language);
  const verdict = verdictFor(coverage);
  const pct = (n: number) => coverage.tokens ? Math.round((n / coverage.tokens) * 100) : 0;

  const bars = useMemo(() => ([
    { key: 'due',   n: coverage.dueTokens,                             color: 'var(--accent)' },
    { key: 'deck',  n: coverage.inDeckTokens - coverage.dueTokens,     color: 'var(--jade)' },
    { key: 'out',   n: coverage.notInDeckTokens,                       color: 'var(--line)' },
  ]), [coverage]);

  // The headline. Named for the two facts that are actually in tension: the blanks are
  // right, and the prose around them may be unreadable.
  const headline =
    targets.words.size === 0
      ? coverage.dueTypes === 0
        ? 'Nothing in this text is due for review, so it will have no blanks. It is still worth reading — every word stays clickable — but it will not move your schedule.'
        : `${coverage.dueTypes} due word${coverage.dueTypes === 1 ? '' : 's'} appear${coverage.dueTypes === 1 ? 's' : ''} here, but none fit: ${targets.heldBackByBudget > 0 ? "today's new-card limit is spent" : `the ${density}% density leaves room for ${targets.budget} blank${targets.budget === 1 ? '' : 's'}`}.`
      : verdict === 'beyond'
        ? `${targets.blanks} blank${targets.blanks === 1 ? '' : 's'} will be right — and ${pct(coverage.notInDeckTokens)}% of the running words here are not in your deck. Expect the blanks to work and the reading not to.`
        : verdict === 'heavy'
          ? `${targets.blanks} blank${targets.blanks === 1 ? '' : 's'}, with ${pct(coverage.notInDeckTokens)}% of the running words outside your deck — heavy going between them.`
          : verdict === 'workable'
            ? `${targets.blanks} blank${targets.blanks === 1 ? '' : 's'}, with ${pct(coverage.notInDeckTokens)}% of the running words outside your deck — readable with lookups.`
            : `${targets.blanks} blank${targets.blanks === 1 ? '' : 's'}, and ${pct(coverage.inDeckTokens)}% of the running words are already in your deck.`;

  const row = (n: number, color: string, text: string) => (
    <div className="flex items-baseline gap-2.5" style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, transform: 'translateY(-1px)' }} />
      <span style={{ ...mono, fontSize: 12, color: 'var(--ink)', minWidth: 40 }}>{n.toLocaleString()}</span>
      <span>{text}</span>
    </div>
  );

  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
      <div style={{ ...label, marginBottom: 8 }}>
        {coverage.tokens.toLocaleString()} {cfg.countUnit} · {coverage.types.toLocaleString()} distinct
      </div>

      <div className="flex rounded-[3px] overflow-hidden mb-3" style={{ height: 8, background: 'var(--line)' }}>
        {bars.map(b => b.n > 0 && (
          <span key={b.key} style={{ width: `${(b.n / Math.max(1, coverage.tokens)) * 100}%`, background: b.color }} />
        ))}
      </div>

      <div className="flex flex-col gap-1.5 mb-3">
        {row(targets.blanks, 'var(--accent)', `blank${targets.blanks === 1 ? '' : 's'} from ${targets.words.size} due word${targets.words.size === 1 ? '' : 's'}`)}
        {row(coverage.inDeckTokens - coverage.dueTokens, 'var(--jade)', 'in your deck, not due today')}
        {row(coverage.notInDeckTypes, 'var(--line)', `distinct word${coverage.notInDeckTypes === 1 ? '' : 's'} not in your deck (${pct(coverage.notInDeckTokens)}% of the running text)`)}
      </div>

      <p style={{
        fontSize: 13, lineHeight: 1.55, maxWidth: '62ch', margin: 0,
        color: verdict === 'beyond' ? 'var(--accent-deep)' : 'var(--ink-soft)',
      }}>
        {headline}
      </p>

      {/* Said once, plainly. "Not in your deck" is the only thing the app can measure; it is
          not the same as "you don't know it", and the numbers above must not imply it is. */}
      <p style={{ ...mono, fontSize: 10.5, lineHeight: 1.5, color: 'var(--ink-faint)', maxWidth: '62ch', margin: '8px 0 0' }}>
        Deck coverage only — plenty of words you know have never been made into cards.
      </p>

      {coverage.notInDeckSample.length > 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.6, margin: '8px 0 0' }}>
          <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase' }}>e.g. </span>
          <span style={{ fontFamily: cfg.scriptIsUnspaced ? 'var(--f-han)' : 'inherit' }}>
            {coverage.notInDeckSample.join(cfg.scriptIsUnspaced ? '、' : ', ')}
          </span>
        </p>
      )}

      {targets.heldBackByBudget > 0 && (
        <p style={{ ...mono, fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '8px 0 0' }}>
          {targets.heldBackByBudget} due word{targets.heldBackByBudget === 1 ? '' : 's'} held back by your{' '}
          {getSrsSettings().newPerDay}/day new-card limit — the same budget Practice spends from.
        </p>
      )}
      {targets.heldBackByDensity > 0 && (
        <p style={{ ...mono, fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.5, margin: '4px 0 0' }}>
          {targets.heldBackByDensity} more would not fit at {density}% density ({targets.budget} blanks for this length).
        </p>
      )}
    </div>
  );
}
