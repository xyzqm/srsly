/**
 * WHAT A TAB SWITCH COSTS, ON A PHONE — measured, not guessed.
 *
 * `npm run perf:tabs` (or with env: PROBE_URL, CPU_THROTTLE, DECK_SIZE, CDP_PORT)
 *
 * It spawns headless Chrome, drives it over the DevTools Protocol with Node's own global
 * WebSocket — the pattern `scripts/sweep-readability.mjs` established, so this needs no
 * dependency — seeds a deck of a given size into localStorage, then clicks each tab and
 * reports time-to-settle, main-thread long tasks, blocking time and layout shift. It visits
 * every tab twice, because `TabPanel` keeps tabs alive and the second visit is the steady
 * state most switches actually pay.
 *
 * ── WHY IT THROTTLES THE CPU, AND WHY THAT IS THE WHOLE POINT ──
 * "The website feels choppy" was reported from a Pixel and is invisible on the Mac this was
 * written on. `Emulation.setCPUThrottlingRate` is the only honest way to see it from here:
 * at 1x the deck list cost 181ms and looked fine, and at 4x it cost 431ms with 163ms of
 * BLOCKING across three long tasks. Same code, same page. This repo's own rule is to run it
 * in the conditions the bug lives in; for a phone, that rule needs a number.
 *
 * ── TWO TRAPS, BOTH OF WHICH PRODUCED A WRONG ANSWER FIRST ──
 *  - **A HIDDEN PAGE THROTTLES `requestAnimationFrame` TO NOTHING.** The first attempt drove
 *    the in-app browser pane while it was not on screen, and the settle loop simply never
 *    finished. Chrome is spawned with --disable-renderer-backgrounding here for that reason.
 *  - **A FIXTURE THAT IS NOT A REAL DeckWord CRASHES THE APP, WHICH LOOKS LIKE A BUG.**
 *    `SRSState.accuracy` is `DailyAccuracy[]`; seeding it as `{}` threw
 *    "`.map` is not a function" inside a `useMemo` and whited out the Read tab. Fifteen
 *    minutes went into a non-existent defect. `lib/types.ts` is the contract for the seed too.
 *
 * Throttling is applied AFTER load, deliberately: the question is what a CLICK costs, and
 * folding a 4x-slower boot into the same number would hide it.
 *
 * It writes nothing to the repo and touches only its own Chrome profile under /tmp.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(CHROME)) { console.error('Chrome not found:', CHROME); process.exit(1); }

const PORT = Number(process.env.CDP_PORT || 9231);
const URL_ = process.env.PROBE_URL || 'https://srsly-zeta.vercel.app';
const THROTTLE = Number(process.env.CPU_THROTTLE || 1);
const OUT = process.env.PROBE_OUT || path.join(process.env.TMPDIR || '/tmp', 'srsly-perf');

try {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) });
  if (r.ok) { console.error(`Port ${PORT} already serving DevTools. Set CDP_PORT.`); process.exit(1); }
} catch {}

mkdirSync(OUT, { recursive: true });
let chromeExit = null;
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(OUT, 'profile-' + THROTTLE)}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeErr = '';
chrome.stderr.on('data', d => { chromeErr += d.toString(); });
chrome.on('exit', c => { chromeExit = c; });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    if (chromeExit !== null) break;
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find(t => t.type === 'page');
      if (p && chromeExit === null) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no debugging target. ' + chromeErr.split('\n').slice(-4).join('\n'));
}

let id = 0;
const rpc = (ws, method, params = {}) => new Promise((res, rej) => {
  const mine = ++id;
  const to = setTimeout(() => rej(new Error(method + ': timed out')), 120_000);
  const on = ev => {
    const m = JSON.parse(ev.data);
    if (m.id !== mine) return;
    clearTimeout(to); ws.removeEventListener('message', on);
    if (m.error) rej(new Error(`${method}: ${m.error.message}`)); else res(m.result);
  };
  ws.addEventListener('message', on);
  ws.send(JSON.stringify({ id: mine, method, params }));
});

const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

const ev = async (expr) => {
  const r = await rpc(ws, 'Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result?.value;
};

await rpc(ws, 'Page.enable');
await rpc(ws, 'Runtime.enable');
await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
  width: 412, height: 915, deviceScaleFactor: 2.6, mobile: true,
});

const SEED = `(() => {
  const chars = '爱吃喝看说读写走跑飞坐站买卖来去做想要会能给打开关问答学教家人水火山石田土日月星天地风雨雪云花草树鸟鱼马牛羊狗猫虫米饭面茶酒肉菜果瓜豆盐糖油书笔纸刀车船门窗床桌椅灯钱衣鞋帽手足头眼耳口心身血骨皮毛角尾大小多少长短高低新旧好坏快慢早晚冷热干湿明暗';
  const glosses = ['to love','to eat','a long explanatory gloss with several senses; another sense; a third','water','to go','mountain','to read carefully','sun; day; daytime','moon; month'];
  const words = [];
  for (let i = 0; i < ${process.env.DECK_SIZE || 300}; i++) {
    const c = chars[i % chars.length] + (i > 150 ? chars[(i*7) % chars.length] : '');
    const rev = i % 11;
    words.push({ id:'perf-'+i, h:c, p:'pin'+i, m:glosses[i % glosses.length],
      lastReview: rev ? '2026-10-'+String(1+(i%28)).padStart(2,'0') : undefined,
      dueAt: '2026-11-'+String(1+(i%28)).padStart(2,'0'),
      reviews: rev, difficulty: 2+(i%8), phase: rev?'review':'new',
      stability: rev ? (i%60) : 0, lapses: i%4, leech: i%37===0 });
  }
  localStorage.setItem('srsly-vocab-deck-zh', JSON.stringify(words));
  localStorage.setItem('srsly-srs-state', JSON.stringify({ streak:40, lastActive:'2026-11-05', todayScore:12, todayScoreDate:'2026-11-05', sessions:60, forgivenDays:[], accuracy:[], lastVisit:'2026-11-05' }));
  const prefs = JSON.parse(localStorage.getItem('srsly-prefs') || '{}');
  prefs.languages = ['zh']; prefs.language='zh'; prefs.hskLevel=3;
  localStorage.setItem('srsly-prefs', JSON.stringify(prefs));
  const log = [];
  for (let d = 0; d < 300; d++) {
    if (d % 5 === 3) continue;
    const dt = new Date(Date.UTC(2026,10,5) - d*86400000);
    log.push({ d: dt.toISOString().slice(0,10), n: 5+(d%40), l: d%7===0?1:0 });
  }
  localStorage.setItem('srsly-activity-log', JSON.stringify(log));
  localStorage.setItem('srsly-lessons-done', JSON.stringify(['zh-v-basics','zh-v-numbers','zh-measure','zh-le']));
  localStorage.setItem('srsly-tab','dash');
  return 'seeded';
})()`;

// Seed on the real origin, then reload so the app boots with a deck.
await rpc(ws, 'Page.navigate', { url: URL_ });
await sleep(3000);
console.log('seed:', await ev(SEED));
await rpc(ws, 'Page.navigate', { url: URL_ });
await sleep(4000);

// Throttle AFTER load, so we measure interaction rather than boot.
if (THROTTLE > 1) await rpc(ws, 'Emulation.setCPUThrottlingRate', { rate: THROTTLE });

await ev(`
  window.__jank = { long: [], shift: [] };
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__jank.long.push(Math.round(e.duration)); }).observe({ type:'longtask', buffered:true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__jank.shift.push(+e.value.toFixed(4)); }).observe({ type:'layout-shift', buffered:true });
  'ok'`);

const measure = name => ev(`(async () => {
  const b = [...document.querySelectorAll('nav button')].find(x => (x.textContent||'').trim().startsWith(${JSON.stringify(name)}));
  if (!b) return { tab: ${JSON.stringify(name)}, error: 'button not found' };
  const main = document.querySelector('main');
  window.__jank.long = []; window.__jank.shift = [];
  const t0 = performance.now();
  b.click();
  let last = -1, stable = 0, frames = 0; const path = [];
  while (stable < 6 && frames < 150) {
    await new Promise(r => requestAnimationFrame(r));
    frames++;
    const h = Math.round(main.getBoundingClientRect().height);
    if (h === last) stable++; else { stable = 0; last = h; path.push(h); }
  }
  return { tab: ${JSON.stringify(name)}, ms: Math.round(performance.now()-t0), frames,
    heightPath: path.slice(0,10), long: window.__jank.long,
    blocking: window.__jank.long.reduce((a,d)=>a+Math.max(0,d-50),0),
    cls: +window.__jank.shift.reduce((a,v)=>a+v,0).toFixed(4) };
})()`);

console.log(`\n=== CPU throttle ${THROTTLE}x · viewport 412x915 · deck ${process.env.DECK_SIZE || 300} ===`);
const rows = [];
for (const name of ['Review','Read','Learn','Vocab','Settings','Home']) {
  try { const r = await measure(name); rows.push(r); console.log(JSON.stringify(r)); }
  catch (e) { console.log(name, 'FAILED', e.message); }
  await sleep(600);
}
// second pass: already-mounted, so this is the steady-state cost
console.log('\n--- second visit (already mounted) ---');
for (const name of ['Review','Learn','Vocab']) {
  try { console.log(JSON.stringify(await measure(name))); } catch (e) { console.log(name, 'FAILED', e.message); }
  await sleep(600);
}
ws.close(); chrome.kill();
