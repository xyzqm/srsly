'use client';
import { useState } from 'react';
import type { PassageToken } from '@/lib/types';

interface Props {
  token: PassageToken;
  onOpen: (e: React.MouseEvent, token: PassageToken) => void;
  /** Extra inline styles applied to the ruby/span wrapper */
  style?: React.CSSProperties;
  /**
   * Visual claim state for this word:
   *  'vocab'    — added this session: solid jade underline + '+' badge
   *  'tomorrow' — queued for tomorrow: solid gold underline + '▸' badge
   *  null/undefined — unknown word: dotted faint underline, no badge
   */
  claimKind?: 'vocab' | 'tomorrow' | null;
  /**
   * True when this is an SRS review word in the deck (and not freshly claimed): dotted
   * accent underline, matching how review words look in the passage body. Ignored when
   * claimKind is set.
   */
  isReviewWord?: boolean;
}

/**
 * A single clickable word that opens a definition popup.
 * Tokens without pinyin render as plain spans (punct / plain text).
 */
export default function ClickableWord({ token, onOpen, style, claimKind, isReviewWord }: Props) {
  const [hovered, setHovered] = useState(false);

  if (!token.pinyin || token.type === 'punct') return <span style={style}>{token.text}</span>;

  const borderStyle = claimKind === 'vocab'
    ? '1.5px solid var(--jade)'
    : claimKind === 'tomorrow'
      ? '1.5px solid var(--gold)'
      : isReviewWord
        ? '1.5px dotted var(--accent)'
        : '1px dotted color-mix(in srgb, var(--ink-faint) 55%, transparent)';

  const badgeChar = claimKind === 'tomorrow' ? '▸' : '+';
  const badgeColor = claimKind === 'vocab'
    ? 'var(--jade)'
    : claimKind === 'tomorrow'
      ? 'var(--gold)'
      : 'transparent';

  return (
    <>
      <ruby
        onClick={e => onOpen(e, token)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="cursor-pointer"
        style={{
          borderBottom: borderStyle,
          background: hovered ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
          borderRadius: 3,
          paddingBottom: 1,
          transition: 'background .12s',
          ...style,
        }}
      >
        {token.text}
        <rt>{token.pinyin}</rt>
      </ruby>
      {/* Badge indicator */}
      <span
        aria-hidden="true"
        style={{
          display: 'inline',
          fontSize: '0.45em',
          verticalAlign: 'super',
          lineHeight: 0,
          fontFamily: 'var(--f-ui)',
          fontWeight: 700,
          pointerEvents: 'none',
          userSelect: 'none',
          color: badgeColor,
        }}
      >
        {badgeChar}
      </span>
    </>
  );
}
