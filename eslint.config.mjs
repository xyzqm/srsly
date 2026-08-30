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
   * These are exactly the build outputs `.gitignore` already lists.
   */
  {
    ignores: [
      // A GLOB, not a list. `.next-verify` and `.next-agent` are build dirs for isolated
      // runs, and naming them one at a time means the next one added is 140 lint errors
      // nobody expected — which is exactly what happened when `.next-agent` was created.
      ".next*/**",
      ".vercel/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  /**
   * A LEADING UNDERSCORE MEANS "DELIBERATELY UNUSED", and the code already says so.
   *
   * The convention across the codebase: a parameter kept to satisfy a signature it does not
   * use is prefixed with `_`. It earned its place against `lib/storage/firebase.ts`, a stub
   * adapter whose methods had to take `DataService`'s full parameter list and use none of it
   * — 17 warnings about code doing the right thing. That file is gone now, but the rule
   * stays: the convention is the point, not the one file that first needed it.
   */
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
];

export default eslintConfig;
