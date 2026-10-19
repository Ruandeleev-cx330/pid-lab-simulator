/**
 * Deterministic seeded PRNG (mulberry32).
 *
 * A challenge is fully reproducible from its seed: same target, same initial
 * condition, same starting gains. The seed is NOT the answer - the gains still
 * have to be tuned by the user.
 */

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  gaussian(mean: number, stdDev: number): number;
  pick<T>(items: readonly T[]): T;
  /** Rounded sample that respects the display precision of the UI. */
  stepped(min: number, max: number, step: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    gaussian(mean, stdDev) {
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick(items) {
      return items[Math.floor(next() * items.length) % items.length];
    },
    stepped(min, max, step) {
      const steps = Math.max(1, Math.round((max - min) / step));
      return min + Math.round(steps * next()) * step;
    }
  };
}

/** Derive an independent seed for retry attempt `n`. */
export function deriveSeed(seed: number, attempt: number): number {
  return (Math.imul(seed ^ 0x85ebca6b, 0x27d4eb2d) ^ Math.imul(attempt + 1, 0x165667b1)) >>> 0;
}

export function randomSeed(): number {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
