'use client';
import { useState } from 'react';
import type { PassageToken } from '@/lib/types';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';

interface Props {
  token: PassageToken;
  onOpen: (e: React.MouseEvent, token: PassageToken) => void;
  /** Extra inline styles applied to the ruby/span wrapper */
  style?: React.CSSProperties;
  /**
   * True when this is an SRS review word in the deck: dotted accent underline, matching how
   * review words look in the passage body.
   */
  isReviewWord?: boolean;
  /**
   * Whether word-boundary marks are on. The passage body drops its underlines when the
   * learner turns BOUNDARIES off; the title used to keep them, because this component never
   * heard about the toggle — so the same setting produced two different answers on one
   * screen. Defaults to true for the surfaces that have no such toggle (question prompts and
   * multiple-choice options), where the underline is the only cue that a word is tappable.
   */
  showWordBoundaries?: boolean;
}

/**
 * A single clickable word that opens a definition popup.
 * Tokens we know nothing about render as plain spans (punct / plain text).
 */
export default function ClickableWord({ token, onOpen, style, isReviewWord, showWordBoundaries = true }: Props) {
  const [hovered, setHovered] = useState(false);
  const scriptIsUnspaced = getLanguageConfig(useLanguage()).scriptIsUnspaced;

  // "reading OR meaning", not reading alone — Spanish has no reading layer, so a
  // reading-only gate would render every Spanish word as dead text.
  if (token.type === 'punct' || !(token.reading || token.meaning)) return <span style={style}>{token.text}</span>;

  // No "just added" state. A jade underline and a '+' badge used to mark a word claimed this
  // session, which meant the same word was drawn two different ways depending on when you
  // looked at it — and only in the surfaces that happened to pass claimKind. The popup
  // already says whether a word is in the deck, at the moment you ask.
  const borderStyle = !showWordBoundaries
    ? undefined
    : isReviewWord
      ? '1.5px dotted var(--accent)'
      : '1px dotted color-mix(in srgb, var(--ink-faint) 55%, transparent)';

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
        {token.reading && <rt>{token.reading}</rt>}
      </ruby>
      {/* Blank slot after the word, so adjacent tokens read as separate where the script
          has no spaces of its own. It used to carry the '+' badge; with that gone it is
          only a spacer, and a spacer is the last thing Spanish and French need — they are
          already space-delimited, so this was widening every gap in the line for nothing.
          Same rule as TokenEl's `reserveGap`. */}
      {scriptIsUnspaced && (
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
            color: 'transparent',
          }}
        >
          +
        </span>
      )}
    </>
  );
}
