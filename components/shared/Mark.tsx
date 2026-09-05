/**
 * The small marks that label a control — a page, a book, a key, a spark.
 *
 * GEOMETRY, NOT EMOJI, for the reason `BadgeSeal` already gives about milestone marks: an
 * emoji is somebody else's artwork. 📖 is a different drawing on macOS, Windows, Android and
 * every Android skin, it arrives in full colour into a palette built from six themes' worth
 * of CSS variables, and it cannot be made to sit on the mono baseline the rest of this UI is
 * set on. These are four paths on `currentColor`, so they inherit the theme like text.
 *
 * Deliberately NOT a general icon set. There are four here because four things need marking;
 * a fifth belongs here when a fifth control needs one, not before.
 */
export type MarkName = 'page' | 'book' | 'key' | 'spark';

interface Props {
  name: MarkName;
  /** Pixel size of the square. Card marks are ~20; inline badge marks ~12. */
  size?: number;
  /** Nudges the mark onto a text baseline when it sits inline in a sentence. */
  inline?: boolean;
}

/**
 * A stroke that stays visually even as the mark shrinks.
 *
 * A flat 1.5 reads as a hairline at 12px and as a slab at 20px, because the stroke does not
 * scale with the box — the viewBox does. Tying it to the size keeps the two marks in the
 * empty-state cards and the two in the inline badges looking like one family.
 */
function strokeFor(size: number): number {
  return size >= 18 ? 1.5 : 1.75;
}

export default function Mark({ name, size = 16, inline = false }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: strokeFor(size),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    style: inline
      ? { verticalAlign: '-0.15em', flexShrink: 0 }
      : { display: 'block', flexShrink: 0 },
  };

  if (name === 'page') {
    // A sheet with two rules on it. The corner is cut rather than square, which is what says
    // "page" at 12px — a plain rectangle at this size reads as a button.
    return (
      <svg {...common}>
        <path d="M4 2.5h7l5 5v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
        <path d="M11 2.5v5h5" />
        <path d="M6.5 11.5h7M6.5 14.5h4.5" />
      </svg>
    );
  }

  if (name === 'book') {
    // A block with a spine down the left. Two rules, not the open-book V: at this size the V
    // collapses into a chevron and stops reading as a book at all.
    return (
      <svg {...common}>
        <path d="M4 2.5h11a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
        <path d="M7 2.5v15" />
        <path d="M10 6.5h3.5M10 9.5h3.5" />
      </svg>
    );
  }

  if (name === 'key') {
    // Ring, shaft, one tooth. The second tooth every key drawing wants is what turns this
    // into a smudge below ~14px, so there is one.
    return (
      <svg {...common}>
        <circle cx="6.75" cy="10" r="3.75" />
        <path d="M10.5 10H17" />
        <path d="M14.5 10v3" />
      </svg>
    );
  }

  // spark — a four-pointed star with concave sides, the shape ✦ already implies, drawn so it
  // sits on the same optical weight as the other three instead of whatever the font ships.
  return (
    <svg {...common} fill="currentColor" stroke="none">
      <path d="M10 1.5c.35 3.9 1.35 5.95 3.1 7.05 1 .63 2.3 1.03 3.9 1.2v.5c-1.6.17-2.9.57-3.9 1.2-1.75 1.1-2.75 3.15-3.1 7.05h-.5c-.35-3.9-1.35-5.95-3.1-7.05-1-.63-2.3-1.03-3.9-1.2v-.5c1.6-.17 2.9-.57 3.9-1.2C8.15 7.45 9.15 5.4 9.5 1.5Z" />
    </svg>
  );
}
