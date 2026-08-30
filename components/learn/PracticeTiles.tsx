'use client';
import { useCallback, useRef, useState } from 'react';
import { createDoubleTap, hasInspectModifier } from '@/lib/inspectGesture';

/**
 * The tiles of a build-the-sentence question: tap to place, drag to position, ask to inspect.
 *
 * ── THREE THINGS TO DO, ONE POINTER TO DO THEM WITH ──
 *
 *   tap            place it (from the pool) or take it back (from the answer)
 *   drag           drop it at a chosen position, including BETWEEN two placed words
 *   inspect        open the word's definition, audio and Add to vocab
 *
 * The first two are separated by what the pointer does after it goes down, not by inventing
 * modes. A press starts a timer; moving more than `DRAG_SLOP` cancels it and begins a drag;
 * releasing before either fires is a tap. That is the standard resolution, and it is why a
 * long-press does not fight a drag: one is "held still", the other is "moved".
 *
 * INSPECT has four ways in — long-press, right-click, ⌘/ctrl-click and double-click — because
 * it is one intent that three input devices spell three different ways, and a learner reaches
 * for whichever their hands already know. `lib/inspectGesture.ts` holds the set.
 *
 * ── THE POOL DOES NOT REFLOW, AND THAT IS LOAD-BEARING ──
 * A used tile leaves its slot behind rather than closing the gap. That is how Duolingo's word
 * bank behaves and it looked like a cosmetic choice; it is not. When the pool closed up, the
 * next tile slid under the cursor the instant the first was placed — so a double-click placed
 * TWO tiles rather than inspecting one, which is exactly what happened the first time this was
 * driven in a browser. Keeping the slot means two presses in one spot can only ever mean one
 * tile, which is what lets the double-click pair on position at all.
 *
 * A placeholder is still a button: its tap does nothing, but a long-press or right-click on it
 * opens the same definition, because the learner is pointing at a word either way.
 *
 * ── PLACEMENT IS BY SLOT INDEX, NOT BY WORD ──
 * A sentence may legitimately use the same word twice. Tracking placed tiles as strings meant
 * "remove this word from the pool" had to guess WHICH copy; indexes have no such ambiguity,
 * and they are what makes a slot a stable identity.
 *
 * ── WHY NOT HTML5 DRAG AND DROP ──
 * `draggable` + `dragover` does not fire for touch at all, so it would have worked on a desktop
 * and done nothing on the phone this app was just made usable on. Pointer events are one code
 * path for both.
 */

/** Movement, in px, that turns a press into a drag rather than a tap or a hold. */
const DRAG_SLOP = 8;
/** How long a still press must last to count as "inspect this word". */
const HOLD_MS = 450;

/** Which row a press landed in, and therefore what a plain tap on it means. */
type Role = 'pool' | 'placed' | 'used';

interface Props {
  /** The pool, in a FIXED display order — a tile keeps its slot once used. */
  slots: string[];
  /** Slot indexes, in the order the learner has placed them. */
  placed: number[];
  /** Put slot `slot` at position `at` in the answer (`at === placed.length` appends). */
  onPlace: (slot: number, at: number) => void;
  /** Move the tile at answer position `from` to position `to`. */
  onMove: (from: number, to: number) => void;
  /** Take the tile at answer position `at` back out. */
  onRemove: (at: number) => void;
  /** Long-press, right-click, ⌘-click or double-click: show what this word means. */
  onInspect: (tile: string, el: HTMLElement) => void;
  /** Colour feedback once the answer has been checked. */
  tone?: string;
  disabled?: boolean;
}

interface DragState {
  tile: string;
  /** Position within `placed`, or null when the tile came from the pool. */
  fromPos: number | null;
  x: number;
  y: number;
}

export default function PracticeTiles({
  slots, placed, onPlace, onMove, onRemove, onInspect, tone, disabled,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Where the dragged tile would land — drawn as a caret between two placed tiles. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  /** Set by anything that has already handled this press, so the pointerup does nothing. */
  const handledRef = useRef(false);
  const dblRef = useRef(createDoubleTap());

  const used = new Set(placed);
  const clearHold = () => { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; } };

  /**
   * Which gap in the answer row a pointer at `clientX` is over.
   *
   * Measured against each placed tile's midpoint: past the middle of a tile means "after it".
   * That is what makes dropping between two words work rather than only appending.
   */
  const gapAt = useCallback((clientX: number): number => {
    const row = rowRef.current;
    if (!row) return placed.length;
    const tiles = [...row.querySelectorAll('[data-placed]')] as HTMLElement[];
    for (let i = 0; i < tiles.length; i++) {
      const r = tiles[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return tiles.length;
  }, [placed.length]);

  /**
   * The second press of a double, caught in the CAPTURE phase so it lands before any tile's
   * own handler and can veto it.
   *
   * It sits on the wrapper rather than on the tiles because the first press moves things: after
   * taking the last word back out of the answer, the spot the learner pressed may be bare row.
   * A press there still has to complete the double, and only the container sees it.
   */
  const consumedRef = useRef(false);
  const onCapture = (e: React.PointerEvent) => {
    consumedRef.current = false;
    if (disabled) return;
    const hit = dblRef.current.completes(e.clientX, e.clientY);
    if (!hit) return;
    consumedRef.current = true;
    hit.undo();
    // Anchored to whatever was pressed, before the undo has re-rendered — so the card opens
    // where the finger is rather than where the tile is about to be.
    onInspect(hit.tile, (e.target as HTMLElement) ?? e.currentTarget);
  };

  const begin = (e: React.PointerEvent, tile: string) => {
    if (disabled) return;
    if (consumedRef.current) { handledRef.current = true; return; }
    const el = e.currentTarget as HTMLElement;
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    handledRef.current = false;
    clearHold();
    // ⌘/ctrl announces itself before anything happens, so it needs no undo — the tap is
    // simply never performed. Marked handled so the pointerup that follows does not place it.
    if (hasInspectModifier(e)) {
      handledRef.current = true;
      dblRef.current.reset();
      onInspect(tile, el);
      return;
    }
    holdRef.current = setTimeout(() => {
      handledRef.current = true;       // suppress the tap that would otherwise follow
      dblRef.current.reset();          // a hold is not the first half of a double
      onInspect(tile, el);
    }, HOLD_MS);
    // Capture keeps the moves coming to this element even when the finger leaves it. It is an
    // optimisation, not a requirement — and it THROWS for a pointer id the browser does not
    // consider active. Never let that failure escape: it would abort a gesture that was about
    // to work perfectly well without capture.
    try { el.setPointerCapture?.(e.pointerId); } catch { /* uncaptured is still draggable */ }
  };

  const move = (e: React.PointerEvent, tile: string, fromPos: number | null, role: Role) => {
    const start = startRef.current;
    if (!start || disabled || handledRef.current || role === 'used') return;
    const far = Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP;
    if (!far) return;
    if (!movedRef.current) {
      movedRef.current = true;
      clearHold();                     // moving means this was never a hold
      dblRef.current.reset();          // nor the first half of a double
      setDrag({ tile, fromPos, x: e.clientX, y: e.clientY });
    }
    setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    setDropAt(gapAt(e.clientX));
  };

  const end = (e: React.PointerEvent, tile: string, slot: number, fromPos: number | null, role: Role) => {
    clearHold();
    // Same guard as `begin`, and it matters more here: this used to be the second statement in
    // the handler, so a throw took the whole DROP with it — the tile followed the finger, the
    // caret showed where it would land, and releasing did nothing at all.
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* never captured */ }
    const wasDrag = movedRef.current;
    const handled = handledRef.current;
    /**
     * Recomputed from THIS event, not read from `dropAt`.
     *
     * `dropAt` is React state written on pointermove, so the value a pointerup handler sees is
     * whatever the last committed render carried — which is not necessarily the last move.
     * Dropping between two words landed the tile at the END instead. The caret needs the state
     * to render; the drop needs the truth, and the truth is on the event in hand.
     */
    const target = gapAt(e.clientX);
    setDrag(null);
    setDropAt(null);
    startRef.current = null;
    if (disabled || handled) return;   // a hold, ⌘-click or completed double already acted

    if (wasDrag && role !== 'used') {
      if (fromPos === null) onPlace(slot, target);
      // Dropping a placed tile after its own slot shifts the target left by one, because
      // removing it first closes the gap it was occupying.
      else onMove(fromPos, target > fromPos ? target - 1 : target);
      return;
    }

    // A plain tap. Its undo is recorded so that a second press in the same spot, inside the
    // double-click window, can take it back and open the definition instead.
    const at = { x: e.clientX, y: e.clientY, tile };
    if (role === 'pool') {
      const landed = placed.length;
      onPlace(slot, landed);
      dblRef.current.record({ ...at, undo: () => onRemove(landed) });
    } else if (role === 'placed' && fromPos !== null) {
      onRemove(fromPos);
      dblRef.current.record({ ...at, undo: () => onPlace(slot, fromPos) });
    } else {
      // A used slot. Tapping it does nothing — the word is already in the answer — but it is
      // still a word, so it is still recorded and still inspectable by every other gesture.
      dblRef.current.record({ ...at, undo: () => {} });
    }
  };

  const tileStyle = (active: boolean, ghost = false): React.CSSProperties => ({
    fontSize: 16,
    padding: '9px 13px',
    minHeight: 44,                     // a finger target, per the mobile pass
    display: 'inline-flex',
    alignItems: 'center',
    background: ghost ? 'transparent' : 'var(--card)',
    border: `1px solid ${ghost ? 'var(--line-soft)' : (tone ?? 'var(--line)')}`,
    color: ghost ? 'transparent' : (tone ?? 'var(--ink)'),
    borderRadius: 10,
    lineHeight: 1.3,
    touchAction: 'none',               // we own the gesture; let the browser not scroll-steal
    userSelect: 'none',
    opacity: active ? 0.35 : 1,
    cursor: disabled ? 'default' : ghost ? 'default' : 'grab',
  });

  const handlers = (tile: string, slot: number, fromPos: number | null, role: Role) => ({
    onPointerDown: (e: React.PointerEvent) => begin(e, tile),
    onPointerMove: (e: React.PointerEvent) => move(e, tile, fromPos, role),
    onPointerUp: (e: React.PointerEvent) => end(e, tile, slot, fromPos, role),
    onPointerCancel: () => { clearHold(); dblRef.current.reset(); setDrag(null); setDropAt(null); },
    // Right-click — and on a Mac, ctrl-click and a two-finger tap, which raise the same event.
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      handledRef.current = true;
      dblRef.current.reset();
      onInspect(tile, e.currentTarget as HTMLElement);
    },
  });

  return (
    <div onPointerDownCapture={onCapture}>
      {/* The answer. Always at least a tile tall so the layout does not jump on the first
          placement — a page that shifts while you are aiming is its own bug. */}
      <div
        ref={rowRef}
        className="flex flex-wrap gap-2 items-center rounded-lg px-3"
        style={{
          minHeight: 56, paddingTop: 7, paddingBottom: 7, marginBottom: 14,
          borderBottom: `2px solid ${tone ?? 'var(--line)'}`,
        }}
      >
        {placed.length === 0 && dropAt === null && (
          <span style={{ fontSize: 13, color: 'var(--ink-faint)', opacity: .75 }}>
            tap or drag the words into order
          </span>
        )}
        {placed.map((slot, i) => (
          <span key={`${slot}-${i}`} className="inline-flex items-center">
            {dropAt === i && drag && <Caret />}
            <button data-placed {...handlers(slots[slot], slot, i, 'placed')}
              style={tileStyle(drag?.fromPos === i)}>
              {slots[slot]}
            </button>
          </span>
        ))}
        {dropAt === placed.length && drag && <Caret />}
      </div>

      <div className="flex flex-wrap gap-2" style={{ minHeight: 44 }}>
        {slots.map((t, i) => (
          <button
            key={i}
            /* A spent slot is decorative to a screen reader — the word is announced in the
               answer row where it now lives — but it stays in the DOM and stays inspectable.
               `aria-hidden` on a focusable element is invalid, so it leaves the tab order too. */
            aria-hidden={used.has(i) || undefined}
            tabIndex={used.has(i) ? -1 : undefined}
            {...handlers(t, i, null, used.has(i) ? 'used' : 'pool')}
            style={tileStyle(drag?.fromPos === null && drag?.tile === t && !used.has(i), used.has(i))}
          >
            {t}
          </button>
        ))}
      </div>

      {/* The tile under the finger. `pointer-events: none` so it never becomes the drop target
          for its own drag. */}
      {drag && (
        <div
          style={{
            position: 'fixed', left: drag.x, top: drag.y, transform: 'translate(-50%, -50%)',
            pointerEvents: 'none', zIndex: 80, fontSize: 16, padding: '9px 13px',
            background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 10,
            boxShadow: '0 8px 20px rgba(0,0,0,.18)', opacity: .95,
          }}
        >
          {drag.tile}
        </div>
      )}
    </div>
  );
}

/** Where the dragged tile will land. */
function Caret() {
  return (
    <span
      aria-hidden
      style={{ display: 'inline-block', width: 3, height: 30, borderRadius: 2,
        background: 'var(--accent)', marginRight: 4 }}
    />
  );
}
