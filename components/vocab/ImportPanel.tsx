'use client';
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import type { DeckWord, LanguageCode } from '@/lib/types';
import { lookupReadingAsync } from '@/lib/data/lookup';
import { toneNumToMark, splitLeadingPinyin } from '@/lib/pinyin';
import { POLYPHONES } from '@/lib/polyphones';
import { useLanguage } from '@/lib/LanguageContext';
import { inStudyDeck } from '@/lib/deck';
import { getLanguageConfig, levelLabel, levelNumbers } from '@/lib/languageConfig';

/** A language's level word lists. `vocab` entries carry `pinyin` (zh) or `reading` (ja);
 *  the reading is always '' for Spanish and Korean. */
interface LevelData {
  vocab: Record<string, { pinyin?: string; reading?: string; meaning: string }>;
  words: Record<number, string[]>;
}

/**
 * Level tables are loaded ON DEMAND, not imported statically. Together they are ~1.8 MB of
 * source — HSK 338 kB, JLPT 585 kB, CEFR 900 kB, TOPIK 600 kB — and every one of them used
 * to land in the initial page bundle even though they are only read inside this drawer's
 * level-import mode, and then only for the single active language.
 */
const LEVEL_LOADERS: Record<LanguageCode, () => Promise<LevelData>> = {
  zh: async () => ({
    vocab: (await import('@/lib/data/hsk-vocab')).HSK_VOCAB,
    words: (await import('@/lib/data/hsk-levels')).HSK_LEVELS,
  }),
  ja: async () => ({
    vocab: (await import('@/lib/data/jlpt-vocab')).JLPT_VOCAB,
    words: (await import('@/lib/data/jlpt-levels')).JLPT_LEVELS,
  }),
  es: async () => ({
    vocab: (await import('@/lib/data/cefr-vocab')).CEFR_VOCAB,
    words: (await import('@/lib/data/cefr-levels')).CEFR_LEVELS,
  }),
  ko: async () => ({
    vocab: (await import('@/lib/data/topik-vocab')).TOPIK_VOCAB,
    words: (await import('@/lib/data/topik-levels')).TOPIK_LEVELS,
  }),
};

interface Props {
  deck: DeckWord[];
  /** The deck being imported into ('' = the default/all-decks collection). Dedup and the
   *  "already in deck" / HSK "N new" counts are scoped to this deck, since decks are
   *  independent — the same word can exist in more than one deck. */
  studyDeck: string;
  onImport: (words: Array<{ h: string; p: string; m: string }>) => void;
  onCancel: () => void;
}

type ImportMode = 'list' | 'quizlet' | 'csv' | 'hsk';

interface ParsedWord {
  h: string;
  p: string;
  m: string;
  status: 'loading' | 'ready' | 'not-found' | 'in-deck';
  selected: boolean;
}

const MODE_LABELS: Record<ImportMode, string> = {
  list: 'Word list',
  quizlet: 'Quizlet',
  csv: 'CSV',
  hsk: 'HSK levels',
};

// Diagnostic: copies full report to clipboard — Chinese chars in data, DOM nodes, fiber, API calls.
const DEBUG_SRC = `(function(){var info=['URL: '+location.pathname];var nd=window.__NEXT_DATA__;if(nd){var ndStr=JSON.stringify(nd);var ndCN=ndStr.match(/[\\u4e00-\\u9fa5]{2,}/g);info.push('Chinese in __NEXT_DATA__: '+(ndCN?ndCN.slice(0,10).join(' | '):'NONE'));var pp=nd.props&&nd.props.pageProps;var drsk=pp&&pp.dehydratedReduxStateKey;if(drsk){info.push('dehydratedReduxStateKey: type='+typeof drsk+', len='+(typeof drsk==='string'?drsk.length:JSON.stringify(drsk).length));if(typeof drsk==='string'){try{var px=JSON.parse(drsk);var pxCN=JSON.stringify(px).match(/[\\u4e00-\\u9fa5]{2,}/g);info.push('  parsed ok, Chinese: '+(pxCN?pxCN.slice(0,5).join(','):'none'))}catch(e){info.push('  not JSON: '+drsk.slice(0,100))}}}if(pp){var ppArr=[];Object.keys(pp).forEach(function(k){if(k==='dehydratedState'||k==='_nextI18Next')return;var v=pp[k];if(Array.isArray(v)&&v.length)ppArr.push(k+'['+v.length+']~'+JSON.stringify(v[0]).slice(0,60));else if(v&&typeof v==='object'){var ia=Object.keys(v).filter(function(ik){return Array.isArray(v[ik])&&v[ik].length});if(ia.length)ppArr.push(k+'.{'+ia.map(function(ik){return ik+'['+v[ik].length+']'}).join(',')+'}');}});info.push('pageProps arrays: '+(ppArr.length?ppArr.join('; '):'none'))}}var walker=document.createTreeWalker(document.body,0x4);var chNodes=[];var seenP=new WeakSet();while(walker.nextNode()){var tx=walker.currentNode.textContent.trim();if(tx.match(/[\\u4e00-\\u9fa5]/)&&tx.length<200){var par=walker.currentNode.parentElement;if(par&&!seenP.has(par)){seenP.add(par);chNodes.push(par.tagName+'['+par.className.slice(0,25)+']: '+tx.slice(0,50))}}}info.push('Chinese DOM nodes ('+chNodes.length+'): '+chNodes.slice(0,12).join(' || '));var targets=[document.querySelector('#__next > *'),document.querySelector('#__next'),document.querySelector('main'),document.querySelector('[data-testid]')].filter(Boolean);var fEl=null,fKey=null;for(var ti=0;ti<targets.length&&!fKey;ti++){var tel=targets[ti];var tnames=Object.getOwnPropertyNames(tel);var tfk=tnames.find(function(k){return k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance')});if(tfk){fEl=tel;fKey=tfk;info.push('Fiber on '+tel.tagName+(tel.id?'#'+tel.id:''))}else info.push('No fiber on '+tel.tagName+(tel.id?'#'+tel.id:'')+' ('+tnames.length+' own props)')}if(fEl&&fKey){var f=fEl[fKey];var rfound=false;while(f){if(f.memoizedProps&&f.memoizedProps.client&&typeof f.memoizedProps.client.getQueryCache==='function'){rfound=true;var rqQs=f.memoizedProps.client.getQueryCache().getAll();info.push('ReactQuery: '+rqQs.length+' queries');for(var ri=0;ri<rqQs.length;ri++){var rqd=rqQs[ri].state&&rqQs[ri].state.data;info.push('RQ['+ri+']: key='+JSON.stringify(rqQs[ri].queryKey).slice(0,40)+' => '+(rqd?Object.keys(rqd).slice(0,6).join(','):'null'));if(rqd&&rqd.studiableItems)info.push('  studiableItems: '+rqd.studiableItems.length);if(rqd&&rqd.terms)info.push('  terms: '+rqd.terms.length)}break}f=f.return}if(!rfound)info.push('No RQ client going up from fiber')}try{var perf=performance.getEntriesByType('resource');var apiCalls=perf.filter(function(e){return e.name.indexOf('quizlet.com')>-1&&!e.name.match(/\\.(js|css|png|jpg|gif|woff|ico|svg|webp)/)});info.push('API calls ('+apiCalls.length+'):');apiCalls.forEach(function(e){info.push('  '+e.name.replace('https://quizlet.com',''))})}catch(pe){info.push('perf err: '+pe)}var out=info.join('\\n');navigator.clipboard.writeText(out).then(function(){alert('Copied to clipboard ('+info.length+' lines).\\nPaste it and share — preview:\\n\\n'+out.slice(0,600))}).catch(function(){alert(out.slice(0,2000))})})()`;

// Bookmarklet: runs on a Quizlet page, extracts cards, copies as TSV.
// Cards live in pageProps.dehydratedReduxStateKey — a JSON *string*, so find() parses strings too.
// Defined as a string so React never sees the javascript: URL in a prop.
const BOOKMARKLET_SRC = `(function(){function cs(a){var c=[];for(var i=0;i<a.length;i++){var x=a[i];if(x&&x.cardSides&&x.cardSides.length>=2){var s0=x.cardSides[0],s1=x.cardSides[1],ft=(s0&&s0.media&&s0.media[0]&&s0.media[0].plainText)||'',bk=(s1&&s1.media&&s1.media[0]&&s1.media[0].plainText)||'';if(ft||bk)c.push(ft.trim()+'\\t'+bk.trim())}}return c.length?c:null}function find(v,d,seen){if(d>30||v==null)return null;if(typeof v==='string'){if(v.length>30&&(v.charAt(0)==='{'||v.charAt(0)==='[')){try{return find(JSON.parse(v),d+1,seen)}catch(e){}}return null}if(typeof v!=='object')return null;try{if(seen.has(v))return null;seen.add(v)}catch(e){}if(Array.isArray(v)){var sc=cs(v);if(sc)return sc;var c=[];for(var i=0;i<v.length;i++){var o=v[i];if(o&&typeof o==='object'){var t=o.word||o.term||o.front,m=o.definition||o.back||o.meaning;if(t&&m&&typeof t==='string'&&typeof m==='string')c.push(t.trim()+'\\t'+m.trim())}}if(c.length)return c;for(var ai=0;ai<v.length;ai++){var ar=find(v[ai],d+1,seen);if(ar&&ar.length)return ar}return null}var vals;try{vals=Object.values(v)}catch(e){return null}for(var j=0;j<vals.length;j++){var r=find(vals[j],d+1,seen);if(r&&r.length)return r}return null}function copyTSV(c){var text=c.join('\\n');function done(){alert('Copied '+c.length+' cards! Switch to srsly and paste.')}function fb(){var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);done()}navigator.clipboard?navigator.clipboard.writeText(text).then(done).catch(fb):fb()}function tryData(data){var c=find(data,0,new WeakSet());if(c&&c.length){copyTSV(c);return true}return false}try{var rk=window.__NEXT_DATA__&&window.__NEXT_DATA__.props&&window.__NEXT_DATA__.props.pageProps&&window.__NEXT_DATA__.props.pageProps.dehydratedReduxStateKey;if(rk&&tryData(typeof rk==='string'?JSON.parse(rk):rk))return}catch(e){}if(window.__NEXT_DATA__&&tryData(window.__NEXT_DATA__))return;var targets=[document.querySelector('#__next > *'),document.querySelector('#__next'),document.querySelector('main'),document.body].filter(Boolean);var fk=null,fEl=null;for(var ti=0;ti<targets.length&&!fk;ti++){var props=Object.getOwnPropertyNames(targets[ti]);fk=props.find(function(k){return k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance')});if(fk)fEl=targets[ti]}if(fk&&fEl){var f=fEl[fk];while(f){if(f.memoizedProps&&f.memoizedProps.client&&typeof f.memoizedProps.client.getQueryCache==='function'){var rqQs=f.memoizedProps.client.getQueryCache().getAll();for(var qi=0;qi<rqQs.length;qi++){var qd=rqQs[qi].state&&rqQs[qi].state.data;if(qd&&tryData(qd))return}break}f=f.return}}var tts=document.querySelectorAll('.TermText');if(tts.length>=2){var dc=[];for(var di=0;di+1<tts.length;di+=2){var w=(tts[di].textContent||'').trim(),df=(tts[di+1].textContent||'').trim();if(w&&df)dc.push(w+'\\t'+df)}if(dc.length){copyTSV(dc);return}}var m=window.location.pathname.match(/\\/([0-9]+)\\//);if(!m){alert('Could not find set ID in URL.');return}var id=m[1];var eps=['/webapi/3.4/studyables/'+id+'/terms?perPage=500','/webapi/3.4/sets/'+id,'/webapi/3.2/studiable-item-documents?filters[studiableContainerId]='+id+'&filters[studiableContainerType]=1&perPage=500','/webapi/3.2/sets/'+id+'?perPage=500'];function tryNext(i){if(i>=eps.length){alert('Could not extract cards. Try: More () → Export on Quizlet.');return}fetch(eps[i],{credentials:'include'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(data){if(!tryData(data))tryNext(i+1)}).catch(function(){tryNext(i+1)})}tryNext(0)})()`;

const tabBtn = (active: boolean): React.CSSProperties => ({
  fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em',
  textTransform: 'uppercase',
  background: active ? 'var(--card)' : 'none',
  color: active ? 'var(--accent)' : 'var(--ink-soft)',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,.07)' : 'none',
  border: 'none', borderRadius: 7, padding: '7px 13px',
  cursor: 'pointer', fontWeight: active ? 500 : undefined,
  transition: 'all .15s', whiteSpace: 'nowrap',
});

const textareaStyle: React.CSSProperties = {
  width: '100%', minHeight: 130, resize: 'vertical',
  fontFamily: 'var(--f-mono)', fontSize: 13, lineHeight: 1.6,
  background: 'var(--paper-2)', border: '1px solid var(--line)',
  borderRadius: 10, padding: '12px 14px', color: 'var(--ink)',
  outline: 'none',
};

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--f-mono)', fontSize: 13, background: 'var(--paper-2)',
  border: '1px solid var(--line)', borderRadius: 7, padding: '7px 10px',
  color: 'var(--ink)', outline: 'none', transition: 'border-color .15s',
};

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseWordList(text: string): Array<{ h: string; p: string; m: string }> {
  return text.split(/[\n,，]+/).map(l => l.trim()).filter(Boolean).map(l => ({ h: l, p: '', m: '' }));
}

function parseQuizletText(text: string, wordRe: RegExp): Array<{ h: string; p: string; m: string }> {
  return text.split(/\n+/).map(l => l.trim()).filter(Boolean).flatMap(line => {
    const parts = line.split(/\t/);
    if (parts.length < 2) return [];
    const term = parts[0].trim(), def = parts[1].trim();
    if (!term) return [];
    if (wordRe.test(term)) return [{ h: term, p: '', m: def }];
    if (wordRe.test(def))  return [{ h: def,  p: '', m: term }];
    return [];
  });
}

function parseCsv(text: string, wordRe: RegExp): Array<{ h: string; p: string; m: string }> {
  return text.split(/\n+/).map(l => l.trim()).filter(Boolean).flatMap(line => {
    const parts = line.split(/,|\t/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    const [h, second, third] = parts;
    if (!h || !wordRe.test(h)) return [];
    if (third) return [{ h, p: second || '', m: third }];
    if (second) return [{ h, p: '', m: second }];
    return [{ h, p: '', m: '' }];
  });
}

// ─── Lookup helper ────────────────────────────────────────────────────────────

// Identity for "already in deck" / dedup: character + meaning. A different meaning for
// the same character (行 "to walk" vs 行 "a row") is a distinct, importable card.
function wordIdentity(w: { h: string; m: string }): string {
  return w.h + ' ' + (w.m || '').trim();
}

/** Does a pasted gloss look like it describes this reading's senses? Used only to pick
 *  BETWEEN a polyphone's readings — never as a source of definition text. */
function matchesSenses(pasted: string, senses: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const target = norm(pasted);
  if (!target) return false;
  return norm(senses).split(' ').some(word => word.length > 2 && target.includes(word));
}

/** Words the batch endpoint resolved, keyed by the surface that was submitted. */
type BatchResults = Record<string, { found: boolean; word: string; reading: string; meaning: string }>;

/** Requests per round-trip. Large pastes are chunked so one huge list doesn't become one
 *  huge request (the endpoint caps at 500). */
const BATCH_CHUNK = 200;

/**
 * Ask the server to resolve every distinct surface in one go, undoing inflection on the
 * way — this is what lets a pasted 먹었어요 land as the 먹다 card instead of being rejected.
 * Chinese never gets here: see `resolveBatch`.
 */
async function fetchBatch(surfaces: string[], lang: LanguageCode): Promise<BatchResults> {
  const out: BatchResults = {};
  for (let i = 0; i < surfaces.length; i += BATCH_CHUNK) {
    const chunk = surfaces.slice(i, i + BATCH_CHUNK);
    const res = await fetch('/api/batch-word-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang, words: chunk }),
    });
    if (!res.ok) throw new Error(`batch lookup failed: ${res.status}`);
    const data = await res.json();
    Object.assign(out, data.results ?? {});
  }
  return out;
}

/**
 * Resolve a whole parsed paste against the dictionary.
 *
 * STRICT POLICY: the dictionary is the only source of definitions. Pasted readings and
 * glosses are used solely to disambiguate WHICH entry is meant — never stored. A word with
 * no dictionary entry comes back 'not-found' and cannot be imported.
 *
 * Two transports behind one function, chosen the same way `useWordLookup` chooses for the
 * single-word form:
 *
 *   - Inflecting languages (ja, es, ko) go to /api/batch-word-lookup, because undoing
 *     conjugation needs the server-side lemmatizers.
 *   - Chinese stays on the client. It has no inflection to undo, and both CC-CEDICT and the
 *     polyphone table are already in the browser — sending it to the server would mean
 *     shipping another 8 MB dictionary server-side to compute an answer we already have.
 */
async function resolveBatch(
  parsed: Array<{ h: string; p: string; m: string }>,
  deckIds: Set<string>,
  lang: LanguageCode,
): Promise<ParsedWord[]> {
  const settle = (h: string, pin: string, mean: string): ParsedWord => {
    // In-deck only when the same character AND meaning already exist.
    if (deckIds.has(wordIdentity({ h, m: mean }))) {
      return { h, p: pin, m: mean, status: 'in-deck', selected: false };
    }
    return { h, p: pin, m: mean, status: 'ready', selected: true };
  };
  const missing = (h: string): ParsedWord =>
    ({ h, p: '', m: '', status: 'not-found', selected: false });

  if (lang === 'zh') {
    return Promise.all(parsed.map(async w => {
      let p = w.p;
      let pastedMeaning = w.m;
      // Pull a leading reading out of the definition so polyphones keep distinct pinyin
      // ("háng - a row" → pinyin "háng", meaning "a row").
      if (!p) {
        const split = splitLeadingPinyin(pastedMeaning);
        if (split) { p = split.pinyin; pastedMeaning = split.meaning; }
      }
      if (/[1-5]/.test(p)) p = toneNumToMark(p);

      // Polyphones carry a different meaning per reading, and the dictionary returns one
      // merged gloss covering all of them. The pasted reading (or gloss) picks which one is
      // meant; the definition text still comes from POLYPHONES — our curated data, not the
      // paste.
      const poly = POLYPHONES[w.h];
      if (poly?.length) {
        const chosen =
          poly.find(r => r.p === p)
          ?? poly.find(r => matchesSenses(pastedMeaning, r.m))
          ?? poly[0];
        return settle(w.h, chosen.p, chosen.m);
      }
      const found = await lookupReadingAsync(lang, w.h, '', '');
      return found.meaning ? settle(w.h, found.reading || p, found.meaning) : missing(w.h);
    }));
  }

  const surfaces = [...new Set(parsed.map(w => w.h).filter(Boolean))];
  const results = await fetchBatch(surfaces, lang);
  return parsed.map(w => {
    const r = results[w.h];
    if (!r?.found) return missing(w.h);
    // File the card under the dictionary form the server resolved, so an inflected paste
    // dedupes against the same card a generated passage would produce.
    return settle(r.word || w.h, r.reading, r.meaning);
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportPanel({ deck, studyDeck, onImport, onCancel }: Props) {
  const language = useLanguage();
  const langConfig = getLanguageConfig(language);
  const wordRe = langConfig.wordCharRe;
  // Level data + labels switch with the active language (HSK 1–6 / JLPT N5–N1 / CEFR A1–C2
  // / TOPIK 1–6). The tables themselves stream in when the level tab is opened.
  const [levelData, setLevelData] = useState<LevelData | null>(null);
  const levelVocab = levelData?.vocab ?? {};
  const levelWords = levelData?.words ?? {};
  const levelList = levelNumbers(language);
  // "HSK level" → "HSK levels" etc., so the tab and copy follow the active language.
  const levelSetLabel = `${langConfig.levelSectionLabel}s`;
  const [mode, setMode] = useState<ImportMode>('list');
  const [text, setText] = useState('');
  const [words, setWords] = useState<ParsedWord[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupError, setLookupError] = useState(false);
  const abortRef = useRef(0);

  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);
  const [dupCount, setDupCount] = useState(0);     // duplicate hanzi merged out of the paste
  const [droppedCount, setDroppedCount] = useState(0); // pasted lines that couldn't be parsed

  // Must run after every render — React reconciliation resets href="#" on re-renders
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  useLayoutEffect(() => {
    if (bookmarkletRef.current) {
      bookmarkletRef.current.href = 'javascript:' + BOOKMARKLET_SRC;
    }
  });

  function copyBookmarkletUrl() {
    navigator.clipboard.writeText('javascript:' + BOOKMARKLET_SRC).then(() => {
      setBookmarkletCopied(true);
      setTimeout(() => setBookmarkletCopied(false), 2000);
    });
  }

  function copyDebugUrl() {
    navigator.clipboard.writeText('javascript:' + DEBUG_SRC).then(() => {
      setDebugCopied(true);
      setTimeout(() => setDebugCopied(false), 2000);
    });
  }

  // Scope "already in deck" detection to the deck we're importing into. With studyDeck=''
  // ("All") inStudyDeck matches everything, so importing in All sees the whole collection
  // and shows "all added" instead of creating tag-only duplicates.
  const deckScoped = deck.filter(d => inStudyDeck(d, studyDeck));
  const deckSet = new Set(deckScoped.map(d => d.h));                 // hanzi-level — HSK mode
  const deckIds = new Set(deckScoped.map(d => wordIdentity(d)));     // character+meaning — list/csv/quizlet

  const loadLevelData = useCallback(async () => {
    if (levelData) return;
    try {
      setLevelData(await LEVEL_LOADERS[language]());
    } catch {
      // Chunk failed to load — the level grid stays empty rather than crashing the drawer.
    }
  }, [language, levelData]);

  // Drop cached tables when the language changes, so the grid can't show another
  // language's levels while the new ones stream in.
  useEffect(() => { setLevelData(null); }, [language]);

  function switchMode(m: ImportMode) {
    setMode(m);
    if (m === 'hsk') void loadLevelData();
    setText(''); setWords([]); setLookupDone(false);
    setDupCount(0); setDroppedCount(0);
  }

  // Re-parse text on change
  useEffect(() => {
    if (mode === 'hsk') return;
    const run = ++abortRef.current;
    if (!text.trim()) { setWords([]); setLookupDone(false); setDupCount(0); setDroppedCount(0); return; }

    let raw: Array<{ h: string; p: string; m: string }> = [];
    if (mode === 'list')    raw = parseWordList(text);
    if (mode === 'csv')     raw = parseCsv(text, wordRe);
    if (mode === 'quizlet') raw = parseQuizletText(text, wordRe);

    // How many input items were attempted — lets us report any that couldn't be parsed.
    const inputCount = (mode === 'list' ? text.split(/[\n,，]+/) : text.split(/\n+/))
      .map(l => l.trim()).filter(Boolean).length;
    setDroppedCount(Math.max(0, inputCount - raw.length));

    const seen = new Set<string>();
    const beforeDedup = raw.length;
    raw = raw.filter(w => { const k = wordIdentity(w); if (seen.has(k)) return false; seen.add(k); return true; });
    setDupCount(beforeDedup - raw.length);

    setWords(raw.map(w => ({ ...w, status: 'loading', selected: false })));
    setLookupDone(false);

    setLookupError(false);
    resolveBatch(raw, deckIds, language).then(results => {
      if (abortRef.current !== run) return;
      setWords(results);
      setLookupDone(true);
    }).catch(() => {
      if (abortRef.current !== run) return;
      // A failed lookup must not read as "these words don't exist" — nothing is importable,
      // but the reason shown is the network, not the dictionary.
      setWords(prev => prev.map(w => ({ ...w, status: 'not-found', selected: false })));
      setLookupError(true);
      setLookupDone(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, mode, language]);

  /** Only a confirmed dictionary entry can ever be selected. */
  const isSelectable = (w: ParsedWord) => w.status === 'ready';

  const toggleWord = useCallback((i: number) => {
    setWords(prev => prev.map((w, j) =>
      j === i && isSelectable(w) ? { ...w, selected: !w.selected } : w
    ));
  }, []);

  const selectedWords = words.filter(w => isSelectable(w) && w.selected && w.h && w.m);

  function handleImport() {
    // Re-filter rather than trusting `selected` alone. The UI already prevents selecting a
    // 'not-found' row, but this is the last point before the word reaches the deck, and a
    // stale selection (a row that was selectable and then re-resolved as not-found while
    // the text was still being edited) must not slip through.
    const payload = words
      .filter(w => isSelectable(w) && w.selected && w.h && w.m)
      .map(w => ({ h: w.h, p: w.p, m: w.m }));
    if (payload.length > 0) onImport(payload);
  }

  // ── HSK level mode ──────────────────────────────────────────────────────────

  function addHskLevel(level: number) {
    const wordList = levelWords[level] ?? [];
    const toAdd = wordList
      .filter(h => !deckSet.has(h))
      .map(h => {
        const v = levelVocab[h];
        return { h, p: v?.pinyin ?? v?.reading ?? '', m: v?.meaning ?? '' };
      })
      // Level lists are dictionary-derived, but a handful of entries carry no gloss.
      // A card with no meaning can't be reviewed, so it doesn't belong in the deck.
      .filter(w => w.m);
    if (toAdd.length > 0) onImport(toAdd);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Import vocabulary
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, marginTop: 2 }}>
            Add words in bulk
          </div>
        </div>
        <button onClick={onCancel}
          style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--line)', color: 'var(--ink-soft)', borderRadius: 7, padding: '7px 14px', cursor: 'pointer' }}>
          ← Back
        </button>
      </div>

      {/* Mode switcher */}
      <div className="inline-flex gap-1 p-[5px] rounded-[11px] mb-5 flex-wrap" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
        {(Object.keys(MODE_LABELS) as ImportMode[]).map(m => (
          <button key={m} onClick={() => switchMode(m)} style={tabBtn(mode === m)}>
            {m === 'hsk' ? levelSetLabel : MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* ── HSK level mode ── */}
      {mode === 'hsk' && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 18 }}>
            Add all vocabulary words from a specific {langConfig.levelSectionLabel.replace(/ level$/, '')} level. Words already in your deck are skipped.
          </p>
          {!levelData && (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)', letterSpacing: '.06em', marginBottom: 14 }}>
              loading {langConfig.name} word lists…
            </div>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {levelList.map(level => {
              const all    = levelWords[level]?.length ?? 0;
              const inDeck = (levelWords[level] ?? []).filter(h => deckSet.has(h)).length;
              const toAdd  = all - inDeck;
              return (
                <button key={level} onClick={() => addHskLevel(level)} disabled={toAdd === 0}
                  className="transition-all duration-150 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                  style={{ background: 'var(--card)', border: '1px solid var(--line)', borderBottom: '2px solid var(--accent)', borderRadius: 12, padding: '16px 18px', textAlign: 'left' }}>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 600 }}>{levelLabel(language, level)}</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, letterSpacing: '.04em' }}>
                    {toAdd > 0 ? `+ ${toAdd} new` : 'all added'}
                    <span style={{ color: 'var(--ink-faint)', marginLeft: 6 }}>/ {all} total</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quizlet mode ── */}
      {mode === 'quizlet' && (
        <div className="flex flex-col gap-5">

          {/* Bookmarklet — works on free accounts */}
          <div className="rounded-[12px] px-5 py-4" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Option A — Bookmarklet (free accounts, any set)
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 12 }}>
              A bookmarklet is a browser bookmark that runs a script instead of opening a page. You save it once and then click it while you&apos;re on a Quizlet set — it copies all the cards to your clipboard automatically. No Quizlet Plus needed.
            </p>
            <div className="flex items-center gap-4 flex-wrap mb-4">
              <a
                ref={bookmarkletRef}
                href="#"
                className="flex items-center gap-2 select-none"
                style={{
                  fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600,
                  background: 'var(--accent)', color: '#fff', borderRadius: 8,
                  padding: '10px 16px', boxShadow: '0 2px 0 var(--accent-deep)',
                  textDecoration: 'none', cursor: 'grab', whiteSpace: 'nowrap', display: 'inline-flex',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
                Copy Quizlet Cards
              </a>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>← drag to your bookmarks bar to save it</span>
            </div>
            <ol style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.9, margin: 0, paddingLeft: 18 }}>
              <li>Drag the button above to your browser&apos;s bookmarks bar — or right-click → <em>Bookmark this link</em></li>
              <li>Open your Quizlet set in a new tab</li>
              <li>Click <strong>Copy Quizlet Cards</strong> in your bookmarks bar — a popup says how many cards were copied</li>
              <li>Come back here and paste below</li>
            </ol>
            <div className="flex flex-col gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span style={{ fontSize: 12, color: 'var(--ink-faint)', minWidth: 90 }}>Drag not working?</span>
                <button onClick={copyBookmarkletUrl} className="cursor-pointer transition-all duration-150"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', background: bookmarkletCopied ? 'var(--jade-soft)' : 'var(--card)', color: bookmarkletCopied ? 'var(--jade)' : 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 12px' }}>
                  {bookmarkletCopied ? '✓ Copied' : 'Copy URL'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  → right-click bookmarks bar → <em>Add bookmark</em> → paste into the <strong>URL field</strong> (not the address bar)
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span style={{ fontSize: 12, color: 'var(--ink-faint)', minWidth: 90 }}>Still failing?</span>
                <button onClick={copyDebugUrl} className="cursor-pointer transition-all duration-150"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', background: debugCopied ? 'var(--jade-soft)' : 'var(--card)', color: debugCopied ? 'var(--jade)' : 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 12px' }}>
                  {debugCopied ? '✓ Copied' : 'Copy Debug'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  → save as a bookmark the same way → run it on your Quizlet page → share the popup text with me
                </span>
              </div>
            </div>
          </div>

          {/* Manual export — Quizlet Plus */}
          <div className="rounded-[12px] px-5 py-4" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Option B — Quizlet export (Quizlet Plus)
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
              Open the set in Quizlet → <strong>⋯ More</strong> → <strong>Export</strong>, copy the text, then paste below.
            </p>
          </div>

          {/* Shared paste area */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>
              Paste here (works for both options above)
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste copied cards here…"
              style={textareaStyle}
            />
          </div>

        </div>
      )}

      {/* ── Word list mode ── */}
      {mode === 'list' && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 10 }}>
            Paste {langConfig.name} words, one per line or comma-separated.{' '}
            {langConfig.hasReadings ? 'Readings and meanings are' : 'Meanings are'} looked up automatically from {langConfig.dictName}.
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={`${langConfig.sampleWords.join('\n')}\n...`} style={textareaStyle} />
        </div>
      )}

      {/* ── CSV mode ── */}
      {mode === 'csv' && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 10 }}>
            Columns: <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--line-soft)', padding: '1px 5px', borderRadius: 4 }}>word, meaning</code>{langConfig.hasReadings && <> or <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--line-soft)', padding: '1px 5px', borderRadius: 4 }}>word, {langConfig.readingLabel.toLowerCase()}, meaning</code></>}. Compatible with Anki and Pleco exports.
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={`${langConfig.sampleWords[0]},to study\n${langConfig.sampleWords[1]},to work\n...`} style={textareaStyle} />
        </div>
      )}

      {/* ── Shared preview ── */}
      {words.length > 0 && mode !== 'hsk' && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              Preview · {words.length} word{words.length !== 1 ? 's' : ''}
              {dupCount > 0 && <span style={{ textTransform: 'none', letterSpacing: 0 }} title="Your deck stores one entry per character, so repeated characters were collapsed into one."> · {dupCount} duplicate{dupCount !== 1 ? 's' : ''} merged</span>}
              {droppedCount > 0 && <span style={{ textTransform: 'none', letterSpacing: 0 }} title={`Lines with no ${langConfig.name} word couldn't be parsed.`}> · {droppedCount} skipped</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWords(prev => prev.map(w => isSelectable(w) ? { ...w, selected: true } : w))}
                style={{ ...inputStyle, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>All</button>
              <button onClick={() => setWords(prev => prev.map(w => ({ ...w, selected: false })))}
                style={{ ...inputStyle, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>None</button>
            </div>
          </div>

          {!lookupDone && (
            <div
              className="flex items-center gap-2.5 mb-2 px-4 py-2.5 rounded-[9px]"
              style={{ background: 'var(--paper-2)', border: '1px dashed var(--line)' }}
            >
              <span className="playing-pulse" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-soft)', letterSpacing: '.04em' }}>
                Validating vocabulary against the {langConfig.dictName.replace(/\s*\(.*\)$/, '')} dictionary…
              </span>
            </div>
          )}

          {lookupError && (
            <div
              className="mb-2 px-4 py-2.5 rounded-[9px]"
              style={{ background: 'color-mix(in srgb, var(--accent) 7%, transparent)', border: '1px dashed var(--accent)' }}
            >
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)' }}>Couldn&apos;t reach the dictionary</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.5 }}>
                This is a connection problem, not a verdict on these words — edit the text above to retry.
              </div>
            </div>
          )}

          <div className="rounded-[10px] overflow-hidden mb-4" style={{ border: '1px solid var(--line)', maxHeight: 300, overflowY: 'auto' }}>
            {words.map((w, i) => (
              <div key={i}
                onClick={() => isSelectable(w) && toggleWord(i)}
                className="flex items-center gap-2 px-4 py-2 transition-colors"
                style={{
                  background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--card)',
                  borderBottom: i < words.length - 1 ? '1px solid var(--line-soft)' : 'none',
                  cursor: isSelectable(w) ? 'pointer' : 'not-allowed',
                  opacity: w.status === 'not-found' ? 0.5 : 1,
                  minHeight: 42,
                }}>
                {/* Checkbox — only a confirmed dictionary entry can be ticked. */}
                <input
                  type="checkbox"
                  checked={w.selected}
                  disabled={!isSelectable(w)}
                  readOnly
                  aria-label={isSelectable(w) ? `Import ${w.h}` : `${w.h} cannot be imported`}
                  onClick={e => e.stopPropagation()}
                  onChange={() => toggleWord(i)}
                  style={{
                    width: 16, height: 16, flexShrink: 0, margin: 0, accentColor: 'var(--accent)',
                    cursor: isSelectable(w) ? 'pointer' : 'not-allowed',
                    opacity: isSelectable(w) ? 1 : 0.4,
                  }}
                />

                <span style={{ fontFamily: 'var(--f-han)', fontSize: 20, minWidth: 56, fontWeight: 'var(--han-weight)' as 'bold' }}>{w.h}</span>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', minWidth: 90, letterSpacing: '.03em' }}>
                  {w.status === 'loading' ? '…' : w.p || '—'}
                </span>
                {/* Read-only — definitions come from the dictionary and are never editable. */}
                <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.status === 'loading' ? 'looking up…' :
                   w.status === 'not-found' ? <span style={{ color: 'var(--accent)', fontFamily: 'var(--f-mono)', fontSize: 11 }}>not in dictionary — can&apos;t be imported</span> :
                   w.status === 'in-deck' ? <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontSize: 11 }}>already in deck</span> :
                   w.m || '—'}
                </span>
              </div>
            ))}
          </div>

          {/* Shown whenever the lookup has finished — not only when something is
              selectable. If every pasted word is missing from the dictionary the counts
              are the only explanation the user gets for an empty import. */}
          {lookupDone && (() => {
            const inDeck = words.filter(w => w.status === 'in-deck').length;
            const missing = words.filter(w => w.status === 'not-found').length;
            const notes = [
              inDeck > 0 ? `${inDeck} already in deck` : '',
              missing > 0 ? `${missing} not in dictionary` : '',
            ].filter(Boolean).join(' · ');
            return (
              <div className="flex items-center gap-3 flex-wrap">
                {selectedWords.length > 0 && (
                  <button onClick={handleImport}
                    className="cursor-pointer transition-all duration-150"
                    style={{
                      fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                      background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '11px 22px', boxShadow: '0 2px 0 var(--accent-deep)',
                    }}>
                    Import {selectedWords.length} word{selectedWords.length !== 1 ? 's' : ''}
                  </button>
                )}
                {notes && (
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: missing > 0 && selectedWords.length === 0 ? 'var(--accent)' : 'var(--ink-faint)' }}>
                    {notes}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
