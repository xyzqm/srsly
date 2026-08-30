import { describe, it, expect, vi } from 'vitest';
import {
  createDoubleTap, hasInspectModifier, INSPECT_DOUBLE_MS, INSPECT_DOUBLE_SLOP,
} from '@/lib/inspectGesture';

/**
 * The four ways to ask a practice tile what it means.
 *
 * Three of them announce themselves before anything happens, so they are trivially safe. The
 * double-tap cannot — its first tap has already placed or removed the tile by the time the
 * second arrives — so it carries an `undo`, and everything here is about that undo firing
 * exactly when it should and never when it should not.
 */

const tap = (x: number, y: number, undo = () => {}) => ({ tile: '本', x, y, undo });

describe('the modifier that means "explain, do not act"', () => {
  it('accepts ⌘ and ctrl alike, because the platforms disagree about which', () => {
    expect(hasInspectModifier({ metaKey: true })).toBe(true);
    expect(hasInspectModifier({ ctrlKey: true })).toBe(true);
    expect(hasInspectModifier({ metaKey: false, ctrlKey: false })).toBe(false);
    expect(hasInspectModifier({})).toBe(false);
  });

  /** Shift and alt select and drag things elsewhere; claiming them would break those. */
  it('claims nothing else', () => {
    expect(hasInspectModifier({ shiftKey: true } as never)).toBe(false);
    expect(hasInspectModifier({ altKey: true } as never)).toBe(false);
  });
});

describe('pairing two presses into one double', () => {
  it('completes on a second press in the same place inside the window', () => {
    const undo = vi.fn();
    const d = createDoubleTap();
    d.record(tap(100, 100, undo), 1000);
    const hit = d.completes(100, 100, 1000 + INSPECT_DOUBLE_MS - 1);
    expect(hit?.undo).toBe(undo);
    expect(hit?.tile).toBe('本');
  });

  it('does not complete once the window has passed', () => {
    const d = createDoubleTap();
    d.record(tap(100, 100), 1000);
    expect(d.completes(100, 100, 1000 + INSPECT_DOUBLE_MS)).toBeNull();
  });

  /**
   * A double-click is two clicks in the same PLACE — that is its definition, and it is what
   * keeps ordinary fast play from reading as one. Two tiles tapped in quick succession are at
   * two different points, so they can never pair.
   */
  it('does not pair two presses far apart, however quick', () => {
    const d = createDoubleTap();
    d.record(tap(100, 100), 1000);
    expect(d.completes(100 + INSPECT_DOUBLE_SLOP + 1, 100, 1005)).toBeNull();
  });

  it('tolerates a finger that does not land on the same pixel', () => {
    const d = createDoubleTap();
    d.record(tap(100, 100), 1000);
    expect(d.completes(100 + INSPECT_DOUBLE_SLOP - 1, 100, 1005)).not.toBeNull();
  });

  /** Distance is measured in both axes, not just horizontally along the tile row. */
  it('measures the gap diagonally', () => {
    const d = createDoubleTap();
    d.record(tap(100, 100), 1000);
    expect(d.completes(100 + INSPECT_DOUBLE_SLOP, 100 + INSPECT_DOUBLE_SLOP, 1005)).toBeNull();
  });

  /**
   * A triple-click is a double followed by a single, not two doubles. Without the reset the
   * stale record would fire a second undo and take back something the learner meant to do.
   */
  it('spends the record, so a third press is a fresh single', () => {
    const undo = vi.fn();
    const d = createDoubleTap();
    d.record(tap(100, 100, undo), 1000);
    expect(d.completes(100, 100, 1010)?.undo).toBe(undo);
    expect(d.completes(100, 100, 1020)).toBeNull();
  });

  it('forgets the pending press when a drag, a hold or a modifier claims it', () => {
    const d = createDoubleTap();
    d.record(tap(100, 100), 1000);
    d.reset();
    expect(d.completes(100, 100, 1010)).toBeNull();
  });

  it('completes nothing at all before a first press', () => {
    expect(createDoubleTap().completes(100, 100, 1000)).toBeNull();
  });
});
