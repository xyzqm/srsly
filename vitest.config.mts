import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * The three aliases the app resolves through, mirrored for the test runner.
 *
 * `@data` and `@dict` are deliberately absent from tsconfig's `paths` — that absence is what
 * keeps TypeScript from opening 29 MB of generated JSON (see lib/data/json-modules.d.ts) —
 * so they exist only in next.config.ts and have to be repeated here rather than inherited.
 * A test that imports a lemmatizer pulls a real dictionary through `@dict`, which is the
 * point: the rules under test are claims ABOUT that data, and stubbing it would test the
 * regex rather than the behaviour.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@data': path.join(import.meta.dirname, 'lib/data'),
      '@dict': path.join(import.meta.dirname, 'public'),
      '@': import.meta.dirname,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The French and Spanish suites each load a multi-megabyte dictionary.
    testTimeout: 30_000,
  },
});
