/**
 * Who gets to announce a milestone when two surfaces both could.
 *
 * ── THE PROBLEM ──
 * `AchievementToast` (the completion screens) and `ToastHost` (the floating corner toast)
 * both read `fresh` from `useAchievements` and both call `acknowledge()`. They are separate
 * hook instances, so whichever effect runs first consumes the announcement and the other
 * shows nothing. That is a race with no winner declared, and it lost the reward on the screen
 * built to give it: a milestone crossed on the last card of a session would be announced as a
 * corner toast instead of on the session-complete screen.
 *
 * It was worse than a coin flip. `ToastHost` used to live inside `ReadTab`, which mounts
 * TWICE (variant 'read' and variant 'srs'), and `TabPanel` hides the inactive one with
 * `display: none` — so the announcement could be consumed by a toast host that was not on
 * screen at all, and simply never appear. `ToastHost` now mounts once, at the app root.
 *
 * ── THE RULE ──
 * A completion screen always wins while one is mounted; the floating toast announces only
 * when there is none. Both halves matter. The floating toast exists because the earliest
 * milestones are deliberately reachable in a first session (see lib/achievements.ts) and a
 * learner who saves five words while reading and never finishes a passage would otherwise
 * meet none of them — so silencing it outright would delete a deliberate behaviour.
 *
 * ── WHY A MODULE AND NOT CONTEXT ──
 * The claim has to be visible to `ToastHost`'s effect in the SAME commit that mounts the
 * completion screen, and React runs every render before any effect. So the claim is made
 * during RENDER, and it is a `Set` keyed by instance to make that safe: adding the same key
 * twice is a no-op, so StrictMode's double render cannot inflate a count, and there is no
 * state update during render to warn about. Reads happen in effects, which is after every
 * render in the commit — so the answer is never a matter of which component sits first in
 * the tree.
 */

const surfaces = new Set<object>();

/** Called during render by a completion screen. Idempotent for a given key. */
export function claimCompletionSurface(key: object): void {
  surfaces.add(key);
}

/** Called from an unmount cleanup. */
export function releaseCompletionSurface(key: object): void {
  surfaces.delete(key);
}

/** Read this in an EFFECT, never in render — see the note above about commit ordering. */
export function completionSurfaceMounted(): boolean {
  return surfaces.size > 0;
}

/** Tests only: a module-level Set outlives a test case otherwise. */
export function resetCompletionSurfaces(): void {
  surfaces.clear();
}
