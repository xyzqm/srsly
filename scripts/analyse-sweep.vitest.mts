import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * `scripts/analyse-sweep.ts` reads a sweep's dumps and reports what share of each passage sits
 * ABOVE the level it was written for, using `lib/readability.ts` — the app's own metric, on the
 * app's own normalised tokens. Needs its own config for the reason
 * `lesson-practice.vitest.mts` gives: it imports TypeScript that pulls multi-megabyte data
 * through `@data` / `@dict`, and vitest is the only TypeScript runner this project depends on.
 *
 *   SWEEP_DIR=/tmp/sweep-groq npx vitest run --config scripts/analyse-sweep.vitest.mts
 *
 * `vitest.config.mts` includes only `tests/**`, so this never runs as part of `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@data': path.join(import.meta.dirname, '../lib/data'),
      '@dict': path.join(import.meta.dirname, '../public'),
      '@': path.join(import.meta.dirname, '..'),
    },
  },
  test: { environment: 'node', include: ['scripts/analyse-sweep.ts'], testTimeout: 300_000 },
});
