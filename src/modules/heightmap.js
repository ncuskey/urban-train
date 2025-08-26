// js/modules/heightmap.js
// NOTE: d3 is global; do not import it here.

export function randomMap(count, {
  rng, diagram, polygons,
  heightInput, radiusInput, sharpnessInput,
  circlesLayer, // d3 selection/group used to draw seed markers
  mapWidth, mapHeight, color, radiusOutput
}) {
  for (var c = 0; c < count; c++) {
    // Big blob first
    if (c == 0) {
      var x = rng.random() * mapWidth / 4 + mapWidth / 2;
      var y = rng.random() * mapHeight / 4 + mapHeight / 2;
      var rnd = diagram.find(x, y).index;
      circlesLayer.append("circle")
        .attr("r", 3)
        .attr("cx", x)
        .attr("cy", y)
        .attr("fill", color(1 - heightInput.valueAsNumber))
        .attr("class", "circle");
      add(rnd, "island", {
        rng, diagram, polygons,
        heightInput, radiusInput, sharpnessInput
      });
      radiusInput.value = 0.99;
      radiusOutput.value = 0.99;
    } else { // Then small blobs
      var limit = 0; // limit while iterations
      do {
        rnd = rng.int(0, polygons.length - 1);
        limit++;
      } while ((polygons[rnd].height > 0.25 || polygons[rnd].data[0] < mapWidth * 0.25 || polygons[rnd].data[0] > mapWidth * 0.75 || polygons[rnd].data[1] < mapHeight * 0.2 || polygons[rnd].data[1] > mapHeight * 0.75) &&
        limit < 50)
      heightInput.value = rng.random() * 0.4 + 0.1;
      circlesLayer.append("circle")
        .attr("r", 3)
        .attr("cx", polygons[rnd].data[0])
        .attr("cy", polygons[rnd].data[1])
        .attr("fill", color(1 - heightInput.valueAsNumber))
        .attr("class", "circle");
      add(rnd, "hill", {
        rng, diagram, polygons,
        heightInput, radiusInput, sharpnessInput
      });
    }
  }
  heightInput.value = rng.random() * 0.4 + 0.1;
  heightOutput.value = heightInput.valueAsNumber;
}

export function add(start, type, {
  rng, diagram, polygons,
  heightInput, radiusInput, sharpnessInput
}) {
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
      if (used.indexOf(e) < 0 && polygons[e]) {
        var mod = rng.random() * sharpness + 1.1 - sharpness;
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
