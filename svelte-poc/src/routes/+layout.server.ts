import type { LayoutServerLoad } from './$types';

// Pass the auth cookies through so the isomorphic client in +layout.ts can read the session
// during SSR. Session/user themselves are derived in +layout.ts (see the note there).
export const load: LayoutServerLoad = async ({ cookies }) => {
  return { cookies: cookies.getAll() };
};
