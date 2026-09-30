import { MAX_PASTE_CHARS } from './constants';
import { CLIP_PREFIX, encodeClip, decodeClip, type WebClip } from './webClip';

/**
 * Sharing something you are reading — the web clipper pointed the other way.
 *
 * ## WHY THIS EXISTS, IN THE CODEBASE'S OWN WORDS
 *
 * `ReadTab` clears the clip hash as soon as it reads it, and says why: refreshing must not
 * re-import the same article, and "an 8,000-character fragment sitting in the address bar is
 * something the reader might copy and share without realising what is in it."
 *
 * This module does not contradict that sentence, it ANSWERS it. Sharing stops being an accident
 * of a URL nobody read and becomes a deliberate act, with a sentence next to the button saying
 * what travels. The hash was always shareable; what was missing was the learner knowing it.
 *
 * It is also the only social mechanic that suits this app rather than a different one. An app
 * with nothing but scores can only share a score; srsly can share the TEXT, and the recipient
 * reads it segmented at THEIR level against THEIR deck — one article, two readers, two
 * readability figures, and no server in the middle.
 *
 * ## A SHARED PASSAGE ARRIVES AS READING, NEVER AS AN EXERCISE
 *
 * A generated passage is shareable, and what lands on the other side is a `WebClip` — which
 * `ReadTab` treats as the learner's own text: no blanks, no grading, no schedule touched. That is
 * not a simplification, it is the contract in "Only GENERATED passages have blanks" applied
 * correctly. A generated passage may fairly test you because it was written around the words
 * *you* owe today; it carries no such licence over somebody else's deck, and blanking it against
 * theirs would ask them to recall words chosen for a stranger.
 *
 * ## THE BROWSER IS NOT WHY THIS COMPRESSES, AND THE FIRST DRAFT SAID IT WAS
 *
 * The claim was that a full-length clip is too long for a URL. Measured against the live site
 * rather than reasoned about: 8,000 Han characters percent-encode to a 72,146-character URL, and
 * all 8,000 ARRIVE INTACT through a real page load. The clipper has never been broken, and a
 * `#clip=` link needs nothing done to it.
 *
 * What is new here is the TRANSPORT. A bookmarklet's URL is machine-generated and seen by nobody;
 * a share link is pasted into a messenger, an email or a chat channel that wraps it, truncates it
 * and fetches it for a preview — and a 72,000-character link is not a shareable object whatever
 * Chrome tolerates. Measured on this repo's own authored prose: percent-encoding costs 8.60× raw
 * for CJK and 1.52× for Latin script, and `deflate-raw` + base64url lands at 24% and 48% of that.
 *
 * Third-party messenger behaviour is NOT measured, so the target is a judgement rather than a
 * number, and this comment says so instead of implying a test was run.
 *
 * ## base64url, SO THERE IS NOTHING LEFT TO PERCENT-ENCODE
 *
 * The alphabet is `A–Z a–z 0–9 - _`, every character of which is legal in a fragment as-is. That
 * is half the saving: v1 spends its bytes twice, once on UTF-8 and again on `%XX` per byte.
 *
 * ## `#clip=` IS DECODED FOREVER
 *
 * A bookmarklet lives in someone's bookmark bar and is never updated. Retiring v1 would be a
 * break that is invisible to us and permanent for them, so `decodeShare` reads both and
 * `encodeShare` falls back to v1 wholesale on a browser without the codec.
 */

/** v2: `deflate-raw` + base64url. A second prefix rather than a flag inside the payload, so
 *  which codec to use is answerable without decoding anything. */
const SHARE_PREFIX = '#read=';

/**
 * Is this hash one of ours? SYNCHRONOUS, AND THAT IS THE ENTIRE POINT OF IT EXISTING.
 *
 * `DecompressionStream` is async, and two callers decide LAYOUT before anything can be awaited:
 * `initialTab()` in `app/page.tsx` is a lazy `useState` initialiser, and `ReadSections` picks its
 * default section the same way. Neither can wait for a payload. Both only ever needed to know
 * whether a share is present, never what is in it — so the prefix answers them, and the decode
 * happens later, inside the component that renders the text.
 */
export function sharePrefixPresent(hash: string): boolean {
  return hash.startsWith(SHARE_PREFIX) || hash.startsWith(CLIP_PREFIX);
}

/**
 * The outcome of reading a hash, as three cases rather than `WebClip | null`.
 *
 * `unreadable` is the one worth separating, and it is the likely failure in practice: the whole
 * reason this module compresses is that links travel through apps which wrap and truncate them,
 * and a truncated share is a real event that deserves a sentence. Folding it into `none` would
 * render a damaged link as "there is nothing to read", which is the mistake this repository names
 * four times over.
 */
export type ShareDecode =
  | { kind: 'none' }
  | { kind: 'share'; clip: WebClip }
  | { kind: 'unreadable'; why: string };

const CHUNK = 0x2000;

/** Spreading a whole 8 kB array into `fromCharCode` throws `Maximum call stack size exceeded`,
 *  so the binary string is built in chunks. Found the obvious way. */
function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The return type is pinned to `Uint8Array<ArrayBuffer>` rather than left inferred, because
 *  `BlobPart` rejects the `ArrayBufferLike` form — a `SharedArrayBuffer` cannot back a Blob. */
function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Whether this runtime can do v2 at all. Safari gained `CompressionStream` in 16.4 and Firefox
 *  in 113, so this is a floor rather than a live concern — but a share link that silently fails
 *  is worse than a long one that works. */
export function codecAvailable(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/**
 * `Blob(...).stream().pipeThrough(...)` rather than a writer.
 *
 * Taking `writable.getWriter()` and awaiting `write()` before reading `readable` DEADLOCKS once
 * the payload exceeds the stream's internal buffer — the write cannot complete until something
 * drains the other end, and nothing is draining it yet. Piping has no such ordering to get wrong.
 */
async function pipe(data: BlobPart, transform: CompressionStream | DecompressionStream): Promise<ArrayBuffer> {
  const stream = new Blob([data]).stream().pipeThrough(transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return await new Response(stream as unknown as ReadableStream).arrayBuffer();
}

/** The payload, exactly v1's field names so one JSON shape serves both codecs. */
function payloadOf(clip: WebClip): string {
  return JSON.stringify({
    t: clip.title,
    x: clip.text.slice(0, MAX_PASTE_CHARS),
    ...(clip.lang ? { l: clip.lang } : {}),
  });
}

/**
 * Build the fragment for a share link, including its leading `#`.
 *
 * Falls back to the v1 encoding when the runtime has no codec: a longer link that works
 * everywhere beats a shorter one that cannot be produced.
 */
export async function encodeShare(clip: WebClip): Promise<string> {
  if (!codecAvailable()) return encodeClip(clip);
  try {
    const buf = await pipe(new TextEncoder().encode(payloadOf(clip)), new CompressionStream('deflate-raw'));
    return SHARE_PREFIX + toBase64Url(new Uint8Array(buf));
  } catch {
    return encodeClip(clip);   // a codec that exists and threw is still a reason to send v1
  }
}

/** A whole share URL. `base` is an origin plus path — never a hash, which this replaces. */
export async function buildShareUrl(base: string, clip: WebClip): Promise<string> {
  return base.replace(/#.*$/, '') + await encodeShare(clip);
}

/**
 * Read a hash. Handles both codecs, and reports a damaged link as damaged.
 *
 * Deliberately forgiving in the same way `decodeClip` is: a hash can be mangled by a link
 * shortener, a chat app or a manual copy-paste, and the honest response is to say so rather than
 * to throw on somebody's first visit.
 */
export async function decodeShare(hash: string): Promise<ShareDecode> {
  if (hash.startsWith(CLIP_PREFIX)) {
    const clip = decodeClip(hash);
    return clip ? { kind: 'share', clip } : { kind: 'unreadable', why: 'truncated' };
  }
  if (!hash.startsWith(SHARE_PREFIX)) return { kind: 'none' };
  if (!codecAvailable()) return { kind: 'unreadable', why: 'unsupported' };

  const body = hash.slice(SHARE_PREFIX.length);
  if (!body) return { kind: 'unreadable', why: 'truncated' };
  try {
    const buf = await pipe(fromBase64Url(body), new DecompressionStream('deflate-raw'));
    const parsed = JSON.parse(new TextDecoder().decode(buf)) as { t?: unknown; x?: unknown; l?: unknown };
    const text = typeof parsed?.x === 'string' ? parsed.x.trim() : '';
    if (!text) return { kind: 'unreadable', why: 'truncated' };
    return {
      kind: 'share',
      clip: {
        title: typeof parsed.t === 'string' ? parsed.t.trim() : '',
        text: text.slice(0, MAX_PASTE_CHARS),
        ...(typeof parsed.l === 'string' && parsed.l.trim() ? { lang: parsed.l.trim().slice(0, 20) } : {}),
      },
    };
  } catch {
    // Bad base64, a corrupt deflate stream, or JSON that stops mid-object — all of which are
    // what a link chopped in half by a messenger looks like from here.
    return { kind: 'unreadable', why: 'truncated' };
  }
}
