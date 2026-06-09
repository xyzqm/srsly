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
import { useSRS } from '@/hooks/useSRS';

export default function Home() {
  const [tab, setTab] = useState<TabId>('read');
  const [sheetOpen, setSheetOpen] = useState(false);
  const { recordScore } = useSRS();

  return (
    <>
      <div className="relative z-[1]">
        <Header onOpenTheme={() => setSheetOpen(true)} />
        <TabNav active={tab} onChange={setTab} />
        <main className="max-w-[880px] mx-auto px-7 pb-16">
          {tab === 'read' && (
            <ReadTab
              onScore={recordScore}
              onNavigatePractice={() => setTab('practice')}
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
        </main>
        <footer className="text-center pb-10 text-xs" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', letterSpacing: '.04em' }}>
          srsly. · one interval at a time
        </footer>
      </div>

      <ThemeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
