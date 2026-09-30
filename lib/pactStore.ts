'use client';
import { getSupabaseBrowser } from './supabase/client';
import { storage } from './storage';
import { todayStr } from './deck';
import type { LanguageCode } from './types';
import {
  contributionFor, generatePactCode, normalisePactCode,
  type Pact, type PactGoal, type PactMemberView,
} from './pact';

/**
 * Reading and writing a pact. The arithmetic is in `lib/pact.ts`, which is pure; this is the
 * round trip.
 *
 * ## WHAT IT MAY TOUCH, AND WHAT IT MAY NOT
 *
 * It READS the activity log and the shelf and writes ONE integer to its own membership row. It
 * writes nothing to FSRS, the streak, the daily budget or the activity log, and
 * `tests/pactFirewall.test.ts` asserts it cannot even import the modules that would let it —
 * the shape `tests/writingState.test.ts` established for handwriting. A goal you share with a
 * friend must never be able to move your schedule; the moment it can, missing a day costs
 * somebody else something, which is the mechanic CLAUDE.md refuses.
 *
 * ## IT IS DELIBERATELY NOT IN THE OFFLINE WRITE QUEUE
 *
 * `lib/storage/writeQueue.ts` is a map keyed by COLUMN on `user_data`, and a pact is a different
 * table entirely. Adding it would mean a second queue with a second set of rules. It does not
 * need one: the published number is a RECOMPUTATION, written with `set`, so a publish that never
 * happened costs nothing — the next one online sends the same truth. That is the reasoning
 * `passage_state` already uses to be skipped rather than queued, applied to a case where it is
 * simply true rather than a compromise.
 */

const SUPPORTED: LanguageCode[] = ['zh', 'ja', 'es', 'fr'];

export interface PactWithMembers { pact: Pact; members: PactMemberView[]; }

/** Whatever went wrong, in one word the UI can turn into a sentence. */
export type PactError = 'unavailable' | 'signed-out' | 'bad-code' | 'not-found' | 'rate-limited' | 'failed';

interface PactRow { id: string; code: string; goal_kind: string; target: number; starts: string; ends: string }
interface MemberRow { pact_id: string; user_id: string; label: string; contributed: number }

function rowToPact(r: PactRow): Pact {
  return { id: r.id, code: r.code, goal: r.goal_kind as PactGoal, target: r.target, starts: r.starts, ends: r.ends };
}

/**
 * Turn a Postgres error into one of the four things the learner can act on.
 *
 * It reads the MESSAGE, which is normally the thing this codebase warns against — but these
 * messages are ours: they are raised by `join_pact` in `supabase/schema.sql`, not echoed from a
 * third party. The fallback is `failed` rather than a guess, for the reason `GenerationError`
 * gives: telling somebody to wait when the real problem is their code is advice that can never
 * work.
 */
function classify(message: string): PactError {
  if (/sign in/i.test(message)) return 'signed-out';
  if (/too many/i.test(message)) return 'rate-limited';
  if (/no pact with that code/i.test(message)) return 'not-found';
  return 'failed';
}

/** Every pact this account belongs to, with everyone's published number. */
export async function listPacts(): Promise<PactWithMembers[] | PactError> {
  const sb = getSupabaseBrowser();
  if (!sb) return 'unavailable';
  const { data: pacts, error } = await sb.from('pacts').select('id, code, goal_kind, target, starts, ends');
  if (error) return classify(error.message);
  if (!pacts?.length) return [];
  const { data: members, error: mErr } = await sb
    .from('pact_members')
    .select('pact_id, user_id, label, contributed')
    .in('pact_id', (pacts as PactRow[]).map(p => p.id));
  if (mErr) return classify(mErr.message);
  return (pacts as PactRow[]).map(p => ({
    pact: rowToPact(p),
    members: ((members ?? []) as MemberRow[])
      .filter(m => m.pact_id === p.id)
      .map(m => ({ userId: m.user_id, label: m.label, contributed: m.contributed })),
  }));
}

export async function createPact(
  opts: { goal: PactGoal; target: number; days: number; label: string },
): Promise<string | PactError> {
  const sb = getSupabaseBrowser();
  if (!sb) return 'unavailable';
  const starts = todayStr();
  const end = new Date(`${starts}T12:00:00`);
  end.setDate(end.getDate() + Math.max(1, opts.days) - 1);
  const ends = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  const { data, error } = await sb.rpc('create_pact', {
    p_code: generatePactCode(), p_goal: opts.goal, p_target: opts.target,
    p_starts: starts, p_ends: ends, p_label: opts.label.trim().slice(0, 24),
  });
  if (error) return classify(error.message);
  return data as string;
}

export async function joinPact(code: string, label: string): Promise<string | PactError> {
  const sb = getSupabaseBrowser();
  if (!sb) return 'unavailable';
  const { data, error } = await sb.rpc('join_pact', {
    p_code: normalisePactCode(code), p_label: label.trim().slice(0, 24),
  });
  if (error) return classify(error.message);
  return data as string;
}

/**
 * Recompute this device's contribution and publish it.
 *
 * `set`, never `increment` — see `contributionFor`. The write targets only this account's row;
 * the RLS policy would refuse anything else, so the filter here is for clarity rather than for
 * safety, and both are deliberate.
 *
 * Returns the number published, or an error word. A failure is not worth surfacing loudly: the
 * next publish sends the same truth.
 */
export async function publishContribution(pact: Pact, userId: string): Promise<number | PactError> {
  const sb = getSupabaseBrowser();
  if (!sb) return 'unavailable';
  const log = await storage.getActivityLog();
  const shelves = await Promise.all(SUPPORTED.map(l => storage.getShelf(l)));
  const passageDates = shelves.flat().map(e => e.date);
  const value = contributionFor(pact, { log, passageDates });
  const { error } = await sb
    .from('pact_members')
    .update({ contributed: value, updated_at: new Date().toISOString() })
    .eq('pact_id', pact.id)
    .eq('user_id', userId);
  if (error) return classify(error.message);
  return value;
}
