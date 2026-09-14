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

   **Existing projects: also run every file in [`supabase/migrations/`](./migrations) in
   filename order.** `schema.sql` only creates the table when it is absent, so a project
   made before a column existed will not gain it from here. This is not hypothetical — the
   `decks`, `shelf` and `passage_state` columns lived only as `alter table` statements in a
   code comment for a while, so any database built from the repo silently stored nothing.
   `tests/sync.test.ts` now fails if a column is added in TypeScript without a migration.

3. **Enable auth providers** (Authentication → Providers / Sign In):
   - **Anonymous sign-ins** — required (every visitor gets a silent anonymous session
     so the budget is server-enforced).
   - **Email** — magic-link / OTP.
   - **Google** — add your Google OAuth client ID + secret. In Authentication → URL
     Configuration, set the **Site URL** and add redirect URLs (e.g.
     `http://localhost:3000/**`, `https://<your-domain>/**`). Google's authorized redirect
     URI is `https://<project-ref>.supabase.co/auth/v1/callback`.

   > **If signing in on a DEPLOYED site sends you to `localhost` — this is why.**
   >
   > The symptom is a browser error page reading *"This site can't be reached — localhost
   > refused to connect"* immediately after choosing a Google account, and it looks nothing
   > like an auth problem, which is what makes it worth writing down.
   >
   > `AuthProvider.signInWithGoogle` asks for `${window.location.origin}/auth/callback`, which
   > is correct on every origin. But Supabase **validates `redirectTo` against the redirect
   > allow-list, and silently falls back to the Site URL when it does not match** — so a
   > project still configured for local development hands every deployed user back to
   > `localhost:3000`. Nothing in the app can detect this: the redirect never returns.
   >
   > Add the deployed origin to **both** fields, not just one. The Site URL is the fallback;
   > the allow-list is what makes the app's own request legal.

4. **Set env vars** in `.env.local` (Project Settings → API):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   ```

5. **Restart** `npm run dev`.

## How it behaves once enabled

- **Guests** keep studying locally for free, and that is most of the app — your own text,
  EPUBs, the web clipper, lookups, the lesson trees and the entire SRS side never call a
  model. The one thing that costs money is having a passage WRITTEN, and the shipped guest
  limit for that is **0**: an operator-funded generation is refused with HTTP 402. A learner
  who puts their own Anthropic key in Settings is not metered at all — their key, their bill,
  no limit — and that is the route the empty state actually points at. There is no static
  fallback passage; a refusal says so rather than serving canned text. Grading falls back to
  free keyword matching for guests.
- **Signing in** (email or Google) upgrades the *same* anonymous account to permanent →
  unlimited AI **on the operator's key**, and the local deck is uploaded + synced across
  devices. srsly's own deployment deliberately sets no operator key, so what signing in buys
  there is sync; generation needs your own key whether you are signed in or not.
- The cap is **server-enforced**, so clearing `localStorage` doesn't restore generations.
  That is also the argument for 0 rather than a small number: the budget is per ANONYMOUS
  SESSION, so a fresh incognito window is a fresh allowance, and a small allowance is a speed
  bump rather than a cap. A per-IP backstop is the only real fix and is not worth writing for
  a feature that is bring-your-own-key by design.

## Changing the guest limit

It lives in **two** places that must match, and both ship at **0**:
- `guest_limit` in `consume_ai_credit()` (`supabase/schema.sql`) — the source of truth.
- `GUEST_AI_LIMIT` in `lib/aiBudget.ts` — the UI mirror only.

**Editing the file does not change a database that already exists.** `create or replace
function` only does anything when the file is actually run, so after changing the number,
paste `schema.sql` (or just [`migrations/0005_guest_limit_zero.sql`](./migrations/0005_guest_limit_zero.sql))
into the SQL Editor. A limit that lives only in the repo is a limit nobody has applied.
