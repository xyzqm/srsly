/**
 * Makes the generated data JSON opaque to TypeScript.
 *
 * WHY: srsly imports ~29 MB of generated JSON. With `resolveJsonModule` enabled — which
 * Next sets and rewrites back on every build, so it cannot simply be disabled — TypeScript
 * opens each file and materialises an object type with one property per key. Measured, that
 * alone was the difference between a 0.25 GB and a 2.7 GB tsc run, and it bought nothing:
 * every one of those imports is cast to its real shape by the module that owns it, because
 * the inferred literal type is far too specific to be useful.
 *
 * A plain `declare module '*.json'` does NOT work: when TypeScript can resolve the real
 * file, actual resolution beats an ambient wildcard. So the data is imported through the
 * `@data/*` alias, which is defined for webpack in next.config.ts and deliberately NOT in
 * tsconfig's `paths` — TypeScript cannot resolve it, so this declaration applies and the
 * files are never opened.
 *
 * Type safety is unchanged: the casts in the wrapper modules remain the single place each
 * dataset's shape is asserted, colocated with the code that knows it.
 */
declare module '@data/*.json' {
  const value: unknown;
  export default value;
}

/** The five large dictionaries under public/, imported by the server segmenters. These are
 *  by far the biggest contributors — ~29 MB between them. */
declare module '@dict/*.json' {
  const value: unknown;
  export default value;
}
