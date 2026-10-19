import type { LanguageCode } from './types';

/**
 * WHICH LESSONS ARE IN WHICH UNIT — the ids alone, and nothing else.
 *
 * ## ⚠ THIS IS SPLIT FROM THE PROSE FOR ONE REASON: THE LANDING BUNDLE
 *
 * `lib/data/lessons/units.ts` holds each unit's title and its one-line promise, and it is
 * imported by the Learn tab, which is lazily loaded. `lib/achievements.ts` needs to know when
 * a unit has been COMPLETED, and that module is reached from `ToastHost` at the app root —
 * which renders on every screen. Importing the titles there would put them in the first bundle
 * for every learner, including the ones who never open Learn. That is the rule this repo states
 * for the level tables and the lesson trees, applied to a smaller thing for the same reason.
 *
 * ## THERE IS STILL ONE COPY OF THE IDS
 *
 * `units.ts` does not repeat them — it reads them from here and attaches a title. So this is
 * a split by WEIGHT rather than a duplication, and the two cannot drift: a unit with a title
 * and no lessons, or lessons and no title, fails `tests/lessonUnits.test.ts` rather than
 * rendering as an empty row or vanishing from the course.
 *
 * Authored, never parsed off an id prefix. A unit boundary is a teaching judgement about where
 * one capability ends — see the long note in `units.ts`.
 */
export const UNIT_LESSONS: Partial<Record<LanguageCode, Record<string, string[]>>> = {
  'es': {
    'es-u1': [
      'es-v-basics',
      'es-gender',
      'es-plural',
      'es-articles',
      'es-v-numbers'
    ],
    'es-u2': [
      'es-v-family',
      'es-ser-estar',
      'es-tener',
      'es-v-adjectives'
    ],
    'es-u3': [
      'es-v-verbs',
      'es-present',
      'es-negation',
      'es-v-routine'
    ],
    'es-u4': [
      'es-v-colours',
      'es-gustar',
      'es-adjectives',
      'es-adj-position',
      'es-v-food'
    ],
    'es-u5': [
      'es-v-places',
      'es-questions',
      'es-por-para',
      'es-v-transport'
    ],
    'es-u6': [
      'es-v-weekdays',
      'es-futuro-proximo',
      'es-preterito',
      'es-imperfecto',
      'es-v-months'
    ],
    'es-u7': [
      'es-v-body',
      'es-reflexive',
      'es-object-pronouns',
      'es-saber-conocer',
      'es-v-clothing'
    ],
    'es-u8': [
      'es-v-weather',
      'es-perfecto',
      'es-comparatives',
      'es-v-seasons'
    ],
    'es-u9': [
      'es-v-house',
      'es-imperative',
      'es-subjunctive',
      'es-future-conditional',
      'es-v-school'
    ],
    'es-u10': [
      'es-v-animals',
      'es-demonstratives',
      'es-possessives',
      'es-se',
      'es-v-tableware'
    ],
    'es-u11': [
      'es-progressive',
      'es-hay',
      'es-accents',
      'es-v-everyday'
    ]
  },
  'fr': {
    'fr-u1': [
      'fr-v-basics',
      'fr-gender',
      'fr-plural',
      'fr-articles',
      'fr-v-numbers'
    ],
    'fr-u2': [
      'fr-v-family',
      'fr-etre',
      'fr-avoir',
      'fr-v-adjectives'
    ],
    'fr-u3': [
      'fr-v-verbs',
      'fr-er-verbs',
      'fr-negation',
      'fr-v-routine'
    ],
    'fr-u4': [
      'fr-v-food',
      'fr-partitif',
      'fr-adjectives',
      'fr-adj-position',
      'fr-v-colours'
    ],
    'fr-u5': [
      'fr-v-places',
      'fr-questions',
      'fr-futur-proche',
      'fr-v-transport'
    ],
    'fr-u6': [
      'fr-v-weekdays',
      'fr-passe-compose',
      'fr-passe-etre',
      'fr-imparfait',
      'fr-v-months'
    ],
    'fr-u7': [
      'fr-v-body',
      'fr-reflexive',
      'fr-object-pronouns',
      'fr-y-en',
      'fr-v-clothing'
    ],
    'fr-u8': [
      'fr-v-weather',
      'fr-comparatives',
      'fr-futur-simple',
      'fr-v-seasons'
    ],
    'fr-u9': [
      'fr-v-house',
      'fr-relative',
      'fr-imperative',
      'fr-depuis',
      'fr-v-school'
    ],
    'fr-u10': [
      'fr-v-animals',
      'fr-conditionnel',
      'fr-subjonctif',
      'fr-prepositions-places',
      'fr-v-tableware'
    ],
    'fr-u11': [
      'fr-demonstratives',
      'fr-possessives',
      'fr-accents',
      'fr-v-everyday'
    ]
  },
  'zh': {
    'zh-u1': [
      'zh-v-basics',
      'zh-word-order',
      'zh-measure-words',
      'zh-v-numbers'
    ],
    'zh-u2': [
      'zh-v-family',
      'zh-de',
      'zh-shi-you',
      'zh-v-body'
    ],
    'zh-u3': [
      'zh-v-verbs',
      'zh-negation',
      'zh-le',
      'zh-v-routine'
    ],
    'zh-u4': [
      'zh-v-places',
      'zh-guo',
      'zh-zai',
      'zh-v-transport'
    ],
    'zh-u5': [
      'zh-v-adjectives',
      'zh-questions',
      'zh-adjectives',
      'zh-v-colours'
    ],
    'zh-u6': [
      'zh-v-house',
      'zh-ba',
      'zh-bei',
      'zh-v-clothing'
    ],
    'zh-u7': [
      'zh-v-food',
      'zh-modals',
      'zh-resultative',
      'zh-v-weather'
    ],
    'zh-u8': [
      'zh-v-school',
      'zh-duration',
      'zh-jiu-cai',
      'zh-directional',
      'zh-v-animals'
    ],
    'zh-u9': [
      'zh-v-weekdays',
      'zh-zhe',
      'zh-yao-xiang',
      'zh-time-words',
      'zh-v-months'
    ],
    'zh-u10': [
      'zh-yinwei',
      'zh-ne-ba',
      'zh-dou-ye',
      'zh-v-seasons',
      'zh-v-tableware',
      'zh-v-everyday'
    ]
  },
  'ja': {
    'ja-u1': [
      'ja-v-basics',
      'ja-word-order',
      'ja-wa-ga',
      'ja-v-numbers'
    ],
    'ja-u2': [
      'ja-v-family',
      'ja-particles',
      'ja-desu',
      'ja-v-body'
    ],
    'ja-u3': [
      'ja-v-adjectives',
      'ja-adjectives',
      'ja-verbs',
      'ja-v-colours'
    ],
    'ja-u4': [
      'ja-v-verbs',
      'ja-te-form',
      'ja-aru-iru',
      'ja-v-routine'
    ],
    'ja-u5': [
      'ja-v-food',
      'ja-plain-form',
      'ja-tai',
      'ja-v-places'
    ],
    'ja-u6': [
      'ja-v-transport',
      'ja-questions',
      'ja-counters',
      'ja-v-house'
    ],
    'ja-u7': [
      'ja-v-clothing',
      'ja-potential',
      'ja-conditionals',
      'ja-v-weather'
    ],
    'ja-u8': [
      'ja-v-school',
      'ja-giving-receiving',
      'ja-transitive-pairs',
      'ja-relative-clauses',
      'ja-v-animals'
    ],
    'ja-u9': [
      'ja-v-weekdays',
      'ja-kara-node',
      'ja-comparatives',
      'ja-nakereba',
      'ja-v-months'
    ],
    'ja-u10': [
      'ja-counters-time',
      'ja-keigo',
      'ja-noun-modifiers',
      'ja-v-seasons',
      'ja-v-tableware',
      'ja-v-everyday'
    ]
  }
};
