'use client';
import { Fragment, useEffect, useState } from 'react';

interface Props {
  /** The full dictionary gloss, senses joined by ';'. */
  gloss: string;
  /** The one sense that applies in this sentence, if the generator identified one. */
  contextual?: string;
  /** Colour for the highlighted sense. Defaults to the body ink. */
  highlightColor?: string;
  /**
   * Show ONE sense with a control to reveal the rest.
   *
   * Opt-in, because the passage's hover tooltip renders this with `pointerEvents: 'none'` —
   * a control the reader cannot click is worse than the full gloss.
   */
  collapsible?: boolean;
}

/** Normalise for comparison only — never for display. */
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Words that frame a sense without being part of it. Removing them before comparing is what
 * separates a genuine duplicate from a genuinely narrower sense: "the color blue" reduces to
 * "blue" and is a restatement, while "to be located" keeps `located` and is not.
 */
const FRAMING = new Set([
  'the', 'a', 'an', 'of', 'to', 'or', 'and', 'in', 'on', 'for', 'with', 'is', 'be',
  'color', 'colour', 'colored', 'coloured', 'sense', 'meaning', 'used', 'especially', 'esp',
]);

/** The content words of a sense, for comparison only — never for display. */
function contentWords(sense: string): Set<string> {
  return new Set(
    sense.toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter(w => w && !FRAMING.has(w)),
  );
}

const sameWords = (a: Set<string>, b: Set<string>) =>
  a.size > 0 && a.size === b.size && [...a].every(w => b.has(w));

/**
 * Split a gloss into its senses, dropping the ones that merely restate an earlier one.
 *
 * Wiktionary lists near-identical senses more often than you would expect: `gris` carries both
 * "grey / gray" AND "gray / grey", `bleu` both "blue" and "the color blue", `rouge` both
 * "red (of a red color)" and "red". Printed in a row that reads as though the app is padding,
 * and it is the first thing anyone notices about a colour list.
 *
 * DELIBERATELY CONSERVATIVE: only an EXACT match on content words counts as a duplicate. The
 * looser test — one sense's words being a subset of another's — also swallows real senses,
 * collapsing être's "to be; to be located; to be situated" down to "to be". A repeated sense
 * is untidy; a deleted one is wrong.
 *
 * Some sources separate senses with a middle dot rather than a semicolon, which is why the
 * popup used to run every gloss through its own `fmtMeaning`; doing it here means one rule for
 * what a "sense" is.
 */
function senses(gloss: string): string[] {
  const raw = gloss.replace(/\s*·\s*/g, '; ').split(';').map(s => s.trim()).filter(Boolean);
  const kept: { text: string; words: Set<string> }[] = [];
  for (const text of raw) {
    const words = contentWords(text);
    if (words.size && kept.some(k => sameWords(words, k.words))) continue;
    kept.push({ text, words });
  }
  return kept.map(k => k.text);
}

/**
 * Renders a dictionary gloss with the contextually-relevant sense emphasised.
 *
 * A gloss is often several senses ("to want, wish, desire; to expect; to think"), and showing
 * all of them tells a learner nothing about the sentence in front of them. When the generator
 * has identified which sense applies (see `contextualMeanings` on DailyPassage), that segment
 * is bolded so the eye lands on it.
 *
 * IT EMPHASISES; IT NO LONGER DE-EMPHASISES. The others used to be faded to 45%, which does
 * not say "this one fits here" — it says "the rest are wrong". They very often are not:
 * dictionary senses are frequently synonyms of each other, so 学生 "student; pupil" was
 * shown with `pupil` bold and `student` greyed out, as if student were the wrong answer.
 * The filter upstream now refuses to mark two-segment glosses at all, and this stops the
 * remaining highlight from making a claim the data cannot support.
 *
 * ── COLLAPSED TO ONE SENSE ──
 * `jaune` glosses as "yellow; yolk (of egg); strikebreaker", and a learner who tapped a colour
 * has to read past two senses that have nothing to do with the sentence. Collapsed, it shows
 * the one sense that answers the question and offers the rest on a tap — the same judgement
 * `LeechTriage` is built on, that a five-sense dictionary dump is the reason a card will not
 * stick. Nothing is DISCARDED: the deck still stores the full gloss, so this only ever changes
 * what is shown first.
 *
 * The sense shown first is the CONTEXTUAL one where the generator identified one, not blindly
 * the first. Collapsing to segment zero would have hidden the very sense this component exists
 * to surface.
 *
 * Falls back to the plain gloss whenever there is no match, so a reworded or stale
 * `contextual` can only ever lose the emphasis, never hide or alter the definition.
 */
export default function GlossText({ gloss, contextual, highlightColor, collapsible }: Props) {
  const [open, setOpen] = useState(false);
  // A new word starts collapsed again — the popup reuses this instance as you tap around,
  // and an expanded gloss left over from the previous word is not a choice anyone made.
  useEffect(() => { setOpen(false); }, [gloss]);

  const segments = senses(gloss);
  const target = contextual ? norm(contextual) : '';

  // Exact match first; then containment, which absorbs a trailing qualifier the model may
  // have copied along with the sense.
  let hit = target ? segments.findIndex(s => norm(s) === target) : -1;
  if (hit < 0 && target) hit = segments.findIndex(s => norm(s).includes(target) || target.includes(norm(s)));

  if (segments.length < 2) return <>{gloss}</>;

  if (collapsible && !open) {
    const lead = hit >= 0 ? hit : 0;
    return (
      <>
        {segments[lead]}
        <button
          onClick={e => { e.stopPropagation(); setOpen(true); }}
          className="cursor-pointer"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '.04em',
            background: 'none', border: 'none', padding: '0 0 0 6px',
            color: 'inherit', opacity: .55,
          }}
          aria-label={`Show ${segments.length - 1} more definitions`}
        >
          +{segments.length - 1} more
        </button>
      </>
    );
  }

  if (hit < 0) {
    // No contextual sense to emphasise. Expanded, this is just the gloss — but it still needs
    // the way back, or opening it is one-way.
    return (
      <>
        {segments.join('; ')}
        {collapsible && <LessButton onClick={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      {segments.map((seg, i) => (
        <Fragment key={i}>
          {i > 0 && <span style={{ opacity: 0.55 }}>; </span>}
          {i === hit
            ? <strong style={{ fontWeight: 700, color: highlightColor ?? 'var(--ink)' }}>{seg}</strong>
            : <span>{seg}</span>}
        </Fragment>
      ))}
      {collapsible && <LessButton onClick={() => setOpen(false)} />}
    </>
  );
}

function LessButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className="cursor-pointer"
      style={{
        fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '.04em',
        background: 'none', border: 'none', padding: '0 0 0 6px',
        color: 'inherit', opacity: .55,
      }}
    >
      less
    </button>
  );
}
