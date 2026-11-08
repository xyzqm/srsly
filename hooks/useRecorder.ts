'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { stopAll } from '@/lib/speech';

/**
 * Record the learner's own voice, keep it in memory, and never send it anywhere.
 *
 * ── IT IS THE OPPOSITE OF `useMic`, AND THAT IS THE POINT ──
 * `hooks/useMic.ts` streams audio to Google or Apple to be transcribed, and says so on screen
 * because this repository promises the opposite everywhere else. This does not transcribe, does
 * not score and does not upload: `getUserMedia` plus `MediaRecorder` are entirely local APIs,
 * so "stays on this device" here is a fact about which functions are called rather than a
 * policy anyone has to keep. `tests/shadowFirewall.test.ts` pins it by forbidding the imports.
 *
 * ── THE RECORDING IS DELIBERATELY NOT SAVED ──
 * A `Blob` and an object URL, replaced on the next take and revoked when it goes. No
 * IndexedDB, no localStorage, no column, no history, no "compare with last week". Partly
 * because a recording of somebody's voice is the most personal thing this app could hold and
 * the only safe amount is none; partly because `lib/epubStore.ts` already shows what a few
 * megabytes per item does to a 5 MB origin. Shadowing is a mirror, not an archive.
 *
 * ── ⚠ STOPPING THE RECORDER DOES NOT RELEASE THE MICROPHONE ──
 * `MediaRecorder.stop()` ends the recording and leaves the `MediaStream` live, which keeps the
 * browser's recording indicator lit and the OS mic claimed — visibly, on a phone, after the
 * learner thinks they have finished. Every TRACK needs `.stop()`, on stop and again on
 * unmount. Same class of leak as the `abort()` on unmount in `useMic`, and far more obvious
 * to the person using it.
 *
 * ── MIME NEGOTIATION IS MANDATORY, NOT DEFENSIVE ──
 * `new MediaRecorder(stream, { mimeType })` THROWS on a type the platform will not produce,
 * and the platforms disagree: Chromium produces WebM/Opus and Safari produces MP4/AAC. Asking
 * for either by name breaks the other, so the list is tried in order with
 * `MediaRecorder.isTypeSupported` and falls through to the platform default, which is always
 * something it can actually write.
 *
 * ── FIVE FAILURES, FIVE SENTENCES, FOR THE REASON `micMessage` GIVES ──
 * `getUserMedia` rejects with a `DOMException` whose `name` is the useful part, and the cases
 * need different answers: a declined prompt is fixable in site settings, a mic already held by
 * another app is fixable by quitting it, and no device at all is fixable by neither. Collapsing
 * them into "recording failed" is the empty-value-as-answer mistake this codebase names more
 * often than any other.
 */

export type RecorderStatus =
  /** No `MediaRecorder` or no `getUserMedia` — an old browser, or a non-secure origin. */
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'recording' }
  /** A take is held in memory and can be played back. */
  | { kind: 'ready' }
  /** The permission prompt was declined. Fixable by the learner, so the copy says how. */
  | { kind: 'denied' }
  /** No microphone on this machine. */
  | { kind: 'no-device' }
  /** There is a microphone and something else already has it. */
  | { kind: 'busy' }
  /** Page is not a secure context, so the API refuses outright. */
  | { kind: 'insecure' }
  | { kind: 'failed' };

/**
 * Tried in order. Chromium answers to the first, Safari to the third; `''` is the platform
 * default and is always last, because a recorder constructed with no type cannot throw.
 */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  '',
];

/** One sentence per failure. `idle`, `recording` and `ready` are not failures. */
export function recorderMessage(s: RecorderStatus): string | null {
  switch (s.kind) {
    case 'denied':    return 'Microphone blocked — allow it in your browser’s site settings.';
    case 'no-device': return 'No microphone found.';
    case 'busy':      return 'Something else is using the microphone. Close it and try again.';
    case 'insecure':  return 'Recording needs a secure (https) connection.';
    case 'failed':    return 'The recorder stopped unexpectedly.';
    default:          return null;
  }
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of MIME_CANDIDATES) {
    if (t === '') return '';
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* older impls throw */ }
  }
  return '';
}

/** `DOMException.name` → the sentence it deserves. */
function statusForError(err: unknown): RecorderStatus {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return { kind: 'denied' };
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')     return { kind: 'no-device' };
  if (name === 'NotReadableError' || name === 'TrackStartError')       return { kind: 'busy' };
  if (name === 'SecurityError')                                        return { kind: 'insecure' };
  return { kind: 'failed' };
}

function recordingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof MediaRecorder === 'undefined') return false;
  return !!navigator.mediaDevices?.getUserMedia;
}

export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>({ kind: 'idle' });
  /** The current take's object URL, or null. Never more than one alive at a time. */
  const [takeUrl, setTakeUrl] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const urlRef = useRef<string | null>(null);

  /**
   * Mount-gated, for the hydration reason `useMic` records: `app/page.tsx` is a client
   * component Next still prerenders, where none of these globals exist.
   */
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported(recordingSupported()); }, []);

  /** Release the microphone. The recorder stopping is not enough — see the docstring. */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch { /* already dead */ } });
    streamRef.current = null;
  }, []);

  const revoke = useCallback(() => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  }, []);

  /** Throw the take away — what "next item" means, and what unmount must also do. */
  const clear = useCallback(() => {
    revoke();
    setTakeUrl(null);
    setStatus(prev => (prev.kind === 'ready' ? { kind: 'idle' } : prev));
  }, [revoke]);

  // Unmount: release the device AND the blob. Leaving either is a leak the learner can see —
  // one as a lit recording indicator, the other as memory held for the life of the page.
  useEffect(() => () => {
    try { if (recRef.current?.state === 'recording') recRef.current.stop(); } catch { /* ignore */ }
    recRef.current = null;
    streamRef.current?.getTracks().forEach(t => { try { t.stop(); } catch { /* ignore */ } });
    streamRef.current = null;
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== 'recording') return;
    try { rec.stop(); } catch { setStatus({ kind: 'failed' }); }
  }, []);

  const start = useCallback(async () => {
    if (!recordingSupported()) { setStatus({ kind: 'unsupported' }); return; }
    if (recRef.current?.state === 'recording') return;

    // Never record the reference audio. The speaker is inches from the microphone on a phone,
    // and a take with the app's own voice under it is useless for comparing against.
    try { stopAll(); } catch { /* no synthesis here */ }

    // A new take replaces the old one, so the old URL has to go or it leaks per attempt.
    revoke();
    setTakeUrl(null);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus(statusForError(err));
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      releaseStream();
      setStatus({ kind: 'failed' });
      return;
    }
    recRef.current = rec;

    rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onerror = () => { releaseStream(); recRef.current = null; setStatus({ kind: 'failed' }); };
    rec.onstop = () => {
      // The device is released the instant recording ends, not when the component goes away.
      releaseStream();
      recRef.current = null;
      const parts = chunksRef.current;
      chunksRef.current = [];
      if (parts.length === 0) {
        // Nothing was captured. That is not a take, and presenting an empty player as one
        // would be a value meaning "nothing arrived" rendered as a value meaning "here it is".
        setStatus({ kind: 'idle' });
        return;
      }
      const blob = new Blob(parts, { type: rec.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setTakeUrl(url);
      setStatus({ kind: 'ready' });
    };

    try {
      rec.start();
      setStatus({ kind: 'recording' });
    } catch {
      releaseStream();
      recRef.current = null;
      setStatus({ kind: 'failed' });
    }
  }, [releaseStream, revoke]);

  return {
    status,
    supported,
    recording: status.kind === 'recording',
    /** The current take, or null. An object URL that is revoked when it is replaced. */
    takeUrl,
    start,
    stop,
    clear,
  };
}
