
/**
 * EPUB parsing, in the browser, with no reader library.
 *
 * NO IFRAME AND NO react-reader, deliberately. Those render the publisher's XHTML inside a
 * document we do not control, which would put every word of the book out of reach of the
 * segmenters, the spacing rules and WordPopup — the entire reason this app renders text as
 * tokens rather than as prose. What comes out of here is plain text, which then goes through
 * exactly the same pipeline a pasted passage does.
 *
 * An EPUB is a ZIP with a fixed entry point:
 *
 *   META-INF/container.xml   →  names the OPF ("package document")
 *   the OPF                  →  <manifest> maps ids to files, <spine> gives READING ORDER
 *   spine items              →  XHTML chapters
 *
 * The spine is what matters. The manifest lists every file in the book including images,
 * styles and the cover; only the spine says which are body text and in what order, so
 * walking the manifest instead would produce a shuffled book full of stylesheets.
 *
 * JSZip is imported LAZILY, for the same reason the level tables are: it is ~30 kB and only
 * a reader who actually opens a book needs it. A static import put it in the initial bundle
 * for every learner of every language, which is precisely the regression the @data/@dict
 * discipline exists to prevent.
 */

export interface EpubChapter {
  /** Manifest id, stable within the book. */
  id: string;
  /** Path inside the archive, used for resolving and for debugging a bad parse. */
  href: string;
  /** Heading found in the chapter, or a positional fallback. */
  title: string;
  /** Body text, whitespace-normalised, paragraphs separated by blank lines. */
  text: string;
}

export interface EpubBook {
  title: string;
  author?: string;
  /** The `dc:language` the publisher declared, if any — not to be trusted over the user's. */
  language?: string;
  chapters: EpubChapter[];
}

/** Thrown for a file that is not an EPUB at all, so the UI can say which problem it is. */
export class EpubError extends Error {}

const XML = 'application/xml';

function must<T>(v: T | null | undefined, message: string): T {
  if (v === null || v === undefined) throw new EpubError(message);
  return v;
}

/** Resolve an href that is relative to the OPF's own directory. */
function resolveFrom(base: string, href: string): string {
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const joined = (dir + href).replace(/\/\.\//g, '/');
  // Collapse any `x/../` produced by a chapter that reaches up out of its folder.
  return joined.replace(/[^/]+\/\.\.\//g, '');
}

/**
 * Text of one XHTML chapter.
 *
 * Structure is flattened to blank-line-separated paragraphs rather than preserved, because
 * everything downstream works in sentences: splitSentences treats a line break as a hard
 * boundary, so a paragraph per line is exactly the shape it wants.
 *
 * `<script>`, `<style>` and the rest are dropped by taking `textContent` only from block
 * elements we choose, not from the whole document.
 */
function chapterText(doc: Document): string {
  doc.querySelectorAll('script, style, svg, head').forEach(n => n.remove());
  const body = doc.body ?? doc.documentElement;
  if (!body) return '';

  const blocks = body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, div, td');
  const seen = new Set<Element>();
  const out: string[] = [];

  for (const el of Array.from(blocks)) {
    // A <div> wrapping <p>s would otherwise emit the whole chapter, then each paragraph
    // again. Skip any block that contains another block we are going to visit.
    if (el.querySelector('p, h1, h2, h3, h4, h5, h6, li, blockquote, div, td')) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }

  // Nothing matched — a chapter that is one bare text node. Fall back to the body itself.
  if (out.length === 0) {
    const t = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
    return t;
  }
  return out.join('\n');
}

/** The first heading in a chapter, which is usually its real title. */
function chapterTitle(doc: Document, fallback: string): string {
  const h = doc.querySelector('h1, h2, h3, title');
  const t = (h?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t || fallback;
}

/**
 * Parse an EPUB into ordered chapters of plain text.
 *
 * Browser-only: uses DOMParser rather than shipping an XML parser, since every consumer is a
 * file the learner just dropped into the page.
 */
export async function parseEpub(data: ArrayBuffer | Blob): Promise<EpubBook> {
  const { default: JSZip } = await import('jszip');
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new EpubError('That file is not a valid EPUB (it could not be unzipped).');
  }

  const parser = new DOMParser();
  /**
   * Read one entry, trying the spellings a real EPUB actually uses.
   *
   * An href in the OPF is a URI, so a file called `chapter 1.xhtml` is written
   * `chapter%201.xhtml` — while the ZIP entry keeps the literal space. Accented and CJK
   * filenames are percent-encoded the same way. Looking up only the raw href silently found
   * nothing, and a book whose chapters all have spaces in their names parsed to zero
   * chapters and reported "no readable text", which is true and useless.
   */
  const read = async (path: string): Promise<string> => {
    const candidates = [path, path.replace(/^\//, '')];
    try {
      const decoded = decodeURIComponent(path);
      if (decoded !== path) candidates.push(decoded, decoded.replace(/^\//, ''));
    } catch { /* a stray % that is not an escape — the raw path is all we have */ }
    for (const c of candidates) {
      const f = zip.file(c);
      if (f) return f.async('string');
    }
    return '';
  };

  // ── container.xml → the OPF ────────────────────────────────────────────────
  const containerXml = await read('META-INF/container.xml');
  if (!containerXml) throw new EpubError('That file is not a valid EPUB (no META-INF/container.xml).');
  const container = parser.parseFromString(containerXml, XML);
  // The OPF path is READ FROM THE ARCHIVE, never guessed. `OEBPS/content.opf` is only a
  // convention — Calibre, InDesign and Sigil all place it differently, and container.xml is
  // the one file whose location the spec actually fixes.
  //
  // getElementsByTagName, not a selector, for the same namespace reason as the manifest below:
  // container.xml usually puts <rootfile> in the default OCF namespace, but a prefixed
  // <ocf:rootfile> is legal and would need `ocf|rootfile` in a selector to match.
  const opfPath = must(
    (container.getElementsByTagName('rootfile')[0]
      ?? container.getElementsByTagName('ocf:rootfile')[0])?.getAttribute('full-path'),
    'That EPUB does not name a package document.',
  );

  // ── the OPF → manifest + spine ─────────────────────────────────────────────
  const opfXml = await read(opfPath);
  if (!opfXml) throw new EpubError('That EPUB names a package document that is not in the archive.');
  const opf = parser.parseFromString(opfXml, XML);

  const manifest = new Map<string, { href: string; type: string }>();
  // getElementsByTagName rather than a selector, for the same namespace reason as metaText.
  Array.from(opf.getElementsByTagName('item')).forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, { href, type: item.getAttribute('media-type') ?? '' });
  });

  const spineIds = Array.from(opf.getElementsByTagName('itemref'))
    .map(r => r.getAttribute('idref'))
    .filter((v): v is string => !!v);
  if (spineIds.length === 0) throw new EpubError('That EPUB has no readable chapters in its spine.');

  /**
   * Metadata by LOCAL name, not by selector.
   *
   * The OPF puts these in the Dublin Core namespace, so the element is `<dc:title>` and a
   * CSS selector has to guess whether the prefix is part of the name or a namespace to
   * resolve — which differs between XML and HTML parsing and between implementations.
   * Walking the children and comparing the part after the colon sidesteps the question, and
   * works whichever prefix the publisher chose.
   */
  const metaText = (tag: string) => {
    const metadata = opf.getElementsByTagName('metadata')[0]
      ?? opf.getElementsByTagName('opf:metadata')[0];
    for (const el of Array.from(metadata?.children ?? [])) {
      const local = el.tagName.includes(':') ? el.tagName.split(':').pop()! : el.tagName;
      if (local.toLowerCase() === tag) return (el.textContent ?? '').trim() || undefined;
    }
    return undefined;
  };

  // ── spine → chapters ───────────────────────────────────────────────────────
  const chapters: EpubChapter[] = [];
  for (const id of spineIds) {
    const entry = manifest.get(id);
    if (!entry) continue;
    // Only marked-up documents are body text; a spine can also point at an image page.
    if (entry.type && !/html|xml/.test(entry.type)) continue;

    const path = resolveFrom(opfPath, entry.href);
    const raw = await read(path);
    if (!raw) continue;

    const doc = parser.parseFromString(raw, entry.type.includes('xhtml') ? XML : 'text/html');
    const text = chapterText(doc);
    // Front matter is often a near-empty page — a cover link, a copyright line. Keeping them
    // would open the book on three chapters with nothing to read.
    if (text.length < 200) continue;

    chapters.push({
      id,
      href: path,
      title: chapterTitle(doc, `Chapter ${chapters.length + 1}`),
      text,
    });
  }

  if (chapters.length === 0) throw new EpubError('No readable text was found in that EPUB.');

  return {
    title: metaText('title') ?? 'Untitled book',
    author: metaText('creator'),
    language: metaText('language'),
    chapters,
  };
}
