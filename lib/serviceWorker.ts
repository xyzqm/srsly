'use client';

/**
 * Registering public/sw.js, and the one question it has to answer: has a NEW version arrived?
 *
 * ── IT DOES NOT REGISTER IN DEVELOPMENT, AND THAT IS NOT CAUTION ──
 *
 * A worker caching `localhost:3000` serves yesterday's chunks to today's dev server, and the
 * symptom is not "stale page" — it is an unrelated compile error, or a lazy `import()` that
 * resolves to a chunk the new build never emitted. CLAUDE.md records "debugging against a stale
 * artefact" as a recurring cost and "never run `npm run build` while a dev server is live" as a
 * hard rule for exactly that reason. A dev-registered service worker is the same hazard with a
 * much longer fuse, because clearing it needs DevTools rather than a rebuild.
 *
 * ── A FIRST INSTALL IS NOT AN UPDATE ──
 *
 * `registration.waiting` is non-null in two completely different situations: a second worker
 * standing behind the one currently in control, and the very first worker on a page that has no
 * controller yet. Announcing the second as "a new version is ready" would show an update banner
 * to somebody who has just opened the app for the first time. `navigator.serviceWorker.controller`
 * is what separates them — it is null until a worker is in control — so it is checked before
 * anything is announced.
 *
 * ── `controllerchange` ONLY RELOADS WHEN WE ASKED IT TO ──
 *
 * That event also fires on a first install, the moment `clients.claim()` runs. Reloading on it
 * unconditionally reloads the page out from under a learner who merely opened the app, which
 * looks like a crash. So `applyUpdate` sets a flag first, and the listener reloads only when the
 * reload is one this module requested.
 *
 * The worker itself deliberately does NOT call `skipWaiting` — see public/sw.js. Activation is
 * the learner pressing Reload, so nothing swaps chunks under a page that is mid-session.
 */

/** The worker standing by, once one exists. Module scope because there is one page. */
let waiting: ServiceWorker | null = null;

/** Set by `applyUpdate` so the `controllerchange` listener can tell our reload from a first install. */
let selfRequestedReload = false;

/** Guards the focus-triggered update check, which would otherwise fire on every tab switch. */
let lastCheck = 0;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function serviceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Register the worker and call `onUpdateReady` if (and only if) a genuinely newer one is waiting.
 *
 * Safe to call once per app lifetime; `AppShell` mounts exactly once, which is why it is the
 * caller. Every failure path is swallowed: a browser that refuses to register, a worker that
 * 404s behind a misconfigured host, a private window with storage disabled — none of them may
 * stop the app from running, because the app ran perfectly well without any of this before.
 */
export function registerServiceWorker(onUpdateReady: () => void): void {
  if (!serviceWorkerSupported()) return;
  if (process.env.NODE_ENV !== 'production') return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!selfRequestedReload) return;
    selfRequestedReload = false;
    window.location.reload();
  });

  navigator.serviceWorker.register('/sw.js').then(reg => {
    const announce = (sw: ServiceWorker | null | undefined) => {
      if (!sw) return;
      // No controller means this is the first worker, not a replacement for one.
      if (!navigator.serviceWorker.controller) return;
      waiting = sw;
      onUpdateReady();
    };

    if (reg.waiting) announce(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!incoming) return;
      incoming.addEventListener('statechange', () => {
        if (incoming.state === 'installed') announce(reg.waiting ?? incoming);
      });
    });

    // A standalone window is never navigated, so the browser's own update check on navigation
    // never happens — this app could hold one shell open for a week. Asking on return to the
    // tab is the only thing that makes the banner reachable at all for an installed copy.
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = now;
      void reg.update().catch(() => { /* offline, or nothing to fetch */ });
    };
    lastCheck = Date.now();
    document.addEventListener('visibilitychange', check);
  }).catch(() => { /* never let registration break the app */ });
}

/** Hand over to the waiting worker, then reload once it is in control. */
export function applyUpdate(): void {
  if (typeof window === 'undefined') return;
  if (!waiting) {
    // Nothing to hand over to — a plain reload is still the right answer to the button.
    window.location.reload();
    return;
  }
  selfRequestedReload = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * The kill switch, exported so a bad worker in production can be retired deliberately.
 *
 * A service worker outlives the deploy that shipped it: once it is in control, a learner with a
 * broken one has no route back except DevTools, which is not a route. Shipping a build that
 * calls this is how the whole feature gets turned off without waiting for a cache to expire.
 */
export async function unregisterServiceWorker(): Promise<void> {
  if (!serviceWorkerSupported()) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('srsly-')).map(n => caches.delete(n)));
  } catch { /* nothing to undo */ }
}
