/**
 * LRC parsing — timestamped lyrics.
 *
 * The format is one line per lyric, each prefixed with one or more timestamps:
 *
 *   [ar:Artist]                 ← metadata, no lyric
 *   [offset:-500]               ← global shift in MILLISECONDS, often negative
 *   [00:12.34]Para bailar       ← a lyric line
 *   [01:02.10][02:44.00]Chorus  ← the same line sung twice
 *
 * Two details that a naive `split('[')` gets wrong and that real files rely on: a line can
 * carry SEVERAL timestamps (a repeated chorus is written once), and the fractional part is
 * two digits in most files but three in some, meaning hundredths in one and milliseconds in
 * the other. Reading "45" as 450ms, or "450" as 4.5s, drifts the whole song.
 */

export interface LyricLine {
  timeInSeconds: number;
  text: string;
}

export interface Lrc {
  title?: string;
  artist?: string;
  lines: LyricLine[];
}

/** `[mm:ss.xx]` or `[mm:ss.xxx]` or `[mm:ss]`, captured with the rest of the line. */
const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** `[key:value]` metadata — anything whose "minutes" are not digits. */
const META = /^\[([a-z]+):(.*)\]$/i;

function fraction(raw: string | undefined): number {
  if (!raw) return 0;
  // Two digits are hundredths, three are milliseconds. Padding to three and dividing keeps
  // both readings correct without guessing from the file.
  return Number(raw.padEnd(3, '0')) / 1000;
}

/**
 * Parse an LRC file.
 *
 * Lines are returned in TIME order, not file order: a repeated chorus writes its later
 * timestamps on the same physical line, so file order and playback order are different
 * documents once any line has more than one stamp.
 */
export function parseLrc(source: string): Lrc {
  const out: LyricLine[] = [];
  let title: string | undefined;
  let artist: string | undefined;
  let offset = 0;

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // Metadata only counts when the whole line is one tag and it is not a timestamp.
    const meta = META.exec(line);
    if (meta && !/^\d+$/.test(meta[1])) {
      const key = meta[1].toLowerCase();
      const value = meta[2].trim();
      if (key === 'ti') title = value;
      else if (key === 'ar') artist = value;
      else if (key === 'offset') offset = (Number(value) || 0) / 1000;
      continue;
    }

    STAMP.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let end = 0;
    while ((m = STAMP.exec(line)) !== null) {
      // Only stamps at the START of the line are timestamps; one later is part of the lyric.
      if (m.index !== end) break;
      end = m.index + m[0].length;
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + fraction(m[3]));
    }
    if (stamps.length === 0) continue;

    const text = line.slice(end).trim();
    // A stamp with no words is a real thing — it marks an instrumental gap, and keeping it
    // is what stops the previous line staying highlighted through a guitar solo.
    for (const t of stamps) out.push({ timeInSeconds: Math.max(0, t + offset), text });
  }

  out.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
  return { title, artist, lines: out };
}

/**
 * Which line is sounding at `time`, or -1 before the first one.
 *
 * Binary search rather than a scan: this runs on every `timeupdate`, several times a second,
 * for the whole length of a song.
 */
export function activeLineIndex(lines: LyricLine[], time: number): number {
  let lo = 0, hi = lines.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeInSeconds <= time) { found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found;
}

/**
 * Map segmented sentences back onto the lyric lines they came from.
 *
 * The tokenizer is fed the whole song at once — one request rather than one per line — and
 * `splitSentences` treats a newline as a hard boundary, so lines mostly survive as sentences.
 * MOSTLY is the problem: a line containing "." or "?" splits further, and after the first
 * such line every index is off by one and every lyric highlights the wrong words.
 *
 * So the alignment is done by consuming sentences until their combined text covers the line,
 * comparing with whitespace and punctuation removed — the segmenter reflows both.
 */
export function alignToLines<T extends { text: string }[]>(
  lines: string[],
  sentences: T[],
): T[][] {
  const norm = (s: string) => s.replace(/[\s\p{P}]/gu, '').toLowerCase();
  const out: T[][] = [];
  let i = 0;

  for (const line of lines) {
    const want = norm(line);
    const group: T[] = [];
    let have = '';
    // An empty lyric line (an instrumental marker) consumes nothing.
    while (want && have.length < want.length && i < sentences.length) {
      group.push(sentences[i]);
      have += norm(sentences[i].map(t => t.text).join(''));
      i++;
    }
    out.push(group);
  }
  return out;
}


/**
 * Decode a .lrc file, which is very often NOT UTF-8.
 *
 * Lyric files carry no encoding declaration and circulate in whatever codepage the uploader's
 * machine used — Shift_JIS for Japanese, GBK for Chinese, windows-1252 for European languages.
 * `File.text()` assumes UTF-8 unconditionally, so those arrive as mojibake: the timestamps
 * still parse (they are ASCII) and every lyric is garbage, which looks exactly like a broken
 * parser rather than a broken assumption.
 *
 * THE FALLBACK IS CHOSEN BY STUDY LANGUAGE, NOT BY GUESSING. Trying decoders in a fixed order
 * with `fatal: true` looks principled and is not: Shift_JIS accepts the windows-1252 bytes of
 * `camarón` without complaint and silently returns `camar`, so a Spanish file would be
 * mangled by a Japanese decoder purely because it was tried first. The app already knows which
 * language is being studied, which is far better evidence than byte statistics — a learner
 * loading a .lrc during a Japanese session is loading Japanese lyrics.
 *
 * UTF-8 is still tried first and kept whenever it decodes cleanly, which is the common case;
 * `fatal: true` makes that a real test rather than a silent substitution of U+FFFD.
 */
const LEGACY_FALLBACK: Record<string, string> = {
  ja: 'shift_jis',
  zh: 'gb18030',
  ko: 'euc-kr',
};

export function decodeLrc(buffer: ArrayBuffer, language?: string): string {
  const bytes = new Uint8Array(buffer);

  // A byte-order mark settles it outright.
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8. Fall back to the legacy codepage this language is actually written in;
    // windows-1252 covers the Latin-script languages and never rejects a byte.
    const enc = LEGACY_FALLBACK[language ?? ''] ?? 'windows-1252';
    try {
      return new TextDecoder(enc).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }
}
