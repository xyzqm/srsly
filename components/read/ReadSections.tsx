'use client';
import { useState } from 'react';
import ReadTab from './ReadTab';
import TabPanel from '@/components/TabPanel';
import { decodeClip } from '@/lib/webClip';
import type { FsrsGrade } from '@/lib/fsrs';

/**
 * TWO SECTIONS IN ONE TAB: the passages srsly writes, and the things you brought yourself.
 *
 * ── WHY GENERATION MOVED HERE ────────────────────────────────────────────────
 *
 * It lived in the Practice tab, which was defensible and was wrong in practice. The reasoning
 * was that a generated passage is written around the words you owe today, carries blanks and
 * writes to the schedule — so it belonged with the scheduled work rather than beside a novel
 * you chose. What that missed is the name on the tab: someone looking for "generate me
 * something to read" looks under Read, finds two cards about pasting and uploading, and
 * concludes the feature is missing. It was reported exactly that way.
 *
 * **The contract did not move with it.** CLAUDE.md calls "only generated passages have blanks"
 * a contract rather than a preference, and the contract is per PASSAGE, not per tab: a
 * generated passage still carries its blanks, still grades them, still writes FSRS; pasted
 * text still commits with `vocabWords: []` and still touches no schedule. Nothing about who
 * gets tested on what changed — only where the button is.
 *
 * ── AND WHY TWO SECTIONS RATHER THAN ONE LIST ────────────────────────────────
 *
 * The two kinds behave differently on screen. A generated passage has blanks, a hints toggle,
 * a dictation run, a finish row and a results screen; a pasted article has none of them. Merge
 * the lists and "passage 3 of 9" walks between two kinds of thing whose controls appear and
 * disappear as you page — which is the tangle that made a book get its own reading space in
 * the first place. So they keep their own lists, their own numbering and their own controls,
 * exactly as they had in two tabs, and the only thing that changed is that the switch between
 * them is here rather than in the tab bar.
 *
 * ── THE CLIP TRAP, ONE LEVEL DOWN ────────────────────────────────────────────
 *
 * `TabPanel` mounts a section only once it has been activated, and the web clipper reads its
 * payload from the location hash in an effect INSIDE the library section. That is the same
 * trap `initialTab()` already documents for the tab bar — land somewhere the effect is not
 * mounted and the clipped article is silently never read. `initialTab` sends a clip to Read;
 * this sends it to the section that can actually consume it.
 */

type Section = 'generated' | 'library';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'generated', label: 'Generated' },
  { id: 'library',   label: 'Your library' },
];

interface Props {
  active: boolean;
  onScore: (n: number) => void;
  onActivity: () => void;
  onAnswer: (correct: boolean) => void;
  onRequireSignIn: () => void;
  onNavigateVocab: () => void;
  onNavigateSettings: () => void;
  /** The tag comes off `<html lang>` in a clip, so it is an arbitrary string until parsed. */
  onRequestLanguage?: (tag: string) => void;
  onMcGrade?: (questionIdx: number, grade: FsrsGrade) => void;
}

export default function ReadSections({ active, ...rest }: Props) {
  /**
   * Generated is the default, because being unable to find it is what moved it here. The one
   * exception is a URL carrying a clip: that is an article the learner is arriving WITH, and
   * it belongs to the library section, whose effect has to be mounted to read it.
   */
  const [section, setSection] = useState<Section>(() =>
    typeof window !== 'undefined' && decodeClip(window.location.hash) ? 'library' : 'generated');

  return (
    <div>
      {/*
        The same segmented control SrsTab uses for its drills, deliberately: this is the same
        kind of choice one level up, and two visual languages for one interaction is how a UI
        stops being learnable.
      */}
      <div className="flex gap-1.5 mb-4">
        {SECTIONS.map(({ id, label }) => {
          const on = section === id;
          return (
            <button
              key={id}
              onClick={() => setSection(id)}
              className="cursor-pointer"
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em',
                textTransform: 'uppercase', padding: '6px 12px', borderRadius: 7,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                background: on ? 'var(--accent-soft)' : 'var(--card)',
                color: on ? 'var(--accent)' : 'var(--ink-soft)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/*
        KEPT ALIVE, AND TOLD WHEN THEY ARE HIDDEN — both halves matter and for different
        reasons. `TabPanel` stops a section rebuilding from its loading state every time you
        switch, which is its whole docstring. `active` is the other half: a hidden panel still
        hears `window`, so a passage player or a dictation run in the section you left would go
        on speaking over the one you are looking at. SrsTab learned that from two Enters
        pressed on the Settings tab grading a flashcard nobody could see.
      */}
      <TabPanel active={section === 'generated'}>
        <ReadTab variant="srs" active={active && section === 'generated'} {...rest} />
      </TabPanel>
      <TabPanel active={section === 'library'}>
        <ReadTab variant="read" active={active && section === 'library'} {...rest} />
      </TabPanel>
    </div>
  );
}
