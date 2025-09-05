// src/modules/lakes.js
// Priority-flood to detect closed depressions ("lakes") above sea level,
// compute each cell's spill height, and pick a single outlet per lake.
// Adds per-cell fields:
//   spillHeight: number
//   lakeId: -1 if none, else lake index
//   isLake: boolean
//   lakeOutlet: outlet cell index for this cell's lake (same for all members)
//
// Returns { lakes, cellsInLakes, endorheic, msg } where
//   lakes = count of lake regions, cellsInLakes = total lake cells,
//   endorheic = 0/rare (we treat outside as ocean), msg = short string.

function hasNeighbors(polygons) {
  return Array.isArray(polygons) && polygons.length && Array.isArray(polygons[0]?.neighbors);
}

class MinHeap {
  constructor() { this.a = []; }
  _swap(i, j) { const t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t; }
  _up(i) { for (; i>0; ) { const p=(i-1)>>1; if (this.a[p].k <= this.a[i].k) break; this._swap(i,p); i=p; } }
  _down(i) { for (let n=this.a.length;;) { let l=i*2+1, r=l+1, m=i; if (l<n && this.a[l].k < this.a[m].k) m=l; if (r<n && this.a[r].k < this.a[m].k) m=r; if (m===i) break; this._swap(i,m); i=m; } }
  push(x, k){ this.a.push({x,k}); this._up(this.a.length-1); }
  pop(){ if (!this.a.length) return null; const top=this.a[0]; const last=this.a.pop(); if (this.a.length){ this.a[0]=last; this._down(0);} return top; }
  get size(){ return this.a.length; }
}

export function computeLakes(polygons, { seaLevel = 0.2, eps = 1e-6 } = {}) {
  const N = Array.isArray(polygons) ? polygons.length : 0;
  if (!N || !hasNeighbors(polygons)) {
    return { lakes: 0, cellsInLakes: 0, endorheic: 0, msg: '[lakes] skipped (no neighbors)' };
  }

  // Reset/prepare fields
  for (let i=0;i<N;i++){
    const p = polygons[i];
    p.spillHeight = p.spillHeight ?? 0;
    p.lakeId = -1;
    p.isLake = false;
    p.lakeOutlet = -1;
  }

  // Seed the heap from ocean cells (height < seaLevel).
  const H = new MinHeap();
  const visited = new Uint8Array(N);
  const spill = new Float64Array(N);
  const via = new Int32Array(N);
  for (let i=0;i<N;i++){ spill[i] = Infinity; via[i] = -1; }

  let oceanSeeds = 0;
  for (let i=0;i<N;i++){
    const p = polygons[i];
    if (Number.isFinite(p.height) && p.height < seaLevel) {
      visited[i] = 1;
      spill[i] = p.height;
      H.push(i, p.height);
      oceanSeeds++;
    }
  }
  if (oceanSeeds === 0) {
    // Rare seed: if no ocean, treat map boundary as outlet by seeding the lowest 1% cells
    const hs = polygons.map((p, i) => ({i, h: p.height ?? 1}));
    hs.sort((a,b)=>a.h-b.h);
    const k = Math.max(1, Math.floor(0.01 * N));
    for (let t=0;t<k;t++){
      const i = hs[t].i;
      if (!visited[i]) { visited[i]=1; spill[i]=polygons[i].height; H.push(i, polygons[i].height); }
    }
  }

  // Priority-flood: pop lowest, relax neighbors at max(neigh.h, current.k)
  while (H.size){
    const {x:i, k:level} = H.pop();
    const p = polygons[i];
    for (const j of p.neighbors){
      if (j == null || visited[j]) continue;
      visited[j] = 1;
      const hj = polygons[j].height;
      const newLevel = Math.max(hj, level); // water level needed to pass to ocean
      spill[j] = newLevel;
      via[j] = i; // path toward ocean passes through i
      H.push(j, newLevel);
    }
  }

  // Classify lake cells (spill above ground AND above sea)
  const isLakeCell = new Uint8Array(N);
  let cellsInLakes = 0;
  for (let i=0;i<N;i++){
    const p = polygons[i];
    if (!Number.isFinite(p.height)) continue;
    if (spill[i] > p.height + eps && spill[i] > seaLevel + eps){
      isLakeCell[i] = 1; cellsInLakes++;
    }
  }
  if (!cellsInLakes) {
    // no lakes found
    for (let i=0;i<N;i++){ polygons[i].spillHeight = spill[i]; }
    return { lakes: 0, cellsInLakes: 0, endorheic: 0, msg: '[lakes] none' };
  }

  // Group contiguous lake regions (same spill within eps)
  const lakeId = new Int32Array(N); for (let i=0;i<N;i++) lakeId[i] = -1;
  const lakes = []; // { id, spill, outlet }
  let lid = 0;
  const stack = [];
  for (let s=0;s<N;s++){
    if (!isLakeCell[s] || lakeId[s] !== -1) continue;
    const targetSpill = spill[s];
    let count = 0, outlet = -1;

    stack.length = 0; stack.push(s);
    lakeId[s] = lid;

    while (stack.length){
      const i = stack.pop();
      const pi = polygons[i];
      pi.isLake = true;
      pi.lakeId = lid;
      pi.spillHeight = targetSpill;

      // Try to pick an outlet: the boundary contact where water escapes
      // We prefer a neighbor with spill == targetSpill but not a lake cell.
      const vi = via[i];
      if (vi >= 0 && !isLakeCell[vi] && Math.abs(spill[vi] - targetSpill) < 1e-6) {
        outlet = vi;
      }
      for (const j of pi.neighbors){
        if (j == null) continue;
        if (isLakeCell[j] && lakeId[j] === -1 && Math.abs(spill[j]-targetSpill) < 1e-6) {
          lakeId[j] = lid; stack.push(j);
        }
      }
      count++;
    }

    lakes.push({ id: lid, spill: targetSpill, outlet: outlet });
    lid++;
  }

  // Assign per-cell outlet for convenience
  for (const L of lakes) {
    for (let i=0;i<N;i++){
      if (lakeId[i] === L.id) polygons[i].lakeOutlet = L.outlet;
    }
  }

  // Endorheic accounting (if any lake spill path still doesn't reach sea in our model)
  let endorheic = 0;
  for (const L of lakes) if (L.outlet < 0) endorheic++;

  return {
    lakes: lakes.length,
    cellsInLakes,
    endorheic,
    msg: `[lakes] lakes=${lakes.length} cells=${cellsInLakes} endorheic=${endorheic}`
  };
}
