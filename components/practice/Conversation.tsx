'use client';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { DeckWord, ConvoTurn, PassageToken } from '@/lib/types';
import { CONVO } from '@/lib/data/conversation';
import { speak } from '@/lib/speech';
import { useMic } from '@/hooks/useSpeech';
import { useWordPopup } from '@/hooks/useWordPopup';
import ClickableWord from '@/components/shared/ClickableWord';
import WordPopup from '@/components/read/WordPopup';
import ConvoReport from './ConvoReport';

/**
 * Chat message data model.
 * Tutor messages store token arrays (not JSX) so the render function can
 * compute live claimKind on every render — fixing the stale-closure bug where
 * "Add to vocab" / "Learn this word" didn't update the underline in-chat.
 */
interface ChatMessage {
  side: 'tutor' | 'me';
  tokens?: PassageToken[];  // tutor messages only
  text?: string;            // user messages only
  isTyping?: boolean;       // typing indicator placeholder
  audioText?: string;
}
interface Response { text: string; turnIdx: number; }

interface Props {
  onScore: (score: number) => void;
  deck: DeckWord[];
  onAddVocab: (word: string, pinyin: string, meaning: string) => void;
  onGrade?: (hanzi: string, grade: number) => void;
  /** Daily AI-generated conversation turns. Falls back to CONVO. */
  turns?: ConvoTurn[];
}

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>
  </svg>
);

export default function Conversation({ onScore, deck, onAddVocab, onGrade, turns }: Props) {
  const ACTIVE_CONVO = turns ?? CONVO;
  // Use a ref so showTutor always reads the current conversation without
  // needing to be recreated whenever ACTIVE_CONVO reference changes.
  const activeConvoRef = useRef(ACTIVE_CONVO);
  activeConvoRef.current = ACTIVE_CONVO;

  // Only show today's SRS-due words in the scorecard
  const TARGET_WORDS = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return deck.filter(w => !w.dueAt || w.dueAt <= today).map(d => d.h);
  }, [deck]);
  const deckWords = useMemo(() => new Set(deck.map(d => d.h)), [deck]);
  const { popup, openPopup, closePopup, handleAddVocab, handleLearnTomorrow, vocabClaimed, tomorrowClaimed } = useWordPopup(onAddVocab, deckWords);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turnIdx, setTurnIdx] = useState(0);
  const [responses, setResponses] = useState<Response[]>([]);
  const [chips, setChips] = useState<{ text: string; tokens: ConvoTurn['suggestions'][0] }[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [sessionEnded, setSessionEnded] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [suggestionsOn, setSuggestionsOn] = useState(true);
  const [reportMetrics, setReportMetrics] = useState<{ vocab: number; relevance: number; fluency: number; overall: number } | null>(null);
  const [reportUsed, setReportUsed] = useState<string[]>([]);
  const [reportMissed, setReportMissed] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }, []);

  const showTutor = useCallback((idx: number) => {
    const turn = activeConvoRef.current[idx];
    if (!turn) return;
    const audioText = turn.tokens.map(t => t.text).join('');
    addMessage({ side: 'tutor', tokens: turn.tokens, audioText });
    setChips(turn.suggestions.map(toks => ({ text: toks.map(t => t.text).join(''), tokens: toks })));
  }, [addMessage]); // no openPopup dep — tokens are stored, rendered live

  useEffect(() => {
    // Guard against React Strict Mode double-invocation in development
    if (initializedRef.current) return;
    initializedRef.current = true;
    showTutor(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userSay = useCallback((plain: string) => {
    if (sessionEnded) return;
    setResponses(prev => [...prev, { text: plain, turnIdx }]);
    addMessage({ side: 'me', text: plain });
    setChips([]);

    // Show typing indicator, then advance to next tutor turn
    const typingMsg: ChatMessage = { side: 'tutor', isTyping: true };
    setMessages(prev => [...prev, typingMsg]);
    setTimeout(() => {
      setMessages(prev => prev.filter(m => !m.isTyping));
      const nextIdx = Math.min(turnIdx + 1, activeConvoRef.current.length - 1);
      setTurnIdx(nextIdx);
      showTutor(nextIdx);
    }, 950);
  }, [sessionEnded, turnIdx, addMessage, showTutor]);

  const sendTyped = useCallback(() => {
    const v = inputVal.trim();
    if (!v) return;
    setInputVal('');
    userSay(v);
  }, [inputVal, userSay]);

  const onMicResult = useCallback((text: string) => { setInputVal(text); }, []);
  const { listening, toggle: toggleMic, supported: micSupported } = useMic(onMicResult);

  const endSession = useCallback(() => {
    if (sessionEnded) return;
    setSessionEnded(true);
    setChips([]);

    const usedSet = new Set<string>();
    let relevantTurns = 0, fluentTurns = 0;
    responses.forEach(r => {
      TARGET_WORDS.forEach(w => { if (r.text.includes(w)) usedSet.add(w); });
      const key = (activeConvoRef.current[r.turnIdx]?.key) || [];
      if (key.some(k => r.text.includes(k))) relevantTurns++;
      const hanCount = (r.text.match(/[一-鿿]/g) || []).length;
      if (hanCount >= 3) fluentTurns++;
    });
    const n = Math.max(responses.length, 1);
    const vocab = Math.min(100, Math.round(usedSet.size / Math.max(TARGET_WORDS.length, 1) * 100));
    const relevance = Math.round(relevantTurns / n * 100);
    const fluency = Math.round(fluentTurns / n * 100);
    const overall = Math.round(vocab * 0.4 + relevance * 0.35 + fluency * 0.25);
    const missed = TARGET_WORDS.filter(w => !usedSet.has(w));

    // Apply FSRS grades: Good (3) for words used in conversation, Hard (2) for unused
    TARGET_WORDS.forEach(w => {
      onGrade?.(w, usedSet.has(w) ? 3 : 2);
    });

    setReportMetrics({ vocab, relevance, fluency, overall });
    setReportUsed([...usedSet]);
    setReportMissed(missed);
    setShowReport(true);
  }, [sessionEnded, responses, TARGET_WORDS, onGrade]);

  const usedCount = useMemo(() => {
    const s = new Set<string>();
    responses.forEach(r => TARGET_WORDS.forEach(w => { if (r.text.includes(w)) s.add(w); }));
    return s;
  }, [responses, TARGET_WORDS]);

  if (deck.length === 0) {
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 52, color: 'var(--ink-faint)', fontWeight: 'var(--han-weight)' as 'bold' }}>空</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>No words in your deck yet.</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0', maxWidth: '34ch', marginInline: 'auto', lineHeight: 1.6 }}>
          Go to the <strong>Read</strong> tab and click any underlined word to add it, or add words manually in the <strong>Vocab</strong> tab.
        </p>
      </div>
    );
  }

  if (TARGET_WORDS.length === 0) {
    const nextDue = deck.reduce<string | null>((earliest, w) => {
      if (!w.dueAt) return earliest;
      return earliest === null || w.dueAt < earliest ? w.dueAt : earliest;
    }, null);
    return (
      <div className="text-center py-14">
        <div style={{ fontFamily: 'var(--f-han)', fontSize: 52, color: 'var(--jade)', fontWeight: 'var(--han-weight)' as 'bold' }}>好</div>
        <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 10 }}>All caught up!</h3>
        <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0', maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.6 }}>
          No words are due for conversation practice today.
          {nextDue && <> Next review scheduled for <strong>{nextDue}</strong>.</>}
        </p>
      </div>
    );
  }

  const toggleStyle = (on: boolean) => ({
    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' as const,
    background: on ? 'var(--ink)' : 'var(--card)',
    color: on ? 'var(--paper)' : 'var(--ink-soft)',
    border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
    borderRadius: 8, padding: '9px 15px', cursor: 'pointer', transition: 'all .15s',
    display: 'inline-flex', alignItems: 'center', gap: 7,
  });

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-end gap-3 flex-wrap mb-3">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Conversation · generated tutor</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-.01em', marginTop: 4 }}>Talk it through</div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button style={toggleStyle(audioOnly)} onClick={() => setAudioOnly(v => !v)}>🎧 Audio only</button>
          <button style={toggleStyle(suggestionsOn)} onClick={() => setSuggestionsOn(v => !v)}>💬 Suggestions</button>
        </div>
      </div>

      <p style={{ fontSize: 14.5, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 14 }}>
        A short guided chat around today&apos;s theme. Tap a suggested reply, type your own, or tap the mic to answer out loud. The scorecard below ticks up as you use today&apos;s words — press <b>End &amp; get feedback</b> whenever you want the full report.
      </p>

      {/* Scorecard */}
      <div className="flex items-center gap-3 flex-wrap px-3.5 py-3 rounded-[10px] mb-3" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Words used</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, lineHeight: 1 }}>
            <span style={{ color: 'var(--accent)' }}>{usedCount.size}</span> / {TARGET_WORDS.length}
          </div>
        </div>
        <div className="flex-1 min-w-[120px] h-[5px] rounded-[4px] overflow-hidden" style={{ background: 'var(--line-soft)' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--gold), var(--jade))', width: `${usedCount.size / TARGET_WORDS.length * 100}%`, transition: 'width .5s cubic-bezier(.2,.7,.3,1)', borderRadius: 4 }} />
        </div>
        <button
          disabled={sessionEnded}
          onClick={endSession}
          className="ml-auto cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', background: 'var(--ink)', color: 'var(--paper)', border: 'none', borderRadius: 8, padding: '9px 15px' }}
        >
          {sessionEnded ? 'Session ended' : 'End & get feedback'}
        </button>
        <div className="flex gap-1.5 flex-wrap w-full">
          {TARGET_WORDS.map(w => (
            <span
              key={w}
              className="rounded-[14px] px-2 py-0.5 transition-all duration-300"
              style={{
                fontFamily: 'var(--f-han)', fontSize: 13,
                background: usedCount.has(w) ? 'var(--jade-soft)' : 'var(--card)',
                border: `1px solid ${usedCount.has(w) ? 'var(--jade)' : 'var(--line-soft)'}`,
                color: usedCount.has(w) ? 'var(--jade)' : 'var(--ink-faint)',
                fontWeight: 'var(--han-weight)' as 'bold',
              }}
            >
              {w}
            </span>
          ))}
        </div>
      </div>

      {/* Chat messages — tutor tokens rendered live so claimKind is always current */}
      <div className="flex flex-col gap-3.5 py-1.5">
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{ alignSelf: msg.side === 'me' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}
          >
            {msg.isTyping ? (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 shrink-0" />
                <div className="flex gap-1.5 px-4 py-4 rounded-[14px] rounded-bl-[4px]" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                  {[0, 200, 400].map(d => (
                    <span key={d} className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--ink-faint)', animation: 'blink 1.2s infinite', animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            ) : audioOnly && msg.side === 'tutor' ? (
              <div className="flex items-start gap-2.5">
                <button
                  onClick={() => msg.audioText && speak(msg.audioText)}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                  style={{ border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)' }}
                  title="Play audio"
                >
                  <SpeakerIcon />
                </button>
              </div>
            ) : msg.side === 'tutor' ? (
              <div className="flex items-start gap-2.5">
                <button
                  onClick={() => msg.audioText && speak(msg.audioText)}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 cursor-pointer"
                  style={{ border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)' }}
                >
                  <SpeakerIcon />
                </button>
                <div
                  className="rounded-[14px] rounded-bl-[4px] px-4 py-3"
                  style={{ fontFamily: 'var(--f-han)', fontSize: 18, lineHeight: 1.85, background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)', fontWeight: 'var(--han-weight)' as 'bold' }}
                >
                  {msg.tokens?.map((t, ti) => {
                    const ck = (vocabClaimed.has(t.text) && deckWords.has(t.text)) ? 'vocab' as const
                      : tomorrowClaimed.has(t.text) ? 'tomorrow' as const
                      : null;
                    return <ClickableWord key={ti} token={t} onOpen={openPopup} claimKind={ck} />;
                  })}
                </div>
              </div>
            ) : (
              <div
                className="rounded-[14px] rounded-br-[4px] px-4 py-3"
                style={{ fontFamily: 'var(--f-han)', fontSize: 18, lineHeight: 1.85, background: 'var(--accent)', color: '#fff', fontWeight: 'var(--han-weight)' as 'bold' }}
              >
                {msg.text}
              </div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Suggestion chips */}
      {suggestionsOn && chips.length > 0 && !sessionEnded && (
        <div className="flex flex-col gap-2 mt-4 items-end">
          {chips.map((reply, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {/* Radio circle — submits the reply */}
              <button
                onClick={() => userSay(reply.text)}
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer hover:border-[var(--jade)] hover:bg-[var(--jade-soft)]"
                style={{ border: '2px solid var(--line)', background: 'transparent' }}
                title="Send this reply"
              />
              {/* Text — clickable words open popup */}
              <div
                className="transition-all duration-150"
                style={{
                  fontFamily: 'var(--f-han)', fontSize: 16,
                  background: 'var(--card)', border: '1px solid var(--line)',
                  color: 'var(--ink)', borderRadius: 13, padding: '10px 16px',
                  textAlign: 'right', lineHeight: 1.7, fontWeight: 'var(--han-weight)' as 'bold',
                }}
              >
                {reply.tokens.map((t, ti) => {
                  const ck = (vocabClaimed.has(t.text) && deckWords.has(t.text)) ? 'vocab' as const
                    : tomorrowClaimed.has(t.text) ? 'tomorrow' as const
                    : null;
                  return <ClickableWord key={ti} token={t} onOpen={openPopup} claimKind={ck} />;
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report */}
      {showReport && reportMetrics && (
        <ConvoReport
          metrics={reportMetrics}
          used={reportUsed}
          missed={reportMissed}
          onScore={onScore}
        />
      )}

      {/* Chat bar */}
      <div className={`flex gap-2 mt-5 pt-4 ${sessionEnded ? 'opacity-50 pointer-events-none' : ''}`} style={{ borderTop: '1px solid var(--line)' }}>
        <button
          onClick={() => toggleMic(inputVal)}
          disabled={!micSupported}
          className={`shrink-0 w-11 rounded-[10px] flex items-center justify-center cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${listening ? 'playing-pulse' : ''}`}
          style={{
            border: `1px solid ${listening ? 'var(--accent)' : 'var(--line)'}`,
            background: listening ? 'var(--accent)' : 'var(--card)',
            color: listening ? '#fff' : 'var(--ink-soft)',
          }}
          title={micSupported ? 'Record a spoken reply' : "Voice input isn't supported in this browser"}
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
            <path d="M12 19v3"/>
          </svg>
        </button>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendTyped(); }}
          placeholder={listening ? 'Edit or press Send →' : 'Type your reply in Chinese…'}
          className="flex-1 rounded-[10px] px-4 py-3 transition-all duration-150"
          style={{
            fontFamily: 'var(--f-han)', fontSize: 16, background: 'var(--card)',
            border: '1px solid var(--line)', color: 'var(--ink)',
            fontWeight: 'var(--han-weight)' as 'bold', outline: 'none',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--line)')}
        />
        <button
          onClick={sendTyped}
          className="cursor-pointer rounded-[10px] px-5"
          style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', background: 'var(--ink)', color: 'var(--paper)', border: 'none' }}
        >
          Send
        </button>
      </div>

      <WordPopup
        data={popup}
        onClose={closePopup}
        onAddVocab={handleAddVocab}
        onLearnTomorrow={handleLearnTomorrow}
      />
    </div>
  );
}
