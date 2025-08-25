// Deterministic, seedable RNG (sfc32 + xmur3), with helpers.
// Usage:
//   import { RNG } from "./core/rng.js";
//   const rng = new RNG(12345); // or new RNG("seed-string")
//   rng.random(); // 0..1
//   rng.int(0, 10); // integer in [0,10]
//   rng.pick(array); // pick one element
//   rng.shuffle(array, true); // in-place Fisher-Yates

const hasPerf = typeof performance !== "undefined" && performance.now;

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const res = (t + d) | 0;
    c = (c + res) | 0;
    return (res >>> 0) / 4294967296;
  };
}

function normalizeSeed(seed) {
  if (seed == null) return 123456789;
  if (typeof seed === "number" && Number.isFinite(seed)) return Math.floor(seed) >>> 0;
  return seed + ""; // string fallback
}

export class RNG {
  constructor(seed) {
    this.reseed(seed);
  }

  reseed(seed) {
    const s = normalizeSeed(seed);
    if (typeof s === "number") {
      // expand a single int into four using simple mix
      let a = s >>> 0;
      let b = (s ^ 0x9e3779b9) >>> 0;
      let c = (s ^ 0x85ebca6b) >>> 0;
      let d = (s ^ 0xc2b2ae35) >>> 0;
      this._rand = sfc32(a, b, c, d);
      this._seed = s;
    } else {
      const h = xmur3(String(s));
      this._rand = sfc32(h(), h(), h(), h());
      this._seed = s;
    }
  }

  get seed() { return this._seed; }

  random() { return this._rand(); } // float [0,1)

  float(min = 0, max = 1) { return min + (max - min) * this._rand(); }

  int(min, max) {
    if (min > max) [min, max] = [max, min];
    return Math.floor(this.float(min, max + 1));
  }

  bool(p = 0.5) { return this._rand() < p; }

  pick(arr) { return arr[(this.int(0, arr.length - 1))]; }

  shuffle(arr, inPlace = false) {
    const a = inPlace ? arr : arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// handy singleton for quick use without wiring (optional, can remove)
export const globalRNG = new RNG((hasPerf ? Math.floor(performance.now()) : Date.now()) ^ 0xdeadbeef);
