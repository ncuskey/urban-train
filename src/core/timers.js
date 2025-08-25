// Lightweight perf timers with console logging + summaries.
// Usage:
//   import { Timers } from "./core/timers.js";
//   const timers = new Timers();
//   timers.mark("generate");
//   // ...work...
//   timers.lap("generate", "Init Voronoi polys");
//   console.table(timers.summary());

export class Timers {
  constructor() {
    this._marks = new Map();
    this._rows = [];
  }

  mark(key) { this._marks.set(key, performance.now()); }

  lap(key, label = key) {
    const t0 = this._marks.get(key);
    if (t0 == null) return 0;
    const dt = performance.now() - t0;
    this._rows.push({ label, ms: +dt.toFixed(2) });
    this._marks.set(key, performance.now());
    return dt;
  }

  time(label, fn) {
    const t0 = performance.now();
    const val = fn();
    const dt = performance.now() - t0;
    this._rows.push({ label, ms: +dt.toFixed(2) });
    return val;
  }

  log(label, ms) { this._rows.push({ label, ms: +ms.toFixed(2) }); }

  summary() { return this._rows.slice(); }

  clear() { this._marks.clear(); this._rows.length = 0; }
}
