import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

// Shared Claude client + minimal text-completion helper, used by both generate.ts (passage
// generation) and definitions.ts (single-word definition lookups).

function client(): Anthropic {
  const apiKey = env.SRSLY_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') throw new Error('no-api-key');
  return new Anthropic({ apiKey });
}

/** Ask Claude for plain text (no JSON wrapping) and return the trimmed response. */
export async function askText(prompt: string): Promise<string> {
  const res = await client().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    system: 'Respond with exactly the requested format, nothing else — no markdown, no explanations.',
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].type === 'text' ? res.content[0].text.trim() : '';
}
