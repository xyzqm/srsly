import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * SHADOWING RECORDS YOUR VOICE, SO IT MUST BE UNABLE TO SEND IT OR KEEP IT.
 *
 * Every other claim in this app is a policy somebody has to remember. This one is meant to be
 * a FACT ABOUT WHICH FUNCTIONS EXIST: `getUserMedia` and `MediaRecorder` are local APIs, so as
 * long as nothing in these modules can reach the network or the storage layer, "stays on this
 * device" is structural. The UI says it to the learner in those words, which is exactly why it
 * cannot rest on care.
 *
 * It is also the fourth copy of a posture this project keeps — `lib/practiceSheet.ts`,
 * `lib/writingState.ts` and `lib/pact.ts` each have one — and the second reason is the same as
 * theirs: the drill grades NOTHING. A pronunciation practice that could write FSRS would be
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

/** Built across two phases; a module absent today must not silently pass once it lands. */
const MODULES = [
  'hooks/useRecorder.ts',
  'lib/shadowSentences.ts',
  'components/practice/ShadowPractice.tsx',
  'components/practice/ShadowPlayer.tsx',
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

/** Identifiers that WRITE something, or that would send audio off the device. */
const FORBIDDEN_CALLS = [
  'fsrsSchedule', 'gradeCard', 'logGraded', 'bumpCount', 'applyLeech',
  'saveDrillCards', 'getDrillCards', 'setItem', 'indexedDB',
  'SpeechRecognition', 'FormData', 'XMLHttpRequest', 'sendBeacon',
];

describe('shadowing cannot score, store or transmit', () => {
  it('the modules under test actually exist by the time the drill ships', () => {
    // A firewall over an empty list passes vacuously — the `aiGate` suite's own failure mode,
    // where a renamed directory silently switched the whole check off.
    expect(present).toContain('hooks/useRecorder.ts');
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
      // stripping; it is the CALL that would take the audio off the device.
      expect(sources[mod]).not.toMatch(/\bfetch\s*\(/);
      expect(sources[mod]).not.toMatch(/\bnavigator\.sendBeacon\b/);
      expect(sources[mod]).not.toMatch(/\bWebSocket\b/);
    });

    it('never persists the recording', () => {
      expect(sources[mod]).not.toMatch(/localStorage|sessionStorage/);
      expect(sources[mod]).not.toMatch(/\bidb\b|openDB/);
    });
  });

  it('the reference voice is the LOCAL one, never the paid route', () => {
    // `speak()` reaches /api/tts first; `speakLocal` is the whole reason it exists. A drill
    // whose premise is "costs nothing" must not be one keystroke from a per-press round trip.
    const rec = sources['hooks/useRecorder.ts'];
    expect(rec).not.toContain('/api/tts');
    for (const m of present) {
      if (sources[m].includes('@/lib/speech')) {
        expect(sources[m]).not.toMatch(/\bspeak\s*\(/);
      }
    }
  });
});
