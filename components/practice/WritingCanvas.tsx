'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadHanziWriter, strokeDataUrl } from '@/lib/hanziWriter';

/**
 * One character's drawing surface.
 *
 * Owns exactly one `HanziWriter` instance and the imperative mess that comes with it, so the
 * session component above stays declarative. Mounted with a `key` of the character, so every
 * character gets a fresh instance and there is no path where a half-drawn stroke carries over.
 *
 * ── touch-action: none IS THE WHOLE MOBILE STORY ──
 * hanzi-writer listens for pointer and touch moves and calls preventDefault, but a browser
 * decides whether a touch is a scroll BEFORE it delivers move events. Without `touch-action:
 * none` on the surface, dragging a finger scrolls the page and the library receives almost
 * nothing — the character simply cannot be drawn on a phone or an iPad, which is the hardware
 * this feature exists for. It is one CSS property and it is load-bearing.
 *
 * ── COLOURS ARE RESOLVED FROM CSS VARIABLES, NOT HARDCODED ──
 * The library takes hex strings and parses them into rgba, so it cannot read `var(--ink)`
 * itself. Passing its defaults (#555, #DDD) would give the one screen in the app that ignores
 * all six themes — a grey character on a paper background in ink mode. `getComputedStyle`
 * resolves them at mount, and a MutationObserver on the theme attribute updates them live
 * through `updateColor`, so switching theme mid-session does not leave a stale palette until
 * the next character.
 *
 * ── SIZING IS MEASURED, NOT ASSUMED ──
 * The canvas is a square that fills its column, so its pixel size depends on the viewport. A
 * ResizeObserver feeds `updateDimensions`, which resizes WITHOUT resetting the quiz — a
 * rotation mid-character keeps the strokes already drawn.
 */

interface Props {
  char: string;
  /** Fired once, when every stroke is done. */
  onDone: (result: { mistakes: number; usedHint: boolean }) => void;
  /** No stroke data for this character — the session skips it rather than hanging. */
  onUnavailable: () => void;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;

/**
 * The shape of one file in `public/strokes/`, declared here rather than imported.
 *
 * `CharacterJson` lives inside `hanzi-writer`, and importing it — even as a type — for a
 * component that lazily loads the module would be easy to turn into a real import by accident.
 * This is the contract the build script emits and the library consumes; if they ever diverge,
 * tests/writingState.test.ts is what notices the files stopped matching.
 */
type StrokeJson = { strokes: string[]; medians: number[][][]; radStrokes?: number[] };

/**
 * The parts of `HanziWriter` this component actually drives.
 *
 * Written out rather than typed `any`, so the dependency surface is visible: five public
 * methods and — deliberately — ONE private field. `_quiz._currentStrokeIndex` is the only
 * route to "which stroke are they stuck on", which the hint button needs; naming it here
 * means an upstream rename shows up as a type to update rather than as a hint that silently
 * animates the wrong stroke.
 */
interface WriterHandle {
  quiz(options: Record<string, unknown>): unknown;
  cancelQuiz(): void;
  updateDimensions(dims: { width: number; height: number; padding: number }): void;
  updateColor(name: string, value: string, options?: { duration?: number }): unknown;
  highlightStroke(strokeNum: number): unknown;
  _quiz?: { _currentStrokeIndex?: number };
}

/** The palette, read from whichever theme is on the body right now. */
function themeColors(): Record<string, string> {
  const s = getComputedStyle(document.body);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    // The finished strokes read as text, so they take the text colour.
    strokeColor: v('--ink', '#333'),
    // The outline is the prompt, not the answer — deliberately faint.
    outlineColor: v('--line', '#ddd'),
    // What the learner draws, in the app's accent so it reads as *theirs*.
    drawingColor: v('--accent', '#b23a2e'),
    highlightColor: v('--gold', '#b8912f'),
    radicalColor: v('--jade', '#3f7a5e'),
  };
}

export default function WritingCanvas({ char, onDone, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<WriterHandle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const usedHintRef = useRef(false);
  const doneRef = useRef(false);

  // Latest callbacks without re-running the mount effect, which would rebuild the writer.
  const cbRef = useRef({ onDone, onUnavailable });
  cbRef.current = { onDone, onUnavailable };

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void loadHanziWriter().then(mod => {
      if (cancelled || !mod || !hostRef.current) { if (!cancelled && !mod) setStatus('missing'); return; }
      const box = hostRef.current.getBoundingClientRect();
      const size = Math.max(160, Math.round(Math.min(box.width, box.height) || 260));

      const writer = mod.default.create(hostRef.current, char, {
        width: size,
        height: size,
        padding: 8,
        showCharacter: false,   // it is a quiz: the answer is what they have to produce
        showOutline: true,      // the frame, not the answer — see outlineColor above
        ...themeColors(),
        /**
         * From `public/strokes/`, srsly's own subset. A 404 is a real answer — a character
         * outside HSK — so it resolves to `onUnavailable` and the session moves on instead of
         * sitting on a blank square for ever.
         */
        charDataLoader: (c: string, onLoad: (d: StrokeJson) => void, onError: () => void) => {
          fetch(strokeDataUrl(c))
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then(onLoad)
            .catch(() => { onError(); if (!cancelled) { setStatus('missing'); cbRef.current.onUnavailable(); } });
        },
      });
      // The concrete class comes from a lazily-imported module; narrowing it to the handle
      // above is what keeps that import out of this file's type graph.
      writerRef.current = writer as unknown as WriterHandle;

      writer.quiz({
        /**
         * The automatic hint stays ON, and it costs nothing in fairness: three misses already
         * grades Again (lib/writingState.ts), so a hint arriving at that point cannot change
         * the outcome — it only lets a stuck learner finish the character instead of being
         * trapped. `usedHint` therefore tracks only the DELIBERATE "Show me", which is the
         * one a grade should answer for.
         */
        showHintAfterMisses: 3,
        onComplete: ({ totalMistakes }: { totalMistakes: number }) => {
          if (cancelled || doneRef.current) return;
          doneRef.current = true;
          cbRef.current.onDone({ mistakes: totalMistakes, usedHint: usedHintRef.current });
        },
      });
      if (!cancelled) setStatus('ready');
    });

    return () => {
      cancelled = true;
      try { writerRef.current?.cancelQuiz(); } catch { /* never started */ }
      writerRef.current = null;
      // THE LIBRARY HAS NO destroy(). It appends an SVG to the host and leaves it there, so
      // without this every character would stack another one on top of the last.
      if (host) host.innerHTML = '';
    };
  }, [char]);

  /** Keep the drawing square square, and resize without discarding drawn strokes. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const box = host.getBoundingClientRect();
      const size = Math.max(160, Math.round(Math.min(box.width, box.height) || 260));
      try { writerRef.current?.updateDimensions({ width: size, height: size, padding: 8 }); } catch { /* not mounted yet */ }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  /** Follow the theme live rather than freezing the palette at mount. */
  useEffect(() => {
    const target = document.body;
    const obs = new MutationObserver(() => {
      const colors = themeColors();
      for (const [name, value] of Object.entries(colors)) {
        try { writerRef.current?.updateColor(name, value, { duration: 0 }); } catch { /* not mounted */ }
      }
    });
    obs.observe(target, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const showStroke = useCallback(() => {
    usedHintRef.current = true;
    // `animateStroke` needs the index of the stroke they are stuck on, which the quiz tracks
    // internally. Reading `_quiz._currentStrokeIndex` is the only way to it; a wrong guess
    // animates the wrong stroke, so it falls back to highlighting nothing rather than lying.
    const idx = writerRef.current?._quiz?._currentStrokeIndex;
    if (typeof idx === 'number') {
      try { writerRef.current?.highlightStroke(idx); } catch { /* mid-teardown */ }
    }
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        style={{
          width: 'min(300px, 78vw)', aspectRatio: '1 / 1',
          border: '1px solid var(--line)', borderRadius: 12,
          background: 'var(--paper-2)',
          display: 'grid', placeItems: 'center', position: 'relative',
        }}
      >
        {/* A quarter-grid, the way squared practice paper is ruled. Purely a guide, so it sits
            under the strokes and never intercepts a pointer. */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 10, pointerEvents: 'none',
          borderLeft: '1px dashed var(--line-soft)', borderTop: '1px dashed var(--line-soft)',
          width: 'auto', height: 'auto',
          backgroundImage:
            'linear-gradient(to right, var(--line-soft) 1px, transparent 1px),' +
            'linear-gradient(to bottom, var(--line-soft) 1px, transparent 1px)',
          backgroundPosition: 'center',
          backgroundSize: '50% 50%',
          opacity: 0.55,
        }} />
        <div
          ref={hostRef}
          // THE LOAD-BEARING LINE. Without it a finger drag scrolls the page instead of
          // drawing, and the feature does not work at all on the devices it is for.
          style={{ touchAction: 'none', width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}
        />
        {status === 'loading' && (
          <div style={{ ...mono, position: 'absolute', fontSize: 11, color: 'var(--ink-faint)' }}>
            Loading strokes…
          </div>
        )}
        {status === 'missing' && (
          <div style={{ ...mono, position: 'absolute', fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', padding: 12 }}>
            No stroke data for {char}.
          </div>
        )}
      </div>

      <button
        onClick={showStroke}
        disabled={status !== 'ready'}
        className="cursor-pointer"
        style={{
          ...mono, fontSize: 11.5, letterSpacing: '.06em', padding: '8px 14px',
          borderRadius: 8, border: '1px solid var(--line)',
          background: 'var(--card)', color: 'var(--ink-soft)',
          opacity: status === 'ready' ? 1 : 0.5,
        }}
      >
        Show me the next stroke
      </button>
    </div>
  );
}
