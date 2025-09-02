// src/labels/spatial-index.js
// Minimal quadtree index over anchors (x,y). d3 is global.

export function makeAnchorIndex(anchors) {
  const qt = d3.quadtree()
    .x(a => a.x)
    .y(a => a.y)
    .addAll(anchors);

  function query(bbox) {
    // bbox: {x0,x1,y0,y1}
    const out = [];
    qt.visit((node, x0, y0, x1, y1) => {
      if (x1 < bbox.x0 || x0 > bbox.x1 || y1 < bbox.y0 || y0 > bbox.y1) return true; // skip
      if (!node.length) {
        do {
          const d = node.data;
          if (d && d.x >= bbox.x0 && d.x <= bbox.x1 && d.y >= bbox.y0 && d.y <= bbox.y1) out.push(d);
        } while (node = node.next);
      }
      return false;
    });
    return out;
  }

  return { qt, query, size: () => qt.size() };
}
