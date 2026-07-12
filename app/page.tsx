'use client';
import { useState, useCallback, useEffect } from 'react';
import type { TabId, PracticeMode, LanguageCode } from '@/lib/types';
import { LanguageProvider } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { setSpeechLang } from '@/lib/speech';
import { storage } from '@/lib/storage';
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
    fontFamily: 'var(--f-mono)',
    fontSize: 11,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    background: 'var(--card)',
    border: '1px solid var(--line)',
    color: 'var(--ink-faint)',
    borderRadius: 7,
    padding: '8px 12px',
    cursor: 'pointer',
  };
  if (signedIn) {
    const email = user?.email ?? 'account';
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span
          title={`Signed in as ${email}`}
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.02em',
            background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink-soft)',
            borderRadius: 7, padding: '8px 12px', maxWidth: 200,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {email}
        </span>
        <button onClick={signOut} style={chip} title="Sign out">
          Sign out
        </button>
      </div>
    );
  }
  return (
    <button onClick={onSignIn} style={chip}>
      Sign in
    </button>
  );
}

function AppShell() {
  const [tab, setTab] = useState<TabId>('read');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signIn, setSignIn] = useState<{ open: boolean; reason?: string }>({ open: false });
  const { recordScore } = useSRS();
  const requireSignIn = useCallback((reason?: string) => setSignIn({ open: true, reason }), []);

  // Active study language. Persisted in prefs; drives deck namespacing, dictionary
  // lookups, proficiency labels and TTS locale via LanguageProvider below.
  const [language, setLanguage] = useState<LanguageCode>('zh');
  useEffect(() => {
    storage.getPrefs().then(p => {
      const lang = p.language ?? 'zh';
      setLanguage(lang);
      setSpeechLang(getLanguageConfig(lang).bcp47);
    });
  }, []);
  const handleLanguageChange = useCallback(async (lang: LanguageCode) => {
    setLanguage(lang);
    const cfg = getLanguageConfig(lang);
    document.documentElement.setAttribute('lang', cfg.htmlLang);
    setSpeechLang(cfg.bcp47);
    const prefs = await storage.getPrefs();
    await storage.savePrefs({ ...prefs, language: lang });
  }, []);

  // Ephemeral, session-only study scope. null = the global due queue (default). Set by the
  // Vocab tab's "Study this deck" shortcut; cleared on Exit or when a focused session ends.
  // Deliberately NOT persisted — it's a temporary focus, not a saved preference.
  const [studyScope, setStudyScope] = useState<string[] | null>(null);
  // Which Practice mode to open in when a focused session launches: 'flash' = review due
  // cards, 'cram' = drill the whole deck ignoring due dates.
  const [studyStartMode, setStudyStartMode] = useState<PracticeMode>('flash');
  const startDeckStudy = useCallback((decks: string[], mode: PracticeMode) => {
    setStudyScope(decks.length ? decks : null);
    setStudyStartMode(mode);
    setTab('practice');
  }, []);
  const exitDeckStudy = useCallback(() => setStudyScope(null), []);

  return (
    <LanguageProvider value={language}>
      <div className="relative z-[1]">
        <Header
          onOpenTheme={() => setSheetOpen(true)}
          accountSlot={<AccountChip onSignIn={() => setSignIn({ open: true })} />}
          language={language}
          onLanguageChange={handleLanguageChange}
        />
        <TabNav active={tab} onChange={setTab} />
        <main className="max-w-[1200px] mx-auto px-7 pb-16">
          {tab === 'read' && (
            <ReadTab
              onScore={recordScore}
              onRequireSignIn={requireSignIn}
              studyScope={studyScope}
              onExitStudyScope={exitDeckStudy}
              onNavigateVocab={() => setTab('vocab')}
            />
          )}
          {tab === 'practice' && (
            <ExtrasTab onScore={recordScore} studyScope={studyScope} onExitStudyScope={exitDeckStudy} initialMode={studyStartMode} />
          )}
          {tab === 'dash' && (
            <StatsTab onNavigateRead={() => setTab('read')} />
          )}
          {tab === 'vocab' && (
            <VocabTab onStudyDeck={startDeckStudy} />
          )}
          {tab === 'settings' && (
            <SettingsTab />
          )}
        </main>
        <footer className="text-center pb-10 text-xs" style={{ color: 'var(--ink-faint)' }}>
          srsly.
        </footer>
      </div>

      <ThemeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      
      {/* FIXED: Removed "|| !signedIn" so it respects your click state perfectly */}
      <SignInModal open={signIn.open} reason={signIn.reason} onClose={() => setSignIn({ open: false })} />
    </LanguageProvider>
  );
}
