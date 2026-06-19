'use client';
import { createBrowserClient } from '@supabase/ssr';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True only when Supabase env is configured. When false the whole app runs in pure
 * local-guest mode (no auth, no AI metering) — exactly as it did before this feature —
 * so nothing breaks until you create a project and set the env vars.
 */
export const supabaseEnabled = !!(URL && ANON);

let cached: ReturnType<typeof createBrowserClient> | null = null;

/** Singleton browser Supabase client, or null when Supabase isn't configured. */
export function getSupabaseBrowser() {
  if (!supabaseEnabled) return null;
  if (!cached) cached = createBrowserClient(URL!, ANON!);
  return cached;
}
