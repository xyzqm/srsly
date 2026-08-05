'use client';
import { Fragment } from 'react';

interface Props {
  /** The full dictionary gloss, senses joined by ';'. */
  gloss: string;
  /** The one sense that applies in this sentence, if the generator identified one. */
  contextual?: string;
  /** Colour for the highlighted sense. Defaults to the body ink. */
  highlightColor?: string;
}

/** Normalise for comparison only — never for display. */
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Renders a dictionary gloss with the contextually-relevant sense emphasised and the rest
 * dimmed.
 *
 * A gloss is often several senses ("to want, wish, desire; to expect; to think"), and
 * showing all of them tells a learner nothing about the sentence in front of them. When the
 * generator has identified which sense applies (see `contextualMeanings` on DailyPassage),
 * that segment is bolded and the others faded — the full gloss is still there to read, but
 * the eye lands on the one that matters.
 *
 * Falls back to the plain gloss whenever there is no match, so a reworded or stale
 * `contextual` can only ever lose the emphasis, never hide or alter the definition.
 */
export default function GlossText({ gloss, contextual, highlightColor }: Props) {
  const segments = gloss.split(';').map(s => s.trim()).filter(Boolean);
  const target = contextual ? norm(contextual) : '';

  // Exact match first; then containment, which absorbs a trailing qualifier the model may
  // have copied along with the sense.
  let hit = target ? segments.findIndex(s => norm(s) === target) : -1;
  if (hit < 0 && target) hit = segments.findIndex(s => norm(s).includes(target) || target.includes(norm(s)));

  if (hit < 0 || segments.length < 2) return <>{gloss}</>;

  return (
    <>
      {segments.map((seg, i) => (
        <Fragment key={i}>
          {i > 0 && <span style={{ opacity: 0.45 }}>; </span>}
          {i === hit
            ? <strong style={{ fontWeight: 700, color: highlightColor ?? 'var(--ink)' }}>{seg}</strong>
            : <span style={{ opacity: 0.45 }}>{seg}</span>}
        </Fragment>
      ))}
    </>
  );
}
