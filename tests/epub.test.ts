// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseEpub, EpubError } from '@/lib/epub';
import { chunkChapter } from '@/lib/epubChunk';
import { MAX_PASTE_CHARS } from '@/lib/constants';

/**
 * Built as a real ZIP rather than mocked, because every bug this parser can have is about the
 * shape of an actual EPUB: the OPF living in a subfolder, the spine disagreeing with the
 * manifest, a chapter reached by a relative href.
 */
async function makeEpub(opts: {
  opfPath?: string;
  chapters?: { name: string; html: string }[];
  spine?: string[];
  extraManifest?: string;
} = {}): Promise<ArrayBuffer> {
  const opfPath = opts.opfPath ?? 'OEBPS/content.opf';
  const dir = opfPath.slice(0, opfPath.lastIndexOf('/') + 1);
  const body = (n: number) => `<p>${'Una frase larga de prueba. '.repeat(20)} Capítulo ${n}.</p>`;
  const chapters = opts.chapters ?? [
    { name: 'c1.xhtml', html: `<html><body><h1>Primero</h1>${body(1)}</body></html>` },
    { name: 'c2.xhtml', html: `<html><body><h1>Segundo</h1>${body(2)}</body></html>` },
  ];
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml',
    `<container><rootfiles><rootfile full-path="${opfPath}"/></rootfiles></container>`);
  const items = chapters.map((c, i) =>
    `<item id="ch${i + 1}" href="${c.name}" media-type="application/xhtml+xml"/>`).join('');
  const spine = (opts.spine ?? chapters.map((_, i) => `ch${i + 1}`))
    .map(id => `<itemref idref="${id}"/>`).join('');
  // A real OPF declares the Dublin Core namespace; without it the document is invalid XML.
  zip.file(opfPath, `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>
      <dc:title>El libro</dc:title><dc:creator>Alguien</dc:creator><dc:language>es</dc:language>
    </metadata><manifest>${items}${opts.extraManifest ?? ''}</manifest><spine>${spine}</spine></package>`);
  for (const c of chapters) zip.file(dir + c.name, c.html);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('parseEpub', () => {
  it('reads metadata and chapters in spine order', async () => {
    const book = await parseEpub(await makeEpub());
    expect(book.title).toBe('El libro');
    expect(book.author).toBe('Alguien');
    expect(book.language).toBe('es');
    expect(book.chapters.map(c => c.title)).toEqual(['Primero', 'Segundo']);
  });

  it('follows the SPINE, not the manifest order', async () => {
    const book = await parseEpub(await makeEpub({ spine: ['ch2', 'ch1'] }));
    expect(book.chapters.map(c => c.title)).toEqual(['Segundo', 'Primero']);
  });

  it('ignores manifest entries the spine does not reference', async () => {
    // A cover image and a stylesheet are in every real book and are not chapters.
    const book = await parseEpub(await makeEpub({
      extraManifest: '<item id="cov" href="cover.jpg" media-type="image/jpeg"/>'
                   + '<item id="css" href="s.css" media-type="text/css"/>',
    }));
    expect(book.chapters).toHaveLength(2);
  });

  it('resolves chapter paths relative to the OPF, wherever it lives', async () => {
    const book = await parseEpub(await makeEpub({ opfPath: 'deep/nested/book.opf' }));
    expect(book.chapters[0].href).toBe('deep/nested/c1.xhtml');
    expect(book.chapters[0].text).toContain('Capítulo 1');
  });

  it('skips near-empty front matter', async () => {
    const book = await parseEpub(await makeEpub({
      chapters: [
        { name: 'cover.xhtml', html: '<html><body><p>Cover</p></body></html>' },
        { name: 'c1.xhtml', html: `<html><body><h1>Real</h1><p>${'Texto de verdad. '.repeat(30)}</p></body></html>` },
      ],
    }));
    expect(book.chapters.map(c => c.title)).toEqual(['Real']);
  });

  it('does not emit a wrapper div and its paragraphs twice', async () => {
    const book = await parseEpub(await makeEpub({
      chapters: [{ name: 'c1.xhtml', html:
        `<html><body><div><p>${'Uno dos tres cuatro cinco. '.repeat(20)}</p></div></body></html>` }],
    }));
    const occurrences = book.chapters[0].text.split('Uno dos tres').length - 1;
    expect(occurrences).toBe(20);
  });

  it('drops script and style content', async () => {
    const book = await parseEpub(await makeEpub({
      chapters: [{ name: 'c1.xhtml', html:
        `<html><head><style>.a{color:red}</style></head><body><script>var x=1</script><p>${'Sólo esto. '.repeat(30)}</p></body></html>` }],
    }));
    expect(book.chapters[0].text).not.toContain('color:red');
    expect(book.chapters[0].text).not.toContain('var x');
  });

  it('rejects a non-EPUB with a message, not a crash', async () => {
    await expect(parseEpub(new TextEncoder().encode('not a zip').buffer)).rejects.toBeInstanceOf(EpubError);
  });

  it('rejects a zip with no container.xml', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(parseEpub(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toBeInstanceOf(EpubError);
  });
});

describe('chunkChapter', () => {
  const para = (n: number) => `${'Una oración de relleno. '.repeat(n)}`.trim();

  it('returns nothing for an empty chapter', () => {
    expect(chunkChapter('')).toEqual([]);
    expect(chunkChapter('   \n  \n')).toEqual([]);
  });

  it('keeps a short chapter as one section', () => {
    expect(chunkChapter(`${para(3)}\n${para(3)}`)).toHaveLength(1);
  });

  it('never exceeds the segment route limit', () => {
    const long = Array.from({ length: 60 }, () => para(20)).join('\n');
    for (const s of chunkChapter(long)) expect(s.length).toBeLessThanOrEqual(MAX_PASTE_CHARS);
  });

  it('splits between paragraphs, so no section starts mid-sentence', () => {
    const long = Array.from({ length: 40 }, () => para(20)).join('\n');
    for (const s of chunkChapter(long)) {
      expect(s.startsWith('Una')).toBe(true);
      expect(s.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('breaks a single overlong paragraph at sentence ends', () => {
    const monster = para(2000);            // one paragraph, far over the budget
    const out = chunkChapter(monster);
    expect(out.length).toBeGreaterThan(1);
    for (const s of out) expect(s.length).toBeLessThanOrEqual(MAX_PASTE_CHARS);
    // Nothing is lost: every sentence survives somewhere.
    const total = out.join(' ').split('Una oración').length - 1;
    expect(total).toBe(2000);
  });

  it('loses no text overall', () => {
    const chapter = Array.from({ length: 30 }, (_, i) => `Párrafo ${i}. ${para(15)}`).join('\n');
    const rejoined = chunkChapter(chapter).join('\n');
    for (let i = 0; i < 30; i++) expect(rejoined).toContain(`Párrafo ${i}.`);
  });
});

// ── Progression ───────────────────────────────────────────────────────────────
import { nextPosition, sectionCount, positionLabel } from '@/lib/epubProgress';
import type { StoredBook } from '@/lib/epubStore';

/** `n` paragraphs of filler — enough of them to force a chapter into several sections. */
const filler = (n: number) => Array.from({ length: n }, (_, i) =>
  `Párrafo ${i}. ${'Una oración de relleno bastante larga para ocupar espacio. '.repeat(12)}`).join('\n');

const book = (chapters: string[]): StoredBook => ({
  id: 'b', addedAt: '2026-08-19', title: 'Libro', chapters:
    chapters.map((text, i) => ({ id: `c${i}`, href: `c${i}.xhtml`, title: `Capítulo ${i + 1}`, text })),
});

describe('nextPosition', () => {
  it('advances within a chapter while sections remain', () => {
    const b = book([filler(30)]);                       // one multi-section chapter
    expect(sectionCount(b, 0)).toBeGreaterThan(1);
    expect(nextPosition(b, 0, 0)).toEqual({ chapter: 0, section: 1 });
  });

  it('crosses into the next chapter from the last section', () => {
    const b = book([filler(4), filler(4)]);             // one section each
    expect(sectionCount(b, 0)).toBe(1);
    expect(nextPosition(b, 0, 0)).toEqual({ chapter: 1, section: 0 });
  });

  it('crosses from the LAST section of a multi-section chapter', () => {
    const b = book([filler(30), filler(4)]);
    const last = sectionCount(b, 0) - 1;
    expect(nextPosition(b, 0, last)).toEqual({ chapter: 1, section: 0 });
  });

  it('returns null at the end of the book', () => {
    const b = book([filler(4), filler(4)]);
    expect(nextPosition(b, 1, 0)).toBeNull();
  });

  it('returns null from the last section of the last chapter', () => {
    const b = book([filler(4), filler(30)]);
    expect(nextPosition(b, 1, sectionCount(b, 1) - 1)).toBeNull();
  });

  it('skips a chapter that has no sections rather than landing on it', () => {
    // An empty chapter still occupies an index; adding one would report section 0 of nothing.
    const b = book([filler(4), '', filler(4)]);
    expect(sectionCount(b, 1)).toBe(0);
    expect(nextPosition(b, 0, 0)).toEqual({ chapter: 2, section: 0 });
  });

  it('returns null when every later chapter is empty', () => {
    const b = book([filler(4), '', '   ']);
    expect(nextPosition(b, 0, 0)).toBeNull();
  });
});

describe('positionLabel', () => {
  it('names the chapter alone when it is one section', () => {
    expect(positionLabel(book([filler(4)]), 0, 0)).toBe('Capítulo 1');
  });

  it('numbers the section when a chapter has several', () => {
    const b = book([filler(30)]);
    expect(positionLabel(b, 0, 1)).toMatch(/^Capítulo 1 \(2\/\d+\)$/);
  });
});
