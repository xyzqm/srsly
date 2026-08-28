#!/usr/bin/env node
/**
 * A deck that lights up the milestone seals, for looking at them.
 *
 * The Stats panel hides itself entirely on a new account — deliberately, because a wall of
 * empty progress bars is a list of things you have failed to do. That is right for a learner
 * and useless for checking that the badges render, so this prints a snippet that seeds one.
 *
 * ── WHY IT PRINTS A SNIPPET INSTEAD OF WRITING FILES ──
 * Every deck lives in `localStorage`, which only the browser can write. So there is nothing
 * for Node to edit: the useful thing it can do is compose the payload and hand it over.
 *
 * ── IT BACKS UP FIRST, AND THAT IS NOT OPTIONAL ──
 * Seeding overwrites real decks. This snippet copies every existing `srsly-*` key into
 * `srsly-dev-seed-backup` before touching anything, and prints the one-line restore. Written
 * after a session where a dev deck was overwritten with fixtures and could not be recovered.
 *
 * Usage:  npm run seed:dev          (copies to the clipboard on macOS)
 *         npm run seed:dev -- --raw (prints only the snippet, for piping)
 */

/** Real HSK 1 vocabulary, so the words resolve in the dictionary and the deck looks like one. */
const WORDS = [
  ['爱', 'ài', 'to love'], ['八', 'bā', 'eight'], ['爸爸', 'bàba', 'father'],
  ['杯子', 'bēizi', 'cup'], ['北京', 'Běijīng', 'Beijing'], ['本', 'běn', 'measure word for books'],
  ['不客气', 'bú kèqi', "you're welcome"], ['菜', 'cài', 'dish, cuisine'], ['茶', 'chá', 'tea'],
  ['吃', 'chī', 'to eat'], ['出租车', 'chūzūchē', 'taxi'], ['打电话', 'dǎ diànhuà', 'to make a call'],
  ['大', 'dà', 'big'], ['的', 'de', 'possessive particle'], ['点', 'diǎn', "o'clock"],
  ['电脑', 'diànnǎo', 'computer'], ['东西', 'dōngxi', 'thing'], ['都', 'dōu', 'all, both'],
];
const ES_WORDS = [['casa', '', 'house'], ['perro', '', 'dog']];

/**
 * 12 of the 18 are mastered (stability past MASTERY_STABILITY_DAYS), and 10 of those 12 ALSO
 * carry enough lapses to count as rescued leeches. A card can honestly be both — it was
 * forgotten repeatedly, then fixed, and is now holding — which is what lets 18 words fill six
 * ladders at six different heights instead of needing hundreds.
 */
const deck = WORDS.map(([h, p, m], i) => ({
  id: `seed-${i}`, h, p, m,
  lastReview: '2026-08-20', dueAt: '2026-09-20',
  reviews: 6, difficulty: 5, phase: 'review',
  stability: i < 12 ? 45 : 3,          // 12 mastered
  lapses: i < 10 ? 9 : 0,              // 10 of them rescued leeches (LEECH_THRESHOLD is 8)
  leech: false,                        // cleared flag + high lapses == "was stuck, now isn't"
}));
const esDeck = ES_WORDS.map(([h, p, m], i) => ({
  id: `seed-es-${i}`, h, p, m, lastReview: '2026-08-20', dueAt: '2026-09-20',
  reviews: 2, stability: 4, difficulty: 5, lapses: 0, phase: 'review',
}));

const srs = {
  streak: 40, lastVisit: new Date().toISOString().slice(0, 10),
  todayScore: -1, todayScoreDate: new Date().toISOString().slice(0, 10),
  sessions: 60, byLanguage: { zh: { streak: 35 }, es: { streak: 4 } },
};

const payload = JSON.stringify({ zh: deck, es: esDeck, srs });

const snippet = `(() => {
  const seed = ${payload};
  const backup = {};
  for (const k of Object.keys(localStorage)) if (k.startsWith('srsly-') && k !== 'srsly-dev-seed-backup') backup[k] = localStorage.getItem(k);
  localStorage.setItem('srsly-dev-seed-backup', JSON.stringify(backup));
  localStorage.setItem('srsly-vocab-deck-zh', JSON.stringify(seed.zh));
  localStorage.setItem('srsly-vocab-deck-es', JSON.stringify(seed.es));
  localStorage.setItem('srsly-srs-state', JSON.stringify(seed.srs));
  const prefs = JSON.parse(localStorage.getItem('srsly-prefs') || '{}');
  prefs.languages = [...new Set([...(prefs.languages || []), 'zh', 'es'])];
  prefs.language = 'zh';
  localStorage.setItem('srsly-prefs', JSON.stringify(prefs));
  // CLEARED, not filled. An absent key is a first run, and useAchievements seeds it SILENTLY
  // in that case (see lib/achievementsSeen.ts) — which is exactly what is wanted here: seven
  // badges appear in Stats without seven toasts firing at once. To watch one ARRIVE instead,
  // seed first, then remove a single id from srsly-achievements-seen by hand.
  localStorage.removeItem('srsly-achievements-seen');
  location.reload();
})()`;

const restore = `(() => { const b = JSON.parse(localStorage.getItem('srsly-dev-seed-backup') || '{}');
  for (const k of Object.keys(localStorage)) if (k.startsWith('srsly-') && k !== 'srsly-dev-seed-backup') localStorage.removeItem(k);
  for (const [k, v] of Object.entries(b)) localStorage.setItem(k, v);
  localStorage.removeItem('srsly-dev-seed-backup'); location.reload(); })()`;

if (process.argv.includes('--raw')) {
  console.log(snippet);
} else if (process.argv.includes('--restore')) {
  console.log(restore);
} else {
  const badges = [
    // Named "First steps", not "Collector": a collapsed badge takes the name of the highest
    // rung EARNED, and rung 2 of the deck ladder is `first-steps`. Printing "Collector" here
    // would have the script describe a badge that does not appear under that name.
    ['First steps',   '2/6', 'rung 2 of the deck ladder — next rung at 25 words'],
    ['Vocabulary',    '1/5', '12 mastered — next rung at 50'],
    ['Streak',        '4/6', '40 days — next rung at 100'],
    ['Sessions',      '3/4', '60 sessions — next rung at 250'],
    ['Unstuck',       'MAX', '10 rescued — gold, a topped ladder'],
    ['Two languages', '—',   'single rung, full ring'],
    ['Devoted',       '—',   '35 days in one language'],
  ];
  console.log('\n  srsly dev seed — 20 words across 2 languages, 7 badges\n');
  for (const [name, tier, note] of badges) {
    console.log(`    ${name.padEnd(15)} ${tier.padEnd(4)} ${note}`);
  }
  console.log(`
  Paste the snippet into the console at http://localhost:3000, then open Stats.

    npm run seed:dev -- --raw       print the snippet
    npm run seed:dev -- --restore   print the snippet that puts your own data back

  Your existing srsly-* keys are copied to 'srsly-dev-seed-backup' before anything
  is overwritten, so --restore always has something to put back.
`);
  // Clipboard is the whole ergonomic point — the snippet is a few kB of JSON and nobody is
  // selecting that out of a terminal by hand.
  let copied = false;
  if (process.platform === 'darwin') {
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('pbcopy', { input: snippet });
      copied = true;
    } catch { /* pbcopy missing or not permitted — fall back to printing */ }
  }
  if (copied) {
    console.log('  ✓ snippet copied to the clipboard — paste it into the console.\n');
  } else {
    console.log('  ─── snippet ───\n');
    console.log(snippet);
    console.log();
  }
}
