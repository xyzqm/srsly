'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
}

export default function SignInModal({ open, onClose, reason }: Props) {
  const { signInWithEmail, signInWithGoogle, enabled } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function doEmail() {
    setBusy(true); setErr('');
    const { error } = await signInWithEmail(email);
    setBusy(false);
    if (error) setErr(error); else setSent(true);
  }

  async function doGoogle() {
    setErr('');
    const { error } = await signInWithGoogle();
    if (error) setErr(error);
  }

  return (
    <div
      style={{ 
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(20,18,16,.45)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="animate-rise"
        style={{ width: 380, maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '26px 24px', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}
      >
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-.01em' }}>
          Sign in to srsly
        </div>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, lineHeight: 1.55, margin: '8px 0 18px' }}>
          {reason ?? 'Sync your deck and progress across devices and unlock unlimited AI-generated content.'}
        </p>

        {!enabled ? (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', lineHeight: 1.6 }}>
            Sign-in isn’t configured yet. Add a Supabase project and the
            <code style={{ margin: '0 4px' }}>NEXT_PUBLIC_SUPABASE_*</code> env vars.
          </div>
        ) : sent ? (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--jade)', lineHeight: 1.6 }}>
            Check your email — we sent a sign-in link to <strong>{email.trim()}</strong>.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={doGoogle}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 12, borderRadius: 8, padding: '11px 14px', width: '100%', background: 'var(--paper-2)', color: 'var(--ink)', border: '1px solid var(--line)', cursor: 'pointer' }}
            >
              Continue with Google
            </button>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: '100%', fontFamily: 'var(--f-mono)', fontSize: 13, background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--ink)', outline: 'none' }}
            />
            <button
              onClick={doEmail}
              disabled={busy}
              style={{ fontFamily: 'var(--f-mono)', fontSize: 12, borderRadius: 8, padding: '11px 14px', width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {err && <div style={{ color: 'var(--accent)', fontFamily: 'var(--f-mono)', fontSize: 11.5 }}>{err}</div>}
          </div>
        )}

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          style={{
            marginTop: 20,
            fontFamily: 'var(--f-mono)',
            fontSize: 12,
            background: 'none',
            border: 'none',
            color: 'var(--ink-faint)',
            cursor: 'pointer',
            width: '100%',
            textDecoration: 'underline'
          }}
        >
          {sent ? 'Done' : 'Maybe later'}
        </button>
      </div>
    </div>
  );
}
