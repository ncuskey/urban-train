// js/modules/coastline.js
// NOTE: d3 is global; do not import it here.

export function drawCoastline({
  polygons,
  diagram,
  mapWidth,
  mapHeight,
  svg,
  islandBack,
  coastline,
  lakecoast,
  oceanLayer
}) {
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
          if (polygons[ea] && polygons[ea].height < 0.2) {
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
