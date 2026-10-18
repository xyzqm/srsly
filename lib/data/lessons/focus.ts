import type { LanguageCode } from '@/lib/types';

/**
 * WHICH FORMS EACH LESSON'S RULE CHOOSES BETWEEN — see `Lesson.focus` for why this exists.
 *
 * The short version: 92% of practice questions were "rebuild the sentence", which tests word
 * ORDER, while most grammar lessons teach a word CHOICE whose answer was already printed on
 * the tile. A lesson listed here blanks its own form instead and offers these as the options.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
 *
 * **Word-order lessons.** `es-adj-position` teaches that *un viejo amigo* and *un amigo
 * viejo* mean different things; `zh-ba` moves the object in front of the verb; `ja-word-order`
 * is the verb going last. Rebuilding the sentence IS the question there, and a focus set added
 * for consistency would replace the right exercise with a worse one.
 *
 * **Lessons whose answer changes per sentence.** A conjugation lesson's form depends on which
 * verb the sentence happens to use, so one list for the lesson cannot be right for all three
 * of its sentences — the options would be forms of a verb that is not in front of the learner.
 * Those keep ordering until the data is per-sentence rather than per-lesson.
 *
 * ── THE LISTS ARE THE ALTERNATIVES A LEARNER COULD PLAUSIBLY WRITE ───────────
 *
 * Not every form in the paradigm. `LETTER_CHOICES` in `lib/lessonPractice.ts` takes the same
 * line and says why: a choice between a right answer and three absurdities is not a question.
 * `es-ser-estar` offers the third persons of both verbs, because that is the decision; it does
 * not offer `estuviéramos`.
 *
 * `tests/lessonFocus.test.ts` asserts every list here BITES — a set matching no tile in its
 * own lesson is dead weight that silently leaves the lesson on the ordering drill.
 */
export const LESSON_FOCUS: Partial<Record<LanguageCode, Record<string, string[]>>> = {
  es: {
    'es-gender':         ['el', 'la'],
    'es-articles':       ['un', 'una', 'el', 'la'],
    'es-ser-estar':      ['es', 'está', 'son', 'están'],
    'es-tener':          ['tengo', 'tienes', 'tiene', 'tenemos', 'tienen'],
    'es-negation':       ['no', 'nunca', 'nada', 'nadie'],
    'es-gustar':         ['me', 'te', 'le', 'nos'],
    'es-por-para':       ['por', 'para'],
    'es-saber-conocer':  ['sé', 'sabe', 'sabes', 'conozco', 'conoce', 'conoces'],
    'es-demonstratives': ['este', 'ese', 'aquel', 'esta', 'esa', 'aquella'],
    'es-possessives':    ['mi', 'tu', 'su', 'mis', 'tus', 'sus', 'nuestro', 'nuestra'],
    'es-comparatives':   ['más', 'menos', 'tan', 'mejor', 'peor'],
    'es-hay':            ['hay', 'está', 'están'],
    'es-se':             ['se', 'le', 'lo', 'la'],
  },
  fr: {
    'fr-gender':              ['le', 'la'],
    'fr-articles':            ['un', 'une', 'le', 'la', 'des'],
    'fr-etre':                ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
    'fr-avoir':               ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
    'fr-negation':            ['ne', 'pas', 'jamais', 'rien', 'personne'],
    'fr-partitif':            ['du', 'de', 'des'],
    'fr-y-en':                ['y', 'en'],
    'fr-demonstratives':      ['ce', 'cet', 'cette', 'ces'],
    'fr-possessives':         ['mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses'],
    'fr-comparatives':        ['plus', 'moins', 'aussi', 'meilleur'],
    'fr-prepositions-places': ['à', 'en', 'au', 'aux', 'du'],
  },
  zh: {
    'zh-measure-words': ['个', '杯', '只', '张', '本', '条', '件', '位'],
    'zh-negation':      ['不', '没'],
    'zh-de':            ['的', '得', '地'],
    'zh-shi-you':       ['是', '有'],
    'zh-zai':           ['在', '到', '从'],
    'zh-modals':        ['会', '能', '可以', '要', '想'],
    'zh-dou-ye':        ['都', '也'],
    'zh-jiu-cai':       ['就', '才'],
    'zh-yao-xiang':     ['要', '想'],
    'zh-ne-ba':         ['呢', '吧', '吗'],
    'zh-yinwei':        ['因为', '所以', '虽然', '但是'],
  },
  ja: {
    'ja-wa-ga':        ['は', 'が'],
    'ja-particles':    ['を', 'に', 'で', 'へ', 'と', 'から', 'まで', 'が', 'は'],
    'ja-aru-iru':      ['あります', 'います', 'ある', 'いる'],
    'ja-kara-node':    ['から', 'ので'],
    'ja-comparatives': ['より', 'ほう', 'いちばん', '一番'],
  },
};
