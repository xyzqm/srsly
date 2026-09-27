import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  resolve: { alias: {
    '@data': path.join(import.meta.dirname, '../lib/data'),
    '@dict': path.join(import.meta.dirname, '../public'),
    '@': path.join(import.meta.dirname, '..'),
  } },
  test: { environment: 'node', include: ['scripts/measure-fr-lemma.ts'], testTimeout: 300_000 },
});
