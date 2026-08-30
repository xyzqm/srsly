'use client';
import { useCallback, useRef, useState } from 'react';

/**
 * The tiles of a build-the-sentence question: tap to place, drag to position, hold to inspect.
 *
 * ── THREE GESTURES ON ONE ELEMENT, AND HOW THEY STAY APART ──
 * A tile has to do three different things and only one pointer to do them with:
 *
 *   tap            place it (from the pool) or take it back (from the answer)
 *   drag           drop it at a chosen position, including BETWEEN two placed words
 *   long-press     open the word's definition — and right-click does the same on a desktop
 *
 * They are separated by what the pointer does after it goes down, not by inventing modes.
 * A press starts a timer; moving more than `DRAG_SLOP` cancels the timer and begins a drag;
 * releasing before either fires is a tap. That is the standard resolution and it is why the
 * long-press does not fight the drag: one is "held still", the other is "moved".
 *
 * `onInspect` gets the tile's element so the caller can anchor a popup to it, because the
 * gesture that opens it is not always a React mouse event — a long-press has no click.
 *
 * ── WHY NOT HTML5 DRAG AND DROP ──
 * `draggable` + `dragover` does not fire for touch at all, so it would have worked on a
 * desktop and done nothing on the phone this app was just made usable on. Pointer events are
 * one code path for both.
 */

/** Movement, in px, that turns a press into a drag rather than a tap or a hold. */
const DRAG_SLOP = 8;
/** How long a still press must last to count as "inspect this word". */
const HOLD_MS = 450;

interface Props {
  /** Tiles the learner has placed, in order. */
  placed: string[];
  /** Tiles still to use. */
  pool: string[];
  /** Place `tile` at `index` in the answer (index === placed.length appends). */
  onPlace: (tile: string, index: number) => void;
  /** Move an already-placed tile to a new index. */
  onMove: (from: number, to: number) => void;
  /** Take a placed tile back out. */
  onRemove: (index: number) => void;
  /** Long-press or right-click: show what this word means. */
  onInspect: (tile: string, el: HTMLElement) => void;
  /** Colour feedback once the answer has been checked. */
  tone?: string;
  disabled?: boolean;
}

interface DragState {
  tile: string;
  /** Index within `placed`, or null when the tile came from the pool. */
  fromIndex: number | null;
  x: number;
  y: number;
}

export default function PracticeTiles({
  placed, pool, onPlace, onMove, onRemove, onInspect, tone, disabled,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Where the dragged tile would land — drawn as a caret between two placed tiles. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const heldRef = useRef(false);

  const clearHold = () => { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; } };

  /**
   * Which gap in the answer row a pointer at `clientX` is over.
   *
   * Measured against each placed tile's midpoint: past the middle of a tile means "after
   * it". That is what makes dropping between two words work rather than only appending.
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

  const begin = (e: React.PointerEvent, tile: string) => {
    if (disabled) return;
    const el = e.currentTarget as HTMLElement;
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    heldRef.current = false;
    clearHold();
    holdRef.current = setTimeout(() => {
      heldRef.current = true;          // suppress the tap that would otherwise follow
      onInspect(tile, el);
    }, HOLD_MS);
    // Capture keeps the moves coming to this element even when the finger leaves it. It is
    // an optimisation, not a requirement — and it THROWS for a pointer id the browser does
    // not consider active. Never let that failure escape: it would abort the gesture that
    // was about to work perfectly well without capture.
    try { el.setPointerCapture?.(e.pointerId); } catch { /* uncaptured is still draggable */ }
  };

  const move = (e: React.PointerEvent, tile: string, fromIndex: number | null) => {
    const start = startRef.current;
    if (!start || disabled) return;
    const far = Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_SLOP;
    if (!far) return;
    if (!movedRef.current) {
      movedRef.current = true;
      clearHold();                     // moving means this was never a hold
      setDrag({ tile, fromIndex, x: e.clientX, y: e.clientY });
    }
    setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    setDropAt(gapAt(e.clientX));
  };

  const end = (e: React.PointerEvent, tile: string, fromIndex: number | null) => {
    clearHold();
    // Same guard as `begin`, and it matters more here: this used to be the second statement
    // in the handler, so a throw took the whole DROP with it — the tile followed the finger,
    // the caret showed where it would land, and releasing did nothing at all.
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* never captured */ }
    const wasDrag = movedRef.current;
    const wasHold = heldRef.current;
    /**
     * Recomputed from THIS event, not read from `dropAt`.
     *
     * `dropAt` is React state written on pointermove, so the value a pointerup handler sees
     * is whatever the last committed render carried — which is not necessarily the last
     * move. Dropping between two words landed the tile at the END instead, because the
     * stale value was still the append index. The caret needs the state to render; the drop
     * needs the truth, and the truth is on the event in hand.
     */
    const target = gapAt(e.clientX);
    setDrag(null);
    setDropAt(null);
    startRef.current = null;
    if (disabled || wasHold) return;   // a hold already opened the popup; don't also move it

    if (wasDrag && target !== null) {
      if (fromIndex === null) onPlace(tile, target);
      // Dropping a placed tile after its own slot shifts the target left by one, because
      // removing it first closes the gap it was occupying.
      else onMove(fromIndex, target > fromIndex ? target - 1 : target);
      return;
    }
    // A plain tap.
    if (fromIndex === null) onPlace(tile, placed.length);
    else onRemove(fromIndex);
  };

  const tileStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 16,
    padding: '9px 13px',
    minHeight: 44,                     // a finger target, per the mobile pass
    display: 'inline-flex',
    alignItems: 'center',
    background: 'var(--card)',
    border: `1px solid ${tone ?? 'var(--line)'}`,
    color: tone ?? 'var(--ink)',
    borderRadius: 10,
    lineHeight: 1.3,
    touchAction: 'none',               // we own the gesture; let the browser not scroll-steal
    userSelect: 'none',
    opacity: active ? 0.35 : 1,
    cursor: disabled ? 'default' : 'grab',
  });

  const handlers = (tile: string, fromIndex: number | null) => ({
    onPointerDown: (e: React.PointerEvent) => begin(e, tile),
    onPointerMove: (e: React.PointerEvent) => move(e, tile, fromIndex),
    onPointerUp: (e: React.PointerEvent) => end(e, tile, fromIndex),
    onPointerCancel: () => { clearHold(); setDrag(null); setDropAt(null); },
    // Right-click is the desktop half of "inspect": same result, no hold required.
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onInspect(tile, e.currentTarget as HTMLElement);
    },
  });

  return (
    <>
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
        {placed.map((t, i) => (
          <span key={`${t}-${i}`} className="inline-flex items-center">
            {dropAt === i && drag && <Caret />}
            <button data-placed {...handlers(t, i)} style={tileStyle(drag?.fromIndex === i)}>
              {t}
            </button>
          </span>
        ))}
        {dropAt === placed.length && drag && <Caret />}
      </div>

      <div className="flex flex-wrap gap-2" style={{ minHeight: 44 }}>
        {pool.map((t, i) => (
          <button key={`${t}-${i}`} {...handlers(t, null)} style={tileStyle(drag?.tile === t && drag?.fromIndex === null)}>
            {t}
          </button>
        ))}
      </div>

      {/* The tile under the finger. `pointer-events: none` so it never becomes the drop
          target for its own drag. */}
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
    </>
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
