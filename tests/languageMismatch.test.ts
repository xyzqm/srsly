import { describe, it, expect } from 'vitest';
import { declaredMismatch, scriptMismatch, mismatchWarning } from '@/lib/languageMismatch';

const ES = 'El camarón está en la playa mientras el sol sube despacio sobre el agua tranquila.';
const FR = 'Le chat dort sur la table pendant que la pluie tombe doucement sur les toits gris.';
const ZH = '学生们在学校里打扫教室。老师说得很清楚，大家都懂了他的意思。下课以后他们要休息。';
const JA = 'わたしは まいにち がっこうへ いきます。ともだちと はなして、ほんを よみます。';

describe('declaredMismatch', () => {
  it('compares the primary subtag only', () => {
    expect(declaredMismatch('es-MX', 'es')).toBe(false);
    expect(declaredMismatch('es-419', 'es')).toBe(false);
    expect(declaredMismatch('EN-GB', 'es')).toBe(true);
  });

  it('treats absent or junk metadata as no evidence', () => {
    expect(declaredMismatch(undefined, 'es')).toBe(false);
    expect(declaredMismatch('', 'es')).toBe(false);
    expect(declaredMismatch('x', 'es')).toBe(false);
  });
});

describe('scriptMismatch fires on the unambiguous cases', () => {
  it('flags CJK text in a Latin-script session', () => {
    expect(scriptMismatch(ZH, 'es')).toBe(true);
    expect(scriptMismatch(JA, 'fr')).toBe(true);
  });

  it('flags Latin text in a CJK session — the case that shredded camarón', () => {
    expect(scriptMismatch(ES, 'zh')).toBe(true);
    expect(scriptMismatch(FR, 'ja')).toBe(true);
  });

  it('flags kana in a Chinese session, since Chinese never uses it', () => {
    expect(scriptMismatch(JA, 'zh')).toBe(true);
  });
});

describe('scriptMismatch stays quiet when it should', () => {
  it('does not flag a language reading itself', () => {
    expect(scriptMismatch(ES, 'es')).toBe(false);
    expect(scriptMismatch(FR, 'fr')).toBe(false);
    expect(scriptMismatch(ZH, 'zh')).toBe(false);
    expect(scriptMismatch(JA, 'ja')).toBe(false);
  });

  it('does NOT flag kanji-only Japanese, which is real', () => {
    expect(scriptMismatch('新聞社会面記事全文掲載。日本語漢字表記法研究発表会場案内。', 'ja')).toBe(false);
  });

  it('tolerates a proper noun or a loanword in the wrong script', () => {
    expect(scriptMismatch('我今天去了 Starbucks 和朋友一起喝咖啡，然后我们回家了。', 'zh')).toBe(false);
    expect(scriptMismatch('Mi canción favorita se llama 上を向いて歩こう y es preciosa.', 'es')).toBe(false);
  });

  it('will not judge a fragment', () => {
    expect(scriptMismatch('Hola', 'zh')).toBe(false);
    expect(scriptMismatch('', 'zh')).toBe(false);
  });
});

describe('mismatchWarning', () => {
  it('prefers the declared language when there is one', () => {
    expect(mismatchWarning('es', { declared: 'en', text: ES })).toMatch(/“en”/);
  });

  it('falls back to the script when nothing is declared', () => {
    expect(mismatchWarning('zh', { text: ES })).toMatch(/does not look like/);
  });

  it('is null when everything agrees', () => {
    expect(mismatchWarning('es', { declared: 'es-MX', text: ES })).toBeNull();
    expect(mismatchWarning('zh', { text: ZH })).toBeNull();
  });
});
