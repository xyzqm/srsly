/**
 * WHAT MAKES THE INSTALLED APP ACTUALLY OPEN — the other half of app/manifest.ts.
 *
 * That file made srsly installable: a home-screen icon, a standalone window, a theme colour.
 * Its docstring gives the reason — "reviews happen in dead minutes — a queue, a lift, a bus —
 * which is exactly when nobody is going to type a URL." For a year there was no service worker
 * behind it, so that window opened on the browser's offline error page. That is the worse of
 * the two possible failures: a WEBSITE that fails offline looks like the network failed, and an
 * INSTALLED APP that fails offline looks like srsly is broken. The condition the manifest exists
 * to serve was the one condition under which the app could not start.
 *
 * Nothing here syncs, grades or schedules anything. The offline half of THAT was already built
 * and already tested — lib/storage/local.ts is the truth and is written first,
 * lib/storage/writeQueue.ts holds what the cloud has not accepted, and `isPending` stops a stale
 * cloud read mirroring back over a local write. This file only makes the app LOAD, so that the
 * machinery already in the repo gets to run.
 *
 * ── AN ALLOWLIST, NEVER A DENYLIST, AND THAT IS THE ONE SECURITY DECISION HERE ──
 *
 * Every PWA tutorial reaches for a runtime rule on `/api/*`. Here that would write a request
 * bearing `x-srsly-anthropic-key` into Cache Storage, which persists on disk — against a rule
 * lib/server/generator.ts states outright: the key "is used for that one request and never
 * written anywhere". Three routes spend money (`daily-content`, `grade-response`,
 * `missed-review`), a fourth is a paid TTS call, and `/auth/callback` is an OAuth redirect.
 *
 * A denylist also has to be MAINTAINED: the next money-spending route becomes cacheable the day
 * it is added, silently, and there is no symptom for "this was served from disk and nobody
 * paid". So `classify` returns `network-only` for everything it is not explicitly told to
 * cache. Adding a route cannot make it cacheable; adding it to the allowlist can, which is a
 * decision somebody has to write down. Same reasoning lib/aiProviders.ts gives for the Spanish
 * tag set being a whitelist — "blacklisting was tried first and is unwinnable".
 *
 * ── IT CLASSIFIES A PARSED URL, NOT A STRING, AND THAT IS NOT DEFENSIVENESS ──
 *
 * `/strokes/../api/tts` passes a naive `path.startsWith('/strokes/')` and is fetched by the
 * browser as `/api/tts` — a raw-string allowlist would cache a paid call. `//fonts.gstatic.com/x`
 * is a different ORIGIN wearing a same-origin shape. Both are answered by reading `origin` and
 * `pathname` off a real `URL`, which normalises them the same way the browser already did.
 *
 * ── THREE STRATEGIES, EACH EARNED BY WHAT THE THING IS ──
 *
 *  - `document` — network-first, falling back to the cached shell. It MUST be network-first or
 *    a deploy is invisible. Only `/` qualifies: there is exactly one route in this app, so the
 *    rule is exact rather than approximate, and `/auth/callback` navigating through here is
 *    network-only by the same rule rather than by a special case.
 *  - `immutable` — cache-first. The Next chunks are content-hashed, the dictionaries carry
 *    `?v=DICT_VERSION` (lib/data/dictVersion.ts) and a stroke file is write-once. A new version
 *    is a new URL, so cache-first can never serve a stale one.
 *  - `revalidate` — serve the cache, refresh behind it. For the Google Fonts CSS, which arrives
 *    OPAQUE: a `<link rel=stylesheet>` with no `crossorigin` is a no-cors request, so its status
 *    is unreadable and a 500 is indistinguishable from the stylesheet. Cache-first would pin
 *    that failure until the cache version moved; revalidating heals it on the next online load.
 *    The woff2 files themselves are CORS (fonts always are) and their status reads honestly.
 *
 * ── NOTHING IS PRECACHED EXCEPT FOUR SMALL FILES ──
 *
 * Measured: cedict 7.6 MB, esdict 5.6, frdict 4.7, jmdict 3.1, plus 2,663 Chinese and 1,904
 * Japanese stroke files at 11 MB and 8.4 MB. ~40 MB over ~4,600 requests, which is not a thing
 * to do to a phone before the learner has read a word — and it would fetch French at a Chinese
 * learner. Tiers 2 and 3 are populated ON USE instead, so anyone who has opened the app online
 * is already offline-ready for their own language, and the cache grows to the few hundred
 * characters actually practised rather than to every character that exists.
 *
 * A 404 is never cached. That is load-bearing rather than tidy: scripts/build-strokes-ja.mjs
 * leaves 63 rare JLPT kanji absent on purpose and relies on them 404ing gracefully, exactly as
 * the Chinese build does for anything outside HSK. Caching those would make a missing character
 * permanently missing.
 *
 * ── THE WAITING WORKER IS DELIBERATE; IT DOES NOT skipWaiting ON ITS OWN ──
 *
 * Activating immediately would swap chunks under a page that is already running. So a new
 * worker installs and WAITS, lib/serviceWorker.ts notices and raises the banner, and only the
 * learner pressing Reload sends `SKIP_WAITING`. A stale shell outliving a schema change is the
 * worst form of the stale-artefact bug CLAUDE.md records — silent, persistent, and dangerous
 * exactly when the data model has moved — so the escape hatch is a visible control rather than
 * a timer.
 */
'use strict';

/** Bump to evict everything this file owns. Both caches are versioned together on purpose:
 *  a shell that disagrees with its own chunks is the failure the version exists to prevent. */
const VERSION = 'v1';
const SHELL_CACHE = 'srsly-shell-' + VERSION;
const ASSET_CACHE = 'srsly-assets-' + VERSION;
const CURRENT = [SHELL_CACHE, ASSET_CACHE];

/** Only caches this file owns are ever deleted — never one another tool put there. */
const OURS = /^srsly-(shell|assets)-/;

/** Tier 1. Small, fixed, fetched on install. The document is re-cached on every online load. */
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];

/** THE ALLOWLIST. Anything absent from these three lists is network-only. */
const IMMUTABLE_PREFIXES = ['/_next/static/', '/strokes/', '/strokes-ja/'];
const IMMUTABLE_PATHS = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  // The dictionaries. Queried with ?v=DICT_VERSION, so a rebuild is a different URL.
  '/cedict.json',
  '/jmdict.json',
  '/esdict.json',
  '/frdict.json',
];
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

/**
 * Which strategy a request gets: 'network-only' | 'document' | 'immutable' | 'revalidate'.
 *
 * Pure, and exposed on `self` at the foot of this file so tests/serviceWorker.test.ts can drive
 * THIS function rather than grep for it. CLAUDE.md names that distinction: pinning a rule by
 * searching a file's own source "catches a deletion and nothing else".
 */
function classify(rawUrl, method, mode) {
  // Every money-spending route in this app is a POST, so this is a second, independent guard
  // standing in front of the allowlist. `Cache.put` would reject a non-GET anyway; refusing
  // here means the decision is stated rather than inherited from an API's error behaviour.
  if (method !== 'GET') return 'network-only';

  let url;
  try {
    url = new URL(rawUrl, self.location.origin);
  } catch {
    // Not a URL this worker can reason about, so it is not one it will cache.
    return 'network-only';
  }
  // chrome-extension:, data:, blob: — not ours to serve and not cacheable.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'network-only';

  if (url.origin !== self.location.origin) {
    return FONT_ORIGINS.indexOf(url.origin) >= 0 ? 'revalidate' : 'network-only';
  }

  const path = url.pathname;

  // A navigation is the shell or it is nothing. There is one route in this app, so `=== '/'`
  // is the whole truth — and it is what keeps /auth/callback, an OAuth redirect, off the cache
  // without naming it.
  if (mode === 'navigate') return path === '/' ? 'document' : 'network-only';

  if (IMMUTABLE_PATHS.indexOf(path) >= 0) return 'immutable';
  for (let i = 0; i < IMMUTABLE_PREFIXES.length; i++) {
    if (path.indexOf(IMMUTABLE_PREFIXES[i]) === 0) return 'immutable';
  }
  return 'network-only';
}

/**
 * Whether a response may be written to a cache.
 *
 * `ok` is false for the 404s the stroke builds rely on. `opaque` is the font CSS, whose status
 * cannot be read at all — allowed because `revalidate` will replace a bad one. 206 is a range
 * response, which `Cache.put` rejects outright.
 */
function storable(res) {
  if (!res || res.status === 206) return false;
  return res.ok || res.type === 'opaque';
}

async function putQuietly(cache, key, res) {
  // A quota failure must never fail the request the learner is actually waiting on.
  try {
    await cache.put(key, res);
  } catch { /* out of space, or a response the Cache API refuses */ }
}

/**
 * EVERY CACHE WRITE IS HANDED TO `event.waitUntil`, AND THAT IS NOT BOOKKEEPING.
 *
 * A worker is kept alive only for the promise given to `respondWith`. A `cache.put` started
 * beside that promise — the obvious `void putQuietly(...)` — is a detached task the browser may
 * kill the instant the response is delivered, which is exactly when it is least likely to have
 * finished. The symptom is the worst kind: caching that works on a fast machine, works while
 * DevTools is open, and silently stores nothing on a phone. So each handler takes the event and
 * registers its write.
 */
async function immutableFirst(event, request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (storable(res)) event.waitUntil(putQuietly(cache, request, res.clone()));
  return res;
}

async function revalidate(event, request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  const net = fetch(request).then(function (res) {
    if (storable(res)) return putQuietly(cache, request, res.clone()).then(function () { return res; });
    return res;
  });
  if (hit) {
    // The refresh outlives the response, so it is the clearest case for waitUntil.
    event.waitUntil(net.catch(function () { /* the cached copy stands until next time */ }));
    return hit;
  }
  return net;
}

async function documentFirst(event, request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    // Stored under '/' rather than under the request, because a navigation may carry a query
    // (Next appends _rsc= for some requests) and the fallback has to match whatever arrives.
    if (res && res.ok) event.waitUntil(putQuietly(cache, '/', res.clone()));
    return res;
  } catch (e) {
    const hit = await cache.match('/');
    if (hit) return hit;
    // Nothing cached and no network: let the browser say so. Inventing a page here would be a
    // loading state rendered as an answer.
    throw e;
  }
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      // `addAll` is atomic — one 404 rejects the lot and the worker never installs. These four
      // are all served by the app itself, but a deploy racing an install is not impossible, and
      // failing to install is worse than installing without an icon.
      return Promise.all(SHELL_URLS.map(function (u) {
        return fetch(u, { cache: 'reload' })
          .then(function (res) { return storable(res) ? putQuietly(cache, u, res) : null; })
          .catch(function () { return null; });
      }));
    }),
  );
  // NOT skipWaiting. See the header: the learner's Reload is what activates a new worker.
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const names = await caches.keys();
    await Promise.all(names.map(function (n) {
      return OURS.test(n) && CURRENT.indexOf(n) < 0 ? caches.delete(n) : null;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  const kind = classify(request.url, request.method, request.mode);
  // `network-only` does NOT call respondWith at all — the request never enters this worker's
  // control, so there is no code path on which it could be written to a cache.
  if (kind === 'network-only') return;
  if (kind === 'document') { event.respondWith(documentFirst(event, request)); return; }
  if (kind === 'revalidate') { event.respondWith(revalidate(event, request)); return; }
  event.respondWith(immutableFirst(event, request));
});

// The seam tests/serviceWorker.test.ts drives. Exposed rather than duplicated in TypeScript:
// two copies of an allowlist is the drift lib/pinyin.ts warns about for stripTones.
self.__srsly = {
  classify: classify,
  storable: storable,
  allowlist: {
    IMMUTABLE_PREFIXES: IMMUTABLE_PREFIXES,
    IMMUTABLE_PATHS: IMMUTABLE_PATHS,
    FONT_ORIGINS: FONT_ORIGINS,
    SHELL_URLS: SHELL_URLS,
  },
};
