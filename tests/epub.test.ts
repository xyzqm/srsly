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
