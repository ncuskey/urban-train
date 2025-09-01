// d3 is global; do not import it
import { getLabelTokens, opacityForZoom } from "./labelTokens.js";

export function showLODHUD(svg) {
  const t = d3.zoomTransform(svg.node());
  const tokens = getLabelTokens();
  const tiers = tokens.lod.tiers;
  const fadeW = tokens.lod.fade_width_zoom;
  const lines = [
    `k=${t.k.toFixed(2)}  (fadeW=${fadeW})`,
    ...["t1","t2","t3","t4"].map(k => {
      const b = tiers[k];
      const o = opacityForZoom(t.k, +k[1], fadeW);
      return `${k}: [${b.min_zoom}, ${b.max_zoom}] => o=${o.toFixed(2)}`;
    })
  ];

  let hud = d3.select("#lod-hud");
  if (hud.empty()) hud = d3.select("body").append("pre").attr("id","lod-hud")
    .style("position","fixed").style("left","8px").style("top","8px")
    .style("margin","0").style("padding","6px 8px")
    .style("background","#0008").style("color","#fff")
    .style("font","12px/1.2 monospace").style("z-index","9999");
  hud.text(lines.join("\n"));
}
