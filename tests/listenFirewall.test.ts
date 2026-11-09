import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * LISTEN & REPEAT MAY NOT SCORE, STORE, TRANSMIT — OR RECORD AT ALL.
 *
 * ── THE REMOVAL MADE THIS STRICTER, NOT LOOSER ──
 * This drill shipped as "Shadowing" and recorded the learner's voice, so the firewall had to
 * allow `getUserMedia` and `MediaRecorder` while forbidding everything that could move the
 * result off the device. The recording is gone (see `components/practice/ListenRepeat.tsx` for
 * why), so the claim on screen — *"nothing here is recorded, saved or scored"* — can now be
 * enforced at its strongest: the drill cannot reach a capture API in the first place.
 *
 * That is the better kind of guarantee, and it is the same distinction the old version's own
 * docstring drew: a promise that rests on care is a policy, and a promise that rests on which
 * functions a module can call is a fact. `getUserMedia` and `MediaRecorder` are now on the
 * forbidden list rather than exempt from it.
 *
 * ── AND IT IS STILL THE FOURTH COPY OF A POSTURE THIS PROJECT KEEPS ──
 * `lib/practiceSheet.ts`, `lib/writingState.ts` and `lib/pact.ts` each have one, for the same
 * reason: the drill grades NOTHING. A pronunciation drill that could write FSRS would be
 * scoring an accent, which nothing available here can honestly do.
 *
 * Comments are stripped first, for the reason `tests/writingState.test.ts` gives: these modules
 * name the very things they are firewalled FROM while explaining why, so a raw substring check
 * would fail on the documentation and push the next person to delete the explanation to get CI
 * green.
 */

const ROOT = resolve(import.meta.dirname, '..');
const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const MODULES = [
  'lib/listenSentences.ts',
  'components/practice/ListenRepeat.tsx',
] as const;

const present = MODULES.filter(m => existsSync(resolve(ROOT, m)));
const sources = Object.fromEntries(
  present.map(m => [m, strip(readFileSync(resolve(ROOT, m), 'utf8'))]),
) as Record<string, string>;

/** Anything that could schedule, score, count or move a streak. */
const FORBIDDEN_IMPORTS = [
  '@/lib/fsrs', '@/lib/streak', '@/lib/reviewCounts', '@/lib/drillState',
  '@/lib/writingState', '@/lib/activityLog', '@/lib/achievements',
  '@/lib/storage', '@/lib/storage/index', '@/lib/typedAnswer',
];

/**
 * Identifiers that would write something, send audio, or capture any.
 *
 * The last four are what the removal bought. `MediaRecorder` and `getUserMedia` were
 * DELIBERATELY ABSENT from this list while the drill recorded; naming them now is the whole
 * point, and a test that merely kept the old list would have let the recorder be reintroduced
 * one import at a time with the screen still promising it had not been.
 */
const FORBIDDEN_CALLS = [
  'fsrsSchedule', 'gradeCard', 'logGraded', 'bumpCount', 'applyLeech',
  'saveDrillCards', 'getDrillCards', 'setItem', 'indexedDB',
  'SpeechRecognition', 'FormData', 'XMLHttpRequest', 'sendBeacon',
  'MediaRecorder', 'getUserMedia', 'createObjectURL', 'useRecorder',
];

describe('listen & repeat cannot score, store, transmit or record', () => {
  it('the modules under test actually exist', () => {
    // A firewall over an empty list passes vacuously — the `aiGate` suite's own failure mode,
    // where a renamed directory silently switched the whole check off while reporting green.
    expect(present).toContain('components/practice/ListenRepeat.tsx');
    expect(present).toContain('lib/listenSentences.ts');
  });

  it('the recorder and its transport are gone from the tree, not merely unused', () => {
    // An unreferenced `useRecorder.ts` would keep passing every check above while sitting there
    // as an invitation. CLAUDE.md records the cost of exactly that: `StarterPanel` survived
    // unreferenced on purpose and `lib/storage/firebase.ts` was described as current for months
    // after deletion. If recording ever comes back, this line is the deliberate edit.
    expect(existsSync(resolve(ROOT, 'hooks/useRecorder.ts'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'components/practice/ShadowPlayer.tsx'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'components/practice/ShadowPractice.tsx'))).toBe(false);
  });

  describe.each(present)('%s', mod => {
    it.each(FORBIDDEN_IMPORTS)('does not import %s', spec => {
      expect(sources[mod]).not.toContain(`'${spec}'`);
    });

    it.each(FORBIDDEN_CALLS)('never names %s', id => {
      expect(sources[mod]).not.toContain(id);
    });

    it('issues no request of its own', () => {
      // `fetch(` rather than `fetch` so the word may still appear in prose that survives
      // stripping; it is the CALL that would take anything off the device.
      expect(sources[mod]).not.toMatch(/\bfetch\s*\(/);
      expect(sources[mod]).not.toMatch(/\bnavigator\.sendBeacon\b/);
      expect(sources[mod]).not.toMatch(/\bWebSocket\b/);
    });

    it('persists nothing', () => {
      expect(sources[mod]).not.toMatch(/localStorage|sessionStorage/);
      expect(sources[mod]).not.toMatch(/\bidb\b|openDB/);
    });
  });

  it('the voice is the LOCAL one, never the paid route', () => {
    // `speak()` reaches /api/tts first; `speakLocal` is the whole reason it exists. A drill
    // whose premise is "press it as often as you like" must not be one keystroke from a
    // per-press round trip.
    for (const m of present) {
      expect(sources[m]).not.toContain('/api/tts');
      if (sources[m].includes('@/lib/speech')) {
        expect(sources[m]).not.toMatch(/\bspeak\s*\(/);
      }
    }
  });
});
