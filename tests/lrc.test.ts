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
