'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import type { DeckWord } from '@/lib/types';
import { deckNames, isDueToday, todayStr, inSelectedDecks } from '@/lib/deck';

interface Props {
  deck: DeckWord[];
  /** Explicitly-created deck names (so empty decks still appear). */
  customDecks: string[];
  /**
   * Current selection ('' = default/untagged deck):
   *   null → all decks (default)   ·   [] → no decks   ·   [...] → only those decks
   */
  selected: string[] | null;
  onChange: (next: string[] | null) => void;
}

/**
 * Multi-select deck picker for the learning modes. "All decks" studies every deck;
 * unchecking it deselects everything; otherwise only the checked decks are studied.
 * Shows each deck's due count as a hint (e.g. "Deck B has 15 waiting" while studying
 * only Deck A). Choosing decks never changes any card's due date — it only filters
 * this session.
 */
export default function DeckSelector({ deck, customDecks, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const today = todayStr();
  const named = useMemo(
    () => [...new Set([...customDecks, ...deckNames(deck)])].sort((a, b) => a.localeCompare(b)),
    [customDecks, deck],
  );
  const hasDefault = useMemo(() => deck.some(w => !w.decks?.length), [deck]);
  const options = useMemo(() => (hasDefault ? ['', ...named] : named), [hasDefault, named]);

  // A word counts toward deck `key` if it's tagged `key` (or untagged, for the '' default).
  const dueCount = (key: string) => deck.filter(w => inSelectedDecks(w, [key]) && isDueToday(w, today)).length;
  const totalDue = deck.filter(w => isDueToday(w, today)).length;

  const isAll = selected == null;
  const arr = selected ?? [];            // [] for both "all" and "none"; isAll distinguishes
  const isNone = !isAll && arr.length === 0;
  const label = isAll ? 'All decks'
    : isNone ? 'No decks'
    : arr.length === 1 ? (arr[0] || 'Default')
    : `${arr.length} decks`;

  // Hide only when there are no real decks at all (nothing to filter by). With ≥1 named
  // deck we always show, so deleting a deck can never trap you without a way back to "All".
  if (named.length === 0) return null;

  const toggle = (key: string) => {
    // Behave like a real checkbox. "All decks" means every box is checked, so start from
    // the full list and flip the clicked one (clicking a checked box unchecks ONLY it).
    const base = isAll ? options : arr;
    const set = new Set(base);
    if (set.has(key)) set.delete(key); else set.add(key);
    const next = [...set];
    // Checking every deck → "all" (null); any partial set (incl. empty = none) stays as-is.
    onChange(next.length === options.length ? null : next);
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
    borderRadius: 7, padding: '7px 9px', fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink)',
  };

  const Row = ({ checked, name, count, onClick, bold }: { checked: boolean; name: string; count: number; onClick: () => void; bold?: boolean }) => (
    <button
      onClick={onClick}
      style={{ ...rowStyle, fontWeight: bold ? 600 : 400 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 15, height: 15, borderRadius: 4, flexShrink: 0,
          border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
          background: checked ? 'var(--accent)' : 'transparent',
          color: '#fff', fontSize: 11, lineHeight: '13px', textAlign: 'center',
        }}>{checked ? '✓' : ''}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </span>
      {count > 0 && <span style={{ color: 'var(--accent)', fontSize: 11, flexShrink: 0 }}>{count} due</span>}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer transition-all duration-150"
        style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.04em',
          background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--line)',
          borderRadius: 7, padding: '6px 11px', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
        title="Choose which decks to study"
      >
        <span style={{ color: 'var(--ink-faint)' }}>decks:</span> {label}
        {totalDue > 0 && isAll && <span style={{ color: 'var(--accent)' }}>· {totalDue} due</span>}
        <span style={{ color: 'var(--ink-faint)', fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', zIndex: 50, marginTop: 6, minWidth: 210, maxHeight: 320, overflowY: 'auto',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,.16)', padding: 6,
          }}
        >
          {/* "All decks": checked → click clears to none ([]); unchecked → click selects all (null). */}
          <Row checked={isAll} name="All decks" count={totalDue} onClick={() => onChange(isAll ? [] : null)} bold />
          <div style={{ height: 1, background: 'var(--line-soft)', margin: '4px 2px' }} />
          {options.map(key => (
            <Row key={key || '(default)'} checked={isAll || arr.includes(key)} name={key || 'Default'} count={dueCount(key)} onClick={() => toggle(key)} />
          ))}
        </div>
      )}
    </div>
  );
}
