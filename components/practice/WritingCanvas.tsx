"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadHanziWriter, strokeDataUrl } from '@/lib/hanziWriter';

/**
 * One character's drawing surface, in two phases: LEARN then QUIZ.
 *
 * ── A CHARACTER YOU HAVE NEVER SEEN IS TAUGHT BEFORE IT IS TESTED ──
 * It used to drop you onto a square with a grey outline and expect you to produce a character
 * you had never met — which is not a test, it is a guessing game, and every stroke after the
 * first wrong one is a guess about a guess. A new character now opens in LEARN: the strokes
 * animate in order, you can replay as often as you like, and "Got it, let me try" starts the
 * graded quiz. Nothing is scheduled until real strokes arrive, so the teaching costs the
 * scheduler nothing.
 *
 * This is where the "play the whole animation" request landed, and the position matters. As a
 * button INSIDE the quiz beside a self-grade it would be a free answer; BEFORE the quiz it is
 * simply how you meet a character.
 *
 * ── THE HINT LADDER HAS A BOTTOM RUNG, AND IT COSTS A GRADE ──
 * "Show me the next stroke" reveals one stroke. Under it, "Watch the whole character" replays
 * everything — and then RESTARTS THE SAME CHARACTER rather than moving on, so the thing you
 * just watched is the thing you immediately draw. Both set `usedHint`, which
 * `gradeFromStrokes` turns into Again, so watching is never free and never has to be argued
 * about: you were shown the answer, so the card comes back.
 *
 * That is deliberately not "grade Again and skip". Skipping would record the failure and
 * teach nothing at the one moment the learner has actually asked to be taught.
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
 * all six themes. `getComputedStyle` resolves them at mount, and a MutationObserver on the
 * theme attribute updates them live through `updateColor`.
 *
 * ── SIZING IS MEASURED, NOT ASSUMED ──
 * A ResizeObserver feeds `updateDimensions`, which resizes WITHOUT resetting the quiz — a
 * rotation mid-character keeps the strokes already drawn.
 */

interface Props {
  char: string;
  /** Never practised. Opens in Learn instead of dropping straight into the quiz. */
  isNew?: boolean;
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
 */
type StrokeJson = { strokes: string[]; medians: number[][][]; radStrokes?: number[] };

/**
 * The parts of `HanziWriter` this component drives.
 *
 * Written out rather than typed `any`, so the dependency surface is visible — and it includes
 * ONE private field. `_quiz._currentStrokeIndex` is the only route to "which stroke are they
 * stuck on", which the single-stroke hint needs; naming it here means an upstream rename shows
 * up as a type to update rather than as a hint that silently animates the wrong stroke.
 */
interface WriterHandle {
  quiz(options: Record<string, unknown>): unknown;
  cancelQuiz(): void;
  animateCharacter(options?: Record<string, unknown>): Promise<unknown>;
  hideCharacter(options?: Record<string, unknown>): Promise<unknown>;
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

/**
 * ANIMATION TIMING, AND WHY IT IS NOT THE LIBRARY'S DEFAULT.
 *
 * `delayBetweenStrokes` defaults to 1000 ms — a full second of a motionless screen between
 * every stroke. The median HSK character has 9 strokes and the worst has 23, so the default
 * spends nine to twenty-three seconds mostly showing nothing, and it does not read as
 * "deliberate", it reads as broken: you cannot tell a pause from a hang. A quarter-second is
 * long enough to see one stroke end before the next begins and short enough that the
 * character arrives as one movement.
 */
const ANIM = { strokeAnimationSpeed: 1.25, delayBetweenStrokes: 260 } as const;

export default function WritingCanvas({ char, isNew = false, onDone, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<WriterHandle | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  /** Learn teaches; quiz grades. A character with history skips straight to the quiz. */
  const [phase, setPhase] = useState<'learn' | 'quiz'>(isNew ? 'learn' : 'quiz');
  const [animating, setAnimating] = useState(false);
  /**
   * Graded already — the verdict and the Next button are on screen above this.
   *
   * The hint ladder has to switch off here, and it did not. `WritingPractice` keeps this
   * component mounted after `onDone` so the finished strokes stay visible while the verdict
   * is read, which left both hint buttons live on a card that had already been scheduled.
   * Pressing "Watch the whole character" then cancelled and restarted a quiz for a review that
   * was over, underneath a verdict describing it. `doneRef` already blocked the second grade,
   * so nothing was ever double-counted — but the controls were offering an action that could
   * not mean anything. It predates the ladder; the bottom rung only made it obvious.
   */
  const [done, setDone] = useState(false);
  const usedHintRef = useRef(false);
  const doneRef = useRef(false);

  // Latest callbacks without re-running the mount effect, which would rebuild the writer.
  const cbRef = useRef({ onDone, onUnavailable });
  cbRef.current = { onDone, onUnavailable };
  // Read inside the mount effect without making the effect depend on it — a phase change must
  // never tear down and rebuild the writer, or the strokes already drawn would vanish.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /** Start (or restart) the graded quiz on the writer we already have. */
  const startQuiz = useCallback((writer: WriterHandle) => {
    writer.quiz({
      /**
       * The automatic hint stays ON, and it costs nothing in fairness: three misses already
       * grades Again (lib/writingState.ts), so a hint arriving at that point cannot change
       * the outcome — it only lets a stuck learner finish the character instead of being
       * trapped. `usedHint` therefore tracks only the DELIBERATE reveals, which are the ones
       * a grade should answer for.
       */
      showHintAfterMisses: 3,
      onComplete: ({ totalMistakes }: { totalMistakes: number }) => {
        if (doneRef.current) return;
        doneRef.current = true;
        setDone(true);
        cbRef.current.onDone({ mistakes: totalMistakes, usedHint: usedHintRef.current });
      },
    });
  }, []);

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
        // Learn draws the character in; quiz asks the learner to. Either way it starts hidden.
        showCharacter: false,
        showOutline: true,      // the frame, not the answer — see outlineColor above
        ...ANIM,
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
      const handle = writer as unknown as WriterHandle;
      writerRef.current = handle;

      if (phaseRef.current === 'learn') {
        setAnimating(true);
        void handle.animateCharacter()
          .then(() => { if (!cancelled) setAnimating(false); })
          .catch(() => { if (!cancelled) setAnimating(false); });
      } else {
        startQuiz(handle);
      }
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
  }, [char, startQuiz]);

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

  /** Replay the whole character. Free in Learn; in the quiz the caller charges a hint first. */
  const replay = useCallback(() => {
    const w = writerRef.current;
    if (!w || animating) return;
    setAnimating(true);
    void w.animateCharacter()
      .then(() => setAnimating(false))
      .catch(() => setAnimating(false));
  }, [animating]);

  /** Learn → quiz. The character is hidden again so there is something to produce. */
  const beginQuiz = useCallback(() => {
    const w = writerRef.current;
    if (!w) return;
    setPhase('quiz');
    setAnimating(false);
    void Promise.resolve(w.hideCharacter({ duration: 120 }))
      .catch(() => {})
      .then(() => { if (writerRef.current) startQuiz(writerRef.current); });
  }, [startQuiz]);

  /** One stroke — the first rung of the ladder. */
  const showStroke = useCallback(() => {
    usedHintRef.current = true;
    // `highlightStroke` needs the index of the stroke they are stuck on, which the quiz tracks
    // internally. Reading `_quiz._currentStrokeIndex` is the only way to it; a wrong guess
    // animates the wrong stroke, so it falls back to highlighting nothing rather than lying.
    const idx = writerRef.current?._quiz?._currentStrokeIndex;
    if (typeof idx === 'number') {
      try { writerRef.current?.highlightStroke(idx); } catch { /* mid-teardown */ }
    }
  }, []);

  /**
   * The bottom rung: watch it all, then draw it now.
   *
   * The quiz is cancelled so the animation is not fighting the learner's own strokes, and
   * restarted on the SAME character afterwards — being shown a character and then moved past
   * it is the one outcome that teaches nothing. `usedHint` is set first, so however cleanly
   * they draw it afterwards the card grades Again and comes back.
   */
  const watchWhole = useCallback(() => {
    const w = writerRef.current;
    if (!w || animating) return;
    usedHintRef.current = true;
    try { w.cancelQuiz(); } catch { /* not started */ }
    setAnimating(true);
    void w.animateCharacter()
      .catch(() => {})
      .then(() => {
        setAnimating(false);
        const cur = writerRef.current;
        if (!cur) return;
        void Promise.resolve(cur.hideCharacter({ duration: 120 }))
          .catch(() => {})
          .then(() => { if (writerRef.current) startQuiz(writerRef.current); });
      });
  }, [animating, startQuiz]);

  // Nothing on the ladder can mean anything once the card is graded.
  const busy = status !== 'ready' || done;

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

      {phase === 'learn' ? (
        <>
          <div style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)', letterSpacing: '.05em', textAlign: 'center' }}>
            New character — watch the stroke order.
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <Ghost onClick={replay} disabled={busy || animating}>
              {animating ? 'Playing…' : 'Replay'}
            </Ghost>
            <button
              onClick={beginQuiz}
              disabled={busy}
              className="cursor-pointer transition-all duration-150"
              style={{
                ...mono, fontSize: 11.5, letterSpacing: '.08em', textTransform: 'uppercase',
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                padding: '9px 18px', boxShadow: '0 2px 0 var(--accent-deep)',
                opacity: busy ? 0.5 : 1,
              }}
            >
              Got it, let me try
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Ghost onClick={showStroke} disabled={busy || animating}>
            Show me the next stroke
          </Ghost>
          {/* The bottom rung, drawn quieter than the one above it so the ladder reads in order. */}
          <button
            onClick={watchWhole}
            disabled={busy || animating}
            className="cursor-pointer"
            style={{
              ...mono, fontSize: 11, letterSpacing: '.04em', padding: '4px 8px',
              background: 'none', border: 'none',
              color: 'var(--ink-faint)', textDecoration: 'underline', textUnderlineOffset: 3,
              opacity: busy || animating ? 0.5 : 1,
            }}
          >
            {animating ? 'Watching…' : 'Watch the whole character — counts as Again'}
          </button>
        </div>
      )}
    </div>
  );
}

function Ghost({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer"
      style={{
        ...mono, fontSize: 11.5, letterSpacing: '.06em', padding: '8px 14px',
        borderRadius: 8, border: '1px solid var(--line)',
        background: 'var(--card)', color: 'var(--ink-soft)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
