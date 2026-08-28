import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  /**
   * GENERATED OUTPUT IS NOT SOURCE, and eslint has to be told so explicitly.
   *
   * Flat config does NOT read `.eslintignore` — that file is silently inert under eslint 9 —
   * so the ignore list lives here. Without it `npm run lint` walked `.vercel/output`, left
   * behind by a `vercel` deploy, and reported 248 errors from MINIFIED chunks: `no-this-alias`
   * at column 101754 of a one-line bundle. Every one of them was unfixable by construction,
   * and they drowned the real result — the command was useless as a pass/fail gate, which is
   * the only thing a lint script is for.
   *
   * These are exactly the build outputs `.gitignore` already lists. `svelte-poc` is a separate
   * package with its own toolchain and is linted from there, not from here.
   */
  {
    ignores: [
      ".next/**",
      ".next-verify/**",
      ".vercel/**",
      "out/**",
      "build/**",
      "coverage/**",
      "svelte-poc/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
