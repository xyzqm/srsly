#!/usr/bin/env -S npx tsx
// One-time port of the legacy React app's deck.json export into the PoC's `deck_words`
// table (see ../supabase-deck-words.sql, which must be run first).
//
// deck.json holds the *old* DeckWord shape (lib/types.ts in the root app): dueAt/phase/
// reviews/lapses/learningStep, a bespoke FSRS-4.5 clone (lib/fsrs.ts). `deck_words` stores
// ts-fsrs's `Card` shape instead (due/state/stability/difficulty/reps/…, see
// src/lib/types.ts + src/lib/srs.ts). This script maps old -> new field-by-field; see
// toRow() below for the exact rules.
//
// Usage:
//   cd svelte-poc
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/port-deck.ts
//
// Needs the service role key (not the anon key) because it writes rows for a specific
// user_id without that user's own session — never commit this key or put it in .env.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { State } from 'ts-fsrs';
import { SUPPORTED_LANGUAGES } from '../src/lib/languageConfig.ts';
import type { LanguageCode } from '../src/lib/types.ts';

const USER_ID = '36ebaeb2-777d-405b-bee5-f13f632ae04c';
const DECK_JSON_PATH = fileURLToPath(new URL('../../deck.json', import.meta.url));
const SUPABASE_URL = readEnvFile('../.env').PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface OldWord {
  id?: string;
  h: string;
  p: string;
  m: string;
  dueAt?: string; // YYYY-MM-DD
  phase?: 'learning' | 'review';
  lapses?: number;
  reviews?: number;
  stability?: number;
  difficulty?: number;
  lastReview?: string; // YYYY-MM-DD
  learningStep?: number;
  pool?: boolean;
}

function readEnvFile(relPath: string): Record<string, string> {
  const text = readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/**
 * Old -> new state mapping:
 *   pool word (never introduced)         -> New
 *   has a real FSRS stability            -> Review (graduated)
 *   everything else with a dueAt         -> Learning, or Relearning if it's lapsed before
 * `elapsed_days` is left at 0 (ts-fsrs recomputes it from `last_review` on the next grade);
 * `scheduled_days` is back-computed from due - lastReview where both are known.
 */
function toRow(w: OldWord, lang: LanguageCode) {
  const hasStability = typeof w.stability === 'number';
  const state = w.pool
    ? State.New
    : hasStability
      ? State.Review
      : (w.lapses ?? 0) > 0
        ? State.Relearning
        : State.Learning;

  const due = w.dueAt ? parseDateOnly(w.dueAt) : new Date();
  const lastReview = w.lastReview ? parseDateOnly(w.lastReview) : null;
  const scheduledDays =
    state === State.Review && lastReview && w.dueAt
      ? Math.max(0, Math.round((due.getTime() - lastReview.getTime()) / 86_400_000))
      : 0;

  return {
    id: w.id,
    user_id: USER_ID,
    lang,
    h: w.h,
    p: w.p,
    m: w.m,
    pool: w.pool ?? false,
    due: due.toISOString(),
    stability: w.stability ?? 0,
    difficulty: w.difficulty ?? 0,
    elapsed_days: 0,
    scheduled_days: scheduledDays,
    learning_steps: w.learningStep ?? 0,
    reps: w.reviews ?? 0,
    lapses: w.lapses ?? 0,
    state,
    last_review: lastReview ? lastReview.toISOString() : null,
  };
}

async function main() {
  if (!SUPABASE_URL) throw new Error('PUBLIC_SUPABASE_URL not found in svelte-poc/.env');
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      'Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard -> Project Settings -> API) — ' +
        'the anon key cannot write another user\'s rows past RLS.',
    );
  }

  const deck = JSON.parse(readFileSync(DECK_JSON_PATH, 'utf8')) as Partial<Record<LanguageCode, OldWord[]>>;
  const rows = SUPPORTED_LANGUAGES.flatMap((lang) => (deck[lang] ?? []).map((w) => toRow(w, lang)));

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb.from('deck_words').upsert(chunk, { onConflict: 'user_id,h,m,lang' });
    if (error) throw new Error(`Upsert failed at row ${i}: ${error.message}`);
    console.log(`  upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  console.log(`Done. Upserted ${rows.length} words for user ${USER_ID}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
