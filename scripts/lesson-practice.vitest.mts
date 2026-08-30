import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * The generator in `scripts/build-lesson-practice.ts` is run BY vitest, and needs its own
 * config to be.
 *
 * It has to import the real segmenters — `segmentZh`, `segmentJa` and the two European ones
 * are TypeScript modules that pull multi-megabyte dictionaries through the `@dict` alias, and
 * there is no TypeScript runner in this project's dependencies other than vitest. Rather than
 * add one for a script that runs a handful of times a year, the script is a vitest "test" and
 * this config is what points at it. `vitest.config.mts` deliberately includes only
 * `tests/**` so the generator never runs as part of `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@data': path.join(import.meta.dirname, '../lib/data'),
      '@dict': path.join(import.meta.dirname, '../public'),
      '@': path.join(import.meta.dirname, '..'),
    },
  },
  test: {
    environment: 'node',
    include: ['scripts/build-lesson-practice.ts'],
    testTimeout: 180_000,
  },
});
