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

  /**
   * A LEADING UNDERSCORE MEANS "DELIBERATELY UNUSED", and the code already says so.
   *
   * `lib/storage/firebase.ts` is a stub adapter that must satisfy `implements DataService`,
   * so every method carries the interface's full parameter list and uses none of it —
   * `_lang`, `_deck`, `_prefs`. That is the convention, not an oversight, and 17 of the
   * project's warnings were the linter objecting to code doing the right thing. Deleting the
   * parameters to silence it would break the interface the file exists to implement.
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
