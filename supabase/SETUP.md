# Enabling login + cloud sync (Supabase)

Until these steps are done, srsly runs exactly as before: **guest / local-only, AI
ungated, no sign-in UI.** The whole auth + budget layer is gated on the
`NEXT_PUBLIC_SUPABASE_*` env vars being present.

## Steps

1. **Create a Supabase project** at https://supabase.com.

2. **Run the schema.** SQL Editor → paste & run [`supabase/schema.sql`](./schema.sql).
   It creates `user_data` (per-user deck/prefs/SRS as JSONB, RLS-protected), `ai_usage`
   (the guest budget counter), and the `consume_ai_credit()` function that enforces the
   limit server-side.

3. **Enable auth providers** (Authentication → Providers / Sign In):
   - **Anonymous sign-ins** — required (every visitor gets a silent anonymous session
     so the budget is server-enforced).
   - **Email** — magic-link / OTP.
   - **Google** — add your Google OAuth client ID + secret. In Authentication → URL
     Configuration, set the **Site URL** and add redirect URLs (e.g.
     `http://localhost:3000`, your prod domain). Google's authorized redirect URI is
     `https://<project-ref>.supabase.co/auth/v1/callback`.

4. **Set env vars** in `.env.local` (Project Settings → API):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   ```

5. **Restart** `npm run dev`.

## How it behaves once enabled

- **Guests** keep studying locally for free. AI passage generation is metered: the
  `consume_ai_credit()` RPC decrements a per-user credit; after **5** generations a guest
  gets HTTP 402 and the app shows a "sign in to continue" prompt (passages fall back to
  static). Grading falls back to free keyword matching for guests.
- **Signing in** (email or Google) upgrades the *same* anonymous account to permanent →
  unlimited AI, and the local deck is uploaded + synced across devices.
- The cap is **server-enforced**, so clearing `localStorage` doesn't restore generations.
  (A guest in a fresh incognito window gets a new anonymous account + budget — acceptable
  for v1; add a per-IP backstop later if needed.)

## Changing the guest limit

It lives in **two** places that must match:
- `guest_limit` in `consume_ai_credit()` (`supabase/schema.sql`) — the source of truth.
- `GUEST_AI_LIMIT` in `lib/aiBudget.ts` — the UI mirror only.
