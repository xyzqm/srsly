import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /**
   * Build output directory, overridable per invocation.
   *
   * `next build` wipes and rewrites `.next/static/chunks`, and `next dev` serves out of the
   * same directory — so building while a dev server is up pulls the chunks out from under
   * every page the browser has already loaded. Statically imported code survives (it is
   * already evaluated); LAZY `import()` calls do not, and this app puts its biggest, most
   * important data behind them: the level tables and the dictionaries.
   *
   * The symptom is not an error, because both loaders in lib/curriculum.ts swallow the
   * failure and return null. The placement test reads that null as "this level doesn't have
   * enough defined words to build a test from" — for every language at once, since they all
   * share the two loaders. Hunting that as a data bug is a waste of an afternoon.
   *
   *   NEXT_DIST_DIR=.next-verify npm run build   # typecheck a build without touching dev
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  webpack(config) {
    /**
     * `@data/*` resolves to lib/data/*, but ONLY for the bundler — it is deliberately
     * absent from tsconfig's `paths`.
     *
     * The generated dictionaries are ~29 MB of JSON. With `resolveJsonModule` on — which
     * Next sets and rewrites back on every build, so it cannot simply be turned off —
     * TypeScript opens each file and materialises an object type with one property per
     * key, which alone accounted for ~2 GB of a tsc run and bought nothing: every import
     * is cast to its real shape immediately, because the inferred literal type is far too
     * specific to be useful.
     *
     * Routing the imports through an alias TypeScript cannot resolve means the ambient
     * declaration in lib/data/json-modules.d.ts applies instead, and tsc never reads the
     * files. Webpack still resolves them normally, so bundling, chunking and the lazy
     * `import()` splitting all behave exactly as before.
     *
     * If this alias is ever removed the build fails loudly with "module not found" — it
     * cannot silently regress.
     */
    config.resolve.alias = {
      ...config.resolve.alias,
      "@data": path.join(import.meta.dirname, "lib/data"),
      "@dict": path.join(import.meta.dirname, "public"),
    };
    return config;
  },
};

export default nextConfig;
