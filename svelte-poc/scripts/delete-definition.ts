#!/usr/bin/env -S npx tsx
// One-off cleanup: delete a bad row from the shared `word_definitions` cache (e.g. a refusal
// string that got cached as a "meaning" before the getDefinition() validation fix — see
// src/lib/server/definitions.ts). Needs the secret key, same as the app's own server client.
//
// Usage:
//   cd svelte-poc
//   npx tsx scripts/delete-definition.ts <word> <lang>

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const [word, lang] = process.argv.slice(2);
if (!word || !lang) {
  console.error('Usage: npx tsx scripts/delete-definition.ts <word> <lang>');
  process.exit(1);
}

function readEnvFile(relPath: string): Record<string, string> {
  try {
    const text = readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
    const env: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
    return env;
  } catch {
    return {};
  }
}

const envFile = readEnvFile('../.env');
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? envFile.PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? envFile.SUPABASE_SECRET_KEY;

async function main() {
  const client = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
  const { data, error } = await client
    .from('word_definitions')
    .delete()
    .eq('word', word)
    .eq('lang', lang)
    .select();

  if (error) throw error;
  console.log(`Deleted ${data?.length ?? 0} row(s) for word=${word} lang=${lang}`, data);
}

main();
