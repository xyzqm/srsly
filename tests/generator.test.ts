import { describe, it, expect } from 'vitest';
import {
  userKeyGenerator, serverKeyGenerator, looksLikeAnthropicKey, USER_KEY_HEADER,
} from '@/lib/server/generator';

/**
 * `operatorPays` decides whether a generation spends one of the operator-funded AI credits.
 * Getting it backwards either rations a learner who is paying for their own tokens, or gives
 * away tokens the operator is being billed for.
 */
describe('who pays decides who gets metered', () => {
  it('a learner using their own key is not billed to the operator', () => {
    expect(userKeyGenerator('sk-ant-' + 'a'.repeat(40)).operatorPays).toBe(false);
  });

  it('the server key is', () => {
    expect(serverKeyGenerator('sk-ant-' + 'b'.repeat(40)).operatorPays).toBe(true);
  });

  // A key in a log is a leaked key. The name is the only thing that reaches a log line.
  it('never puts the key in its own name', () => {
    const secret = 'sk-ant-' + 'c'.repeat(40);
    for (const g of [userKeyGenerator(secret), serverKeyGenerator(secret)]) {
      expect(g.name).not.toContain(secret);
      expect(g.name).not.toContain('sk-ant');
    }
  });
});

describe('looksLikeAnthropicKey rejects an obviously wrong paste', () => {
  it('accepts a real-shaped key', () => {
    expect(looksLikeAnthropicKey('sk-ant-api03-' + 'x'.repeat(30))).toBe(true);
    expect(looksLikeAnthropicKey('  sk-ant-' + 'y'.repeat(20) + '  ')).toBe(true);
  });

  it('rejects blanks, junk, and other providers', () => {
    for (const v of [undefined, null, '', '   ', 'hunter2', 'sk-ant-', 'sk-ant-short',
                     'sk-proj-' + 'z'.repeat(40), 'Bearer sk-ant-' + 'z'.repeat(30)]) {
      expect(looksLikeAnthropicKey(v)).toBe(false);
    }
  });

  // It is a shape check, not an oracle. Anthropic is the only real validator, and being
  // cleverer here would reject key formats that do not exist yet.
  it('does not try to judge whether the key actually works', () => {
    expect(looksLikeAnthropicKey('sk-ant-' + 'not-a-real-key-but-right-shape-000')).toBe(true);
  });
});

describe('the key travels on a header', () => {
  // Never a query string: URLs are logged by proxies, CDNs and platforms as a matter of
  // course, and a logged credential is a leaked one.
  it('is a lowercase header name', () => {
    expect(USER_KEY_HEADER).toBe('x-srsly-anthropic-key');
    expect(USER_KEY_HEADER).toBe(USER_KEY_HEADER.toLowerCase());
  });
});
