// js/modules/geometry.js
// NOTE: d3 is assumed to be available globally (do not import it here).

// 1) VERBATIM COPY from main.js
export function poissonDiscSampler(width, height, radius, rng) {
  var k = 30, // maximum number of samples before rejection
    radius2 = radius * radius,
    R = 3 * radius2,
    cellSize = radius * Math.SQRT1_2,
    gridWidth = Math.ceil(width / cellSize),
    gridHeight = Math.ceil(height / cellSize),
    grid = new Array(gridWidth * gridHeight),
    queue = [],
    queueSize = 0,
    sampleSize = 0;

  return function() {
    if (!sampleSize) return sample(rng.random() * width, rng.random() * height);

    // Pick a random existing sample and remove it from the queue.
    while (queueSize) {
      var i = rng.int(0, queueSize - 1),
        s = queue[i];

      // Make a new candidate between [radius, 2 * radius] from the existing sample.
      for (var j = 0; j < k; ++j) {
        var a = 2 * Math.PI * rng.random(),
          r = Math.sqrt(rng.random() * R + radius2),
          x = s[0] + r * Math.cos(a),
          y = s[1] + r * Math.sin(a);

        // Reject candidates that are outside the allowed extent,
        // or closer than 2 * radius to any existing sample.
        if (0 <= x && x < width && 0 <= y && y < height && far(x, y)) return sample(x, y);
      }

      queue[i] = queue[--queueSize];
      queue.length = queueSize;
    }
  };

  function far(x, y) {
    var i = x / cellSize | 0,
      j = y / cellSize | 0,
      i0 = Math.max(i - 2, 0),
      j0 = Math.max(j - 2, 0),
      i1 = Math.min(i + 3, gridWidth),
      j1 = Math.min(j + 3, gridHeight);

    for (j = j0; j < j1; ++j) {
      var o = j * gridWidth;
      for (i = i0; i < i1; ++i) {
        if (s = grid[o + i]) {
          var s,
            dx = s[0] - x,
            dy = s[1] - y;
          if (dx * dx + dy * dy < radius2) return false;
        }
      }
    }

    return true;
  }

  function sample(x, y) {
    var s = [x, y];
    queue.push(s);
    grid[gridWidth * (y / cellSize | 0) + (x / cellSize | 0)] = s;
    ++sampleSize;
    ++queueSize;
    return s;
  }
}

// 2) Tiny wrapper around current Voronoi construction (no behavioral changes)
export function buildVoronoi(samples, width, height) {
  // Keep identical d3.voronoi().extent usage and options as in main.js
  const voronoi = d3.voronoi().extent([
    [0, 0],
    [width, height]
  ]);
  const diagram = voronoi(samples);
  const polygons = diagram.polygons();
  return { diagram, polygons };
}

// 3) VERBATIM COPY from main.js
export function detectNeighbors(diagram, polygons) {
  // push neighbors indexes to each polygons element
  polygons.map(function(i, d) {
    i.index = d; // index of this element
    i.height = 0;
    var neighbors = [];
    diagram.cells[d].halfedges.forEach(function(e) {
      var edge = diagram.edges[e],
        ea;
      if (edge.left && edge.right) {
        ea = edge.left.index;
        if (ea === d) {
          ea = edge.right.index;
        }
        neighbors.push(ea);
      }
    })
    i.neighbors = neighbors;
  });
}
