import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
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
