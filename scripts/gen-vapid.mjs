#!/usr/bin/env node
/**
 * Generate a VAPID key pair for Web Push.
 *
 * ## WHAT VAPID IS, IN ONE PARAGRAPH, BECAUSE THE NAME EXPLAINS NOTHING
 *
 * A push service (Google's, Apple's, Mozilla's — whichever the learner's browser uses) will
 * deliver a message to a browser on your behalf. VAPID is how it knows the message came from
 * YOU: the private key signs a short-lived token on every send, and the PUBLIC key is handed to
 * the browser at subscribe time and baked into the resulting subscription. A subscription
 * created under one public key cannot be pushed to with a different private key.
 *
 * **Which is why rotating these invalidates every existing subscription.** Not a reason never
 * to rotate; a reason to know that doing so silently stops every reminder until each device
 * re-subscribes, with no error anywhere a learner can see.
 *
 * ## IT IS WRITTEN HERE RATHER THAN TAKEN FROM `web-push`
 *
 * `web-push` ships `generateVAPIDKeys()` and this script does not call it, which this repo's
 * rules say to justify. The reason is that key generation is a SETUP step run once, on a
 * developer's machine, and `node:crypto` does the whole of it in ten lines — where the thing
 * `web-push` is genuinely earning its place for is the payload encryption on the send path
 * (RFC 8291: ECDH, HKDF and AES-128-GCM), which is exactly the kind of cryptography this repo
 * should not be hand-rolling. Using the library where it is load-bearing and not where it is
 * not keeps the dependency's surface honest.
 *
 * ## THE PRIVATE KEY IS A SECRET AND THIS SCRIPT DOES NOT WRITE IT ANYWHERE
 *
 * It prints. Nothing is saved to disk, because `.env.local` is gitignored but `.env.example`
 * is NOT — the negation in `.gitignore` exists precisely so the template is committed — and a
 * script that helpfully wrote to the wrong one would commit a private key. Copy the two lines
 * it prints into `.env.local` locally, and into the Vercel project's environment variables for
 * production.
 *
 *   node scripts/gen-vapid.mjs
 */
import { generateKeyPairSync } from 'node:crypto';

/** base64url, which is what the Push API and the VAPID spec both want — never plain base64. */
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

/*
  THE PUBLIC KEY MUST BE THE 65-BYTE UNCOMPRESSED POINT, NOT THE DER WRAPPER.
  `export({ type: 'spki' })` gives an X.509 SubjectPublicKeyInfo structure, and handing that to
  `pushManager.subscribe()` fails with an opaque InvalidCharacterError or simply produces a
  subscription nothing can push to. The raw point is the last 65 bytes of the SPKI DER for
  P-256, and it always starts with 0x04 — which is asserted below, because silently shipping
  the wrong 65 bytes would be undetectable until the first push failed.
*/
const spki = publicKey.export({ type: 'spki', format: 'der' });
const raw = spki.subarray(spki.length - 65);
if (raw[0] !== 0x04) {
  console.error('Unexpected public key encoding — refusing to print a key that will not work.');
  process.exit(1);
}

// The private key is the 32-byte scalar `d`. `jwk` exposes it already base64url-encoded.
const { d } = privateKey.export({ format: 'jwk' });

console.log(`
Two values. Put BOTH in .env.local for local development, and in the Vercel
project's environment variables for production.

  NEXT_PUBLIC_VAPID_PUBLIC_KEY=${b64url(raw)}
  VAPID_PRIVATE_KEY=${d}

The public one carries the NEXT_PUBLIC_ prefix on purpose: the browser needs it
at subscribe time, it identifies the sender and authorises nothing, and it is
baked into every subscription anyway.

The private one is a SECRET. It signs every push you send. Do not commit it,
and do not paste it anywhere a key does not belong.

Also set VAPID_SUBJECT to a mailto: or https: URL you control — the push
services require a contact and will reject sends without one. For example:

  VAPID_SUBJECT=mailto:you@example.com

Rotating these invalidates every existing subscription, silently: reminders
simply stop until each device subscribes again.
`);
