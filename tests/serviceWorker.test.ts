import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * THE SERVICE WORKER'S FIREWALL — and this test RUNS the shipped file rather than reading it.
 *
 * `tests/aiGate.test.ts`, `tests/pactFirewall.test.ts` and `tests/shareArrival.test.ts` all
 * assert against a module's SOURCE, because the thing they are pinning is not importable.
 * CLAUDE.md names the weakness of that out loud, about `generateJson` before it was moved:
 * "every claim about it was pinned by grepping the route's own source for an identifier, which
 * catches a deletion and nothing else. It cannot tell whether the error that comes out is the
 * right one."
 *
 * `public/sw.js` cannot be imported — it is a classic worker script, deliberately, because
 * Safari does not support module service workers and iOS is the hardware the handwriting
 * feature exists for. But it is plain JavaScript, so it can be EVALUATED: given a stub `self`,
 * it hands back its own `classify` on `self.__srsly`, and every assertion below drives that
 * real function. There is no second copy of the allowlist in TypeScript to drift from it.
 *
 * The property being defended is one sentence: NO ROUTE THAT SPENDS MONEY OR CARRIES THE
 * LEARNER'S API KEY MAY EVER BE WRITTEN TO DISK. `lib/server/generator.ts` promises the key "is
 * used for that one request and never written anywhere", and Cache Storage is persistent.
 */

const ROOT = resolve(import.meta.dirname, '..');
const SW_PATH = resolve(ROOT, 'public/sw.js');
const ORIGIN = 'https://srsly-zeta.vercel.app';

type Kind = 'network-only' | 'document' | 'immutable' | 'revalidate';

interface Worker {
  classify: (url: string, method: string, mode: string) => Kind;
  storable: (res: unknown) => boolean;
  allowlist: {
    IMMUTABLE_PREFIXES: string[];
    IMMUTABLE_PATHS: string[];
    FONT_ORIGINS: string[];
    SHELL_URLS: string[];
  };
  events: Record<string, unknown>;
}

/**
 * Evaluate a worker script with `self` supplied as a parameter.
 *
 * `new Function` rather than `node:vm`, because the body needs the ambient `URL`, `Promise` and
 * `TypeError` of a real realm and a fresh vm context has none of them — passing each one in by
 * hand would be a second, subtly different environment to maintain. The script's own globals
 * (`self`, `caches`, `fetch`) are parameters, so nothing it does can touch the test's.
 */
function load(src: string = readFileSync(SW_PATH, 'utf8')): Worker {
  const events: Record<string, unknown> = {};
  const self: Record<string, unknown> = {
    location: { origin: ORIGIN },
    addEventListener: (kind: string, fn: unknown) => { events[kind] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const caches = { open: async () => ({ match: async () => undefined, put: async () => {} }), keys: async () => [], delete: async () => true };
  const fetchStub = async () => ({ ok: true, status: 200, type: 'basic', clone: () => ({}) });
  new Function('self', 'caches', 'fetch', src)(self, caches, fetchStub);
  const api = self.__srsly as Omit<Worker, 'events'>;
  return { ...api, events };
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const MODES = ['cors', 'no-cors', 'same-origin', 'navigate'];

/** Route directories read off disk, so a route added later is covered the day it appears. */
const API_ROUTES = readdirSync(resolve(ROOT, 'app/api'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

describe('the service worker exposes a classifier to test', () => {
  it('evaluates and hands back its own rules', () => {
    const sw = load();
    expect(typeof sw.classify).toBe('function');
    expect(typeof sw.storable).toBe('function');
    // install / activate / message / fetch
    expect(Object.keys(sw.events).sort()).toEqual(['activate', 'fetch', 'install', 'message']);
  });
});

describe('the firewall: no API route may ever be cached', () => {
  it('found the API routes on disk', () => {
    // Guards against a vacuous pass — a renamed directory would otherwise test nothing at all.
    expect(API_ROUTES.length).toBeGreaterThanOrEqual(9);
    for (const spender of ['daily-content', 'grade-response', 'missed-review', 'tts']) {
      expect(API_ROUTES).toContain(spender);
    }
  });

  it('classifies every API route network-only, under every method and every mode', () => {
    const { classify } = load();
    for (const route of API_ROUTES) {
      for (const method of METHODS) {
        for (const mode of MODES) {
          expect(classify(`${ORIGIN}/api/${route}`, method, mode)).toBe('network-only');
          expect(classify(`${ORIGIN}/api/${route}/`, method, mode)).toBe('network-only');
          expect(classify(`${ORIGIN}/api/${route}?x=1`, method, mode)).toBe('network-only');
        }
      }
    }
  });

  it('refuses the OAuth callback, which arrives as a navigation', () => {
    const { classify } = load();
    // A navigation is the one shape with its own branch, and this is the one navigation in the
    // app that is not the shell. Serving it from cache would replay an auth redirect.
    expect(classify(`${ORIGIN}/auth/callback?code=abc`, 'GET', 'navigate')).toBe('network-only');
    expect(classify(`${ORIGIN}/auth/callback`, 'GET', 'cors')).toBe('network-only');
  });

  it('refuses a path that only becomes an API route after normalisation', () => {
    const { classify } = load();
    // `/strokes/../api/tts` passes a raw `startsWith('/strokes/')` and is fetched by the
    // browser as `/api/tts` — a paid call. This is why classification parses a URL.
    expect(classify(`${ORIGIN}/strokes/../api/tts`, 'GET', 'cors')).toBe('network-only');
    expect(classify(`${ORIGIN}/_next/static/../../api/daily-content`, 'GET', 'cors')).toBe('network-only');
    expect(classify(`${ORIGIN}/strokes-ja/%2e%2e/api/tts`, 'GET', 'cors')).toBe('network-only');
  });

  it('refuses another origin wearing a same-origin shape', () => {
    const { classify } = load();
    expect(classify('https://evil.example/cedict.json', 'GET', 'cors')).toBe('network-only');
    expect(classify('https://project.supabase.co/rest/v1/user_data', 'GET', 'cors')).toBe('network-only');
    expect(classify(`${ORIGIN}//evil.example/cedict.json`, 'GET', 'cors')).toBe('network-only');
  });

  it('refuses non-http schemes', () => {
    const { classify } = load();
    expect(classify('data:application/json,{}', 'GET', 'cors')).toBe('network-only');
    expect(classify('chrome-extension://abc/cedict.json', 'GET', 'cors')).toBe('network-only');
    expect(classify('not a url at all', 'GET', 'cors')).toBe('network-only');
  });

  it('never caches a non-GET, whatever the path', () => {
    const { classify } = load();
    const cacheable = ['/', '/cedict.json', '/_next/static/chunks/main.js', '/strokes/%E5%A5%BD.json', '/manifest.webmanifest'];
    for (const path of cacheable) {
      for (const method of METHODS.filter(m => m !== 'GET')) {
        expect(classify(ORIGIN + path, method, 'cors')).toBe('network-only');
        expect(classify(ORIGIN + path, method, 'navigate')).toBe('network-only');
      }
    }
  });
});

describe('the three tiers', () => {
  it('serves the shell document network-first, and only for the one route that exists', () => {
    const { classify } = load();
    expect(classify(`${ORIGIN}/`, 'GET', 'navigate')).toBe('document');
    expect(classify(`${ORIGIN}/?_rsc=abc`, 'GET', 'navigate')).toBe('document');
    // Not a navigation: a prefetch of `/` is not the shell being opened.
    expect(classify(`${ORIGIN}/`, 'GET', 'cors')).toBe('network-only');
    // There is exactly one route in this app, so anything else navigating is not the shell.
    expect(classify(`${ORIGIN}/read`, 'GET', 'navigate')).toBe('network-only');
  });

  it('treats content-hashed chunks, versioned dictionaries and stroke files as immutable', () => {
    const { classify } = load();
    expect(classify(`${ORIGIN}/_next/static/chunks/app/page-1a2b3c.js`, 'GET', 'cors')).toBe('immutable');
    expect(classify(`${ORIGIN}/_next/static/css/abc.css`, 'GET', 'cors')).toBe('immutable');
    // lib/data/dictVersion.ts appends ?v=DICT_VERSION, so a rebuild is a different URL.
    expect(classify(`${ORIGIN}/cedict.json?v=6`, 'GET', 'cors')).toBe('immutable');
    expect(classify(`${ORIGIN}/jmdict.json?v=6`, 'GET', 'cors')).toBe('immutable');
    expect(classify(`${ORIGIN}/esdict.json?v=6`, 'GET', 'cors')).toBe('immutable');
    expect(classify(`${ORIGIN}/frdict.json?v=6`, 'GET', 'cors')).toBe('immutable');
    // `strokeDataUrl` percent-encodes the character, so this is the real shape of the request.
    expect(classify(`${ORIGIN}/strokes/%E5%A5%BD.json`, 'GET', 'cors')).toBe('immutable');
    expect(classify(`${ORIGIN}/strokes-ja/%E7%A7%81.json`, 'GET', 'cors')).toBe('immutable');
    expect(classify(`${ORIGIN}/manifest.webmanifest`, 'GET', 'cors')).toBe('immutable');
    expect(classify(`${ORIGIN}/icon.svg`, 'GET', 'cors')).toBe('immutable');
  });

  it('revalidates the Google Fonts origins, because their CSS arrives opaque', () => {
    const { classify } = load();
    expect(classify('https://fonts.googleapis.com/css2?family=Fraunces', 'GET', 'no-cors')).toBe('revalidate');
    expect(classify('https://fonts.gstatic.com/s/fraunces/v1/abc.woff2', 'GET', 'cors')).toBe('revalidate');
  });

  it('caches nothing it was not told to cache', () => {
    const { classify } = load();
    for (const path of ['/robots.txt', '/some-new-asset.json', '/favicon.ico', '/sw.js', '/cedict.json.map']) {
      expect(classify(ORIGIN + path, 'GET', 'cors')).toBe('network-only');
    }
  });
});

describe('what may be written to a cache', () => {
  const res = (over: Record<string, unknown>) => ({ ok: true, status: 200, type: 'basic', ...over });

  it('never stores a 404, because the stroke builds rely on one', () => {
    const { storable } = load();
    // scripts/build-strokes-ja.mjs leaves 63 rare JLPT kanji absent on purpose and relies on
    // them 404ing. Caching that would make a missing character permanently missing.
    expect(storable(res({ ok: false, status: 404 }))).toBe(false);
    expect(storable(res({ ok: false, status: 500 }))).toBe(false);
  });

  it('stores a plain success, and an opaque font response', () => {
    const { storable } = load();
    expect(storable(res({}))).toBe(true);
    expect(storable(res({ ok: false, status: 0, type: 'opaque' }))).toBe(true);
  });

  it('refuses a partial response and a missing one', () => {
    const { storable } = load();
    // `Cache.put` rejects a 206 outright.
    expect(storable(res({ status: 206 }))).toBe(false);
    expect(storable(undefined)).toBe(false);
    expect(storable(null)).toBe(false);
  });
});

/**
 * THE CONTROLS. Each reintroduces the bug the rule above exists to prevent, and asserts the
 * assertion actually catches it — the discipline CLAUDE.md records after the lesson-ordering
 * test and the `MODEL_ID` shape check both passed while testing nothing.
 */
describe('controls — each mutation must break the property it defends', () => {
  const src = readFileSync(SW_PATH, 'utf8');

  it('allowlisting /api/ makes the firewall fail', () => {
    const broken = src.replace(
      "const IMMUTABLE_PREFIXES = ['/_next/static/', '/strokes/', '/strokes-ja/'];",
      "const IMMUTABLE_PREFIXES = ['/_next/static/', '/strokes/', '/strokes-ja/', '/api/'];",
    );
    expect(broken).not.toBe(src);
    const { classify } = load(broken);
    expect(classify(`${ORIGIN}/api/daily-content`, 'GET', 'cors')).toBe('immutable');
  });

  it('dropping the GET guard makes a POST cacheable', () => {
    const broken = src.replace("if (method !== 'GET') return 'network-only';", '');
    expect(broken).not.toBe(src);
    const { classify } = load(broken);
    expect(classify(`${ORIGIN}/cedict.json`, 'POST', 'cors')).toBe('immutable');
  });

  it('matching a raw string instead of a parsed path lets /strokes/../api/tts through', () => {
    const broken = src.replace('const path = url.pathname;', 'const path = rawUrl.replace(self.location.origin, "");');
    expect(broken).not.toBe(src);
    const { classify } = load(broken);
    expect(classify(`${ORIGIN}/strokes/../api/tts`, 'GET', 'cors')).toBe('immutable');
  });

  it('dropping the origin check lets another host be cached as ours', () => {
    const broken = src.replace(
      "if (url.origin !== self.location.origin) {",
      "if (false) {",
    );
    expect(broken).not.toBe(src);
    const { classify } = load(broken);
    expect(classify('https://evil.example/cedict.json', 'GET', 'cors')).toBe('immutable');
  });

  it('storing a 404 would cache a deliberately-absent stroke file', () => {
    const broken = src.replace('return res.ok || res.type === \'opaque\';', 'return true;');
    expect(broken).not.toBe(src);
    const { storable } = load(broken);
    expect(storable({ ok: false, status: 404, type: 'basic' })).toBe(true);
  });
});
