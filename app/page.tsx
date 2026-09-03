'use client';
import { useState, useCallback, useEffect } from 'react';
import type { TabId, LanguageCode } from '@/lib/types';
import { LanguageProvider } from '@/lib/LanguageContext';
import { getLanguageConfig, SUPPORTED_LANGUAGES } from '@/lib/languageConfig';
import { languageFromTag } from '@/lib/languageMismatch';
import { decodeClip } from '@/lib/webClip';
import { addLanguage, resolveLanguages } from '@/lib/onboarding';
import AddLanguage from '@/components/level/AddLanguage';
import { setSpeechLang } from '@/lib/speech';
import { storage } from '@/lib/storage';
import Header from '@/components/Header';
import TabNav from '@/components/TabNav';
import ThemeSheet from '@/components/ThemeSheet';
import TabPanel from '@/components/TabPanel';
import dynamic from 'next/dynamic';
import { hasLessons } from '@/lib/lessons';

/**
 * The Learn tab carries its whole lesson tree, and is the one tab most learners never open —
 * it does not even exist outside French. Loading it on demand keeps 12 kB of prose out of the
 * initial bundle, the same discipline the level tables follow. `ssr: false` because it renders
 * from localStorage.
 */
const LearnTab = dynamic(() => import('@/components/learn/LearnTab'), { ssr: false });
import ReadTab from '@/components/read/ReadTab';
import SrsTab from '@/components/practice/SrsTab';
import StatsTab from '@/components/stats/StatsTab';
import VocabTab from '@/components/vocab/VocabTab';
import SettingsTab from '@/components/settings/SettingsTab';
import { useSRS } from '@/hooks/useSRS';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import ToastHost from '@/components/shared/ToastHost';
import { runDailyPoolActivation } from '@/lib/poolAutoActivate';
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

/** Last language the learner chose, read straight from localStorage. 'zh' only as a floor. */
function savedLanguage(): LanguageCode {
  if (typeof localStorage === 'undefined') return 'zh';
  try {
    const raw = localStorage.getItem('srsly-prefs');
    const lang = raw ? (JSON.parse(raw) as { language?: string }).language : null;
    return SUPPORTED_LANGUAGES.some(c => c.code === lang) ? lang as LanguageCode : 'zh';
  } catch {
    return 'zh';
  }
}

/**
 * Which tab to open on.
 *
 * SRS, normally — it is the first tab and the scheduled work is what a returning learner came
 * back for. The exception is a WEB CLIP, which is a request to read something specific, so it
 * lands in Read.
 *
 * That exception is load-bearing, not a nicety. `TabPanel` mounts a tab only once it has been
 * activated, and the clipper reads its payload from `window.location.hash` in an effect inside
 * ReadTab — gated to the 'read' variant so the SRS copy cannot swallow it. Land on SRS with a
 * clip in the URL and that effect never runs, so the clipped article would sit unread until
 * the learner opened Read by hand, which is the exact papercut the clipper exists to remove.
 *
 * Decided in a lazy initialiser so the first render is already right, for the same reason
 * `savedLanguage()` reads localStorage synchronously instead of correcting itself a tick later.
 */
function initialTab(): TabId {
  if (typeof window === 'undefined') return 'practice';
  return decodeClip(window.location.hash) ? 'read' : 'practice';
}

function AppShell() {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signIn, setSignIn] = useState<{ open: boolean; reason?: string }>({ open: false });

  // Active study language. Persisted in prefs; drives deck namespacing, dictionary lookups,
  // proficiency labels and TTS locale via LanguageProvider below. Declared BEFORE useSRS,
  // which now takes it — a `const` is not hoisted, so reading it above this line is a
  // temporal-dead-zone crash rather than a warning.
  /**
   * Seeded SYNCHRONOUSLY from saved prefs, not defaulted to Chinese.
   *
   * `storage.getPrefs()` is async, so the first render used to commit to `'zh'` and correct
   * itself a tick later — a Spanish learner's app opened as Chinese at HSK 3, and anything
   * that read the language during that window got the wrong answer. localStorage is
   * synchronous underneath, so the right value is available immediately; the effect below
   * still resolves authoritatively (it validates against the added-languages list and
   * migrates old prefs), this only stops the wrong value being shown on the way there.
   *
   * Client-only by necessity — there is no localStorage on the server. `<html>` and `<body>`
   * already carry suppressHydrationWarning for exactly this class of value.
   */
  const [language, setLanguage] = useState<LanguageCode>(savedLanguage);

  const { recordScore, recordActivity, recordAnswer } = useSRS(language);
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

  /** Languages the learner has added. null until prefs load — distinct from [], which is a
   *  genuinely empty account and the one state that forces onboarding. */
  const [languages, setLanguages] = useState<LanguageCode[] | null>(null);
  const [addingLanguage, setAddingLanguage] = useState(false);

  /**
   * A language a clip asked for, held until we know which languages exist.
   *
   * The request arrives on ReadTab's mount, which is BEFORE `languages` has loaded from
   * prefs — so checking the list at call time always failed and the switch silently never
   * happened. Parking the request and applying it once the list is known is the fix; the
   * check itself still matters, because switching to a language the learner never added
   * would trade one wrong context for another.
   */
  const [wantLanguage, setWantLanguage] = useState<LanguageCode | null>(null);
  const requestLanguage = useCallback((tag: string) => {
    const want = languageFromTag(tag);
    if (want) setWantLanguage(want);
  }, []);

  useEffect(() => {
    if (!wantLanguage || !languages) return;
    if (languages.includes(wantLanguage) && wantLanguage !== language) {
      setLanguage(wantLanguage);
      setSpeechLang(getLanguageConfig(wantLanguage).bcp47);
    }
    setWantLanguage(null);
  }, [wantLanguage, languages, language]);

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

  /**
   * The daily pool activation, run on load — see lib/poolAutoActivate.ts for the rules.
   *
   * HERE, and not in useVocabDeck, because AppShell mounts exactly once. That hook is
   * instantiated by four tabs and two of them stay mounted, so an effect inside it would
   * fire from several copies on the same tick, before any had written the date, and activate
   * a batch per copy — precisely the avalanche the feature is supposed to prevent.
   *
   * Keyed on `language` so switching to a language you have not opened today activates its
   * pool too. Each language keeps its own date, because each has its own deck.
   */
  const { releaseFromPool, deckLoaded, deck, loadSeq, reload: reloadDeck } = useVocabDeck(language);
  useEffect(() => {
    // The deck has to be in memory first: releasing from a pool that has not loaded yet
    // would find nothing pooled, and then record the day as done.
    if (!deckLoaded) return;
    void storage.getPrefs().then(p =>
      runDailyPoolActivation(language, p, releaseFromPool, next => storage.savePrefs(next)));
  }, [language, deckLoaded, releaseFromPool]);

  /**
   * Today's budget, as spent on EVERY device.
   *
   * Read once on mount because the readers cannot read it themselves: `getTodayCounts()` is
   * synchronous — called from render and effect paths in three files — and so sees only this
   * device's localStorage. `SupabaseStorage.getReviewCounts` merges the cloud's copy in and
   * writes the result back locally, which is what those synchronous readers then pick up.
   * Without this the counter merges perfectly and nothing ever asks it to. See
   * lib/reviewCounts.ts.
   */
  useEffect(() => { void storage.getReviewCounts(); }, []);

  /**
   * Re-read from the cloud when this tab comes back to the front.
   *
   * Nothing else re-reads after the initial load — there is no realtime subscription — so
   * without this a second device's changes appeared only on a manual refresh, which reads as
   * sync being broken even when it is working. `visibilitychange` covers switching tabs and
   * unlocking a phone; `focus` covers switching windows on a desktop. Both just drop the
   * cache; the reload below is what actually pulls the new data through the hooks.
   */
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      // A short guard so a flurry of focus events is one refresh, not several.
      if (Date.now() - last < 2000) return;
      last = Date.now();
      // Flush FIRST. Coming back to the tab is also the moment a write that failed offline
      // can finally land, and re-reading before it does is what used to overwrite it.
      void storage.flush().finally(() => {
        storage.invalidate();
        void reloadDeck();
        // Pull the other device's share of today's budget down with everything else. Nothing
        // else reads it: `getTodayCounts()` is synchronous and sees only localStorage, so
        // without this the cap stays per-device however well it merges.
        void storage.getReviewCounts();
      });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reloadDeck]);

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
    // Learn exists only where there is a lesson tree, so switching to a language without one
    // would hide the tab while `tab` still pointed at it — a blank page with no tab selected.
    // Falling back to Read rather than to SRS: someone who was reading lessons wants material.
    if (!hasLessons(lang)) setTab(t => (t === 'learn' ? 'read' : t));
    const cfg = getLanguageConfig(lang);
    document.documentElement.setAttribute('lang', cfg.htmlLang);
    setSpeechLang(cfg.bcp47);
    const prefs = await storage.getPrefs();
    await storage.savePrefs({ ...prefs, language: lang });
  }, []);

  /** Vocab's "Study" hands off to the SRS tab. */
  const startStudy = useCallback(() => { changeTab('practice'); }, [changeTab]);

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
        {/* MOUNTED ONCE, AND ABOVE THE TAB PANELS. It used to live inside ReadTab, which
            mounts twice (variant 'read' and variant 'srs') — so there were two of these,
            each with its own `useAchievements`, racing to acknowledge the same milestone.
            Worse, TabPanel hides an inactive tab with `display: none`, so the winner could
            be the one nobody could see and the milestone simply never appeared. */}
        <ToastHost deck={deck} loadSeq={loadSeq} />
        <main className="max-w-[1200px] mx-auto px-3 sm:px-7 pb-16">
          {/* Read and Stats are kept alive between visits — see components/TabPanel.tsx.
              They are the two that visibly rebuilt on every switch: Read re-entered its
              loading state and Stats blinked the milestone ring in late. The other three
              mount and unmount as before; nothing there is expensive enough to earn the
              memory, and Practice owns audio and timers that should stop when you leave. */}
          <TabPanel active={tab === 'read'}>
            <ReadTab
              active={tab === 'read'}
              onScore={recordScore}
              onActivity={recordActivity}
              onAnswer={recordAnswer}
              onRequireSignIn={requireSignIn}
              onNavigateVocab={() => changeTab('vocab')}
              onNavigateSettings={() => changeTab('settings')}
              onRequestLanguage={requestLanguage}
            />
          </TabPanel>
          {/* Kept alive too. A flashcard session holds its queue and its results in local
              state, so unmounting threw away a review you were in the middle of — answer a
              card, glance at Vocab, and you came back to a fresh session. It also came back
              in whatever mode the last handoff had requested rather than the one you were
              in. */}
          <TabPanel active={tab === 'practice'}>
            <SrsTab
              active={tab === 'practice'}
              onScore={recordScore}
              onActivity={recordActivity}
              onAnswer={recordAnswer}
              onRequireSignIn={requireSignIn}
              onNavigateVocab={() => changeTab('vocab')}
              onNavigateSettings={() => changeTab('settings')}
            />
          </TabPanel>
          {/* Not kept alive: the lesson list is a static render off local state, so remounting
              it costs nothing and there is no session in progress to lose. */}
          {tab === 'learn' && (
            <LearnTab onNavigateSrs={() => changeTab('practice')} />
          )}
          <TabPanel active={tab === 'dash'}>
            <StatsTab onNavigateRead={() => changeTab('read')} />
          </TabPanel>
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
        {/* ── The footer credits the dictionaries, and that is an obligation, not manners ──
            Every definition in this app comes from CC BY-SA data — CC-CEDICT, JMdict and
            Wiktionary — and share-alike requires attribution wherever the work is
            redistributed. The EDRDG asks specifically that software displaying JMdict content
            acknowledge it on screen rather than only in a file, and says a footer is enough.
            NOTICE.md carries the full detail; this is the copy a reader actually meets. */}
        <footer className="text-center pb-10 text-xs" style={{ color: 'var(--ink-faint)' }}>
          <div>srsly.</div>
          <div style={{ marginTop: 6, lineHeight: 1.6 }}>
            Definitions from{' '}
            <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict" target="_blank"
              rel="noreferrer noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>
              CC-CEDICT
            </a>,{' '}
            <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project"
              target="_blank" rel="noreferrer noopener"
              style={{ color: 'inherit', textDecoration: 'underline' }}>
              JMdict
            </a>{' '}and{' '}
            <a href="https://www.wiktionary.org/" target="_blank" rel="noreferrer noopener"
              style={{ color: 'inherit', textDecoration: 'underline' }}>
              Wiktionary
            </a>, used under CC BY-SA 4.0.
          </div>
        </footer>
      </div>

      {languages !== null && (addingLanguage || languages.length === 0) && (
        <AddLanguage
          added={languages}
          onSignIn={() => setSignIn({ open: true })}
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
