import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig } from '@/lib/languageConfig';

/**
 * Canned generation output, for developing without spending Anthropic credits.
 *
 * WHY THIS EXISTS. The reading pipeline is the largest thing in the app and the hardest to
 * work on: every run costs tokens, a guest budget runs out, and once it has, the whole tab is
 * unreachable — you cannot see a passage, a blank, a comprehension question or the results
 * screen without generating one. The alternative developers reach for is hand-seeding
 * localStorage, which tests the renderer against data the route would never actually emit.
 *
 * Set `SRSLY_STUB_AI=1` and every generation returns this instead. No key is needed, no
 * credit is consumed, and the shape is the real wire format — RawTok tuples, `|`-segmented
 * for Chinese and plain prose elsewhere — so it exercises the same parsers, segmenters and
 * lemmatizers the live path does.
 *
 * NOT A FALLBACK. It fires only on the explicit env flag, never on a missing key or a failed
 * call, because content the learner did not ask for and cannot tell apart from real output is
 * exactly what this codebase refuses everywhere else. A missing key still surfaces as an
 * error state, and the UI still says so.
 */

/** Sentences per language, written so the target words can be substituted in. */
const FRAME: Record<LanguageCode, { title: string; sentences: string[] }> = {
  zh: {
    // Punctuation gets its own `|` piece. parseTokenString splits on the bar and treats a
    // single-element tuple as punctuation, so `好，我` written as one piece becomes one
    // unsplittable token carrying a comma — which is exactly the shape the real model is
    // told to avoid, and the stub has to match it to be worth anything.
    title: '一个|普通|的|一天',
    sentences: [
      '今天|天气|很|好|，|我|和|朋友|一起|去|公园|。',
      '我们|在|那里|说话|，|也|看|了|很多|花|。',
      '下午|回家|以后|，|我|想|再|学习|一会儿|。',
    ],
  },
  ja: {
    title: 'ふつうの一日',
    sentences: [
      '今日はいい天気なので、友だちと公園に行きました。',
      'そこでたくさん話して、花も見ました。',
      '家に帰ってから、もう少し勉強するつもりです。',
    ],
  },
  es: {
    title: 'Un día normal',
    sentences: [
      'Hoy hace buen tiempo y voy al parque con mi amiga.',
      'Allí hablamos mucho y también vemos las flores.',
      'Cuando vuelvo a casa, quiero estudiar un rato más.',
    ],
  },
  fr: {
    title: 'Une journée ordinaire',
    sentences: [
      'Il fait beau aujourd’hui et je vais au parc avec mon amie.',
      'Là-bas nous parlons beaucoup et nous regardons les fleurs.',
      'En rentrant à la maison, je veux encore travailler un peu.',
    ],
  },
};

interface StubWord { h: string; p: string; m: string }

/**
 * A passage that actually contains the caller's words.
 *
 * Appended as a final sentence rather than woven in: the frame above is fixed text, and
 * pretending a canned sentence was written around your vocabulary would make the stub look
 * more capable than it is. What matters for development is that the target words are PRESENT,
 * so blanks, grading and the results screen all have something to work on.
 */
export function stubDailyContent(language: LanguageCode, words: StubWord[]) {
  const frame = FRAME[language] ?? FRAME.es;
  const { segmentation } = getLanguageConfig(language);
  const pipe = segmentation === 'pipe';
  const targets = words.slice(0, 6);

  const joined = targets.map(w => w.h).join(pipe ? '|' : ', ');
  const tail = targets.length
    ? (pipe ? `今天|的|生词|：|${joined}|。` : `Palabras de hoy: ${joined}.`)
    : '';

  const sentences = [...frame.sentences, ...(tail ? [tail] : [])];

  return {
    title: frame.title,
    sentences,
    questions: targets.slice(0, 2).map(w => ({
      q: pipe ? `${w.h}|是|什么|意思？` : `¿Qué significa «${w.h}»?`,
      model: w.m,
      key: [w.h],
      options: [
        { tokens: w.m, correct: true },
        { tokens: 'something else', correct: false },
        { tokens: 'a third option', correct: false },
        { tokens: 'a fourth option', correct: false },
      ],
    })),
    contextualMeanings: Object.fromEntries(targets.map(w => [w.h, w.m.split(';')[0].trim()])),
  };
}

/** Whether the stub is switched on. Explicit flag only — never inferred. */
export function stubEnabled(): boolean {
  return process.env.SRSLY_STUB_AI === '1';
}
