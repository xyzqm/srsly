'use client';
import { useState } from 'react';
import type { PassageToken } from '@/lib/types';

interface Props {
  token: PassageToken;
  onOpen: (e: React.MouseEvent, token: PassageToken) => void;
  /** Extra inline styles applied to the ruby/span wrapper */
  style?: React.CSSProperties;
  /** When true, renders green vocab underline + + badge (matches PassageText TokenEl) */
  isVocab?: boolean;
}

/**
 * A single clickable word that opens a definition popup.
 * Tokens without pinyin render as plain spans (punct / plain text).
 */
export default function ClickableWord({ token, onOpen, style, isVocab }: Props) {
  const [hovered, setHovered] = useState(false);

  if (!token.pinyin || token.type === 'punct') return <span style={style}>{token.text}</span>;

  return (
    <>
      <ruby
        onClick={e => onOpen(e, token)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="cursor-pointer"
        style={{
          borderBottom: isVocab
            ? '1.5px solid color-mix(in srgb, var(--jade) 80%, transparent)'
            : '1px dotted color-mix(in srgb, var(--ink-faint) 55%, transparent)',
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
      {/* Badge indicator — same approach as PassageText TokenEl */}
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
          color: isVocab ? 'var(--jade)' : 'transparent',
        }}
      >
        +
      </span>
    </>
  );
}
