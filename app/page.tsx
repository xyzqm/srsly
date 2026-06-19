'use client';
import { useState } from 'react';
import type { TabId } from '@/lib/types';
import Header from '@/components/Header';
import TabNav from '@/components/TabNav';
import ThemeSheet from '@/components/ThemeSheet';
import ReadTab from '@/components/read/ReadTab';
import ExtrasTab from '@/components/practice/ExtrasTab';
import StatsTab from '@/components/stats/StatsTab';
import VocabTab from '@/components/vocab/VocabTab';
import SettingsTab from '@/components/settings/SettingsTab';
import { useSRS } from '@/hooks/useSRS';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import SignInModal from '@/components/auth/SignInModal';

export default function Home() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AccountChip({ onSignIn }: { onSignIn: () => void }) {
  const { enabled, signedIn, user, signOut } = useAuth();
  if (!enabled) return null;
  const chip: React.CSSProperties = {
    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
    background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink-soft)',
    borderRadius: 7, padding: '8px 12px', cursor: 'pointer',
  };
  if (signedIn) {
    const email = user?.email ?? 'account';
    const short = email.length > 18 ? email.slice(0, 16) + '…' : email;
    return <button onClick={signOut} title={`Signed in as ${email} — sign out`} style={chip}>{short} · sign out</button>;
  }
  return <button onClick={onSignIn} style={chip}>Sign in</button>;
}

function AppShell() {
  const [tab, setTab] = useState<TabId>('read');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signIn, setSignIn] = useState<{ open: boolean; reason?: string }>({ open: false });
  const { recordScore } = useSRS();
  const requireSignIn = (reason?: string) => setSignIn({ open: true, reason });

  return (
    <>
      <div className="relative z-[1]">
        <Header onOpenTheme={() => setSheetOpen(true)} accountSlot={<AccountChip onSignIn={() => requireSignIn()} />} />
        <TabNav active={tab} onChange={setTab} />
        <main className="max-w-[1200px] mx-auto px-7 pb-16">
          {tab === 'read' && (
            <ReadTab
              onScore={recordScore}
              onNavigatePractice={() => setTab('practice')}
              onRequireSignIn={requireSignIn}
            />
          )}
          {tab === 'practice' && (
            <ExtrasTab onScore={recordScore} />
          )}
          {tab === 'dash' && (
            <StatsTab onNavigateRead={() => setTab('read')} />
          )}
          {tab === 'vocab' && (
            <VocabTab />
          )}
          {tab === 'settings' && (
            <SettingsTab />
          )}
        </main>
        <footer className="text-center pb-10 text-xs" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', letterSpacing: '.04em' }}>
          srsly.
        </footer>
      </div>

      <ThemeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <SignInModal open={signIn.open} reason={signIn.reason} onClose={() => setSignIn({ open: false })} />
    </>
  );
}
