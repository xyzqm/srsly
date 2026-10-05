'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { loadGoogleIdentity, makeNonce, googleClientId } from '@/lib/auth/googleIdentity';

/**
 * Google's own rendered button, which is what the ID-token flow requires and what makes the
 * consent prompt name this site instead of `<project-ref>.supabase.co`.
 *
 * ── renderButton, NOT One Tap ──
 *
 * `google.accounts.id.prompt()` is the tempting one — no button to style around — and it is
 * allowed to do NOTHING. It is suppressed by a cooldown after a dismissal, by third-party
 * cookie settings, and by browsers that have not enabled FedCM, and in every one of those cases
 * it fails silently with no UI and no error. A sign-in control that sometimes does nothing is
 * the dead-button bug this codebase has already fixed twice. `renderButton` always draws
 * something.
 *
 * It is also Google's branding requirement, so the button not matching the rest of the sheet is
 * not a styling oversight — it is the one control here that is deliberately not ours. The width
 * is pinned to the sheet's so it does not sit oddly beside the email field.
 *
 * ── THE NONCE IS MADE ONCE, BEFORE INITIALISE ──
 *
 * Google needs the hash at configuration time, before any token exists, so the pair is created
 * here and the raw half held in a ref for the callback. Regenerating it per click would mean
 * handing Supabase a nonce that does not match the token.
 *
 * ── IT RENDERS NOTHING WHEN IT CANNOT WORK ──
 *
 * No client ID, or a script that will not load, and the caller falls back to the redirect
 * button. An empty space where a sign-in control should be is worse than a slightly uglier one.
 */
export default function GoogleIdButton({ onError }: { onError: (m: string) => void }) {
  const { signInWithGoogleCredential } = useAuth();
  const host = useRef<HTMLDivElement | null>(null);
  const nonceRaw = useRef<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { raw, hashed } = await makeNonce();
        if (!live) return;
        nonceRaw.current = raw;

        const id = await loadGoogleIdentity();
        if (!live || !host.current) return;

        id.initialize({
          client_id: googleClientId(),
          nonce: hashed,
          // Never sign somebody in without them asking. `auto_select` would hand a returning
          // visitor a session on page load, which is a decision the learner did not make.
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: (res) => {
            if (!res.credential) { onError('Google did not return a sign-in token.'); return; }
            // `.catch` as well as the error field: a rejected promise with no handler is a
            // sign-in that does nothing and says nothing, which is exactly what was reported.
            void signInWithGoogleCredential(res.credential, nonceRaw.current)
              .then(r => { if (r.error) onError(r.error); })
              .catch(e => onError(e instanceof Error ? e.message : 'Google sign-in failed.'));
          },
        });

        host.current.innerHTML = '';     // StrictMode runs this effect twice; one button only
        id.renderButton(host.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: host.current.offsetWidth || 332,
        });
      } catch (e) {
        if (!live) return;
        setFailed(true);
        onError(e instanceof Error ? e.message : 'Google sign-in could not be loaded.');
      }
    })();
    return () => { live = false; };
    // Mount-only: re-running would mint a second nonce and re-render the button beneath itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null;
  return <div ref={host} style={{ width: '100%', minHeight: 44, colorScheme: 'light' }} />;
}
