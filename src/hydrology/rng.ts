/**
 * Tiny deterministic PRNG (LCG) so hydrology is fully reproducible.
 * API mirrors Math.random()-adjacent helpers for convenience.
 */
export class SeededRandom {
  private state: number;

  /**
   * @param seed any integer; if undefined, uses a fixed default for stability
   */
  constructor(seed: number = 123456789) {
    this.state = (seed | 0) || 123456789;
    if (this.state === 0) this.state = 1;
  }

  /** Returns a uint32 and advances state */
  nextU32(): number {
    // Numerical Recipes LCG: (a=1664525, c=1013904223, m=2^32)
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state;
  }

  /** Float in [0, 1) */
  float(): number {
    return this.nextU32() / 0x100000000;
  }

  /** Float in [min, max) */
  floatIn(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Int in [min, max] (inclusive) */
  intIn(min: number, max: number): number {
    const a = Math.ceil(min);
    const b = Math.floor(max);
    return a + (this.nextU32() % (b - a + 1));
  }

  /** Pick a random element from a non-empty array */
  choice<T>(arr: T[]): T {
    if (!arr.length) throw new Error("choice() on empty array");
    return arr[this.intIn(0, arr.length - 1)];
  }

  /** Fisher–Yates shuffle (in place) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.intIn(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
