/**
 * Generate N passages per level and dump them, to measure the generator against the app's own
 * readability metric.
 *
 *   node scripts/sweep-readability.mjs <url> <outDir> [perLevel] [levels] [lang]
 *   node scripts/sweep-readability.mjs http://localhost:3000 /tmp/sweep 10 1,2,3,4,5 es
 *
 * Writes `<outDir>/level-<n>.json` — the day's cache for that level, holding fully normalised
 * PassageTokens. Re-running SKIPS any level already dumped, so an interrupted sweep resumes.
 * Analyse with `calculateReadability` from lib/readability.ts; the cached tokens are exactly
 * what the UI measures, which is the whole reason this drives the app rather than the API.
 *
 * ── WHY THE APP AND NOT `/api/daily-content` DIRECTLY ──
 * The route answers in the RawTok wire format; `hooks/useDailyContent.ts` normalises it into
 * PassageTokens, resolving meanings the route left out against the client dictionary. Measuring
 * the raw tuples would measure a different number from the one on screen, and "the app
 * disagreeing with itself in public" is the thing these sweeps exist to catch.
 *
 * ── FIVE THINGS THAT COST AN AFTERNOON, ALL FIXED HERE ──
 *
 * 1. FILLING IS NOT FINISHING. `newPassageDisabled` is
 *      !alreadyFinished || clozeIncomplete || loadingMore || !allPassagesComplete || no due words
 *    so grading every blank satisfies only two of five. The passage must also be FINISHED — the
 *    same button a reader presses. Without that the sweep stops dead at one passage per level.
 *
 * 2. THE BLANKS ARE READ FROM THE CACHE, NEVER GUESSED. Each sentence carries its `plainText`,
 *    the sentence BEFORE any word was blanked, so a blank is exactly a word the rendered
 *    sentence has lost. Guessing from the deck cannot work: most answers are inflected
 *    (`trabajaban` for `trabajar`), and a sentence with no blanks is never hidden at all.
 *    The comparison is scoped to the PASSAGE element — the "new words to know" panel lists the
 *    very words that are blanked, so a page-wide comparison finds nothing missing.
 *
 * 3. THE DAILY NEW-CARD BUDGET CAPS PASSAGES. `newPerDay` defaults to 20 and a passage is built
 *    around 4–5 due words, so the budget runs out after 4–5 passages and there is nothing left
 *    to build the next one around. `srsNewPerDay` is raised in the seeded prefs — a real
 *    setting a real learner can change, not a workaround.
 *
 * 4. HEADLESS CHROME THROTTLES `setTimeout` in a backgrounded page to about one tick a minute.
 *    One passage took 8m44s while the server answered every POST in under 4 seconds. The three
 *    `--disable-*` flags below are not boilerplate.
 *
 * 5. IT HAS TO ASK FOR THE READ TAB, because the app now REMEMBERS which tab you were on
 *    (`srsly-tab`) and lands a first visit on HOME. The seed below wipes every `srsly-*` key,
 *    which includes that one — so the reload opened Home, `TabPanel` never mounted Read, and
 *    the "Generate passage" button did not exist in the DOM. The sweep reported
 *    `NOTHING CACHED` on every level with no other sign of what happened.
 *
 *    Worth stating as a standing hazard rather than a one-off fix: this script drives the UI
 *    rather than the API, deliberately, so that it measures the number a reader actually sees —
 *    and the cost of that choice is that MOVING A BUTTON BREAKS IT. Generation moved from the
 *    drill tab into Read → Generated, and nothing failed loudly.
 *
 * ── METERING ──
 * `consume_ai_credit()` rations ANONYMOUS guests only. Signed in is unlimited, and a learner's
 * own key skips metering entirely (`Generator.operatorPays`). With `guest_limit` at 0 this must
 * be pointed at a signed-in session. `SRSLY_STUB_AI=1` also bypasses it and costs nothing, but
 * serves one canned passage — useful for exercising this script, useless for measuring the
 * generator.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const URL_BASE = process.argv[2];
const OUTDIR = process.argv[3];
const PER = Number(process.argv[4] || 10);
const LEVELS = (process.argv[5] || '1,2,3,4,5').split(',').map(Number);
const LANG = process.argv[6] || 'es';

if (!URL_BASE || !OUTDIR) {
  console.error('usage: node scripts/sweep-readability.mjs <url> <outDir> [perLevel] [levels] [lang]');
  process.exit(1);
}

/** Only the two CEFR languages have the level tables this reads. */
const TABLES = {
  es: { levels: 'cefr-levels.json', vocab: 'cefr-vocab.json', prefKey: 'cefrLevel' },
  fr: { levels: 'fr-levels.json', vocab: 'fr-vocab.json', prefKey: 'frLevel' },
};
const TABLE = TABLES[LANG];
if (!TABLE) {
  console.error(`lang must be one of ${Object.keys(TABLES).join(', ')} — got ${LANG}`);
  process.exit(1);
}

/**
 * A deck of that band's own words: a learner at this level owns words at this level, and the
 * passage is written around whatever is due. Derived from the shipped tables rather than a
 * side file, so there is nothing to generate before running this.
 */
const load = f => JSON.parse(readFileSync(path.join(ROOT, 'lib', 'data', f), 'utf8'));
const BANDS = load(TABLE.levels);
const VOCAB = load(TABLE.vocab);
const deckFor = level => (BANDS[String(level)] ?? [])
  .map(word => ({ word, m: VOCAB[word]?.meaning ?? '' }))
  .filter(x => x.m)
  .slice(0, 80);

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME} — set CHROME_PATH to override.`);
  process.exit(1);
}
const PORT = Number(process.env.CDP_PORT || 9226);

/**
 * THE PORT MUST BE FREE BEFORE CHROME IS SPAWNED, and this is not belt-and-braces.
 *
 * A stale headless instance from an earlier run keeps the debugging port. Chrome does NOT
 * exit when it cannot bind — it carries on without DevTools — so `/json/list` answers
 * perfectly well with the STALE browser's targets, and the script attaches to a browser whose
 * profile it never seeded and then waits for a page that will never be there. It hangs rather
 * than failing, which is the worst shape a failure can take. Refusing to start is the only
 * check that distinguishes the two, because nothing in the target list says whose it is.
 */
try {
  const r = await fetch(`http://127.0.0.1:${Number(process.env.CDP_PORT || 9226)}/json/version`,
    { signal: AbortSignal.timeout(2000) });
  if (r.ok) {
    const who = await r.json().catch(() => ({}));
    console.error(
      `Port ${process.env.CDP_PORT || 9226} is already serving DevTools (${who.Browser ?? 'unknown'}).\n`
      + 'Close that browser, or set CDP_PORT to a free port. Attaching to it would drive the\n'
      + 'wrong profile and hang.');
    process.exit(1);
  }
} catch { /* nothing listening, which is what we want */ }

mkdirSync(OUTDIR, { recursive: true });
const log = m => {
  const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`;
  console.log(s);
  appendFileSync(path.join(OUTDIR, 'sweep.log'), s + '\n');
};

let chromeExit = null;
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUTDIR, 'chrome-profile')}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  // See note 4 above. Without these one passage takes minutes instead of seconds.
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
/**
 * Chrome's stderr is KEPT, because the one failure this script has had was silent: it exits
 * immediately when the debugging port is already held — by a stale headless instance from an
 * earlier run, most often — and `stdio: 'ignore'` turned that into a bare "never exposed a
 * debugging target" with nothing to act on.
 */
let chromeErr = '';
chrome.stderr.on('data', d => { chromeErr += d.toString(); });
chrome.on('exit', code => { chromeExit = code; });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function target() {
  // A cold profile exposes a page target in about a second; 15 s is slack, not a guess.
  for (let i = 0; i < 60; i++) {
    /**
     * OUR Chrome, or none. A stale headless instance already holding the port makes the one
     * we spawned exit immediately — and `/json/list` then answers perfectly well, with the
     * STALE browser's targets. Attaching to those drives someone else's browser against a
     * profile we never seeded, which hangs rather than failing. So the exit is checked before
     * a target is accepted, not merely as a loop guard.
     */
    if (chromeExit !== null) break;
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      // Headless also lists browser_ui / service_worker / background_page targets — the page
      // is the only one worth attaching to.
      const p = list.find(t => t.type === 'page');
      if (p && chromeExit === null) return p;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  const noise = /cv_display_link|DEPRECATED_ENDPOINT|allocator multiple times/;
  const detail = chromeErr.split('\n').filter(l => l.trim() && !noise.test(l)).slice(-4).join('\n');
  throw new Error(
    `Chrome never exposed a debugging target on port ${PORT}`
    + (chromeExit !== null ? ` (it exited with code ${chromeExit})` : '')
    + `\nIs something already using the port? Set CDP_PORT to another one.`
    + (detail ? `\nChrome said:\n${detail}` : ''),
  );
}

let id = 0;
const rpc = (ws, method, params = {}) => new Promise((res, rej) => {
  const mine = ++id;
  const on = ev => {
    const m = JSON.parse(ev.data);
    if (m.id !== mine) return;
    ws.removeEventListener('message', on);
    if (m.error) rej(new Error(`${method}: ${m.error.message}`));
    else res(m.result);
  };
  ws.addEventListener('message', on);
  ws.send(JSON.stringify({ id: mine, method, params }));
});
/** Node 24 ships a global WebSocket, so driving CDP needs no dependency at all. */
/** Prefix on anything `ev` returns because the page THREW. Not valid JSON, deliberately. */
const EV_THREW = '\u0000threw: ';

/**
 * A PAGE-SIDE THROW USED TO PRINT `[object Object]`, WHICH IS WHY THIS RUN LOOKED MYSTERIOUS.
 *
 * `r.result?.value` is the returned value and says nothing about a REJECTION: CDP reports that
 * separately in `exceptionDetails`, and the accompanying `result` is a description of the
 * thrown object rather than a string — so the log line interpolated an object and the only
 * evidence of what went wrong was the word "Object". Same lesson as `generateJson`'s sample
 * being on the wrong branch: instrumentation that misses the failing path reads as proof the
 * failing path did not happen.
 */
const ev = (ws, expression) =>
  rpc(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    .then(r => {
      const x = r.exceptionDetails;
      if (x) {
        const why = x.exception?.description || x.exception?.value || x.text || 'unknown';
        // A SENTINEL, not JSON. The first version returned `{"step":"threw",…}`, which is a
        // perfectly good string — so the dump step at the bottom saw a truthy value and WROTE
        // THE ERROR to level-N.json as if it were a passage cache. A marker that cannot be
        // mistaken for page data is the difference between a failure and a corrupt result.
        return EV_THREW + String(why).split('\n')[0].slice(0, 200);
      }
      const v = r.result?.value;
      return typeof v === 'string' ? v : JSON.stringify(v ?? null);
    });

/** Helpers injected into every page-side step. */
const STEP = `
  const find = re => [...document.querySelectorAll('button')].find(b => re.test((b.textContent||'').trim()));
  const cache = () => { const k = Object.keys(localStorage).find(x => x.startsWith('srsly-daily'));
    return k ? JSON.parse(localStorage.getItem(k)) : null; };
  const words = t => (t||'').replace(/[.,:;!?¿¡«»""()]/g, ' ').split(/\\s+/).filter(Boolean);
`;

try {
  const page = await target();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  await rpc(ws, 'Page.enable');
  await rpc(ws, 'Runtime.enable');
  await rpc(ws, 'Emulation.setDeviceMetricsOverride',
    { width: 1200, height: 1600, deviceScaleFactor: 1, mobile: false });
  await rpc(ws, 'Page.navigate', { url: URL_BASE });
  await sleep(9000);

  for (const level of LEVELS) {
    const out = path.join(OUTDIR, `level-${level}.json`);
    /**
     * RESUMING MUST CHECK WHAT IS THERE, NOT JUST THAT SOMETHING IS.
     *
     * The skip tested `existsSync` alone, so a file written by a FAILED run counted as a
     * finished level — and the broken build wrote 133 bytes of
     * `{"step":"threw","why":"SecurityError: …"}` to each one. Every later run then reported
     * "already dumped, skipping" for all three levels and exited in half a second, which reads
     * exactly like success. The person running it had to open the files to find out.
     *
     * A real dump is the day's cache and carries a `passages` array. Anything else is
     * regenerated rather than trusted, and said out loud so a stale directory explains itself.
     */
    if (existsSync(out)) {
      let usable = false;
      try { usable = Array.isArray(JSON.parse(readFileSync(out, 'utf8'))?.passages); } catch { /* not JSON */ }
      if (usable) { log(`level ${level}: already dumped, skipping`); continue; }
      log(`level ${level}: ${out} is not a passage dump — regenerating it`);
    }

    const deck = deckFor(level);
    if (deck.length === 0) { log(`level ${level}: no banded words, skipping`); continue; }

    await ev(ws, `(() => {
      // Any cached passage for TODAY is kept, so a resumed run costs no extra generations.
      const keep = {};
      for (const k of Object.keys(localStorage)) if (k.startsWith('srsly-daily')) keep[k] = localStorage.getItem(k);
      /* THE CONNECTED KEY SURVIVES THE WIPE, AND WITHOUT THIS THE SWEEP CANNOT RUN AT ALL.
         The reset clears every srsly-* entry, which includes srsly-anthropic-key and
         srsly-ai-provider -- so the very first reload disconnected the learner's key, every
         generation fell through to the operator's, and guest_limit refused it. The sweep would
         report nothing generated while the app was working perfectly.
         It is also the whole mechanism for the thing this script is FOR: comparing providers.
         You pick Gemini or Groq in Settings and sweep; if the reset ate that choice there would
         be nothing to compare.
         (No backticks in here: this string is itself a template literal.) */
      for (const k of ['srsly-anthropic-key', 'srsly-ai-provider']) {
        const v = localStorage.getItem(k); if (v !== null) keep[k] = v;
      }
      for (const k of Object.keys(localStorage)) if (k.startsWith('srsly')) localStorage.removeItem(k);
      for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v);
      localStorage.setItem('srsly-prefs', JSON.stringify({
        theme: 'paper', font: 'editorial-warm', languages: ['${LANG}'], language: '${LANG}',
        ${TABLE.prefKey}: ${level},
        srsNewPerDay: 200,   // see note 3: the default of 20 caps the sweep at ~5 passages
      }));
      localStorage.setItem('srsly-vocab-deck-${LANG}', JSON.stringify(
        ${JSON.stringify(deck)}.map((w, i) => ({ id: 's' + i, h: w.word, p: '', m: w.m }))));
      localStorage.setItem('srsly-achievements-seen', JSON.stringify(['first-word', 'first-steps']));
      // THE TAB HAS TO BE ASKED FOR NOW — see note 5 in the header.
      localStorage.setItem('srsly-tab', 'read');
      return 'seeded';
    })()`);
    await rpc(ws, 'Page.reload');
    await sleep(9000);

    /**
     * IS THIS ACTUALLY THE APP? Asked out loud, because the alternative is a lie.
     *
     * With nothing serving the URL, Chrome shows its own error page — an opaque origin where
     * reading `localStorage` throws `SecurityError: Access is denied for this document`. The
     * seed step failed exactly that way and the script still logged "seeded 80 deck words",
     * because that line runs unconditionally, and then reported NOTHING CACHED three times.
     * Every symptom pointed at generation; nothing pointed at the server being down.
     */
    const ready = await ev(ws, `(() => {
      try { localStorage.getItem('srsly-tab'); } catch { return 'no-storage'; }
      return document.querySelector('nav button') ? 'ok' : 'no-app';
    })()`);
    if (ready !== 'ok') {
      log(`level ${level}: ${URL_BASE} is not serving srsly (${ready}).`);
      log(`  Start it first:  npm run dev      — or  npm run dev:stub  to sweep for free.`);
      break;
    }
    log(`level ${level}: seeded ${deck.length} deck words`);

    for (let n = 0; n < PER; n++) {
      const raw = await ev(ws, `(async () => { ${STEP}
        const before = cache()?.passages?.length ?? 0;
        const b = find(/^Generate passage$/i) || find(/New passage/i);
        if (!b) return JSON.stringify({
          step: 'no-button',
          // Which tab and section are actually open. "no-button" on the wrong tab is a
          // navigation failure and on the right one is a UI change; the old dump of body text
          // could not tell them apart.
          tab: [...document.querySelectorAll('nav button')]
            .map(x => x.textContent.trim()).join('/') || 'no nav',
          stored: localStorage.getItem('srsly-tab'),
          body: document.body.innerText.slice(0, 200),
        });
        if (b.disabled) return JSON.stringify({ step: 'disabled', title: b.title || '' });
        b.click();
        for (let i = 0; i < 90; i++) { await new Promise(r => setTimeout(r, 1000));
          if (!/GENERATING|WRITING/i.test(document.body.innerText)) break; }
        const after = cache()?.passages?.length ?? 0;
        if (after === before) return JSON.stringify({ step: 'no-new-passage', body: document.body.innerText.slice(0, 300) });

        // Fill every blank in the passage just written — see note 2.
        const d = cache();
        const p = d.passages[d.passages.length - 1];
        const inputs = [...document.querySelectorAll('input')].filter(x => x.type === 'text' || !x.type);
        if (inputs.length === 0) return JSON.stringify({ step: 'no-blanks', passages: after });
        let host = inputs[0];
        while (host && !inputs.every(i => host.contains(i))) host = host.parentElement;
        const seen = new Set(words(host ? host.innerText : ''));
        const answers = [];
        for (const s of p.sentences) for (const w of words(s.plainText)) if (!seen.has(w)) answers.push(w);
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        let filled = 0;
        for (let i = 0; i < inputs.length; i++) {
          const a = answers[i]; if (!a) break;
          const el = inputs[i];
          el.focus(); set.call(el, a); el.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 120));
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          await new Promise(r => setTimeout(r, 380));
          filled++;
        }
        document.activeElement?.blur();
        await new Promise(r => setTimeout(r, 800));
        // See note 1: filling is not finishing, and only finishing unlocks the next passage.
        find(/^Finish|^Already finished/)?.click();
        let unlocked = false;
        for (let i = 0; i < 24; i++) {
          await new Promise(r => setTimeout(r, 500));
          const nb = find(/New passage/i);
          if (nb && !nb.disabled) { unlocked = true; break; }
        }
        return JSON.stringify({ step: 'ok', passages: after, blanks: inputs.length, filled, unlocked });
      })()`);
      log(`  level ${level} passage ${n + 1}/${PER} → ${raw}`);
      let parsed = {};
      try { parsed = JSON.parse(raw || '{}'); } catch { /* keep the raw line in the log */ }
      if (parsed.step !== 'ok') break;
      await sleep(800);
    }

    const dump = await ev(ws, `(() => {
      const k = Object.keys(localStorage).find(x => x.startsWith('srsly-daily'));
      return k ? localStorage.getItem(k) : null;
    })()`);
    if (dump && !dump.startsWith(EV_THREW)) { writeFileSync(out, dump); log(`level ${level}: wrote ${out}`); }
    else log(`level ${level}: NOTHING CACHED — nothing was generated${dump ? ` (${dump})` : ''}`);
  }
  log('sweep finished');
} finally {
  chrome.kill();
}
