import { describe, it, expect } from 'vitest';
import { parseLrc, activeLineIndex, alignToLines } from '@/lib/lrc';

describe('parseLrc', () => {
  it('reads timestamps and text', () => {
    const { lines } = parseLrc('[00:12.34]Para bailar la bamba\n[00:15.00]Se necesita');
    expect(lines).toEqual([
      { timeInSeconds: 12.34, text: 'Para bailar la bamba' },
      { timeInSeconds: 15,    text: 'Se necesita' },
    ]);
  });

  it('reads metadata without treating it as a lyric', () => {
    const lrc = parseLrc('[ti:La Bamba]\n[ar:Ritchie Valens]\n[00:01.00]Uno');
    expect(lrc.title).toBe('La Bamba');
    expect(lrc.artist).toBe('Ritchie Valens');
    expect(lrc.lines).toHaveLength(1);
  });

  it('expands a line carrying several timestamps, in time order', () => {
    // A repeated chorus is written once with every time it recurs.
    const { lines } = parseLrc('[00:30.00][01:30.00]Chorus\n[01:00.00]Verse');
    expect(lines.map(l => [l.timeInSeconds, l.text])).toEqual([
      [30, 'Chorus'], [60, 'Verse'], [90, 'Chorus'],
    ]);
  });

  it('reads two fractional digits as hundredths and three as milliseconds', () => {
    expect(parseLrc('[00:01.45]a').lines[0].timeInSeconds).toBeCloseTo(1.45);
    expect(parseLrc('[00:01.450]a').lines[0].timeInSeconds).toBeCloseTo(1.45);
    expect(parseLrc('[00:01.045]a').lines[0].timeInSeconds).toBeCloseTo(1.045);
  });

  it('applies offset, in milliseconds, including negative', () => {
    expect(parseLrc('[offset:-500]\n[00:10.00]a').lines[0].timeInSeconds).toBeCloseTo(9.5);
    expect(parseLrc('[offset:250]\n[00:10.00]a').lines[0].timeInSeconds).toBeCloseTo(10.25);
  });

  it('never produces a negative time', () => {
    expect(parseLrc('[offset:-5000]\n[00:01.00]a').lines[0].timeInSeconds).toBe(0);
  });

  it('keeps an empty stamped line, which marks an instrumental gap', () => {
    const { lines } = parseLrc('[00:01.00]Sing\n[00:20.00]\n[00:40.00]Again');
    expect(lines.map(l => l.text)).toEqual(['Sing', '', 'Again']);
  });

  it('leaves a bracket inside the lyric alone', () => {
    const { lines } = parseLrc('[00:01.00]Hey [x2] there');
    expect(lines[0].text).toBe('Hey [x2] there');
  });

  it('ignores lines with no timestamp', () => {
    expect(parseLrc('just some text\n[00:01.00]real').lines).toHaveLength(1);
  });

  it('handles CRLF files', () => {
    expect(parseLrc('[00:01.00]a\r\n[00:02.00]b').lines).toHaveLength(2);
  });

  it('accepts minutes past 99', () => {
    expect(parseLrc('[100:00.00]a').lines[0].timeInSeconds).toBe(6000);
  });
});

describe('activeLineIndex', () => {
  const lines = [0, 10, 20, 30].map(t => ({ timeInSeconds: t, text: `${t}` }));

  it('is -1 before the first line', () => {
    expect(activeLineIndex([{ timeInSeconds: 5, text: 'a' }], 1)).toBe(-1);
  });

  it('holds a line until the next one starts', () => {
    expect(activeLineIndex(lines, 10)).toBe(1);
    expect(activeLineIndex(lines, 19.99)).toBe(1);
    expect(activeLineIndex(lines, 20)).toBe(2);
  });

  it('stays on the last line past the end', () => {
    expect(activeLineIndex(lines, 9999)).toBe(3);
  });

  it('handles an empty lyric', () => {
    expect(activeLineIndex([], 5)).toBe(-1);
  });
});

describe('alignToLines', () => {
  const toks = (...w: string[]) => w.map(text => ({ text }));

  it('maps one sentence per line', () => {
    const out = alignToLines(['Hola amigo', 'Buenas noches'],
      [toks('Hola', 'amigo'), toks('Buenas', 'noches')]);
    expect(out.map(g => g.length)).toEqual([1, 1]);
    expect(out[1][0].map(t => t.text)).toEqual(['Buenas', 'noches']);
  });

  it('regroups a line the segmenter split on punctuation', () => {
    // "Vamos. Ahora" is ONE lyric line but TWO sentences — the case that shifts every
    // later line by one if alignment is done by index.
    const out = alignToLines(['Vamos. Ahora', 'Ya'],
      [toks('Vamos', '.'), toks('Ahora'), toks('Ya')]);
    expect(out[0]).toHaveLength(2);
    expect(out[1][0].map(t => t.text)).toEqual(['Ya']);
  });

  it('gives an empty instrumental line no sentences', () => {
    const out = alignToLines(['Sing', '', 'Again'],
      [toks('Sing'), toks('Again')]);
    expect(out.map(g => g.length)).toEqual([1, 0, 1]);
    expect(out[2][0].map(t => t.text)).toEqual(['Again']);
  });

  it('does not run off the end when sentences are short', () => {
    const out = alignToLines(['a', 'b', 'c'], [toks('a')]);
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual([]);
  });
});

// ── Encoding ──────────────────────────────────────────────────────────────────
import { decodeLrc } from '@/lib/lrc';

/**
 * Lyric files carry no encoding declaration and circulate in whatever codepage the uploader
 * had. `File.text()` assumes UTF-8, so a Shift_JIS file arrives as mojibake with its ASCII
 * timestamps still parsing — which looks exactly like a broken parser rather than a broken
 * assumption.
 */
describe('decodeLrc', () => {
  const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
  const bytes = (...b: number[]) => new Uint8Array(b).buffer as ArrayBuffer;

  it('reads plain UTF-8', () => {
    expect(decodeLrc(enc('[00:01.00]El camarón'), 'es')).toBe('[00:01.00]El camarón');
  });

  it('keeps UTF-8 even when a legacy fallback is configured for the language', () => {
    expect(decodeLrc(enc('[00:01.00]わたし'), 'ja')).toBe('[00:01.00]わたし');
  });

  it('strips a UTF-8 BOM rather than leaving it in the first tag', () => {
    const withBom = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode('[ti:X]')]);
    expect(decodeLrc(withBom.buffer as ArrayBuffer, 'es')).toBe('[ti:X]');
  });

  it('recovers a windows-1252 Spanish file', () => {
    // 0xF3 is ó in cp1252 and an invalid lone byte in UTF-8.
    const b = new Uint8Array([...new TextEncoder().encode('[00:01.00]camar'), 0xF3, 0x6E]);
    expect(decodeLrc(b.buffer as ArrayBuffer, 'es')).toContain('camarón');
  });

  it('does NOT let a Japanese decoder mangle a Spanish file', () => {
    // Shift_JIS accepts these bytes and silently drops the ón — which is why the fallback is
    // chosen by study language rather than by trying decoders in order.
    const b = new Uint8Array([...new TextEncoder().encode('[00:01.00]camar'), 0xF3, 0x6E]);
    expect(decodeLrc(b.buffer as ArrayBuffer, 'es')).not.toBe('[00:01.00]camar');
  });

  it('uses Shift_JIS for a Japanese session', () => {
    // 0x82 0xA0 is あ in Shift_JIS.
    const b = new Uint8Array([...new TextEncoder().encode('[00:01.00]'), 0x82, 0xA0]);
    expect(decodeLrc(b.buffer as ArrayBuffer, 'ja')).toBe('[00:01.00]あ');
  });

  it('never throws, whatever the bytes', () => {
    expect(() => decodeLrc(bytes(0xFF, 0x00, 0x91, 0xC3, 0x28, 0xED, 0xA0, 0x80), 'es')).not.toThrow();
    expect(() => decodeLrc(bytes(), 'zh')).not.toThrow();
  });

  it('a decoded file still parses to real lines', () => {
    const b = new Uint8Array([...new TextEncoder().encode('[00:02.00]caf'), 0xE9]);
    const { lines } = parseLrc(decodeLrc(b.buffer as ArrayBuffer, 'fr'));
    expect(lines[0]).toEqual({ timeInSeconds: 2, text: 'café' });
  });
});
