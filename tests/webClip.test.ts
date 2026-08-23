import { describe, it, expect } from 'vitest';
import { encodeClip, decodeClip, bookmarkletSource } from '@/lib/webClip';
import { MAX_PASTE_CHARS } from '@/lib/constants';

/**
 * The clip travels in the URL hash so the article never reaches a server — same promise the
 * paste and EPUB panels already make. These pin the round trip and, more importantly, the
 * ways a hash can arrive damaged.
 */
describe('a clip survives the round trip', () => {
  it('carries title and text unchanged', () => {
    const clip = { title: 'El mercado', text: 'Hoy voy al mercado con mi madre.' };
    expect(decodeClip(encodeClip(clip))).toEqual(clip);
  });

  it('handles every script the app supports', () => {
    for (const clip of [
      { title: '我的家', text: '我家有四个人：爸爸、妈妈、姐姐和我。' },
      { title: 'わたしの一日', text: '毎朝六時に起きます。' },
      { title: 'Le petit déjeuner', text: 'Je me lève à sept heures. Ma sœur boit du thé.' },
      { title: 'El mercado', text: '¿Adónde vas? — Al mercado, señora.' },
    ]) {
      expect(decodeClip(encodeClip(clip)), clip.title).toEqual(clip);
    }
  });

  // There is no separator to confuse: the payload is one JSON object, encoded whole.
  it('is not confused by a pipe in the title', () => {
    const clip = { title: 'Rock | Paper | Scissors', text: 'Some article text here.' };
    expect(decodeClip(encodeClip(clip))).toEqual(clip);
  });

  /**
   * The bug this test exists for: the payload used to be two encoded halves joined by a
   * literal `|`, and a browser percent-encodes that separator on navigation. The round-trip
   * test above passed anyway, because a string never went near a browser. Decoding through
   * a real URL object is what reproduces it.
   */
  it('survives a real browser URL, where the fragment gets re-encoded', () => {
    const clip = { title: 'Un artículo | de prueba', text: 'Hoy voy al mercado con mi madre.' };
    const url = new URL('http://localhost:3000/' + encodeClip(clip));
    expect(decodeClip(url.hash)).toEqual(clip);
  });

  it('survives newlines, quotes and percent signs', () => {
    const clip = { title: '100% "real"', text: 'Line one.\n\nLine two — 50% of it.' };
    expect(decodeClip(encodeClip(clip))).toEqual(clip);
  });
});

describe('a hash that is not a clip is not treated as one', () => {
  it.each([
    ['an ordinary anchor', '#section-2'],
    ['an empty hash', '#'],
    ['nothing at all', ''],
    ['our prefix with junk after it', '#clip=justatitle'],
    ['valid JSON with no text', `#clip=${encodeURIComponent('{"t":"T","x":""}')}`],
    ['JSON of the wrong shape', `#clip=${encodeURIComponent('["a","b"]')}`],
    ['malformed percent-encoding', '#clip=%E0%A4%A'],
  ])('returns null for %s', (_label, hash) => {
    expect(decodeClip(hash)).toBeNull();
  });
});

/**
 * The cap is the same one paste enforces, so the clipper cannot produce something the reader
 * could not have pasted by hand — and the URL stays well inside every browser's limit.
 */
describe('a clip is capped like a paste', () => {
  it('truncates an over-long article on encode', () => {
    const clip = { title: 'Long', text: 'a'.repeat(MAX_PASTE_CHARS + 5000) };
    expect(decodeClip(encodeClip(clip))!.text).toHaveLength(MAX_PASTE_CHARS);
  });

  it('truncates on decode too, so a hand-edited URL cannot smuggle more', () => {
    const payload = JSON.stringify({ t: 'T', x: 'b'.repeat(MAX_PASTE_CHARS + 100) });
    expect(decodeClip(`#clip=${encodeURIComponent(payload)}`)!.text).toHaveLength(MAX_PASTE_CHARS);
  });
});

/**
 * The bookmarklet runs in the READER'S page, not ours: it is pasted into a bookmark, so it
 * cannot import anything and has to survive being flattened into a `javascript:` URL.
 */
describe('the bookmarklet is a self-contained javascript: URL', () => {
  const src = bookmarkletSource('https://srsly.example');

  it('is a single line with no imports or template literals', () => {
    expect(src.startsWith('javascript:')).toBe(true);
    expect(src).not.toContain('\n');
    expect(src).not.toMatch(/\bimport\b|\brequire\(/);
  });

  it('points at the origin it was rendered for', () => {
    expect(src).toContain('https://srsly.example/');
    expect(bookmarkletSource('http://localhost:3000')).toContain('http://localhost:3000/');
  });

  it('sends the text as a clip hash', () => {
    expect(src).toContain('#clip=');
    expect(src).toContain('encodeURIComponent');
  });

  // Prefers a selection, then article/main, then the biggest block — and strips furniture
  // before reading text, so a clip is the article rather than the navigation.
  it('looks for the article and strips page furniture', () => {
    expect(src).toContain('getSelection');
    expect(src).toContain("querySelector('article')");
    expect(src).toMatch(/script,style,nav,header,footer,aside/);
  });

  it('caps the text at the paste limit', () => {
    expect(src).toContain(String(MAX_PASTE_CHARS));
  });
});
