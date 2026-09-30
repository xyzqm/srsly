'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { todayStr } from '@/lib/deck';
import { daysLeft, isPactCode, pactProgress, type PactGoal } from '@/lib/pact';
import {
  listPacts, createPact, joinPact, publishContribution,
  type PactError, type PactWithMembers,
} from '@/lib/pactStore';

/**
 * A pact: you and somebody else, one target, nothing to lose.
 *
 * The rules are in `lib/pact.ts` and the round trip is in `lib/pactStore.ts`; this is the
 * screen. What it must never grow is a RANKING — `pactProgress` sorts members by label for
 * exactly that reason, so the order here cannot become a league table by anybody later
 * deciding it looked arbitrary.
 *
 * **Falling behind renders as DISTANCE REMAINING.** That is a fact about the goal rather than a
 * judgement about a person, and it is the whole difference between this and the leaderboard
 * this project refused. Nothing here is ever red, nothing counts down at anybody, and a pact
 * that runs out of days simply stops.
 *
 * **Signed-in accounts only, and that is a fact rather than a policy.** `AuthProvider` calls
 * `storage.resetToLocal()` for an anonymous user, so there is no cloud row to sync at all — a
 * pact held by one is a promise to somebody else that disappears when they clear their cache.
 */

const mono = { fontFamily: 'var(--f-mono)' } as const;
const label: React.CSSProperties = {
  ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)',
};
const field: React.CSSProperties = {
  ...mono, fontSize: 12, background: 'var(--card)', border: '1px solid var(--line)',
  borderRadius: 8, padding: '7px 10px', color: 'var(--ink)',
};
const button: React.CSSProperties = {
  ...mono, fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase',
  background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8,
  padding: '7px 13px', color: 'var(--ink)', cursor: 'pointer',
};

const GOALS: { id: PactGoal; label: string; unit: string }[] = [
  { id: 'cards',    label: 'Cards reviewed', unit: 'cards' },
  { id: 'passages', label: 'Passages read',  unit: 'passages' },
  { id: 'days',     label: 'Days studied',   unit: 'days' },
];

/** One sentence per thing that can go wrong, because "failed" is not an action. */
const SAYS: Record<PactError, string> = {
  unavailable:  'Syncing is not set up on this deployment, so pacts are unavailable.',
  'signed-out': 'Sign in with an email or Google account first — an anonymous session has nothing to sync.',
  'bad-code':   'That does not look like a pact code. They are eight characters, letters and digits.',
  'not-found':  'No pact has that code. Check it with whoever sent it.',
  'rate-limited': 'Too many join attempts today. Try again tomorrow.',
  failed:       'That did not go through. Try again in a moment.',
};

export default function PactPanel() {
  const { user, isAnonymous, signedIn } = useAuth();
  const [pacts, setPacts] = useState<PactWithMembers[] | null>(null);
  const [err, setErr] = useState<PactError | null>(null);
  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [goal, setGoal] = useState<PactGoal>('cards');
  const [target, setTarget] = useState('500');
  const [busy, setBusy] = useState(false);

  const usable = signedIn && !isAnonymous && !!user;

  const refresh = useCallback(async () => {
    const res = await listPacts();
    if (typeof res === 'string') { setErr(res); setPacts([]); return; }
    setErr(null);
    setPacts(res);
    // Publish this device's number on arrival. It is a RECOMPUTATION written with `set`, so
    // doing it on every load is free and self-healing rather than something to schedule.
    if (user) for (const p of res) void publishContribution(p.pact, user.id);
  }, [user]);

  useEffect(() => { if (usable) void refresh(); }, [usable, refresh]);

  if (!usable) return null;
  // `null` is "not loaded" and `[]` is "none yet" — two different silences, and rendering the
  // second while the first is true is the mistake this codebase names four times over.
  if (pacts === null) return null;

  async function submit(kind: 'create' | 'join') {
    setBusy(true);
    const res = kind === 'create'
      ? await createPact({ goal, target: Math.max(1, parseInt(target, 10) || 1), days: 30, label: name || 'Me' })
      : isPactCode(code) ? await joinPact(code, name || 'Me') : 'bad-code' as PactError;
    setBusy(false);
    if (typeof res === 'string' && SAYS[res as PactError]) { setErr(res as PactError); return; }
    setErr(null); setMode('none'); setCode('');
    await refresh();
  }

  return (
    <div className="rounded-[11px] px-5 py-5 mt-8" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
      <div style={label}>A pact</div>

      {pacts.length === 0 && mode === 'none' && (
        <>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.55, margin: '6px 0 12px', maxWidth: '56ch' }}>
            Agree a target with someone and both of you count toward it. There is no ranking and
            nothing to lose — you add to a total together, and falling behind only ever shows as
            how much is left.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button style={button} onClick={() => setMode('create')}>Start one</button>
            <button style={button} onClick={() => setMode('join')}>I have a code</button>
          </div>
        </>
      )}

      {mode !== 'none' && (
        <div className="flex flex-col gap-2" style={{ marginTop: 10, maxWidth: '30rem' }}>
          <input style={field} placeholder="What should they call you?" value={name} maxLength={24}
                 onChange={e => setName(e.target.value)} />
          {mode === 'join'
            ? <input style={field} placeholder="Pact code" value={code} maxLength={12}
                     onChange={e => setCode(e.target.value)} />
            : (
              <div className="flex gap-2 flex-wrap">
                <select style={field} value={goal} onChange={e => setGoal(e.target.value as PactGoal)}>
                  {GOALS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
                <input style={{ ...field, width: 100 }} inputMode="numeric" value={target}
                       onChange={e => setTarget(e.target.value)} aria-label="target" />
                <span style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)', alignSelf: 'center' }}>in 30 days</span>
              </div>
            )}
          <div className="flex gap-2">
            <button style={button} disabled={busy} onClick={() => void submit(mode)}>
              {busy ? 'Working…' : mode === 'create' ? 'Create' : 'Join'}
            </button>
            <button style={{ ...button, border: 'none', background: 'none', color: 'var(--ink-faint)' }}
                    onClick={() => { setMode('none'); setErr(null); }}>cancel</button>
          </div>
        </div>
      )}

      {err && (
        <p style={{ ...mono, fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.5, margin: '10px 0 0', maxWidth: '52ch' }}>
          {SAYS[err]}
        </p>
      )}

      {pacts.map(({ pact, members }) => {
        const p = pactProgress(pact, members);
        const left = daysLeft(pact, todayStr());
        const unit = GOALS.find(g => g.id === pact.goal)?.unit ?? '';
        return (
          <div key={pact.id} style={{ marginTop: 16 }}>
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div style={{ ...mono, fontSize: 13, color: 'var(--ink)' }}>
                {p.total.toLocaleString()} of {p.target.toLocaleString()} {unit}
              </div>
              <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)' }}>
                {p.done ? 'done together' : `${p.remaining.toLocaleString()} to go · ${left} day${left === 1 ? '' : 's'} left`}
              </div>
            </div>
            {/* One bar for the WHOLE pact, not one per person. A bar each is a race with the
                bars drawn side by side, whatever the caption says. */}
            <div style={{ height: 8, borderRadius: 4, background: 'var(--line-soft)', marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: `${(p.fraction * 100).toFixed(1)}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1" style={{ marginTop: 8 }}>
              {p.byMember.map(m => (
                <span key={m.userId} style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)' }}>
                  {m.label} · {m.contributed.toLocaleString()}
                </span>
              ))}
            </div>
            {members.length === 1 && (
              <p style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', margin: '8px 0 0' }}>
                Send them this code to join: <span style={{ color: 'var(--ink-soft)' }}>{pact.code}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
