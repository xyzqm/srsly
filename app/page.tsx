'use client';
import { useState, useCallback, useEffect } from 'react';
import type { TabId, PracticeMode, LanguageCode } from '@/lib/types';
import { LanguageProvider } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { addLanguage, resolveLanguages } from '@/lib/onboarding';
import AddLanguage from '@/components/level/AddLanguage';
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
  const { recordScore, recordActivity, recordAnswer } = useSRS();
  const requireSignIn = useCallback((reason?: string) => setSignIn({ open: true, reason }), []);

  /**
   * Changing tab dismisses the sign-in prompt.
   *
   * The guest-limit modal is raised by the Read tab when a generation comes back 402, which
   * is the right moment to ask. But it is app-level state and nothing closed it, so it then
   * followed you: switch to Stats to look at your heatmap and the modal was still sitting on
   * top of it, asking about a passage you had stopped trying to read. The banner inside the
   * Read tab keeps the offer available for whenever you go back.
   */
  const changeTab = useCallback((next: TabId) => {
    setSignIn(s => (s.open ? { open: false } : s));
    setTab(next);
  }, []);

  // Active study language. Persisted in prefs; drives deck namespacing, dictionary
  // lookups, proficiency labels and TTS locale via LanguageProvider below.
  const [language, setLanguage] = useState<LanguageCode>('zh');
  /** Languages the learner has added. null until prefs load — distinct from [], which is a
   *  genuinely empty account and the one state that forces onboarding. */
  const [languages, setLanguages] = useState<LanguageCode[] | null>(null);
  const [addingLanguage, setAddingLanguage] = useState(false);

  useEffect(() => {
    storage.getPrefs().then(async p => {
      const list = await resolveLanguages(p);
      // Persist the migration once. Left underived, a language removed in Settings would be
      // resurrected on the next load by the deck-derived fallback.
      if (!p.languages) await storage.savePrefs({ ...p, languages: list });
      setLanguages(list);
      // Fall back to the first added language, not 'zh' — after onboarding, 'zh' may well
      // be a language this learner never chose.
      const lang = (p.language && list.includes(p.language)) ? p.language : list[0];
      if (lang) {
        setLanguage(lang);
        setSpeechLang(getLanguageConfig(lang).bcp47);
      }
    });
  }, []);

  const handleAddLanguage = useCallback(async (lang: LanguageCode, placedLevel: number) => {
    const next = await addLanguage(lang, placedLevel);
    setLanguages(next.languages ?? [lang]);
    setLanguage(lang);
    const cfg = getLanguageConfig(lang);
    document.documentElement.setAttribute('lang', cfg.htmlLang);
    setSpeechLang(cfg.bcp47);
    setAddingLanguage(false);
  }, []);
  const handleLanguageChange = useCallback(async (lang: LanguageCode) => {
    setLanguage(lang);
    const cfg = getLanguageConfig(lang);
    document.documentElement.setAttribute('lang', cfg.htmlLang);
    setSpeechLang(cfg.bcp47);
    const prefs = await storage.getPrefs();
    await storage.savePrefs({ ...prefs, language: lang });
  }, []);

  // Which Practice mode to open in when the Vocab tab hands off: 'flash' = review what is
  // due, 'cram' = drill the whole deck ignoring due dates.
  const [studyStartMode, setStudyStartMode] = useState<PracticeMode>('flash');
  const startStudy = useCallback((mode: PracticeMode) => {
    setStudyStartMode(mode);
    changeTab('practice');
  }, [changeTab]);

  return (
    <LanguageProvider value={language}>
      <div className="relative z-[1]">
        <Header
          onOpenTheme={() => setSheetOpen(true)}
          accountSlot={<AccountChip onSignIn={() => setSignIn({ open: true })} />}
          language={language}
          languages={languages ?? []}
          onLanguageChange={handleLanguageChange}
          onAddLanguage={() => setAddingLanguage(true)}
        />
        <TabNav active={tab} onChange={changeTab} />
        <main className="max-w-[1200px] mx-auto px-7 pb-16">
          {tab === 'read' && (
            <ReadTab
              onScore={recordScore}
              onActivity={recordActivity}
              onAnswer={recordAnswer}
              onRequireSignIn={requireSignIn}
              onNavigateVocab={() => changeTab('vocab')}
            />
          )}
          {tab === 'practice' && (
            <ExtrasTab onScore={recordScore} initialMode={studyStartMode} />
          )}
          {tab === 'dash' && (
            <StatsTab onNavigateRead={() => changeTab('read')} />
          )}
          {tab === 'vocab' && (
            <VocabTab onStudy={startStudy} />
          )}
          {tab === 'settings' && (
            <SettingsTab
              languages={languages ?? []}
              onAddLanguage={() => setAddingLanguage(true)}
              onLanguagesChanged={(list, active) => {
                setLanguages(list);
                if (active) {
                  setLanguage(active);
                  const cfg = getLanguageConfig(active);
                  document.documentElement.setAttribute('lang', cfg.htmlLang);
                  setSpeechLang(cfg.bcp47);
                }
              }}
            />
          )}
        </main>
        <footer className="text-center pb-10 text-xs" style={{ color: 'var(--ink-faint)' }}>
          srsly.
        </footer>
      </div>

      {languages !== null && (addingLanguage || languages.length === 0) && (
        <AddLanguage
          added={languages}
          onDone={handleAddLanguage}
          // No cancel with nothing added: there is no app to go back to yet.
          onCancel={languages.length > 0 ? () => setAddingLanguage(false) : undefined}
        />
      )}

      <ThemeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      
      {/* FIXED: Removed "|| !signedIn" so it respects your click state perfectly */}
      <SignInModal open={signIn.open} reason={signIn.reason} onClose={() => setSignIn({ open: false })} />
    </LanguageProvider>
  );
}
