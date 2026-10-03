/**
 * Deterministic random numbers. A challenge seed (a short string) is hashed
 * into 128 bits of state for sfc32, so the same seed always produces the
 * same sequence on every browser and in Node.
 */

export type Rng = () => number;

/** xmur3 string hash -> generator of 32-bit seeds. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** sfc32: small, fast, well-distributed. Returns floats in [0, 1). */
export function createRng(seed: string): Rng {
  const next = xmur3(seed);
  let a = next(), b = next(), c = next(), d = next();
  const rng: Rng = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Discard a few outputs so similar seeds diverge immediately.
  for (let i = 0; i < 12; i++) rng();
  return rng;
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Standard normal via Box–Muller. Always consumes exactly two uniforms. */
export function randNormal(rng: Rng): number {
  const u1 = rng();
  const u2 = rng();
  // 1 - u1 is in (0, 1], so the log is finite.
  return Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
}

const SEED_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const SEED_PATTERN = /^[a-z0-9]{4,24}$/;

/** A fresh, URL-safe challenge seed. Uses crypto when available. */
export function newSeed(length = 8): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const b of bytes) out += SEED_ALPHABET[b % SEED_ALPHABET.length];
  return out;
}

/** Accepts a seed from a URL only if it is a plain short token. */
export function parseSeed(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  return SEED_PATTERN.test(s) ? s : null;
}
