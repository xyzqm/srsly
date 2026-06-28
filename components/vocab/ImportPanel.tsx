'use client';
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import type { DeckWord } from '@/lib/types';
import { lookupWordAsync } from '@/lib/data/dict';
import { HSK_VOCAB } from '@/lib/data/hsk-vocab';
import { HSK_LEVELS } from '@/lib/data/hsk-levels';
import { toneNumToMark, splitLeadingPinyin } from '@/lib/pinyin';
import { inStudyDeck } from '@/lib/deck';

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

function parseQuizletText(text: string): Array<{ h: string; p: string; m: string }> {
  return text.split(/\n+/).map(l => l.trim()).filter(Boolean).flatMap(line => {
    const parts = line.split(/\t/);
    if (parts.length < 2) return [];
    const term = parts[0].trim(), def = parts[1].trim();
    if (!term) return [];
    if (/[一-鿿]/.test(term)) return [{ h: term, p: '', m: def }];
    if (/[一-鿿]/.test(def))  return [{ h: def,  p: '', m: term }];
    return [];
  });
}

function parseCsv(text: string): Array<{ h: string; p: string; m: string }> {
  return text.split(/\n+/).map(l => l.trim()).filter(Boolean).flatMap(line => {
    const parts = line.split(/,|\t/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    const [h, second, third] = parts;
    if (!h || !/[一-鿿]/.test(h)) return [];
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

async function resolveWord(
  w: { h: string; p: string; m: string },
  deckIds: Set<string>,
): Promise<ParsedWord> {
  let p = w.p, m = w.m;
  // Pull a leading reading out of the definition so polyphones keep distinct pinyin
  // ("háng - a row" → pinyin "háng", meaning "a row"). Only when no pinyin was given.
  if (!p) {
    const split = splitLeadingPinyin(m);
    if (split) { p = split.pinyin; m = split.meaning; }
  }
  let status: ParsedWord['status'];
  if (p && m) {
    p = /[1-5]/.test(p) ? toneNumToMark(p) : p;
    status = 'ready';
  } else {
    const found = await lookupWordAsync(w.h, '', m);
    p = found.pinyin || p;
    // Prefer the pasted meaning: it's what distinguishes two readings of one character
    // (行 "to walk" vs "a row"); the dictionary returns a single merged gloss.
    m = m || found.meaning;
    status = (m || found.meaning || found.pinyin) ? 'ready' : 'not-found';
  }
  // In-deck only when the same character AND meaning already exist.
  if (deckIds.has(wordIdentity({ h: w.h, m }))) {
    return { h: w.h, p, m, status: 'in-deck', selected: false };
  }
  return { h: w.h, p, m, status, selected: status === 'ready' };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportPanel({ deck, studyDeck, onImport, onCancel }: Props) {
  const [mode, setMode] = useState<ImportMode>('list');
  const [text, setText] = useState('');
  const [words, setWords] = useState<ParsedWord[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const abortRef = useRef(0);

  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [debugCopied, setDebugCopied] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ h: '', p: '', m: '' });
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

  function switchMode(m: ImportMode) {
    setMode(m);
    setText(''); setWords([]); setLookupDone(false); setEditingIdx(null);
    setDupCount(0); setDroppedCount(0);
  }

  function startEdit(e: React.MouseEvent, i: number) {
    e.stopPropagation();
    setEditingIdx(i);
    setEditDraft({ h: words[i].h, p: words[i].p, m: words[i].m });
  }

  function commitEdit() {
    if (editingIdx === null) return;
    setWords(prev => prev.map((w, i) =>
      i === editingIdx
        ? { ...w, h: editDraft.h.trim(), p: editDraft.p.trim(), m: editDraft.m.trim(), status: 'ready' as const, selected: true }
        : w
    ));
    setEditingIdx(null);
  }

  // Re-parse text on change
  useEffect(() => {
    if (mode === 'hsk') return;
    const run = ++abortRef.current;
    if (!text.trim()) { setWords([]); setLookupDone(false); setDupCount(0); setDroppedCount(0); return; }

    let raw: Array<{ h: string; p: string; m: string }> = [];
    if (mode === 'list')    raw = parseWordList(text);
    if (mode === 'csv')     raw = parseCsv(text);
    if (mode === 'quizlet') raw = parseQuizletText(text);

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

    Promise.all(raw.map(w => resolveWord(w, deckIds))).then(results => {
      if (abortRef.current !== run) return;
      setWords(results);
      setLookupDone(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, mode]);

  const toggleWord = useCallback((i: number) => {
    setWords(prev => prev.map((w, j) => j === i ? { ...w, selected: !w.selected } : w));
  }, []);

  const selectedWords = words.filter(w => w.selected && w.h);

  function handleImport() {
    onImport(selectedWords.map(w => ({ h: w.h, p: w.p, m: w.m })));
  }

  // ── HSK level mode ──────────────────────────────────────────────────────────

  function addHskLevel(level: number) {
    const hanziList = HSK_LEVELS[level] ?? [];
    const toAdd = hanziList
      .filter(h => !deckSet.has(h))
      .map(h => { const v = HSK_VOCAB[h]; return { h, p: v?.pinyin ?? '', m: v?.meaning ?? '' }; });
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
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* ── HSK level mode ── */}
      {mode === 'hsk' && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 18 }}>
            Add all vocabulary words from a specific HSK level. Words already in your deck are skipped.
          </p>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {[1, 2, 3, 4, 5, 6].map(level => {
              const all    = HSK_LEVELS[level]?.length ?? 0;
              const inDeck = (HSK_LEVELS[level] ?? []).filter(h => deckSet.has(h)).length;
              const toAdd  = all - inDeck;
              return (
                <button key={level} onClick={() => addHskLevel(level)} disabled={toAdd === 0}
                  className="transition-all duration-150 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                  style={{ background: 'var(--card)', border: '1px solid var(--line)', borderBottom: '2px solid var(--accent)', borderRadius: 12, padding: '16px 18px', textAlign: 'left' }}>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 600 }}>HSK {level}</div>
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
            Paste Chinese words, one per line or comma-separated. Pinyin and meanings are looked up automatically from CC-CEDICT (121k entries).
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'学习\n工作\n朋友\n...'} style={textareaStyle} />
        </div>
      )}

      {/* ── CSV mode ── */}
      {mode === 'csv' && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 10 }}>
            Columns: <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--line-soft)', padding: '1px 5px', borderRadius: 4 }}>hanzi, meaning</code> or <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--line-soft)', padding: '1px 5px', borderRadius: 4 }}>hanzi, pinyin, meaning</code>. Compatible with Anki and Pleco exports.
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'学习,to study\n工作,gōngzuò,to work\n...'} style={textareaStyle} />
        </div>
      )}

      {/* ── Shared preview ── */}
      {words.length > 0 && mode !== 'hsk' && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              Preview · {words.length} word{words.length !== 1 ? 's' : ''}
              {dupCount > 0 && <span style={{ textTransform: 'none', letterSpacing: 0 }} title="Your deck stores one entry per character, so repeated characters were collapsed into one."> · {dupCount} duplicate{dupCount !== 1 ? 's' : ''} merged</span>}
              {droppedCount > 0 && <span style={{ textTransform: 'none', letterSpacing: 0 }} title="Lines with no Chinese character or no definition couldn't be imported."> · {droppedCount} skipped</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setWords(prev => prev.map(w => w.status === 'in-deck' ? w : { ...w, selected: true }))}
                style={{ ...inputStyle, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>All</button>
              <button onClick={() => setWords(prev => prev.map(w => ({ ...w, selected: false })))}
                style={{ ...inputStyle, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>None</button>
            </div>
          </div>

          <div className="rounded-[10px] overflow-hidden mb-4" style={{ border: '1px solid var(--line)', maxHeight: 300, overflowY: 'auto' }}>
            {words.map((w, i) => (
              <div key={i}
                onClick={() => editingIdx !== i && w.status !== 'in-deck' && toggleWord(i)}
                className="flex items-center gap-2 px-4 py-2 transition-colors"
                style={{
                  background: i % 2 === 0 ? 'var(--paper-2)' : 'var(--card)',
                  borderBottom: i < words.length - 1 ? '1px solid var(--line-soft)' : 'none',
                  cursor: editingIdx === i ? 'default' : w.status === 'in-deck' ? 'default' : 'pointer',
                  opacity: w.status === 'not-found' && editingIdx !== i ? 0.5 : 1,
                  minHeight: 42,
                }}>
                {/* Checkbox */}
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${w.selected ? 'var(--accent)' : 'var(--line)'}`,
                  background: w.selected ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {w.selected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                </div>

                {editingIdx === i ? (
                  <>
                    <input autoFocus value={editDraft.h}
                      onChange={e => setEditDraft(d => ({ ...d, h: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      style={{ ...inputStyle, width: 56, fontFamily: 'var(--f-han)', fontSize: 17, padding: '3px 6px' }} />
                    <input value={editDraft.p} placeholder="pīnyīn"
                      onChange={e => setEditDraft(d => ({ ...d, p: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      style={{ ...inputStyle, width: 94, fontSize: 12, padding: '3px 6px' }} />
                    <input value={editDraft.m} placeholder="meaning"
                      onChange={e => setEditDraft(d => ({ ...d, m: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingIdx(null); }}
                      style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '3px 6px' }} />
                    <button onClick={e => { e.stopPropagation(); commitEdit(); }}
                      style={{ background: 'var(--jade)', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 9px', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: 11, flexShrink: 0 }}>✓</button>
                    <button onClick={e => { e.stopPropagation(); setEditingIdx(null); }}
                      style={{ background: 'var(--line-soft)', color: 'var(--ink-soft)', border: 'none', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontFamily: 'var(--f-mono)', fontSize: 11, flexShrink: 0 }}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontFamily: 'var(--f-han)', fontSize: 20, minWidth: 56, fontWeight: 'var(--han-weight)' as 'bold' }}>{w.h}</span>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', minWidth: 90, letterSpacing: '.03em' }}>
                      {w.status === 'loading' ? '…' : w.p || '—'}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.status === 'loading' ? 'looking up…' :
                       w.status === 'not-found' ? 'not in dictionary' :
                       w.status === 'in-deck' ? <span style={{ color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontSize: 11 }}>already in deck</span> :
                       w.m || '—'}
                    </span>
                    {w.status !== 'in-deck' && w.status !== 'loading' && (
                      <button onClick={e => startEdit(e, i)}
                        title="Edit"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', color: 'var(--ink-faint)', flexShrink: 0, fontSize: 14, lineHeight: 1, borderRadius: 4 }}>
                        ✎
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {selectedWords.length > 0 && lookupDone && (
            <div className="flex items-center gap-3">
              <button onClick={handleImport}
                className="cursor-pointer transition-all duration-150"
                style={{
                  fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '11px 22px', boxShadow: '0 2px 0 var(--accent-deep)',
                }}>
                Import {selectedWords.length} word{selectedWords.length !== 1 ? 's' : ''}
              </button>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
                {words.filter(w => w.status === 'in-deck').length > 0 && `${words.filter(w => w.status === 'in-deck').length} already in deck`}
                {words.filter(w => w.status === 'not-found').length > 0 && ` · ${words.filter(w => w.status === 'not-found').length} not found`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
