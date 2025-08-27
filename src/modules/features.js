// js/modules/features.js
// NOTE: d3 is global if used; do not import it here.

import { makeNamer } from './names.js';

export function markFeatures({
  diagram,
  polygons,
  rng,
  adjectives
}) {
  // Create fantasy namer with seeded RNG
  const namer = makeNamer(() => rng.random(), null); // null = no flavor pack
  
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
    name = namer.ocean();
  }
  polygons[start].featureType = type;
  polygons[start].featureName = name;
  while (queue.length > 0) {
    var i = queue[0];
    queue.shift();
    polygons[i].neighbors.forEach(function(e) {
      if (used.indexOf(e) < 0 && polygons[e] && polygons[e].height < 0.2) {
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
    name = type === "Island" ? namer.island() : namer.lake();
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
        if (used.indexOf(e) < 0 && polygons[e] && polygons[e].height >= greater && polygons[e].height < less) {
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
