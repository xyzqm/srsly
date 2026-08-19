'use client';
import { useRef, type ReactNode } from 'react';

/**
 * Keeps a tab's subtree ALIVE once it has been visited.
 *
 * Tabs used to be `{tab === 'read' && <ReadTab/>}`, which unmounts the whole tree the moment
 * you switch away. That is cheap to write and expensive to use: coming back to Read re-ran
 * the daily-content fetch and redrew from a loading state, and coming back to Stats blinked
 * the milestone ring in a beat late while its level table resolved. Nothing was broken — it
 * just rebuilt in front of you every time, which is what "switching tabs isn't clean" is.
 *
 * `mounted` latches on first activation, so an unvisited tab still costs nothing: Practice,
 * Vocab and Settings are not mounted until you open them. After that the subtree stays and
 * is merely hidden.
 *
 * `display: none` (not visibility/opacity) is deliberate — a hidden panel must not occupy
 * layout, and must not paint. `inert` takes it out of the tab order and out of the
 * accessibility tree, so a hidden panel's inputs cannot be focused or read out.
 *
 * State that must survive a RELOAD, not just a tab switch, still has to be persisted — this
 * only removes the remount, not the browser.
 */
export default function TabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const mounted = useRef(false);
  if (active) mounted.current = true;
  if (!mounted.current) return null;
  return (
    <div hidden={!active} inert={!active ? true : undefined} style={active ? undefined : { display: 'none' }}>
      {children}
    </div>
  );
}
