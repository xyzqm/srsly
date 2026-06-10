'use client';
import { useState } from 'react';
import type { PassageToken } from '@/lib/types';

interface Props {
  token: PassageToken;
  onOpen: (e: React.MouseEvent, token: PassageToken) => void;
  /** Extra inline styles applied to the ruby/span wrapper */
  style?: React.CSSProperties;
}

/**
 * A single clickable word that opens a definition popup.
 * Tokens without pinyin render as plain spans (punct / plain text).
 */
export default function ClickableWord({ token, onOpen, style }: Props) {
  const [hovered, setHovered] = useState(false);

  if (!token.pinyin || token.type === 'punct') return <span style={style}>{token.text}</span>;

  return (
    <ruby
      onClick={e => onOpen(e, token)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer transition-all duration-150"
      style={{
        borderBottom: '1px dotted color-mix(in srgb, var(--ink-faint) 55%, transparent)',
        background: hovered ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
        borderRadius: 3,
        paddingBottom: 1,
        ...style,
      }}
    >
      {token.text}
    </ruby>
  );
}
