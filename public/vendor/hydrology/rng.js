/**
 * Tiny deterministic PRNG (LCG) so hydrology is fully reproducible.
 * API mirrors Math.random()-adjacent helpers for convenience.
 */
export class SeededRandom {
    /**
     * @param seed any integer; if undefined, uses a fixed default for stability
     */
    constructor(seed = 123456789) {
        this.state = (seed | 0) || 123456789;
        if (this.state === 0)
            this.state = 1;
    }
    /** Returns a uint32 and advances state */
    nextU32() {
        // Numerical Recipes LCG: (a=1664525, c=1013904223, m=2^32)
        this.state = (1664525 * this.state + 1013904223) >>> 0;
        return this.state;
    }
    /** Float in [0, 1) */
    float() {
        return this.nextU32() / 0x100000000;
    }
    /** Float in [min, max) */
    floatIn(min, max) {
        return min + (max - min) * this.float();
    }
    /** Int in [min, max] (inclusive) */
    intIn(min, max) {
        const a = Math.ceil(min);
        const b = Math.floor(max);
        return a + (this.nextU32() % (b - a + 1));
    }
    /** Pick a random element from a non-empty array */
    choice(arr) {
        if (!arr.length)
            throw new Error("choice() on empty array");
        return arr[this.intIn(0, arr.length - 1)];
    }
    /** Fisher–Yates shuffle (in place) */
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.intIn(0, i);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}
