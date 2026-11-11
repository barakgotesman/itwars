/**
 * Small numeric helpers shared by the simulation systems.
 */

/** Rounds to centimetres, to keep snapshots and events small. */
export const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Rounds to milliradians, for view angles on the wire. */
export const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Small fast seeded PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
