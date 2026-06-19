'use client';

/**
 * Guest AI budget — a localStorage MIRROR for instant UI only. The real cap is enforced
 * server-side by the consume_ai_credit() RPC (supabase/schema.sql); keep this number in
 * sync with the `guest_limit` there.
 */
export const GUEST_AI_LIMIT = 5;

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
