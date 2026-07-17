#!/usr/bin/env -S npx tsx
// Ad-hoc runner for `generatePassage` (src/lib/server/generate.ts) — loads it through a Vite SSR
// module graph (rather than a plain `tsx` import) so the SvelteKit-only specifiers it relies on
// ($env/dynamic/private, $lib/*) resolve exactly as they would inside the real app. Hits the
// real Anthropic API (and, for any word missing from our own dictionary, the shared Supabase
// word_definitions cache too — see getDefinition in src/lib/server/definitions.ts), so it costs
// tokens/Supabase calls and needs ANTHROPIC_API_KEY / SRSLY_API_KEY / SUPABASE_SECRET_KEY in .env.
//
// Usage:
//   npm run test-generate-passage                                    zh, level 3, no required vocab
//   npm run test-generate-passage -- ja 4                             ja, level 4, no required vocab
//   npm run test-generate-passage -- zh 3 0 "你好:nǐ hǎo:hello" "时间:shí jiān:time"
//                                                                      zh, level 3, themeOffset 0, 2 words
//
// Positional args: [lang] [level] [themeOffset] [word...], each word as "text:reading:meaning".

import { createServer } from 'vite';
import type { Word } from '../src/lib/server/generate.ts';
import type { RawTok, RawPassage } from '../src/lib/tokens.ts';
import type { LanguageCode } from '../src/lib/types.ts';

function parseWord(spec: string): Word {
  const [h, p = '', m = ''] = spec.split(':').map((x) => x.trim());
  return { h, p, m };
}

function fmtTok({ text, reading, meaning }: RawTok): string {
  return reading ? `${text}(${reading}${meaning ? `, ${meaning}` : ''})` : text;
}

function printPassage(p: RawPassage) {
  console.log(`title: ${p.title.map((t) => t.text).join('')}`);
  console.log(`  ${p.title.map(fmtTok).join(' | ')}`);
  console.log(`\nbody: ${p.body.map((t) => t.text).join('')}`);
  console.log(`  ${p.body.map(fmtTok).join(' | ')}`);
}

async function run() {
  const [langArg, levelArg, offsetArg, ...wordArgs] = process.argv.slice(2);
  const lang = (langArg === 'ja' ? 'ja' : 'zh') as LanguageCode;
  const level = levelArg ? parseInt(levelArg, 10) : 3;
  const themeOffset = offsetArg ? parseInt(offsetArg, 10) : Math.floor(Math.random() * 12);
  const words: Word[] = wordArgs.map(parseWord);

  console.log(
    `Generating passage — lang=${lang}, level=${level}, themeOffset=${themeOffset}, ` +
    `words=${words.length ? words.map((w) => w.h).join('、') : '(none — model picks freely)'}`,
  );

  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const mod = await server.ssrLoadModule('/src/lib/server/generate.ts');
    const generatePassage = mod.generatePassage as typeof import('../src/lib/server/generate.ts').generatePassage;

    const start = Date.now();
    const passage = await generatePassage(words, lang, level, themeOffset);
    console.log(`\ngenerated in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    console.log(JSON.stringify(passage, null, 2));
    console.log();
    printPassage(passage);
  } finally {
    await server.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
