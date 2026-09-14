'use client';

/**
 * Guest AI budget — a localStorage MIRROR for instant UI only. The real cap is enforced
 * server-side by the consume_ai_credit() RPC (supabase/schema.sql); keep this number in
 * sync with the `guest_limit` there.
 *
 * IT IS ZERO, WHICH MAKES THIS WHOLE MIRROR VESTIGIAL — deliberately, and harmlessly.
 * srsly does not fund strangers' generations: the feature is bring-your-own-key, so the
 * server refuses an operator-funded guest request outright and there is no allowance left
 * to count down. Nothing on screen reads this number — the limit state the UI renders is
 * `guestLimited` in useDailyContent, set from the 402 itself — so a zero here cannot make a
 * caption wrong. `markGuestAiExhausted()` now writes 0 meaning "none used", which reads as
 * nonsense in isolation and is why this paragraph exists rather than a cleverer constant.
 * Raise BOTH numbers to fund guests again.
 */
export const GUEST_AI_LIMIT = 0;

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
