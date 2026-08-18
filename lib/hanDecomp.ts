import type { LanguageCode } from './types';
import { getLanguageConfig } from './languageConfig';

/**
 * Character decomposition — what a Han character is built from.
 *
 * 休 is 亻 (person) beside 木 (tree); 明 is 日 (sun) and 月 (moon). For a learner this is the
 * difference between memorising an arbitrary shape and remembering a small picture, and it
 * is the one kind of help that works on a character you have never seen before.
 *
 * The table is DYNAMICALLY IMPORTED, like every other large dataset here: it is ~350 kB and
 * only Chinese sessions can use it. Statically importing it would put Han decomposition in
 * the initial bundle for every learner of every other language.
 */

export interface HanEntry {
  /** Short gloss for this character — first sense only, it is a label not a definition. */
  g: string;
  /** Component characters in reading order, as one string. Absent for primitives. */
  p?: string;
  /** The radical, when it differs from the character itself. */
  r?: string;
  /** Human-readable etymology, e.g. "A person 亻 leaning against a tree 木". */
  h?: string;
  t?: string;
  /** Pictophonetic characters only: which part carries the sound, which the meaning. */
  ph?: string;
  se?: string;
}

/** One component of a character, resolved to something displayable. */
export interface Component {
  char: string;
  gloss: string;
  /** How this part contributes, when the source says so. */
  role?: 'sound' | 'meaning';
}

export interface Decomposition {
  char: string;
  gloss: string;
  components: Component[];
  hint?: string;
  type?: string;
}

let cache: Record<string, HanEntry> | null = null;
let loading: Promise<Record<string, HanEntry> | null> | null = null;

/** Load the table once. Returns null if the chunk fails — callers render nothing. */
export async function loadHanDecomp(): Promise<Record<string, HanEntry> | null> {
  if (cache) return cache;
  if (!loading) {
    loading = import('./data/han-decomp')
      .then(m => { cache = m.HAN_DECOMP as Record<string, HanEntry>; return cache; })
      .catch(() => { loading = null; return null; });
  }
  return loading;
}

/**
 * Whether this session should offer decomposition at all — Chinese only.
 *
 * The single gate. Both surfaces that show the panel (the lookup popup and the missed-word
 * review) render it through one component, and that component asks this first, so there is
 * no second place for a language to slip through.
 */
export function supportsDecomposition(lang: LanguageCode): boolean {
  return getLanguageConfig(lang).showsCharacterDecomposition;
}

const HAN = /^[一-鿿㐀-䶿]$/;

/**
 * Break one character into its parts.
 *
 * Returns null for anything that would waste the reader's attention: a non-Han character, a
 * character the table has never heard of, or a PRIMITIVE — one that decomposes into nothing,
 * or into parts that are just strokes with no gloss worth reading. Showing "木 = 十 + 八"
 * would be technically true and pedagogically useless; 木 is a picture of a tree, and the
 * hint says so, which is why a primitive with a hint is still worth returning.
 */
export function decompose(table: Record<string, HanEntry>, char: string): Decomposition | null {
  if (!HAN.test(char)) return null;
  const e = table[char];
  if (!e) return null;

  /**
   * A PICTOGRAPH is not built from anything.
   *
   * 木 is a drawing of a tree, but the source still lists its strokes as ⿻十八 — so this
   * cheerfully rendered "木 = 十 ten + 八 eight", which is not a mnemonic, it is noise that
   * actively misleads. Wherever the source says the character is a picture, the picture is
   * the whole explanation and the hint carries it.
   */
  const parts: Component[] = [];
  for (const c of (e.t === 'pictographic' ? '' : e.p ?? '')) {
    const sub = table[c];
    if (!sub?.g) continue;                       // a stroke-level part with nothing to say
    const role = c === e.ph ? 'sound' : c === e.se ? 'meaning' : undefined;
    parts.push(role ? { char: c, gloss: sub.g, role } : { char: c, gloss: sub.g });
  }

  // Nothing to show and nothing to say — not worth a panel.
  if (parts.length < 2 && !e.h) return null;

  return { char, gloss: e.g, components: parts, hint: e.h, type: e.t };
}
