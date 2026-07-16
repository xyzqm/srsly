import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
import type { LayoutLoad } from './$types';

// Isomorphic Supabase client: a browser client in the browser, a cookie-backed server client
// during SSR. `depends('supabase:auth')` lets the auth listener re-run every load on sign in/out.
export const load: LayoutLoad = async ({ data, depends, fetch }) => {
  depends('supabase:auth');

  const supabase = isBrowser()
    ? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, { global: { fetch } })
    : createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
        global: { fetch },
        cookies: { getAll: () => data.cookies },
      });

  // Read session/user from the client (not from `data`): the server load isn't re-run by
  // invalidate('supabase:auth'), but this universal load is — and the browser client already
  // holds the fresh session right after sign in/out, so the gate updates without a refresh.
  const { data: { session } } = await supabase.auth.getSession();
  const { data: { user } } = await supabase.auth.getUser();

  return { supabase, session, user };
};
