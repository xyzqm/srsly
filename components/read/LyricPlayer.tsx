'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeckWord, LanguageCode, PassageToken } from '@/lib/types';
import type { RawTok } from '@/lib/server/kuromojiSegmenter';
import { parseLrc, decodeLrc, activeLineIndex, alignToLines, type LyricLine } from '@/lib/lrc';
import { buildPastedPassage } from '@/hooks/useDailyContent';
import { needsSpaceBefore } from '@/lib/tokenText';
import { getLanguageConfig } from '@/lib/languageConfig';
import ClickableWord from '@/components/shared/ClickableWord';
import WordPopup from './WordPopup';
import { useWordPopup } from '@/hooks/useWordPopup';
import { mismatchWarning } from '@/lib/languageMismatch';

/**
 * Listen along: synced transcript where every word is still a token.
 *
 * NOT ONLY SONGS. The pairing is an audio file and a timestamped .lrc, and the audio can be
 * anything the browser plays — a track, a podcast episode, an audiobook chapter, a recorded
 * lesson. Naming it after music narrowed it in the reader's head for no reason.
 *
 * THE WHOLE POINT IS THE TOKENS. Rendering the transcript as plain text would make this a
 * karaoke widget; running it through /api/segment-text makes every word clickable, glossed and
 * addable to the deck, exactly as in a passage or an EPUB chapter. Audio you replay is the
 * best place in the app to meet a word.
 *
 * ONE REQUEST FOR THE WHOLE SONG. Lyrics are a few hundred words, well under MAX_PASTE_CHARS,
 * and `splitSentences` treats a newline as a hard boundary — so sending the lines joined by
 * newlines mostly returns one sentence per line. Mostly is not enough (a line containing "."
 * splits further and shifts every later line by one), which is what `alignToLines` fixes.
 *
 * Both files stay on the device. Nothing is uploaded but the lyric TEXT, which goes to our
 * own segmenter; the audio never leaves the browser.
 */

interface Props {
  /**
   * Start expanded, for the card chooser on an empty tab. The panel still owns its open state
   * from then on — this only seeds it, so the collapsed "+ …" button keeps working everywhere
   * else exactly as before.
   */
  startOpen?: boolean;
  language: LanguageCode;
  deck: DeckWord[];
}

const mono = { fontFamily: 'var(--f-mono)' as const };

/** A line in the learner's own language, so the example format is legible to them. */
function exampleLine(language: LanguageCode): string {
  if (language === 'zh') return '我家的小猫很可爱';
  if (language === 'ja') return 'わたしの町は静かです';
  if (language === 'fr') return 'Le matin je me lève tôt';
  return 'Hoy voy al mercado';
}

/**
 * Playback speeds, weighted BELOW normal on purpose.
 *
 * Native-speed audio is the thing a learner cannot follow; 0.75× is usually the difference
 * between hearing a wall of sound and hearing words. Faster than 1.25× stops being useful for
 * comprehension, so the range is not symmetric.
 */
const RATES = [0.5, 0.75, 1, 1.25, 1.5] as const;

export default function LyricPlayer({ language, deck, startOpen = false}: Props) {
  const [open, setOpen] = useState(startOpen);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [title, setTitle] = useState('');
  const [tokens, setTokens] = useState<PassageToken[][][]>([]);   // line → sentences → tokens
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // An .lrc declares no language, so the script is the only signal — see lib/languageMismatch.
  const [warning, setWarning] = useState<string | null>(null);
  /**
   * Playback speed and looping — the two controls that make audio a study tool rather than a
   * player. Slowing a native recording to 0.75x is what makes it parseable at all early on,
   * and looping is what turns one track into repetition practice.
   */
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { scriptIsUnspaced } = getLanguageConfig(language);

  const deckWords = useMemo(() => new Set(deck.map(d => d.h)), [deck]);
  const popup = useWordPopup(undefined, deckWords);

  // The object URL is a live handle on a local file; leaking one per song would pin the
  // whole audio file in memory for the life of the tab.
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const loadLrc = useCallback(async (file: File) => {
    setError('');
    setBusy('Reading lyrics…');
    try {
      // Not file.text(): that assumes UTF-8, and lyric files routinely are not. See decodeLrc.
      const parsed = parseLrc(decodeLrc(await file.arrayBuffer(), language));
      if (parsed.lines.length === 0) throw new Error('No timestamped lines found. An .lrc needs lines like [00:12.34]the words.');
      setLines(parsed.lines);
      setWarning(mismatchWarning(language, { text: parsed.lines.map(l => l.text).join(' ') }));
      setTitle([parsed.title, parsed.artist].filter(Boolean).join(' — ') || file.name.replace(/\.lrc$/i, ''));
      setActive(-1);

      setBusy('Looking up every word…');
      const res = await fetch('/api/segment-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: parsed.lines.map(l => l.text).join('\n'),
          language,
          words: deck.map(w => ({ h: w.h, p: w.p, m: w.m })),
          names: [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      const raw = await res.json() as { title: RawTok[]; sentences: RawTok[][] };
      // Through buildPastedPassage so the tokens carry the same readings, glosses and base
      // forms a passage's do — a song word and a passage word must be the same card.
      const built = buildPastedPassage(raw, deck, language, []);
      setTokens(alignToLines(parsed.lines.map(l => l.text), built.sentences.map(s => s.tokens)));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setTokens([]);
    } finally {
      setBusy('');
    }
  }, [language, deck]);

  const loadAudio = useCallback((file: File) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    setError('');
  }, [audioUrl]);

  /**
   * `timeupdate`, not requestAnimationFrame.
   *
   * The browser fires it about four times a second, which is far finer than a lyric line
   * changes, and it costs nothing while paused. rAF would run a frame loop for the length of
   * a song to compute a value that changes every few seconds — and is suspended outright in a
   * hidden tab, which is exactly when someone leaves music playing.
   */
  const onTimeUpdate = useCallback(() => {
    const t = audioRef.current?.currentTime ?? 0;
    setActive(prev => {
      const next = activeLineIndex(lines, t);
      return next === prev ? prev : next;
    });
  }, [lines]);

  // Keep the sung line in view, but scroll the LIST rather than the page — scrollIntoView on
  // the element would drag the whole tab around every few seconds.
  useEffect(() => {
    const el = lineRefs.current[active];
    const box = listRef.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [active]);

  /**
   * Push the rate onto the element rather than passing it as a prop.
   *
   * `playbackRate` is a DOM property with no React attribute behind it, and browsers reset it
   * to 1 whenever the source changes — so it has to be re-applied on load as well as on
   * change, or picking a new audio file silently snaps the speed back.
   */
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = rate;
  }, [rate, audioUrl]);

  const seekTo = useCallback((i: number) => {
    const a = audioRef.current;
    if (!a || !lines[i]) return;
    a.currentTime = lines[i].timeInSeconds;
    void a.play().catch(() => { /* needs a gesture on some browsers; the click was one */ });
  }, [lines]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="cursor-pointer transition-all duration-150"
        style={{
          ...mono, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase',
          background: 'none', border: '1px dashed var(--line)', borderRadius: 9,
          padding: '9px 15px', color: 'var(--ink-soft)',
        }}
      >
        + Listen along
      </button>
    );
  }

  const filePicker = (label: string, accept: string, onPick: (f: File) => void, hint: string) => (
    <label className="flex-1 block rounded-xl text-center cursor-pointer transition-all duration-150"
           style={{ border: '1px dashed var(--line)', background: 'var(--card)', padding: '14px 12px', minWidth: 150 }}>
      <input type="file" accept={accept} className="hidden"
             onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      <div style={{ ...mono, fontSize: 11.5, color: 'var(--ink)' }}>{label}</div>
      <div style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)', marginTop: 4 }}>{hint}</div>
    </label>
  );

  return (
    <div className="rounded-xl px-5 py-5 animate-rise w-full" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          {title || 'Listen along'}
        </span>
        <button onClick={() => setOpen(false)} className="cursor-pointer"
                style={{ ...mono, fontSize: 11, background: 'none', border: 'none', color: 'var(--ink-faint)' }}>
          close
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filePicker('Choose transcript', '.lrc,text/plain', loadLrc, '.lrc with timestamps')}
        {filePicker('Choose audio', 'audio/*', loadAudio, 'mp3, m4a, wav, ogg…')}
      </div>

      <div style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)', marginTop: 6 }}>
        Both stay on this device — only the text is sent, to our own word lookup.
      </div>

      {/*
        The two-file requirement is the whole barrier to this feature, and it used to be
        unexplained — a learner who has never met an .lrc sees two file pickers and leaves.
        No songs ship with the app because lyrics are separately licensed from recordings and
        both are enforced; what CAN be given away is knowing what to look for and what a
        working file looks like. Shown only before anything is loaded.
      */}
      {lines.length === 0 && !audioUrl && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--line-soft)' }}>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
            New to this?
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6, maxWidth: '54ch', margin: 0 }}>
            An <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>.lrc</strong> is a plain
            text transcript with a timestamp on each line — the format most music players use
            for synced lyrics. Searching for “<em>title</em> lrc” usually finds one, and several
            desktop players can export theirs. Any audio you own works: a song, a podcast, an
            audiobook chapter, a recorded lesson. Audio you replay is the best place to meet a
            word twice.
          </p>
          <pre style={{
            ...mono, fontSize: 11, lineHeight: 1.65, color: 'var(--ink-soft)',
            background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8,
            padding: '10px 12px', marginTop: 10, overflowX: 'auto',
          }}>{`[00:12.30] ${exampleLine(language)}
[00:16.80] …`}</pre>
          <p style={{ fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.55, marginTop: 8, maxWidth: '54ch' }}>
            No timestamps? Paste the words into <strong style={{ color: 'var(--ink-soft)', fontWeight: 500 }}>Paste
            text</strong> instead — you lose the sync, but every word is still tappable.
          </p>
        </div>
      )}

      {warning && (
        <p className="rounded-lg px-3 py-2 mt-3" role="alert"
           style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)',
                    background: 'color-mix(in srgb, var(--gold) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--gold) 40%, transparent)' }}>
          {warning}
        </p>
      )}
      {busy && <p style={{ ...mono, fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 10 }}>{busy}</p>}
      {error && <p style={{ ...mono, fontSize: 11.5, color: 'var(--wrong)', marginTop: 10 }}>{error}</p>}

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          controls
          loop={loop}
          onLoadedMetadata={e => { e.currentTarget.playbackRate = rate; }}
          onTimeUpdate={onTimeUpdate}
          onSeeked={onTimeUpdate}
          className="w-full mt-3"
          style={{ height: 36 }}
        />
      )}

      {audioUrl && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span style={{ ...mono, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Speed
          </span>
          {RATES.map(r => (
            <button
              key={r}
              onClick={() => setRate(r)}
              aria-pressed={rate === r}
              className="cursor-pointer transition-all duration-150"
              style={{
                ...mono, fontSize: 11, borderRadius: 7, padding: '5px 9px',
                border: `1px solid ${rate === r ? 'var(--accent)' : 'var(--line)'}`,
                background: rate === r ? 'var(--accent)' : 'none',
                color: rate === r ? '#fff' : 'var(--ink-soft)',
              }}
            >
              {r}×
            </button>
          ))}

          <button
            onClick={() => setLoop(v => !v)}
            aria-pressed={loop}
            title={loop ? 'Repeating the whole track' : 'Play once and stop'}
            className="cursor-pointer transition-all duration-150"
            style={{
              ...mono, fontSize: 11, borderRadius: 7, padding: '5px 10px', marginLeft: 4,
              border: `1px solid ${loop ? 'var(--accent)' : 'var(--line)'}`,
              background: loop ? 'var(--accent)' : 'none',
              color: loop ? '#fff' : 'var(--ink-soft)',
            }}
          >
            ↻ Loop
          </button>
        </div>
      )}

      {lines.length > 0 && (
        <div
          ref={listRef}
          className="mt-3 rounded-xl px-4 py-3"
          style={{ background: 'var(--card)', border: '1px solid var(--line)', maxHeight: 320, overflowY: 'auto' }}
        >
          {lines.map((line, i) => {
            const isActive = i === active;
            const groups = tokens[i] ?? [];
            return (
              <div
                key={i}
                ref={el => { lineRefs.current[i] = el; }}
                className="rounded-lg px-2 py-1.5"
                style={{
                  fontFamily: scriptIsUnspaced ? 'var(--f-han)' : 'var(--f-display)',
                  fontSize: isActive ? 18 : 16,
                  lineHeight: 1.7,
                  color: isActive ? 'var(--ink)' : 'var(--ink-faint)',
                  background: isActive ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'transparent',
                  transition: 'color .2s, background .2s, font-size .2s',
                }}
              >
                {/* Jump to a line by its time. A lyric you want to hear again is the most
                    common reason to touch a player, and hunting for it on a scrub bar is
                    the thing this replaces. */}
                <button
                  onClick={() => seekTo(i)}
                  title={`Play from ${line.timeInSeconds.toFixed(1)}s`}
                  className="cursor-pointer align-middle mr-2"
                  style={{ ...mono, fontSize: 9.5, background: 'none', border: 'none', color: 'var(--ink-faint)', padding: 0 }}
                >
                  ▶
                </button>
                {groups.length === 0
                  ? <span style={{ opacity: 0.5 }}>{line.text || '♪'}</span>
                  : groups.map((toks, gi) => (
                      <Fragment key={gi}>
                        {toks.map((t, ti) => (
                          <Fragment key={ti}>
                            {needsSpaceBefore(toks, ti, scriptIsUnspaced)}
                            <ClickableWord token={t} onOpen={popup.openPopup} />
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
              </div>
            );
          })}
        </div>
      )}

      <WordPopup data={popup.popup} onClose={popup.closePopup} onAddVocab={popup.handleAddVocab} />
    </div>
  );
}
