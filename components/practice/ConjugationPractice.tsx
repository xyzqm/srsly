"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeckWord } from '@/lib/types';
import { useLanguage } from '@/lib/LanguageContext';
import { storage } from '@/lib/storage';
import { getSrsSettings, DEFAULT_SRS_SETTINGS, type SrsSettings, type FsrsGrade } from '@/lib/fsrs';
import { isDrillDue, scheduleDrill, type DrillCards } from '@/lib/drillState';
import { loadEsGrammar } from '@/lib/spanishGrammar';
import { loadFrGrammar } from '@/lib/frenchGrammar';
import type { GrammarTable } from '@/lib/conjugation';
import {
  buildConjugationCards, gradeConjugation, promptSlot, materialise, filterByTenses,
  deltaLabel, siblingForms, tenseLabel, personLabel, rowPersonLabel,
  auxiliaryNote, isAuxiliaryCard,
  type ConjugationCard, type MaterialCard,
} from '@/lib/conjugationDrill';
import { getConjugationTenses, setConjugationTenses, allTenses } from '@/lib/conjugationPrefs';
import type { Tense } from '@/lib/conjugation';
import type { LanguageCode } from '@/lib/types';

/**
 * How a conjugation class reads on screen.
 *
 * `ir2` is the French second group and must not print as "-ir2 verbs"; it is the -ir verbs
 * that take the -iss- infix, and naming it after the infix is what makes the card teach
 * anything. Everything else is its own ending.
 */
function classLabel(cls: string): string {
  return cls === 'ir2' ? '-ir (-iss-)' : cls === 'irregular' ? 'irregular' : `-${cls}`;
}
import TypedAnswer from './TypedAnswer';
import DrillLoading from './DrillLoading';

/**
 * The Spanish conjugation drill — one form per question, typed.
 *
 * ── IT IS A DRILL, AND IT IS FIREWALLED LIKE THE OTHER ONE ──
 * Grades go to `drill_state` under the `c:` namespace and nowhere else: not the reading
 * streak, not `isDueToday`, not the daily new-card budget, not the heatmap. Conjugation is
 * practice you go and do, exactly like handwriting, and being behind on it must never read as
 * a broken streak.
 *
 * ── TAUGHT AS A ROW, TESTED AS A CELL ──
 * A card the learner has never answered opens in LEARN: the whole six-form row, ungraded, with
 * the change named where there is one. "Got it, let me try" starts the typed test. That is the
 * same shape `WritingCanvas` uses for a new character, and for the same reason — a traditional
 * driller tests without ever teaching, so the first encounter with a pattern is a failure by
 * construction.
 *
 * Nothing is scheduled until an answer is typed, so meeting a card costs the scheduler nothing.
 *
 * ── THE QUEUE IS LATCHED ──
 * Built once when the cards arrive and never rebuilt, so answering cannot reshuffle the
 * session underneath the learner. The same rule `Flashcards` and `WritingPractice` follow.
 */

interface Props {
  deck: DeckWord[];
  deckLoaded?: boolean;
  /**
   * False while this session is mounted but hidden — see components/TabPanel.tsx. It gates
   * the Enter shortcut, which is registered on `window` and so is deaf to `display: none`
   * and to `inert` on the subtree; without it, Enter pressed in the flashcard session would
   * also advance the conjugation card sitting invisibly beside it.
   */
  active?: boolean;
}

const mono = { fontFamily: 'var(--f-mono)' } as const;

export default function ConjugationPractice({ deck, deckLoaded = true, active = true }: Props) {
  const language = useLanguage();
  const [table, setTable] = useState<GrammarTable | null>(null);
  const [cards, setCards] = useState<DrillCards | null>(null);
  const [queue, setQueue] = useState<ConjugationCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'learn' | 'test'>('test');
  const [answer, setAnswer] = useState<{ correct: boolean; typed: string; expected: string } | null>(null);
  const [settings, setSettings] = useState<SrsSettings>(DEFAULT_SRS_SETTINGS);
  /** Which tenses to ask about. Read synchronously so the picker paints right on frame one. */
  const [tenses, setTenses] = useState<Tense[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setSettings(getSrsSettings());
    setTenses(getConjugationTenses());
  }, []);

  useEffect(() => {
    let alive = true;
    // Each language's table is already lazily imported for the word-popup grammar note, so
    // this is a cache hit for anyone who has tapped a word.
    const load = language === 'fr' ? loadFrGrammar() : loadEsGrammar();
    void load.then(t => { if (alive) setTable((t as GrammarTable | null) ?? null); });
    void storage.getDrillCards(language, 'c').then(c => { if (alive) setCards(c); });
    return () => { alive = false; };
  }, [language]);

  /** Every card this deck earns — derived, never stored. See lib/conjugationDrill.ts. */
  const all = useMemo(
    () => (table ? filterByTenses(buildConjugationCards(table, deck, language), tenses) : []),
    [table, deck, tenses, language],
  );

  // Latched once, when the deck, the table and the stored cards are all actually here.
  useEffect(() => {
    if (queue !== null || !deckLoaded || table === null || cards === null) return;
    const due = all.filter(c => isDrillDue(cards[c.id]));
    setQueue(due);
    setIndex(0);
    setPhase(due.length > 0 && (cards[due[0].id]?.reviews ?? 0) === 0 ? 'learn' : 'test');
  }, [queue, deckLoaded, table, cards, all]);

  const card = queue && index < queue.length ? queue[index] : null;
  const stored = card ? cards?.[card.id] : undefined;
  const reviews = stored?.reviews ?? 0;
  /** Resolved against the exemplar this review shows — see conjugationDrill's `exemplars`. */
  const material: MaterialCard | null = card && table ? materialise(table, card, reviews, language) : null;
  const slot = card ? promptSlot(card, reviews) : null;
  const cell = material && slot
    ? material.cells.find(c => c.tense === slot.tense && c.person === slot.person) ?? material.cells[0] ?? null
    : null;

  const commit = useCallback(async (id: string, grade: FsrsGrade) => {
    const next = { ...(cards ?? {}), [id]: scheduleDrill(cards?.[id], grade, settings) };
    setCards(next);
    await storage.saveDrillCards(language, 'c', next);
  }, [cards, language, settings]);

  const onSubmit = useCallback((_r: unknown, typed: string) => {
    if (!card || !cell || !table || !material) return;
    // Re-graded HERE rather than trusting the vocabulary verdict, because an accent in a
    // conjugation drill separates two answers rather than spelling one — see gradeConjugation.
    const verdict = gradeConjugation(typed, cell.form, siblingForms(table, material.lemma, language), language).verdict;
    const correct = verdict === 'exact';
    setAnswer({ correct, typed, expected: cell.form });
    void commit(card.id, correct ? 3 : 1);
  }, [card, cell, table, material, commit, language]);

  /** Guarded, because auto-advance and a keypress can both fire inside the same window. */
  const advancing = useRef(false);
  const advance = useCallback(() => {
    if (advancing.current) return;
    advancing.current = true;
    setAnswer(null);
    const next = index + 1;
    setIndex(next);
    const nextCard = queue?.[next];
    setPhase(nextCard && (cards?.[nextCard.id]?.reviews ?? 0) === 0 ? 'learn' : 'test');
    // Released on the next tick rather than immediately, so the timer below and a stray Enter
    // arriving together still only move one card.
    setTimeout(() => { advancing.current = false; }, 0);
  }, [index, queue, cards]);

  /**
   * ADVANCING IS THE LEARNER'S, NOT A TIMER'S.
   *
   * A right answer used to move on by itself after half a second. It was asked for and then
   * asked back — and the second answer is the better one: half a second is long enough to feel
   * hurried and short enough to miss what you just wrote, and the card vanishing on its own is
   * the app deciding you were finished looking. Enter does the same job with none of that,
   * because the learner says when.
   *
   * Enter continues everywhere it is unambiguous, and after BOTH verdicts — the whole point of
   * removing the timer is that a correct card now waits too. It is deliberately not bound while
   * the input is on screen: `TypedAnswer` owns Enter there, and guards `isComposing` so an IME
   * candidate keystroke cannot submit.
   */
  useEffect(() => {
    const waiting = phase === 'learn' || answer !== null;
    if (!waiting || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      if (phase === 'learn') setPhase('test');
      else advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, answer, advance, active]);

  if (!deckLoaded || table === null || cards === null || queue === null) {
    return <DrillLoading />;
  }

  if (all.length === 0) {
    return (
      <div className="py-10 text-center">
        <p style={{ color: 'var(--ink-soft)', maxWidth: '38ch', marginInline: 'auto', lineHeight: 1.6 }}>
          Nothing to conjugate yet. Cards come from the verbs in your deck — read something and
          tap a verb to add it.
        </p>
      </div>
    );
  }

  if (!card || !cell) {
    const remaining = all.filter(c => isDrillDue(cards[c.id])).length;
    return (
      <div className="py-10 text-center">
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {queue.length > 0 ? 'Done for now' : 'Nothing due'}
        </div>
        <p style={{ color: 'var(--ink-soft)', marginTop: 10, maxWidth: '38ch', marginInline: 'auto', lineHeight: 1.6 }}>
          {queue.length > 0
            ? `${queue.length} card${queue.length === 1 ? '' : 's'} answered.`
            : 'Every pattern and exception you own is scheduled ahead. Conjugation has its own schedule — it does not affect your reading streak.'}
          {remaining > 0 && ` ${remaining} still due — reopen to carry on.`}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-5 gap-4">
        <div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Conjugation · FSRS
          </div>
          <div style={{ ...mono, fontSize: 12, color: 'var(--ink-faint)' }}>
            {index + 1} of {queue.length}
            <span style={{ marginLeft: 8 }}>
              · {card.kind === 'pattern' ? 'pattern' : 'exception'}
              {reviews > 0 && ` · seen ${reviews}×`}
            </span>
          </div>
        </div>
        <div style={{ height: 5, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden', flex: 1, maxWidth: 240 }}>
          <div style={{
            height: '100%', background: 'var(--accent)', borderRadius: 4,
            width: `${(index / queue.length) * 100}%`, transition: 'width .4s cubic-bezier(.2,.7,.3,1)',
          }} />
        </div>
      </div>

      <TensePicker
        open={picking}
        onToggle={() => setPicking(p => !p)}
        chosen={tenses}
        lang={language}
        onChange={next => { setConjugationTenses(next); setTenses(next); setQueue(null); }}
      />

      {phase === 'learn' && material ? (
        <LearnRow card={card} material={material} lang={language} onReady={() => setPhase('test')} />
      ) : (
        <div className="text-center">
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            {tenseLabel(cell.tense, language)}
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 500, letterSpacing: '-.015em', margin: '8px 0 2px' }}>
            {material?.lemma ?? ''}
          </div>
          {cell.person && (
            <div style={{ ...mono, fontSize: 15, color: 'var(--accent)', letterSpacing: '.04em' }}>
              {personLabel(cell.person, language)}
            </div>
          )}

          <div style={{ maxWidth: 340, margin: '18px auto 0' }}>
            {answer === null ? (
              <TypedAnswer
                key={`${card.id}:${cell.tense}:${cell.person}`}
                expected={cell.form}
                language={language}
                placeholder="the form"
                onSubmit={onSubmit}
              />
            ) : (
              <div>
                <div style={{
                  ...mono, fontSize: 13, letterSpacing: '.04em',
                  color: answer.correct ? 'var(--jade)' : 'var(--accent)',
                }}>
                  {answer.correct
                    ? 'Correct.'
                    : <>Not quite — it is <strong style={{ fontWeight: 600 }}>{answer.expected}</strong></>}
                </div>
                {/* The near-miss that is NOT forgiven, named so it teaches rather than stings. */}
                {!answer.correct && sameLetters(answer.typed, answer.expected) && (
                  <div style={{ ...mono, fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 6, lineHeight: 1.5 }}>
                    The accent is the difference between two forms here, not a spelling detail.
                  </div>
                )}
                <button
                  onClick={advance}
                  className="cursor-pointer transition-all duration-150"
                  style={{
                    ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '11px 22px', marginTop: 16,
                    boxShadow: '0 2px 0 var(--accent-deep)',
                  }}
                >
                  {index + 1 >= queue.length ? 'Finish' : 'Next'}
                </button>
                <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 7 }}>
                  or press Enter
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Letters equal, accents not — the case the drill deliberately marks wrong. */
function sameLetters(a: string, b: string): boolean {
  const strip = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return a.trim() !== '' && strip(a) === strip(b);
}

/**
 * The Learn state: the whole row, before anything is graded.
 *
 * A pattern card shows the six endings it teaches. An exception shows the same row with the
 * forms that actually change picked out, so the change is met as a DEVIATION from something
 * rather than as a list of forms to memorise — which is the entire argument for teaching the
 * 27 patterns first.
 */
function LearnRow(
  { card, material, lang, onReady }:
  { card: ConjugationCard; material: MaterialCard; lang: LanguageCode; onReady: () => void },
) {
  const changed = new Set(material.cells.map(c => c.form));
  return (
    <div className="text-center">
      <div style={{ ...mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        {isAuxiliaryCard(card)
          ? (card.kind === 'pattern' ? 'New pattern · passé composé' : 'New auxiliary')
          : card.kind === 'pattern' ? `New pattern · ${classLabel(card.cls)} verbs` : 'New exception'}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 27, fontWeight: 500, margin: '7px 0 2px' }}>
        {material.lemma}
      </div>
      <div style={{ ...mono, fontSize: 12.5, color: 'var(--ink-soft)' }}>
        {card.tense ? tenseLabel(card.tense, lang) : ''}
        {card.delta && <> · {deltaLabel(card.delta)}</>}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'auto auto', gap: '6px 16px',
        justifyContent: 'center', margin: '18px auto 0', textAlign: 'left',
      }}>
        {material.row.map(c => {
          const on = changed.has(c.form);
          return (
            <FormRow key={`${c.tense}:${c.person}`} person={rowPersonLabel(c.person, lang, c.form)} form={c.form} on={on} />
          );
        })}
      </div>

      {/* The one thing about a French auxiliary a card cannot show by example. */}
      {auxiliaryNote(material.lemma) && (
        <div style={{ ...mono, fontSize: 11, color: 'var(--accent)', marginTop: 12, maxWidth: '36ch', marginInline: 'auto', lineHeight: 1.5 }}>
          {auxiliaryNote(material.lemma)}
        </div>
      )}

      {material.cells.length > material.row.length && (
        <div style={{ ...mono, fontSize: 11, color: 'var(--ink-faint)', marginTop: 12, maxWidth: '34ch', marginInline: 'auto', lineHeight: 1.5 }}>
          The same change runs through {material.cells.length} forms in all.
        </div>
      )}

      <button
        onClick={onReady}
        className="cursor-pointer transition-all duration-150"
        style={{
          ...mono, fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase',
          background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '11px 22px', marginTop: 20,
          boxShadow: '0 2px 0 var(--accent-deep)',
        }}
      >
        Got it, let me try
      </button>
      <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 8 }}>
        or press Enter
      </div>
    </div>
  );
}

function FormRow({ person, form, on }: { person: string; form: string; on: boolean }) {
  return (
    <>
      <span style={{
        ...mono, fontSize: 12, color: 'var(--ink-faint)', textAlign: 'right',
        // An elided pronoun is part of the word, so it must not sit a gap away from it.
        marginRight: person.endsWith("'") ? -10 : 0,
      }}>{person}</span>
      <span style={{
        fontFamily: 'var(--f-display)', fontSize: 17,
        color: on ? 'var(--accent)' : 'var(--ink)',
        fontWeight: on ? 600 : 400,
      }}>
        {form}
      </span>
    </>
  );
}

/**
 * Which tenses to drill.
 *
 * Collapsed by default, because it is a setting rather than part of the exercise and a row of
 * nine checkboxes above every question is furniture. Changing it clears the latched queue —
 * that IS a new session, and latching through the change would leave the learner answering
 * tenses they just turned off.
 */
function TensePicker(
  { open, onToggle, chosen, lang, onChange }:
  { open: boolean; onToggle: () => void; chosen: Tense[]; lang: LanguageCode;
    onChange: (t: Tense[]) => void },
) {
  const all = allTenses(lang);
  const on = chosen.length === 0 ? new Set(all) : new Set(chosen);
  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="cursor-pointer"
        style={{
          ...mono, fontSize: 11, letterSpacing: '.06em', padding: '5px 10px', borderRadius: 7,
          border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)',
        }}
      >
        Tenses · {chosen.length === 0 ? 'all' : `${chosen.length} of ${all.length}`}
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
          {all.map(t => {
            const isOn = on.has(t);
            return (
              <button
                key={t}
                onClick={() => {
                  const next = isOn ? [...on].filter(x => x !== t) : [...on, t];
                  onChange(next as Tense[]);
                }}
                className="cursor-pointer"
                style={{
                  ...mono, fontSize: 11, letterSpacing: '.04em', padding: '5px 10px', borderRadius: 7,
                  border: `1px solid ${isOn ? 'var(--accent)' : 'var(--line)'}`,
                  background: isOn ? 'var(--accent-soft)' : 'var(--card)',
                  color: isOn ? 'var(--accent)' : 'var(--ink-faint)',
                }}
              >
                {tenseLabel(t, lang)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
