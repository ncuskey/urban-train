console.time('generate');
generate(5); // Generate a random map with 5 features on initial load
console.timeEnd('generate');

// genaral function; run onload of to start from scratch
function generate(count) {
  // Add general elements
  var svg = d3.select("svg")
    .on("touchmove mousemove", moved),
    mapWidth = +svg.attr("width"),
    mapHeight = +svg.attr("height"),
    defs = svg.select("defs"),
    viewbox = svg.append("g").attr("class", "viewbox"),
    islandBack = viewbox.append("g").attr("class", "islandBack"),
    mapCells = viewbox.append("g").attr("class", "mapCells"),
    oceanLayer = viewbox.append("g").attr("class", "oceanLayer"),
    circles = viewbox.append("g").attr("class", "circles"),
    coastline = viewbox.append("g").attr("class", "coastline"),
		shallow = viewbox.append("g").attr("class", "shallow"),
    lakecoast = viewbox.append("g").attr("class", "lakecoast");
  // Poisson-disc sampling from https://bl.ocks.org/mbostock/99049112373e12709381
  var sampler = poissonDiscSampler(mapWidth, mapHeight, sizeInput.valueAsNumber),
    samples = [],
    sample;
  while (sample = sampler()) samples.push(sample);
  // Voronoi D3
  var voronoi = d3.voronoi().extent([
      [0, 0],
      [mapWidth, mapHeight]
    ]),
    diagram = voronoi(samples),
    polygons = diagram.polygons(),
    // Colors D3 interpolation
    color = d3.scaleSequential(d3.interpolateSpectral),
    // Queue array  
    queue = [];

  // Hover HUD perf helpers
  let hoverRafId = 0;
  let lastNearest = -1;
  const hudCell = document.getElementById('cell');
  const hudHeight = document.getElementById('height');
  const hudFeature = document.getElementById('feature');

  // Add D3 drag and zoom behavior
  var zoom = d3.zoom()
    .scaleExtent([1, 50])
    .translateExtent([
      [-100, -100],
      [mapWidth + 100, mapHeight + 100]
    ])
    .on("zoom", zoomed);

  svg.call(zoom);

  function zoomed(event) {
    viewbox.attr("transform", event.transform);
  }

  $("#resetZoom").click(function() {
    svg.transition().duration(1000)
      .call(zoom.transform, d3.zoomIdentity);
  });

  // array to use as names
  var adjectives = ["Ablaze", "Ablazing", "Accented", "Ashen", "Ashy", "Beaming", "Bi-Color", "Blazing", "Bleached", "Bleak", "Blended", "Blotchy", "Bold", "Brash", "Bright", "Brilliant", "Burnt", "Checkered", "Chromatic", "Classic", "Clean", "Colored", "Colorful", "Colorless", "Complementing", "Contrasting", "Cool", "Coordinating", "Crisp", "Dappled", "Dark", "Dayglo", "Deep", "Delicate", "Digital", "Dim", "Dirty", "Discolored", "Dotted", "Drab", "Dreary", "Dull", "Dusty", "Earth", "Electric", "Eye-Catching", "Faded", "Faint", "Festive", "Fiery", "Flashy", "Flattering", "Flecked", "Florescent", "Frosty", "Full-Toned", "Glistening", "Glittering", "Glowing", "Harsh", "Hazy", "Hot", "Hued", "Icy", "Illuminated", "Incandescent", "Intense", "Interwoven", "Iridescent", "Kaleidoscopic", "Lambent", "Light", "Loud", "Luminous", "Lusterless", "Lustrous", "Majestic", "Marbled", "Matte", "Medium", "Mellow", "Milky", "Mingled", "Mixed", "Monochromatic", "Motley", "Mottled", "Muddy", "Multicolored", "Multihued", "Murky", "Natural", "Neutral", "Opalescent", "Opaque", "Pale", "Pastel", "Patchwork", "Patchy", "Patterned", "Perfect", "Picturesque", "Plain", "Primary", "Prismatic", "Psychedelic", "Pure", "Radiant", "Reflective", "Rich", "Royal", "Ruddy", "Rustic", "Satiny", "Saturated", "Secondary", "Shaded", "Sheer", "Shining", "Shiny", "Shocking", "Showy", "Smoky", "Soft", "Solid", "Somber", "Soothing", "Sooty", "Sparkling", "Speckled", "Stained", "Streaked", "Streaky", "Striking", "Strong Neutral", "Subtle", "Sunny", "Swirling", "Tinged", "Tinted", "Tonal", "Toned", "Translucent", "Transparent", "Two-Tone", "Undiluted", "Uneven", "Uniform", "Vibrant", "Vivid", "Wan", "Warm", "Washed-Out", "Waxen", "Wild"];

  detectNeighbors();

  // for each polygon detect neibours and add their indexes
  function detectNeighbors() {
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

  function add(start, type) {
    // get options
    var height = heightInput.valueAsNumber,
      radius = radiusInput.valueAsNumber,
      sharpness = sharpnessInput.valueAsNumber,
      queue = [], // polygons to check
      used = []; // used polygons
    polygons[start].height += height;
    polygons[start].featureType = undefined;
    queue.push(start);
    used.push(start);
    for (var i = 0; i < queue.length && height > 0.01; i++) {
      if (type == "island") {
        height = polygons[queue[i]].height * radius;
      } else {
        height = height * radius;
      }
      polygons[queue[i]].neighbors.forEach(function(e) {
        if (used.indexOf(e) < 0) {
          var mod = Math.random() * sharpness + 1.1 - sharpness;
          if (sharpness == 0) {
            mod = 1;
          }
          polygons[e].height += height * mod;
          if (polygons[e].height > 1) {
            polygons[e].height = 1;
          }
          polygons[e].featureType = undefined;
          queue.push(e);
          used.push(e);
        }
      });
    }
  }

  function drawPolygons() {
    // delete all polygons
    svg.select(".mapCell").remove();
    // redraw the polygons based on new heights
    var grads = [],
      limit = 0.2;
    if (seaInput.checked == true) {
      limit = 0;
    }
    polygons.map(function(i) {
      if (i.height >= limit) {
        mapCells.append("path")
          .attr("d", "M" + i.join("L") + "Z")
          .attr("class", "mapCell")
          .attr("fill", color(1 - i.height));
        mapCells.append("path")
          .attr("d", "M" + i.join("L") + "Z")
          .attr("class", "mapStroke")
          .attr("stroke", color(1 - i.height));
      }
			if (i.type === "shallow") {
				shallow.append("path")
					.attr("d", "M" + i.join("L") + "Z");
			}
    });
    if (blurInput.valueAsNumber > 0) {
      toggleBlur();
    }
  }

  // Mark GeoFeatures (ocean, lakes, isles)
  function markFeatures() {
    var queue = []; // polygons to check
    var used = []; // checked polygons
    // define ocean cells
    var start = diagram.find(0, 0).index;
    queue.push(start);
    used.push(start);
    var type = "Ocean",
      name;
    if (polygons[start].featureType) {
      name = polygons[start].featureName;
    } else {
      name = adjectives[Math.floor(Math.random() * adjectives.length)];
    }
    polygons[start].featureType = type;
    polygons[start].featureName = name;
    while (queue.length > 0) {
      var i = queue[0];
      queue.shift();
      polygons[i].neighbors.forEach(function(e) {
        if (used.indexOf(e) < 0 && polygons[e].height < 0.2) {
          polygons[e].featureType = type;
          polygons[e].featureName = name;
          queue.push(e);
          used.push(e);
        }
      });
    }
    // define islands and lakes
    var island = 0,
      lake = 0,
      number = 0,
      greater = 0,
      less = 0;
    var unmarked = $.grep(polygons, function(e) {
      return (!e.featureType);
    });
    while (unmarked.length > 0) {
      if (unmarked[0].height >= 0.2) {
        type = "Island";
        number = island;
        island += 1;
        greater = 0.2;
        less = 100; // just to omit exclusion
      } else {
        type = "Lake";
        number = lake;
        lake += 1;
        greater = -100; // just to omit exclusion
        less = 0.2;
      }
      name = adjectives[Math.floor(Math.random() * adjectives.length)];
      start = unmarked[0].index;
      polygons[start].featureType = type;
      polygons[start].featureName = name;
      polygons[start].featureNumber = number;
      queue.push(start);
      used.push(start);
      while (queue.length > 0) {
        var i = queue[0];
        queue.shift();
        polygons[i].neighbors.forEach(function(e) {
          if (used.indexOf(e) < 0 && polygons[e].height >= greater && polygons[e].height < less) {
            polygons[e].featureType = type;
            polygons[e].featureName = name;
            polygons[e].featureNumber = number;
            queue.push(e);
            used.push(e);
          }
        });
      }
      unmarked = $.grep(polygons, function(e) {
        return (!e.featureType);
      });
    }
  }

  function drawCoastline() {
    d3.selectAll(".coastlines").remove();
    var line = []; // array to store coasline edges
    for (var i = 0; i < polygons.length; i++) {
      if (polygons[i].height >= 0.2) {
        var cell = diagram.cells[i];
        cell.halfedges.forEach(function(e) {
          var edge = diagram.edges[e];
          if (edge.left && edge.right) {
            var ea = edge.left.index;
            if (ea === i) {
              ea = edge.right.index;
            }
            if (polygons[ea].height < 0.2) {
              var start = edge[0].join(" ");
              var end = edge[1].join(" ");
              if (polygons[ea].featureType === "Ocean") {
								polygons[ea].type = "shallow";
								var type = "Island";
                var number = polygons[i].featureNumber;
              } else {
                var type = "Lake";
                var number = polygons[ea].featureNumber;
              }
              line.push({start, end, type, number});
            }
          }
        })
      }
    }
    // scales amd line for paths drawing
    var x = d3.scaleLinear().domain([0, mapWidth]).range([0, mapWidth]);
    var y = d3.scaleLinear().domain([0, mapHeight]).range([0, mapHeight]);
    var path = d3.line()
      .x(function(d) {
        return x(d.x);
      })
      .y(function(d) {
        return y(d.y);
      })
      .curve(d3.curveBasisClosed);
    // find and draw continuous coastline (island/ocean)
    var number = 0;
    var type = "Island";
    var edgesOfFeature = $.grep(line, function(e) {
      return (e.type == type && e.number === number);
    });
    while (edgesOfFeature.length > 0) {
      var coast = []; // array to store coastline for feature
      var start = edgesOfFeature[0].start;
      var end = edgesOfFeature[0].end;
      edgesOfFeature.shift();
      var spl = start.split(" ");
      coast.push({
        x: spl[0],
        y: spl[1]
      });
      spl = end.split(" ");
      coast.push({
        x: spl[0],
        y: spl[1]
      });
      for (var i = 0; end !== start && i < 2000; i++) {
        var next = $.grep(edgesOfFeature, function(e) {
          return (e.start == end || e.end == end);
        });
        if (next.length > 0) {
          if (next[0].start == end) {
            end = next[0].end;
          } else if (next[0].end == end) {
            end = next[0].start;
          }
          spl = end.split(" ");
          coast.push({
            x: spl[0],
            y: spl[1]
          });
        }
        var rem = edgesOfFeature.indexOf(next[0]);
        edgesOfFeature.splice(rem, 1);
      }
      svg.select("#shape").append("path").attr("d", path(coast))
        .attr("fill", "black");
      islandBack.append("path").attr("d", path(coast));
      coastline.append("path").attr("d", path(coast));
      number += 1;
      edgesOfFeature = $.grep(line, function(e) {
        return (e.type == type && e.number === number);
      });
    }
    // find and draw continuous coastline (lake/island)
    number = 0;
    type = "Lake";
    edgesOfFeature = $.grep(line, function(e) {
      return (e.type == type && e.number === number);
    });
    while (edgesOfFeature.length > 0) {
      var coast = []; // array to store coasline for feature
      number += 1;
      var start = edgesOfFeature[0].start;
      var end = edgesOfFeature[0].end;
      edgesOfFeature.shift();
      spl = start.split(" ");
      coast.push({
        x: spl[0],
        y: spl[1]
      });
      spl = end.split(" ");
      coast.push({
        x: spl[0],
        y: spl[1]
      });
      for (var i = 0; end !== start && i < 2000; i++) {
        var next = $.grep(edgesOfFeature, function(e) {
          return (e.start == end || e.end == end);
        });
        if (next.length > 0) {
          if (next[0].start == end) {
            end = next[0].end;
          } else if (next[0].end == end) {
            end = next[0].start;
          }
          spl = end.split(" ");
          coast.push({
            x: spl[0],
            y: spl[1]
          });
        }
        var rem = edgesOfFeature.indexOf(next[0]);
        edgesOfFeature.splice(rem, 1);
      }
      edgesOfFeature = $.grep(line, function(e) {
        return (e.type == type && e.number === number);
      });
      lakecoast.append("path").attr("d", path(coast));
    }
    oceanLayer.append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", mapWidth).attr("height", mapHeight);
  }

  // Click handler removed - no longer adding terrain on click

  function moved() {
    if (hoverRafId) return; // throttle to animation frame
    const point = d3.mouse(this);
    hoverRafId = requestAnimationFrame(function () {
      hoverRafId = 0;
      const nearest = diagram.find(point[0], point[1]).index;
      if (nearest === lastNearest) return; // only update when cell changes
      lastNearest = nearest;
      const poly = polygons[nearest];
      // vanilla DOM updates (faster than jQuery for high-frequency UI)
      hudCell.textContent = nearest;
      hudHeight.textContent = poly.height.toFixed(2);
      hudFeature.textContent = poly.featureType
        ? (poly.featureName + " " + poly.featureType)
        : "no!";
    });
  }

  if (count != undefined) {
    randomMap(count);
  }

  // Create randon map
  function randomMap(count) {
    for (var c = 0; c < count; c++) {
      // Big blob first
      if (c == 0) {
        var x = Math.random() * mapWidth / 4 + mapWidth / 2;
        var y = Math.random() * mapHeight / 4 + mapHeight / 2;
        var rnd = diagram.find(x, y).index;
        circles.append("circle")
          .attr("r", 3)
          .attr("cx", x)
          .attr("cy", y)
          .attr("fill", color(1 - heightInput.valueAsNumber))
          .attr("class", "circle");
        add(rnd, "island");
        radiusInput.value = 0.99;
        radiusOutput.value = 0.99;
      } else { // Then small blobs
        var limit = 0; // limit while iterations
        do {
          rnd = Math.floor(Math.random() * polygons.length);
          limit++;
        } while ((polygons[rnd].height > 0.25 || polygons[rnd].data[0] < mapWidth * 0.25 || polygons[rnd].data[0] > mapWidth * 0.75 || polygons[rnd].data[1] < mapHeight * 0.2 || polygons[rnd].data[1] > mapHeight * 0.75) &&
          limit < 50)
        heightInput.value = Math.random() * 0.4 + 0.1;
        circles.append("circle")
          .attr("r", 3)
          .attr("cx", polygons[rnd].data[0])
          .attr("cy", polygons[rnd].data[1])
          .attr("fill", color(1 - heightInput.valueAsNumber))
          .attr("class", "circle");
        add(rnd, "hill");
      }
    }
    heightInput.value = Math.random() * 0.4 + 0.1;
    heightOutput.value = heightInput.valueAsNumber;
    // process the calculations
    markFeatures();
    drawCoastline();
    drawPolygons();
    $('.circles').hide();
    
    // reset hover cache after (re)generation
    lastNearest = -1;
  }

  // redraw all polygons on SeaInput change 
  $("#seaInput").change(function() {
    drawPolygons();
  });

  // Draw of remove blur polygons on intup change
  $("#blurInput").change(function() {
    toggleBlur();
  });

  // Change blur, in case of 0 will not be drawn 
  function toggleBlur() {
    d3.selectAll(".blur").remove();
    if (blurInput.valueAsNumber > 0) {
      var limit = 0.2;
      if (seaInput.checked == true) {
        limit = 0;
      }
      polygons.map(function(i) {
        if (i.height >= limit) {
          mapCells.append("path")
            .attr("d", "M" + i.join("L") + "Z")
            .attr("class", "blur")
            .attr("stroke-width", blurInput.valueAsNumber)
            .attr("stroke", color(1 - i.height));
        }
      });
    }
  }

  // Draw of remove blur polygons on intup change
  $("#strokesInput").change(function() {
    toggleStrokes();
  });

  // Change polygons stroke-width,
  // in case of low width svg background will be shined through 
  function toggleStrokes() {
    if (strokesInput.checked == true) {
      var limit = 0.2;
      if (seaInput.checked == true) {
        limit = 0;
      }
      polygons.map(function(i) {
        if (i.height >= limit) {
          mapCells.append("path")
            .attr("d", "M" + i.join("L") + "Z")
            .attr("class", "mapStroke")
            .attr("stroke", "grey");
        }
      });
    } else {
      d3.selectAll(".mapStroke").remove();
    }
  }

  // Based on https://www.jasondavies.com/poisson-disc/
  function poissonDiscSampler(width, height, radius) {
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
      if (!sampleSize) return sample(Math.random() * width, Math.random() * height);

      // Pick a random existing sample and remove it from the queue.
      while (queueSize) {
        var i = Math.random() * queueSize | 0,
          s = queue[i];

        // Make a new candidate between [radius, 2 * radius] from the existing sample.
        for (var j = 0; j < k; ++j) {
          var a = 2 * Math.PI * Math.random(),
            r = Math.sqrt(Math.random() * R + radius2),
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

  // Clear the map on re-generation
  function undraw() {
    // Remove all on regenerate 
    $("g").remove();
    $("path").remove();
    // Set some options to defaults
    heightInput.value = 0.9;
    heightOutput.value = 0.9;
    radiusInput.value = 0.9;
    radiusOutput.value = 0.9;
  }
}

// Clear the map on re-generation (global function)
function undraw() {
  // Remove all on regenerate 
  $("g").remove();
  $("path").remove();
  // Set some options to defaults
  heightInput.value = 0.9;
  heightOutput.value = 0.9;
  radiusInput.value = 0.9;
  radiusOutput.value = 0.9;
}

// Toggle options panel visibility
function toggleOptions() {
  var optionsPanel = document.getElementById('options');
  if (optionsPanel.hidden) {
    optionsPanel.hidden = false;
  } else {
    optionsPanel.hidden = true;
  }
}

// Toggle blob centers visibility
function toggleBlobCenters() {
  $('.circles').toggle();
}

// Make functions available globally for HTML onclick handlers
window.undraw = undraw;
window.generate = generate;
window.toggleOptions = toggleOptions;
window.toggleBlobCenters = toggleBlobCenters;
