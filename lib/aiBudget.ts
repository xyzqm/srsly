'use client';

/**
 * Guest AI budget — a localStorage MIRROR for instant UI only. The real cap is enforced
 * server-side by the consume_ai_credit() RPC (supabase/schema.sql); keep this number in
 * sync with the `guest_limit` there.
 *
 * THREE A DAY, and it stopped being vestigial with migration 0008. It was ZERO for as long as
 * the operator's key was an Anthropic one with a card behind it — srsly does not fund
 * strangers' bills, so the server refused an operator-funded guest outright and there was no
 * allowance to count down. The deployment now runs a shared FREE-TIER key so that a visitor
 * can watch a passage be written without first registering with an AI provider, and a free
 * tier has no bill to run up.
 *
 * STILL NOT THE ENFORCEMENT, AND NOT THE THING THE UI READS. The limit state on screen is
 * `guestLimited` in useDailyContent, set from the server's own 402 — so this number being
 * stale cannot make a caption wrong, only a hypothetical countdown that nothing renders. The
 * server is the authority and `syncGuestAiRemaining` writes its answer back here.
 */
export const GUEST_AI_LIMIT = 3;

const KEY = 'srsly-guest-ai-used';

export function guestAiUsed(): number {
  if (typeof localStorage === 'undefined') return 0;
  return Number(localStorage.getItem(KEY) || 0) || 0;
}

export function guestAiRemaining(): number {
  return Math.max(0, GUEST_AI_LIMIT - guestAiUsed());
}

function setUsed(n: number): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, String(Math.max(0, n))); } catch { /* ignore */ }
}

/** Reflect the server's authoritative `remaining` (null = unlimited / signed in). */
export function syncGuestAiRemaining(remaining: number | null | undefined): void {
  if (remaining == null) return;
  setUsed(GUEST_AI_LIMIT - remaining);
}

/** Mark the budget exhausted (called when the server returns guest_limit). */
export function markGuestAiExhausted(): void {
  setUsed(GUEST_AI_LIMIT);
}
