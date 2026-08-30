/**
 * "Show me what this word means" — the one intent, and every gesture that expresses it.
 *
 * A practice tile has to do three jobs with one pointer: place it, position it, and explain
 * it. The first two are the tile's whole purpose, so the third has to be reachable without
 * ever being mistaken for them. The resolution is that INSPECT is always the deliberate
 * gesture — the one nobody performs by accident:
 *
 *   right-click / two-finger tap   the desktop convention for "tell me about this"
 *   long-press                     the touch convention for the same thing
 *   ⌘-click / ctrl-click           the trackpad convention, and the one with no context menu
 *   double-click / double-tap      the fallback everybody tries first
 *
 * They are gathered here rather than spread across the components that need them because
 * "seamless whether you are on a phone, a mouse or a trackpad" is a property of the SET, and
 * a set defined in two places drifts into two sets.
 *
 * ── WHY DOUBLE-CLICK NEEDS AN UNDO, AND WHY THAT IS NOT A HACK ──
 * The other three announce themselves before anything happens: a modifier is already held at
 * press time, a long-press is a press that never moves, a right-click is its own button. A
 * double-click cannot — its first click is indistinguishable from a single one, so by the time
 * the second arrives the tile has ALREADY been placed or taken back.
 *
 * There are only two ways out. Delay every tap by the double-click window, which puts ~300 ms
 * of lag on the app's most-used gesture in order to serve its rarest — the same 300 ms tap
 * delay the whole platform spent years removing. Or let the first click act and reverse it
 * when the second arrives, which is what happens here: the caller hands over how to undo the
 * tap it just performed, and a completed double runs it. The net effect is the promise the
 * gesture makes — nothing moved, the popup opened.
 *
 * ── IT PAIRS ON POSITION, NOT ON THE WORD ──
 * A double-click is two clicks in the same PLACE; that is its whole definition, and matching
 * anything else gets it wrong in both directions. Matching on the tile's text fails a real
 * double-click outright, because the first click moves that tile out from under the cursor and
 * the second lands on whichever tile slid into the gap — verified in the browser, where
 * double-clicking 杯 placed 杯 and then 咖啡。
 *
 * What makes position safe is that the POOL NO LONGER REFLOWS: a used tile leaves its slot
 * behind (see components/learn/PracticeTiles.tsx), so two presses at one spot can only ever
 * mean one tile. Without that, position-matching would fire on ordinary fast play — click a
 * spot, the next tile slides in, click again — so the two changes are one design and neither
 * is safe alone.
 */

/**
 * How close together in TIME two presses must be to count as one double.
 *
 * Between the ~250 ms most people actually double-click in and the ~500 ms the OS allows.
 */
export const INSPECT_DOUBLE_MS = 320;

/**
 * How close together in SPACE, in px.
 *
 * Generous next to a mouse's few pixels, because a finger returning to the same tile lands
 * within a tile's width rather than on the same pixel — and a tile is 44 px tall by the
 * mobile pass, so a slop wider than that would start pairing presses on two different tiles.
 */
export const INSPECT_DOUBLE_SLOP = 24;

/** A press carrying the modifier that means "explain, do not act". */
export function hasInspectModifier(e: { metaKey?: boolean; ctrlKey?: boolean }): boolean {
  // Both, deliberately. ⌘ is the Mac convention and ctrl the Windows/Linux one, and a learner
  // on either platform reaches for the one their hands know. On a Mac ctrl-click ALSO raises a
  // context menu, so both paths fire for that single gesture — harmless, because opening the
  // same word twice is opening it once.
  return Boolean(e.metaKey || e.ctrlKey);
}

/** What a completed double has to reverse: the single tap that already happened. */
export interface TapRecord {
  /** The word tapped — reported back so the caller knows what to open. */
  tile: string;
  x: number;
  y: number;
  /** Undo the effect of that tap. The caller runs it before opening the popup. */
  undo: () => void;
}

export interface DoubleTap {
  /** Remember a tap that has just acted, and how to take it back. */
  record(rec: TapRecord, now?: number): void;
  /**
   * Does a press at this point right now complete a double? If so the pending record is
   * returned and cleared, so a triple-click is a double followed by a single rather than a
   * second double firing off a stale record and undoing something the learner meant.
   */
  completes(x: number, y: number, now?: number): TapRecord | null;
  /** Forget the pending tap — after a drag, a hold, or a modifier press. */
  reset(): void;
}

export function createDoubleTap(
  windowMs = INSPECT_DOUBLE_MS,
  slop = INSPECT_DOUBLE_SLOP,
): DoubleTap {
  let last: (TapRecord & { at: number }) | null = null;
  return {
    record(rec, now = Date.now()) { last = { ...rec, at: now }; },
    completes(x, y, now = Date.now()) {
      if (!last) return null;
      if (now - last.at >= windowMs) return null;
      if (Math.hypot(x - last.x, y - last.y) > slop) return null;
      const hit = last;
      last = null;
      return hit;
    },
    reset() { last = null; },
  };
}
