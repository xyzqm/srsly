import { describe, it, expect } from 'vitest';
import {
  sharePrefixPresent,
  encodeShare,
  decodeShare,
  buildShareUrl,
  codecAvailable,
} from '@/lib/shareLink';
import { encodeClip, type WebClip } from '@/lib/webClip';
import { MAX_PASTE_CHARS } from '@/lib/constants';

/** High-entropy Han text: a xorshift PRNG rather than a stride pattern, so `deflate` cannot
 *  exploit a regularity real prose would never hand it. A repeated sentence compresses ~200×
 *  and would make every size assertion below meaningless. */
function hanText(n: number): string {
  let s = 0x9e3779b9, out = '';
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    out += String.fromCharCode(0x4e00 + (s % 20000));
  }
  return out;
}

const share = async (clip: WebClip) => decodeShare(await encodeShare(clip));

describe('the codec this runtime is actually using', () => {
  it('has native compression, so these tests exercise v2 rather than the fallback', () => {
    expect(codecAvailable()).toBe(true);
  });
});

describe('round trip', () => {
  it('carries title, text and language', async () => {
    const clip: WebClip = { title: 'Un día en el mercado', text: 'Fui al mercado y compré manzanas.', lang: 'es' };
    expect(await share(clip)).toEqual({ kind: 'share', clip });
  });

  /**
   * Through a REAL `URL`, not a bare string. `tests/webClip.test.ts` already paid for this
   * lesson: the v1 round-trip test passed for months while the payload was ambiguous, because a
   * string never goes near a browser's own escaping.
   */
  it('survives being put through a URL and read back off location.hash', async () => {
    const clip: WebClip = { title: 'Título con | y ~ y *', text: 'Texto con acentos: árbol, mañana, ¿qué?', lang: 'es' };
    const url = new URL('https://srsly.example/' + await encodeShare(clip));
    expect(await decodeShare(url.hash)).toEqual({ kind: 'share', clip });
  });

  it('keeps accented characters exactly, rather than normalising them', async () => {
    const clip: WebClip = { title: 'é', text: 'café  naïve  ñandú  œuvre', lang: 'fr' };
    const out = await share(clip);
    expect(out.kind === 'share' && out.clip.text).toBe('café  naïve  ñandú  œuvre');
  });

  it('omits the language when the source declared none', async () => {
    const out = await share({ title: 'T', text: 'Sin idioma.' });
    expect(out.kind === 'share' && 'lang' in out.clip).toBe(false);
  });

  it('caps the text at MAX_PASTE_CHARS, so a link can never exceed what paste allows', async () => {
    const out = await share({ title: 'T', text: 'a'.repeat(MAX_PASTE_CHARS + 5_000) });
    expect(out.kind === 'share' && out.clip.text).toHaveLength(MAX_PASTE_CHARS);
  });

  it('builds a whole URL and replaces any hash already on the base', async () => {
    const url = await buildShareUrl('https://srsly.example/?x=1#clip=stale', { title: 'T', text: 'Hola.' });
    expect(url.startsWith('https://srsly.example/?x=1#')).toBe(true);
    expect(url).not.toContain('stale');
  });
});

describe('v1 links keep working forever — a bookmarklet is never updated', () => {
  /**
   * THE CONTROL FOR THE WHOLE COMPATIBILITY CLAIM. A `#clip=` link lives in somebody's bookmark
   * bar, so retiring it is a break that is invisible here and permanent for them.
   */
  it('decodes a hash produced by the v1 encoder', async () => {
    const clip: WebClip = { title: 'Vieja', text: 'Un enlace antiguo.', lang: 'es' };
    expect(await decodeShare(encodeClip(clip))).toEqual({ kind: 'share', clip });
  });

  it('recognises both prefixes synchronously', () => {
    expect(sharePrefixPresent('#clip=abc')).toBe(true);
    expect(sharePrefixPresent('#read=abc')).toBe(true);
    expect(sharePrefixPresent('#section-3')).toBe(false);
    expect(sharePrefixPresent('')).toBe(false);
  });
});

describe('a damaged link says it is damaged, and is not reported as nothing to read', () => {
  /**
   * The distinction `ShareDecode` exists for. Compression is here because links travel through
   * apps that wrap and truncate them, so a chopped link is the LIKELY failure — and rendering it
   * as "no share present" would be a value meaning "broken" shown as one meaning "none", which is
   * the mistake this repository names four times over.
   */
  it('reports a truncated v2 body as unreadable', async () => {
    const full = await encodeShare({ title: 'T', text: hanText(2_000), lang: 'zh' });
    const chopped = full.slice(0, Math.floor(full.length * 0.6));
    expect((await decodeShare(chopped)).kind).toBe('unreadable');
  });

  it('reports a truncated v1 body as unreadable', async () => {
    const full = encodeClip({ title: 'T', text: 'Un artículo bastante largo para cortar.', lang: 'es' });
    expect((await decodeShare(full.slice(0, full.length - 12))).kind).toBe('unreadable');
  });

  it('reports an empty body as unreadable', async () => {
    expect((await decodeShare('#read=')).kind).toBe('unreadable');
  });

  it('reports a hash that is not ours as none — the control for the two above', async () => {
    expect(await decodeShare('#section-3')).toEqual({ kind: 'none' });
    expect(await decodeShare('')).toEqual({ kind: 'none' });
  });
});

describe('size, which is the reason v2 exists at all', () => {
  /**
   * The bound is STRUCTURAL rather than a compression ratio, which is what makes it safe to
   * assert on a sample. Percent-encoding spends 3 characters per UTF-8 byte, so an all-multibyte
   * script costs 9 per character; base64url spends 4 per 3 bytes, so the same character costs 4.
   * That is ~45% before `deflate` contributes anything, so this cannot pass by luck on a
   * compressible sample and cannot fail on an incompressible one.
   *
   * Measured at the time of writing: 8,000 high-entropy Han characters give v1 = 72,084 and
   * v2 = 23,292, i.e. 32.3%.
   */
  it('a full-length CJK share is less than half the size of the v1 link', async () => {
    const clip: WebClip = { title: '测试文章', text: hanText(MAX_PASTE_CHARS), lang: 'zh' };
    const v1 = encodeClip(clip).length;
    const v2 = (await encodeShare(clip)).length;
    expect(v1).toBeGreaterThan(60_000);            // the control: v1 really is enormous
    expect(v2).toBeLessThan(v1 * 0.5);
    expect(v2).toBeLessThan(30_000);
  });

  it('a Latin-script share is smaller than its v1 link too', async () => {
    const text = 'Después de la lección María subió al autobús con una canción en la cabeza. '.repeat(20).slice(0, 1_400);
    const clip: WebClip = { title: 'Título', text, lang: 'es' };
    expect((await encodeShare(clip)).length).toBeLessThan(encodeClip(clip).length);
  });

  it('uses only characters that are legal in a fragment, so nothing is escaped twice', async () => {
    const frag = await encodeShare({ title: '测试', text: hanText(500), lang: 'zh' });
    expect(frag.slice('#read='.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
