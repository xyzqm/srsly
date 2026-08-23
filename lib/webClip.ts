import { MAX_PASTE_CHARS } from './constants';

/**
 * The one-click web clipper.
 *
 * Copy-pasting is fine on day one and tedious by week two — and the whole argument for srsly
 * is that you read what you actually want to read. A bookmarklet closes that gap: you are on
 * a Spanish blog or a Chinese article about something you care about, you click once, and it
 * opens here already segmented.
 *
 * ## The text travels in the URL HASH, and that is the whole design
 *
 * A fragment is never sent to the server — browsers strip it from the request. So the article
 * you were reading stays on your device, which is the same promise the paste and EPUB panels
 * already make ("Stays on this device — nothing is uploaded"). A POST endpoint would have been
 * easier to write and would have quietly broken that promise for the one source where the
 * content is someone else's page.
 *
 * It also means no storage, no expiry, no new endpoint, and nothing to clean up.
 *
 * The cap is `MAX_PASTE_CHARS` (8,000), which paste already enforces — so the URL stays far
 * inside every browser's limit and the clipper cannot produce something the reader could not
 * have pasted by hand.
 */

/** Marks a hash as ours, so an unrelated `#section` on the page is never parsed as a clip. */
const CLIP_PREFIX = '#clip=';

export interface WebClip {
  title: string;
  text: string;
  /**
   * The page's own `<html lang>`, when it declared one.
   *
   * Without this a clip is segmented in whatever language the app happened to be showing —
   * clip a Spanish article while studying Chinese and it is analysed as Chinese, which is
   * nonsense. The reader then has to notice, switch language, and re-paste by hand, which is
   * the entire saving of the feature spent on a detour.
   *
   * A raw tag, not a LanguageCode: the page can say anything (`es-419`, `zh-Hans`, `English`),
   * and deciding what it means is `languageFromTag`'s job, not the bookmarklet's.
   */
  lang?: string;
}

/**
 * Build the fragment the bookmarklet navigates to.
 *
 * The payload is JSON, then percent-encoded whole — NOT two fields joined by a separator.
 * A separator cannot be made safe here: `encodeURIComponent` escapes `|` to `%7C` inside the
 * title, and the browser escapes the literal `|` between the fields to `%7C` as well, so the
 * two become indistinguishable. Anything `encodeURIComponent` leaves alone (`~`, `!`, `*`)
 * has the mirror-image problem — it survives inside the content too.
 *
 * JSON has no such ambiguity, and this was found by clicking the link rather than by the
 * round-trip test, which passed happily because it never went through a browser.
 */
export function encodeClip(clip: WebClip): string {
  const payload = JSON.stringify({
    t: clip.title,
    x: clip.text.slice(0, MAX_PASTE_CHARS),
    ...(clip.lang ? { l: clip.lang } : {}),
  });
  return `${CLIP_PREFIX}${encodeURIComponent(payload)}`;
}

/**
 * Read a clip out of a location hash. Returns null for anything that is not one.
 *
 * Deliberately forgiving about damage: a hash can be mangled by a link shortener, a chat app,
 * or a manual copy-paste, and the honest response to that is "no clip" rather than a thrown
 * error on someone's first visit.
 */
export function decodeClip(hash: string): WebClip | null {
  if (!hash.startsWith(CLIP_PREFIX)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(hash.slice(CLIP_PREFIX.length)));
    if (!parsed || typeof parsed !== 'object') return null;
    const { t, x, l } = parsed as { t?: unknown; x?: unknown; l?: unknown };
    const text = typeof x === 'string' ? x.trim() : '';
    if (!text) return null;
    return {
      title: typeof t === 'string' ? t.trim() : '',
      text: text.slice(0, MAX_PASTE_CHARS),
      ...(typeof l === 'string' && l.trim() ? { lang: l.trim().slice(0, 20) } : {}),
    };
  } catch {
    return null;   // malformed percent-encoding, or not JSON
  }
}

/**
 * The bookmarklet source.
 *
 * Written as a string rather than a real module because it has to run in the READER'S page,
 * not ours — it is pasted into a bookmark, so it cannot import anything, cannot depend on our
 * bundle, and has to survive being minified into a `javascript:` URL.
 *
 * What it does, in order:
 *   1. Prefer the reader's SELECTION. If you highlighted three paragraphs, you meant those
 *      three paragraphs, and no heuristic beats being told.
 *   2. Otherwise take `<article>`, then `<main>`, then the biggest text block on the page.
 *      Real articles are wrapped in one of the first two often enough to be worth trying, and
 *      the fallback keeps it useful on the sites that are not.
 *   3. Strip script/style/nav/header/footer/aside before reading text, so the clip is the
 *      article and not the navigation.
 *
 * `origin` is injected at render time so the bookmarklet points at whatever host the app is
 * actually served from — localhost in development, the real domain in production.
 */
export function bookmarkletSource(origin: string): string {
  return `javascript:(function(){
var S=window.getSelection&&String(window.getSelection());
var t='';
if(S&&S.trim().length>40){t=S;}
else{
var el=document.querySelector('article')||document.querySelector('[role=main]')||document.querySelector('main');
if(!el){var best=null,max=0,c=document.querySelectorAll('div,section');
for(var i=0;i<c.length;i++){var L=(c[i].innerText||'').length;if(L>max){max=L;best=c[i];}}el=best;}
if(el){var cl=el.cloneNode(true);
var junk=cl.querySelectorAll('script,style,nav,header,footer,aside,form,noscript');
for(var j=0;j<junk.length;j++){junk[j].parentNode.removeChild(junk[j]);}
t=cl.innerText||'';}}
t=t.replace(/\\n{3,}/g,'\\n\\n').trim().slice(0,${MAX_PASTE_CHARS});
if(!t){alert('srsly: no article text found on this page.');return;}
var h=document.querySelector('h1');
var ti=(h&&h.innerText||document.title||'').trim().slice(0,120);
var lg=(document.documentElement.getAttribute('lang')||'').trim();
window.open('${origin}/'+'${CLIP_PREFIX}'+encodeURIComponent(JSON.stringify({t:ti,x:t,l:lg})),'_blank');
})();`.replace(/\n/g, '');
}
