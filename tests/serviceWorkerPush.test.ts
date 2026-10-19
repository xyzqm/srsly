/**
 * The push handlers, RUN rather than grepped.
 *
 * `tests/serviceWorker.test.ts` says why at length: asserting against source text catches a
 * deletion and nothing else. These two handlers have rules that are invisible in a grep and
 * expensive to get wrong — a push that shows nothing is replaced by the browser's own "site
 * updated in the background" notice, and a click that always opens a window loses the learner's
 * place in the copy they already had open.
 *
 * The worker is a classic script, so it cannot be imported; it is plain JavaScript, so it can
 * be executed with a stub `self`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = 'https://srsly.example';
const SW_PATH = resolve(__dirname, '../public/sw.js');

interface Shown { title: string; options: Record<string, unknown> }

function load() {
  const events: Record<string, (e: unknown) => void> = {};
  const shown: Shown[] = [];
  const opened: string[] = [];
  const focused: string[] = [];
  const navigated: string[] = [];
  let clientList: { url: string }[] = [];
  /** Promises handed to waitUntil, so a test can await what the handler kept alive. */
  const kept: Promise<unknown>[] = [];

  const self: Record<string, unknown> = {
    location: { origin: ORIGIN },
    addEventListener: (kind: string, fn: (e: unknown) => void) => { events[kind] = fn; },
    skipWaiting: () => {},
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => clientList.map(c => ({
        url: c.url,
        focus: async function (this: { url: string }) {
          focused.push(this.url);
          return {
            url: this.url,
            navigate: async (u: string) => { navigated.push(u); return null; },
          };
        },
      })),
      openWindow: async (u: string) => { opened.push(u); return null; },
    },
  };
  const caches = { open: async () => ({ match: async () => undefined, put: async () => {} }), keys: async () => [], delete: async () => true };
  const fetchStub = async () => ({ ok: true, status: 200, type: 'basic', clone: () => ({}) });
  new Function('self', 'caches', 'fetch', readFileSync(SW_PATH, 'utf8'))(self, caches, fetchStub);

  const evt = (extra: Record<string, unknown>) => ({
    waitUntil: (p: Promise<unknown>) => { kept.push(p); },
    ...extra,
  });

  return {
    push: async (payload?: unknown) => {
      events.push(evt({ data: payload === undefined ? null : { json: () => payload } }));
      await Promise.all(kept);
    },
    /** `event.data` is present but malformed — the second half of "always show something". */
    pushThrowing: async () => {
      events.push(evt({ data: { json: () => { throw new SyntaxError('not json'); } } }));
      await Promise.all(kept);
    },
    click: async (data?: Record<string, unknown>, clients: { url: string }[] = []) => {
      clientList = clients;
      let closed = false;
      events.notificationclick(evt({
        notification: { close: () => { closed = true; }, data },
      }));
      await Promise.all(kept);
      return closed;
    },
    shown, opened, focused, navigated,
  };
}

describe('a push always shows something', () => {
  it('renders the payload it was sent', async () => {
    const sw = load();
    await sw.push({ title: 'srsly', body: 'Your words are waiting.', url: '/', tag: 'srsly-daily' });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe('srsly');
    expect(sw.shown[0].options.body).toBe('Your words are waiting.');
  });

  it('still shows one when the payload is missing', async () => {
    // ⚠ THE RULE THAT MATTERS. `userVisibleOnly: true` is required at subscribe time, and a
    // handler that resolves without showing anything makes Chrome substitute its own "This
    // site has been updated in the background" notice — worse than the reminder we meant.
    const sw = load();
    await sw.push(undefined);
    expect(sw.shown).toHaveLength(1);
    expect(String(sw.shown[0].title)).toBeTruthy();
  });

  it('still shows one when the payload will not parse', async () => {
    // The other half of the same rule, and a different code path: `event.data` EXISTS but
    // `.json()` throws. A handler that let that propagate would reject the event and show
    // nothing, which is the browser's generic notice again.
    const sw = load();
    await sw.pushThrowing();
    expect(sw.shown).toHaveLength(1);
    expect(String(sw.shown[0].title)).toBeTruthy();
  });

  it('tags the notification so two days do not stack into a pile', async () => {
    const sw = load();
    await sw.push({ title: 'srsly', body: 'x', tag: 'srsly-daily' });
    expect(sw.shown[0].options.tag).toBe('srsly-daily');
  });
});

describe('tapping a reminder', () => {
  it('focuses an app window that is already open rather than opening a second', async () => {
    const sw = load();
    await sw.click({ url: '/' }, [{ url: `${ORIGIN}/` }]);
    expect(sw.focused).toEqual([`${ORIGIN}/`]);
    expect(sw.opened).toEqual([]);
  });

  it('opens a window when there is none', async () => {
    const sw = load();
    await sw.click({ url: '/' }, []);
    expect(sw.opened).toEqual(['/']);
  });

  it('ignores a window on another origin', async () => {
    // The control. `focus()` on somebody else's tab is both pointless and not ours to do, so
    // a foreign client must fall through to opening our own.
    const sw = load();
    await sw.click({ url: '/' }, [{ url: 'https://example.com/other' }]);
    expect(sw.focused).toEqual([]);
    expect(sw.opened).toEqual(['/']);
  });

  it('closes the notification it was called for', async () => {
    const sw = load();
    expect(await sw.click({ url: '/' }, [])).toBe(true);
  });
});
