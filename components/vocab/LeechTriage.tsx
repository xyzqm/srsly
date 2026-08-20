'use client';
import { useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { LEECH_THRESHOLD } from '@/lib/fsrs';

/**
 * What to do about a card you keep forgetting.
 *
 * A leech is auto-flagged at {LEECH_THRESHOLD} lapses and auto-paused, and until now that was
 * the end of it: the card sat in the Stuck filter forever, out of circulation and unchanged.
 * Pausing stops it eating review time, which is the immediate problem, but it does not fix
 * anything — and an unpaused leech just becomes a leech again.
 *
 * THE PREMISE. A card failed eight times is rarely failing for want of a ninth review.
 * Something about the card is wrong: the gloss is a five-sense dictionary dump nobody can
 * hold, or the word has no hook. So the three actions here all CHANGE THE CARD, and the
 * fourth admits defeat honestly. None of them is "review it again".
 *
 * One card at a time, deliberately. A list of thirty leeches is the thing the learner has
 * already been ignoring; a queue of one asks a question small enough to answer.
 */

interface Props {
  words: DeckWord[];
  onSave: (id: string, patch: Partial<DeckWord>) => void;
  onUnstick: (id: string) => void;
  onRemove: (word: DeckWord) => void;
}

const mono = { fontFamily: 'var(--f-mono)' as const };

export default function LeechTriage({ words, onSave, onUnstick, onRemove }: Props) {
  // EVERY hook before any early return — `words` can be empty, and bailing out above a
  // useState changes the hook order between renders.
  const [idx, setIdx] = useState(0);
  const [meaning, setMeaning] = useState('');
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [seededFor, setSeededFor] = useState<string | undefined>(undefined);

  const word = words.length ? words[Math.min(idx, words.length - 1)] : undefined;

  // Re-seed the drafts when the card changes. Done during render rather than in an effect so
  // the fields are right on the FIRST render of each card, with no flash of the previous one.
  if (word && seededFor !== word.id) {
    setSeededFor(word.id);
    setMeaning(word.m);
    setNote(word.note ?? '');
    setDirty(false);
  }

  if (!word) return null;

  const next = () => setIdx(i => Math.min(i + 1, words.length - 1));

  const field = (
    label: string, value: string, onChange: (v: string) => void, placeholder: string, rows: number,
  ) => (
    <label className="block">
      <span style={{ ...mono, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        {label}
      </span>
      <textarea
        value={value}
        rows={rows}
        onChange={e => { onChange(e.target.value); setDirty(true); }}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 mt-1.5"
        style={{
          fontSize: 13.5, lineHeight: 1.5, resize: 'vertical',
          background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink)', outline: 'none',
        }}
      />
    </label>
  );

  const btn = (label: string, onClick: () => void, tone: 'primary' | 'normal' | 'danger' = 'normal') => (
    <button
      onClick={onClick}
      className="cursor-pointer transition-all duration-150 whitespace-nowrap rounded-lg"
      style={{
        ...mono, fontSize: 10.5, letterSpacing: '.06em', padding: '7px 12px',
        background: tone === 'primary' ? 'var(--accent)' : 'none',
        color: tone === 'primary' ? '#fff' : tone === 'danger' ? 'var(--accent)' : 'var(--ink-soft)',
        border: `1px solid ${tone === 'primary' ? 'var(--accent)' : tone === 'danger' ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--line)'}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl px-4 py-4 mb-3" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <span style={{ ...mono, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Fix a stuck word
        </span>
        <span style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)' }}>
          {Math.min(idx + 1, words.length)} of {words.length}
        </span>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, maxWidth: '54ch', marginBottom: 12 }}>
        Forgotten {word.lapses ?? LEECH_THRESHOLD} times, so it&rsquo;s paused. Another review is
        unlikely to be what fixes it — change the card instead.
      </p>

      <div className="flex items-baseline gap-3 mb-3">
        <span style={{ fontFamily: 'var(--f-han)', fontSize: 24, fontWeight: 'var(--han-weight)' as 'bold' }}>{word.h}</span>
        {word.p && <span style={{ ...mono, fontSize: 12.5, color: 'var(--accent)' }}>{word.p}</span>}
      </div>

      <div className="flex flex-col gap-3">
        {field('Meaning', meaning, setMeaning,
          'Cut it down to the one sense you actually need', 2)}
        {field('Mnemonic', note, setNote,
          'A hook — what it sounds like, where you last saw it, anything that sticks', 2)}
      </div>

      <div className="flex flex-wrap gap-2 items-center mt-3.5">
        {btn(dirty ? 'Save & unstick' : 'Unstick', () => {
          if (dirty) onSave(word.id!, { m: meaning.trim() || word.m, note: note.trim() || undefined });
          onUnstick(word.id!);
          next();
        }, 'primary')}
        {btn('Skip', next)}
        {btn('Remove from deck', () => { onRemove(word); next(); }, 'danger')}
      </div>

      <p style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)', marginTop: 9, lineHeight: 1.5 }}>
        Unsticking clears its history and its stuck flag, so it starts over as a new card.
      </p>
    </div>
  );
}
