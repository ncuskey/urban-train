// names.js — realistic fantasy names for oceans, lakes, islands
export function makeNamer(rng) {
  const used = new Set();

  const ADJ = ["Ancient","Ashen","Azure","Black","Blooming","Bright","Cerulean","Crimson","Crystal","Cursed","Dark","Deep","Dusky","Ebon","Endless","Frozen","Gilded","Glacial","Gleaming","Glimmering","Golden","Hidden","Hollow","Ivory","Jade","Lonely","Misty","Moonlit","Pale","Pearled","Quiet","Restless","Sable","Scarlet","Serene","Shattered","Shimmering","Silent","Silver","Starry","Still","Stormy","Sunken","Tempest","Twilight","Verdant","Whispering","Wild","Winter"];
  const NOUN = ["Abyss","Anchors","Ashes","Banners","Bells","Bones","Brine","Cinders","Crowns","Depths","Dragons","Dreams","Echoes","Embers","Fangs","Feathers","Frost","Ghosts","Giants","Glimmer","Gloom","Gold","Harps","Haze","Hollows","Horizon","Lanterns","Leviathans","Lights","Lotus","Maidens","Mariners","Masks","Mirrors","Mist","Moon","Night","Oath","Pearls","Phantoms","Promise","Reckoning","Reefs","Relics","Rime","Roses","Ruins","Sapphires","Scales","Scars","Serpents","Shadows","Shards","Ships","Silence","Smoke","Snow","Sorrow","Stars","Stones","Tempests","Thrones","Thunder","Tides","Whispers","Winds","Wyrms"];

  const OCEAN_TERMS   = ["Sea","Ocean","Gulf","Bight","Expanse","Reach","Deeps"]; // modern
  const OCEAN_CLASSIC  = ["Mare","Thalassa","Pelagos"];                            // classical (standalone family)
  const LAKE_TERMS     = ["Lake"];                                                 // used as prefix/suffix
  const LAKE_STANDALONE= ["Mere","Loch","Lough","Tarn","Lagoon","Basin","Pool"];   // never combine with "Lake"
  const ISLE_SINGULAR  = ["Island","Isle","Islet","Atoll","Cay","Key","Skerry"];
  const ISLE_PLURAL    = ["Islands","Isles","Keys","Skerries"];

  const pick = a => a[Math.floor(rng()*a.length)];
  const title = s => s.replace(/\s+/g,' ').replace(/\b\w/g, m=>m.toUpperCase()).trim();

  function uniq(gen) {
    for (let i=0;i<60;i++){ const n = gen(); if (!used.has(n)) { used.add(n); return n; } }
    let n = gen(), k=2; while (used.has(`${n} ${k}`)) k++; n=`${n} ${k}`; used.add(n); return n;
  }

  // size in [0..1] relative to world; clusterSize = number of islands in group (>=1)
  function oceanName(size=1) {
    return uniq(() => {
      // 65% modern terms; 35% classical look
      if (rng() < 0.35) {
        const base = pick(OCEAN_CLASSIC);
        if (base === "Mare")     return title(`Mare ${pick(["Noctis","Astra","Umbra","Ventorum","Fulgur","Tenebrarum"])}`);
        if (base === "Thalassa") return title(`Thalassa of ${pick(NOUN)}`);
        if (base === "Pelagos")  return title(`${pick(ADJ)} Pelagos`);
      }
      // modern family: choose one terminal term only
      const term = (size > 0.6) ? pick(["Ocean","Sea","Expanse"]) :
                   (size > 0.3) ? pick(["Sea","Reach","Gulf"]) :
                                  pick(["Sea","Bight","Reach","Deeps"]);
      const form = rng()<0.45 ? `The ${pick(ADJ)} ${term}` :
                   rng()<0.75 ? `${term} of ${pick(NOUN)}` :
                                `${pick(ADJ)} ${pick(NOUN)} ${term}`;
      return title(form);
    });
  }

  function lakeName(size=0.5) {
    return uniq(() => {
      if (rng() < 0.45) { // Lake X / X Lake
        return title( rng()<0.6 ? `Lake ${pick(NOUN)}` : `${pick(ADJ)} Lake` );
      }
      // Standalone type (no "Lake" with these)
      const t = pick(LAKE_STANDALONE);
      return title( rng()<0.6 ? `${pick(NOUN)} ${t}` : `${pick(ADJ)} ${t}` );
    });
  }

  function islandName(clusterSize=1) {
    return uniq(() => {
      const plural = clusterSize > 1;
      const head = plural ? pick(ISLE_PLURAL) : pick(ISLE_SINGULAR);
      // avoid "X Island Island": never append a second type word
      return title( rng()<0.5
        ? `${pick(ADJ)} ${head}`
        : plural ? `${head} of ${pick(NOUN)}`
                 : `${pick(NOUN)} ${head}` );
    });
  }

  return { ocean: oceanName, lake: lakeName, island: islandName };
}
