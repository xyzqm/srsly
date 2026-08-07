'use client';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import { useSRS } from '@/hooks/useSRS';
import { useLanguage } from '@/lib/LanguageContext';
import PieChart from './PieChart';
import LevelProgress from './LevelProgress';
import AccuracyTrend from './AccuracyTrend';

interface Props { onNavigateRead: () => void; }

export default function StatsTab({ onNavigateRead }: Props) {
  const language = useLanguage();
  const { deck } = useVocabDeck(language);
  const { streak, sessions, accuracy } = useSRS();

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        All-time · vocabulary bank
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 500, letterSpacing: '-.015em', margin: '8px 0 4px', lineHeight: 1.15 }}>
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>{deck.length}</em> word{deck.length === 1 ? '' : 's'} in your deck.
      </div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14.5, maxWidth: '46ch', lineHeight: 1.55 }}>
        {deck.length === 0
          ? 'Your deck is empty. Read a passage and click underlined words to start building it.'
          : 'Your complete vocabulary broken down by SRS mastery phase.'}
      </p>

      <PieChart deck={deck} />

      <LevelProgress deck={deck} language={language} />

      <AccuracyTrend history={accuracy} />


      <div
        className="grid mt-8 overflow-hidden rounded-[11px]"
        style={{ gridTemplateColumns: '1.6fr 1fr 1fr', gap: 1, background: 'var(--line-soft)', border: '1px solid var(--line)' }}
      >
        <div className="px-5 py-5" style={{ background: 'var(--paper-2)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Words in deck</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
            {deck.length} <small style={{ fontSize: 14, color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontWeight: 400 }}>total</small>
          </div>
          <button
            onClick={onNavigateRead}
            className="mt-3 flex items-center gap-2 cursor-pointer transition-all duration-150"
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
              padding: '12px 20px', boxShadow: '0 2px 0 var(--accent-deep)', display: 'inline-flex',
            }}
          >
            Open today&apos;s passage
          </button>
        </div>
        <div className="px-5 py-5" style={{ background: 'var(--card)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Day streak</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
            {streak}<small style={{ fontSize: 14, color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontWeight: 400 }}>d</small>
          </div>
        </div>
        <div className="px-5 py-5" style={{ background: 'var(--card)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Total sessions</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, fontWeight: 500, letterSpacing: '-.02em', marginTop: 4, lineHeight: 1 }}>
            {sessions}
          </div>
        </div>
      </div>
    </div>
  );
}
