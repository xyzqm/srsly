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
/**
 * A UNICODE RADICAL NAME IS NOT A GLOSS. Do not reintroduce a table mapping these.
 *
 * ⺍ is named "CJK RADICAL SMALL TWO" (U+2E8D), and that read like a free gloss: "学 = ⺍
 * small + 冖 cover + 子 son". It is wrong. The name places the shape in Unicode's radical
 * block, next to ⺌ "SMALL ONE"; it does not claim the shape MEANS small in any character
 * that contains it. In 学 it is not 小 at all — traditional 學 has 𦥯 on top, two hands
 * around 爻, and the ⺍ is what that collapsed to when the character was simplified. Same
 * story for the other three: ⺈ "KNIFE ONE" is a reduced 爫 (hand) in 争 and 刍, and ⺌ is a
 * reduced 火 in 光. Each is right for one or two characters and false for the rest.
 *
 * These shapes therefore render bare — the glyph with nothing beside it. A learner reading
 * "⺍ + 冖 cover + 子 son" can see there is a part we cannot name, which is true, and the
 * etymology line underneath carries whatever story the source does have.
 */

/**
 * Glosses that are worse than none, suppressed so the shape renders bare.
 *
 * "kwukyel" is 구결 — a Korean reading-annotation mark. Unihan records it because these
 * shapes were borrowed for that purpose, but as the gloss beside a component of 来 or 半 it
 * is not merely unhelpful, it points a Chinese learner at the wrong language. 丷 reaches 24
 * characters that way. There is no agreed meaning to substitute — it is two strokes — so the
 * honest rendering is the shape with nothing beside it.
 */
const UNUSABLE_GLOSS = new Set(['kwukyel']);

/**
 * Cut the "…; 交 also provides the pronunciation" tail off a mnemonic.
 *
 * 256 hints end in one. It is the same sound-versus-meaning bookkeeping the component tags
 * used to carry, and it lands the same way: the character it names is usually not even one
 * of the parts listed above it (学's hint credits ⺍, which is not shown), so it reads as an
 * unanswerable aside in the middle of an otherwise plain sentence. What survives — "A person
 * 亻 keeping watch over a child 子" — is the part a learner can actually use.
 *
 * Deliberately anchored to the END and to those two words only. "The sound a bird makes" and
 * "…provides the meaning and pronunciation" are real mnemonic content and are left alone.
 */
function stripPhoneticClause(hint: string | undefined): string | undefined {
  if (!hint) return hint;
  const cut = hint.replace(/\s*[;,]?\s*\S+\s*(?:also\s+)?provides the (?:pronunciation|sound)\s*$/i, '')
                  .trim().replace(/[;,]$/, '');
  return cut || undefined;
}

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
  /**
   * EVERY part is listed, glossed or not.
   *
   * A part with no gloss used to be skipped, which silently shortened the equation: 学 is
   * ⺍冖子 but ⺍ carries no gloss, so it rendered "学 = 冖 cover + 子 son" — an equation
   * missing a piece the reader can plainly see on the character. Showing the shape with
   * nothing beside it is the honest version; dropping it is a wrong answer.
   *
   * It is 52 characters out of 3,457, and every dropped part was present in the table and
   * merely unglossed — none were absent from it.
   */
  const parts: Component[] = [];
  for (const c of (e.t === 'pictographic' ? '' : e.p ?? '')) {
    const raw = table[c]?.g ?? '';
    parts.push({ char: c, gloss: UNUSABLE_GLOSS.has(raw) ? '' : raw });
  }

  /**
   * THE HINT IS ONLY AN EXPLANATION FOR SOME CHARACTERS.
   *
   * On ideographic and pictographic entries it is a sentence — "A person 亻 leaning against a
   * tree 木", "A crack on an oracle bone". On PICTOPHONETIC entries it is not an explanation
   * at all: it is a bare gloss of the semantic component, repeated. 1,279 of them match that
   * component's gloss exactly and the rest are variants of it ("people" for 亻 "man").
   *
   * Rendered as a line under the breakdown, that read as a definition of the whole character:
   * 意 showed "heart", which is 心's meaning, not 意's — 意 is thought, or idea. So the hint is
   * dropped there rather than passing half the story off as the answer.
   */
  const hint = e.t === 'pictophonetic' ? undefined : stripPhoneticClause(e.h);

  // Nothing to show and nothing to say — not worth a panel.
  if (parts.length < 2 && !hint) return null;

  return { char, gloss: e.g, components: parts, hint, type: e.t };
}
