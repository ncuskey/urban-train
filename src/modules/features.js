// js/modules/features.js
// NOTE: d3 is global if used; do not import it here.

import { makeNamer } from './names.js';

export function markFeatures({
  diagram,
  polygons,
  rng
}) {
  // Create fantasy namer with seeded RNG
  const namer = makeNamer(() => rng.random());
  
  var queue = []; // polygons to check
  var used = []; // checked polygons
  
  // Calculate total area for size normalization
  const totalArea = polygons.length;
  
  // define ocean cells
  var start = diagram.find(0, 0).index;
  queue.push(start);
  used.push(start);
  var type = "Ocean",
    name;
  if (polygons[start].featureType) {
    name = polygons[start].featureName;
  } else {
    // Calculate ocean size (number of ocean cells)
    let oceanSize = 0;
    for (let i = 0; i < polygons.length; i++) {
      if (polygons[i].height < 0.2) oceanSize++;
    }
    const oceanAreaNorm = oceanSize / totalArea;
    name = namer.ocean(oceanAreaNorm);
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
    
    // Calculate feature size and cluster size for naming
    let featureSize = 0;
    let clusterSize = 1; // Default for single feature
    
    if (type === "Island") {
      // Count islands in this cluster
      const tempQueue = [unmarked[0].index];
      const tempUsed = [unmarked[0].index];
      while (tempQueue.length > 0) {
        const i = tempQueue[0];
        tempQueue.shift();
        featureSize++;
        polygons[i].neighbors.forEach(function(e) {
          if (tempUsed.indexOf(e) < 0 && polygons[e] && polygons[e].height >= greater && polygons[e].height < less) {
            tempQueue.push(e);
            tempUsed.push(e);
          }
        });
      }
      clusterSize = featureSize;
      const islandAreaNorm = featureSize / totalArea;
      name = namer.island(clusterSize);
    } else {
      // Count lakes in this cluster
      const tempQueue = [unmarked[0].index];
      const tempUsed = [unmarked[0].index];
      while (tempQueue.length > 0) {
        const i = tempQueue[0];
        tempQueue.shift();
        featureSize++;
        polygons[i].neighbors.forEach(function(e) {
          if (tempUsed.indexOf(e) < 0 && polygons[e] && polygons[e].height >= greater && polygons[e].height < less) {
            tempQueue.push(e);
            tempUsed.push(e);
          }
        });
      }
      const lakeAreaNorm = featureSize / totalArea;
      name = namer.lake(lakeAreaNorm);
    }
    
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
