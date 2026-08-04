import { writeFile } from 'fs/promises';
import path from 'path';

/**
 * Writes a generated dataset as JSON plus a thin typed TypeScript wrapper.
 *
 * The data must NOT be emitted as a TypeScript object literal. Every key of a literal
 * creates a symbol during binding, and across five languages that reached ~1.5M symbols
 * and 1.19 GB of tsc memory. As JSON — with `*.json` declared opaque in
 * lib/data/json-modules.d.ts — the same bytes cost effectively nothing, and the figure
 * stays flat as languages are added rather than growing with each one.
 *
 * The wrapper keeps the export name and type, so every consumer imports exactly as before.
 *
 * @param {string} tsPath   absolute path of the .ts module to write (its .json sibling is derived)
 * @param {string} name     exported symbol, e.g. 'CEFR_VOCAB'
 * @param {string} type     TypeScript type of that export
 * @param {unknown} data    the dataset
 * @param {string} header   provenance comment block placed above the export
 */
export async function emitData(tsPath, name, type, data, header) {
  const jsonPath = tsPath.replace(/\.ts$/, '.json');
  const jsonName = path.basename(jsonPath);

  await writeFile(jsonPath, JSON.stringify(data));
  await writeFile(tsPath, `${header.trimEnd()}
//
// The data lives in the sibling .json file, not as a TypeScript object literal, and is
// imported through the @data alias so TypeScript never opens it — see
// scripts/lib/emitData.mjs and lib/data/json-modules.d.ts. Regenerate both together.
import data from '@data/${jsonName}';

export const ${name} = data as unknown as ${type};
`);
}
