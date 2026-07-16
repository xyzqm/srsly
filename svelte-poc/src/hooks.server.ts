import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
import { loadPrefs } from '$lib/server/data';
import type { Handle } from '@sveltejs/kit';

// Request-scoped Supabase server client (cookie-backed session) + a safeGetSession helper
// that validates the JWT with the auth server. The standard @supabase/ssr SvelteKit setup.
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          event.cookies.set(name, value, { ...options, path: '/' }));
      },
    },
  });

  event.locals.safeGetSession = async () => {
    const { data: { session } } = await event.locals.supabase.auth.getSession();
    if (!session) return { session: null, user: null };
    // getUser() re-validates the token against the auth server (getSession alone is spoofable).
    const { data: { user }, error } = await event.locals.supabase.auth.getUser();
    if (error) return { session: null, user: null };
    return { session, user };
  };

  return resolve(event, {
    filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version',
    // Stamp data-theme onto the SSR shell so the saved theme paints on first frame — otherwise
    // it's only set client-side after hydration (see +page.svelte), flashing the light default
    // on reload for dark-theme users. Matches on `<html` (not the full tag) so it doesn't care
    // about other attributes like `lang`.
    transformPageChunk: async ({ html }) => {
      if (!html.includes('<html')) return html;
      const { user } = await event.locals.safeGetSession();
      const theme = user ? (await loadPrefs(event.locals.supabase, user.id)).theme : 'paper';
      return html.replace('<html', `<html data-theme="${theme}"`);
    },
  });
};
