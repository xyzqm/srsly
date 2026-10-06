/**
 * The header's state mark — drawn, not typed.
 *
 * ⚠ THIS WAS AN EMOJI, AND `Mark.tsx` ALREADY FORBADE IT IN AS MANY WORDS. That file's own
 * docstring says an emoji is "somebody else's artwork": 🤔 is a different drawing on macOS,
 * Windows, Android and every Android skin, it arrives in full colour into a palette assembled
 * from ten themes' worth of CSS variables, and it cannot be made to sit on the baseline the
 * rest of this UI is set on. `BadgeSeal` says the same thing about milestones and draws
 * geometry instead. The header was the one surface still breaking the rule, at 28px, in the
 * top-left corner — the first mark anybody meets — and it read as a placeholder because that
 * is exactly what a system emoji standing in for a logo is.
 *
 * THE TABLE IS IN `lib/stateFace.ts`, NOT HERE, and that split is the point. All twelve states
 * are COMBINATIONS of a small vocabulary — six eye shapes, six mouths, eight badges — rather
 * than twelve bespoke paths, which is what keeps them looking like one family. Keeping the
 * combinations as data in `lib/` means they are testable, because `tsconfig.json` sets
 * `jsx: "preserve"` for Next and vitest cannot parse a `.tsx` at all. This file owns only the
 * geometry each choice renders as.
 *
 * THE BADGE TAKES `--accent` AND THE FACE TAKES `currentColor`, which is the one place this
 * departs from `Mark.tsx`'s single-colour rule and is deliberate. A monochrome line face is
 * refined and slightly lifeless, and the thing it replaced was a flame. Two tokens, both from
 * the theme, so every palette still owns the result and nothing is hardcoded — the rule the
 * colour note in `globals.css` actually protects.
 *
 * Geometry is laid out against a 24-unit box with the face at (11.5, 12.6) r 7.6, which leaves
 * the top-right corner free for a badge. The face never moves between states — an off-centre
 * ring on the badged states only would read as a jump when the streak ticks over.
 */

import { FACES, type FaceName, type Eyes, type Mouth, type Badge } from '@/lib/stateFace';

export type { FaceName };

const CX = 11.5;
const CY = 12.6;
const R = 7.6;

function Eyes({ kind }: { kind: Eyes }) {
  if (kind === 'dots' || kind === 'brow') {
    return (
      <>
        <circle cx={8.6} cy={11.2} r={1.02} fill="currentColor" stroke="none" />
        <circle cx={14.4} cy={11.2} r={1.02} fill="currentColor" stroke="none" />
        {/* One raised brow is the whole of "thinking" — the mouth alone reads as a smirk. */}
        {kind === 'brow' && <path d="M12.9 8.4q1.5-.75 3 .1" />}
      </>
    );
  }
  // Two downward bows: eyes shut, and shut happily rather than squeezed.
  if (kind === 'closed') {
    return (
      <>
        <path d="M7.1 10.8q1.5 1.5 3 0" />
        <path d="M12.9 10.8q1.5 1.5 3 0" />
      </>
    );
  }
  // Flat dashes — present, looking at nothing. The away states.
  if (kind === 'dashes') {
    return (
      <>
        <path d="M7.2 11.2h2.8" />
        <path d="M13 11.2h2.8" />
      </>
    );
  }
  // Round spectacles with a bridge. The nerd-glasses idiom survives being drawn in two
  // circles and a line, which is the only reason "top marks" can have its own face.
  if (kind === 'glasses') {
    return (
      <>
        <circle cx={8.3} cy={11.3} r={2.05} />
        <circle cx={14.7} cy={11.3} r={2.05} />
        <path d="M10.35 11.3h2.3" />
        <circle cx={8.3} cy={11.3} r={0.75} fill="currentColor" stroke="none" />
        <circle cx={14.7} cy={11.3} r={0.75} fill="currentColor" stroke="none" />
      </>
    );
  }
  // One bar across both eyes. Shades, with none of the detail that turns into a smudge.
  return <path d="M6.6 10.9h9.8" strokeWidth={2.6} strokeLinecap="butt" />;
}

function Mouth({ kind }: { kind: Mouth }) {
  if (kind === 'none') return null;
  if (kind === 'smile') return <path d="M8.5 14.9q3 2.1 6 0" />;
  if (kind === 'grin') return <path d="M7.9 14.5q3.6 3.1 7.2 0" />;
  if (kind === 'flat') return <path d="M9.1 15.6h4.8" />;
  // A small wave — the wince that is not a frown. 😅 is embarrassment, not misery.
  if (kind === 'wince') return <path d="M9 15.6q.8-.9 1.6 0t1.6 0 1.6 0" />;
  // Pulled to one side and small: the mouth of somebody working something out.
  return <path d="M9.6 15.8q1.7-1 3.3-.3" />;
}

function Badge({ kind }: { kind: Badge }) {
  if (kind === 'none') return null;

  // Two dots climbing away from the head. The idiom that makes a face a thinking face.
  if (kind === 'think') {
    return (
      <g fill="var(--accent)" stroke="none">
        <circle cx={19.1} cy={6.3} r={1.15} />
        <circle cx={21.8} cy={3.5} r={0.8} />
      </g>
    );
  }

  // A flame with the kink that separates it from a leaf. Filled, so it carries at 28px.
  if (kind === 'flame') {
    return (
      <path
        d="M11.5 1.1c.45 1.5 2 2.1 2 3.45a2 2 0 0 1-4 0c0-1.05.95-1.25 2-3.45Z"
        fill="var(--accent)"
        stroke="none"
      />
    );
  }

  // Three strokes off the crown, SYMMETRIC ABOUT THE TOP. The first version walked them round
  // the upper right — crown, shoulder, side — which at 96px read as broken antennae rather
  // than as shining, because the eye expects a radiating set to be balanced. Found by
  // rendering the whole catalogue and looking at it rather than by reasoning about angles.
  if (kind === 'rays') {
    return (
      <g stroke="var(--accent)" strokeWidth={1.5}>
        <path d="M7.61 4.26 6.77 2.45" />
        <path d="M11.5 3.4V1.4" />
        <path d="M15.39 4.26 16.23 2.45" />
      </g>
    );
  }

  // The four-pointed star from `Mark.tsx`, scaled into the badge corner. Reused rather than
  // redrawn: the spark is already this app's mark for "something good happened".
  if (kind === 'spark') {
    return (
      <path
        transform="translate(14.6 .9) scale(.46)"
        d="M10 1.5c.35 3.9 1.35 5.95 3.1 7.05 1 .63 2.3 1.03 3.9 1.2v.5c-1.6.17-2.9.57-3.9 1.2-1.75 1.1-2.75 3.15-3.1 7.05h-.5c-.35-3.9-1.35-5.95-3.1-7.05-1-.63-2.3-1.03-3.9-1.2v-.5c1.6-.17 2.9-.57 3.9-1.2C8.15 7.45 9.15 5.4 9.5 1.5Z"
        fill="var(--accent)"
        stroke="none"
      />
    );
  }

  // A six-point asterisk. A crystal rather than a snowman: at this size a snowflake's
  // branches merge, and three crossed strokes still read as cold.
  if (kind === 'frost') {
    return (
      <g stroke="var(--accent)" strokeWidth={1.3}>
        <path d="M20 2.3v4.6" />
        <path d="M18 3.45l4 2.3" />
        <path d="M22 3.45l-4 2.3" />
      </g>
    );
  }

  // Mist across the lower face — 😶‍🌫️ drawn. It replaces the mouth rather than sitting beside
  // it, which is what that emoji is: a face the fog has taken the bottom off.
  //
  // TWO BANDS, NOT ONE, AND THAT IS THE WHOLE DIFFERENCE. A single wavy stroke sitting at mouth
  // height simply became a red mouth — the face read as queasy rather than as fogged, which is
  // a different sentence entirely to show somebody who has been away two days. A pair at
  // different heights cannot be a mouth, and held back in opacity they read as weather rather
  // than as a feature of the face.
  if (kind === 'mist') {
    return (
      <g stroke="var(--accent)" strokeOpacity={0.8} strokeWidth={1.3}>
        <path d="M4.6 14.2q1.5-1 3 0t3 0 3 0 3 0" />
        <path d="M5.4 17.4q1.4-1 2.8 0t2.8 0 2.8 0" />
      </g>
    );
  }

  // A single drop at the temple. The one piece of 😅 that is not the face.
  return (
    <path
      d="M18.6 8.1a1.05 1.05 0 0 1-2.1 0c0-.8 1.05-2.2 1.05-2.2S18.6 7.3 18.6 8.1Z"
      fill="var(--accent)"
      stroke="none"
    />
  );
}

interface Props {
  name: FaceName;
  /** Pixel size of the square. The header draws it at 26. */
  size?: number;
  /** Becomes the mark's accessible name; `useSRS`'s tip is what belongs here. */
  title?: string;
}

export default function StateFace({ name, size = 26, title }: Props) {
  const spec = FACES[name] ?? FACES.thinking;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.55}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title ?? name}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      <circle
        cx={CX}
        cy={CY}
        r={R}
        {...(spec.ring === 'dashed' ? { strokeDasharray: '2.6 2.4' } : {})}
      />
      <Eyes kind={spec.eyes} />
      <Mouth kind={spec.mouth} />
      <Badge kind={spec.badge} />
    </svg>
  );
}
