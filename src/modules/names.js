// names.js — fantasy descriptive names for oceans, lakes, islands
// Works with d3-random or any seeded RNG that returns [0,1).

export const NameLex = {
  // broad descriptors you can combine across kinds
  adj: [
    "Ancient","Ashen","Azure","Black","Blighted","Blooming","Bright","Bronze","Calm","Cerulean",
    "Clouded","Cold","Crimson","Crystal","Cursed","Dark","Dawn","Deep","Distant","Dusky",
    "Ebon","Elder","Endless","Fallen","Forgotten","Frozen","Gilded","Glacial","Gleaming","Glimmering",
    "Gloomy","Golden","Grim","Hidden","Hollow","Howling","Iron","Ivory","Jade","Lonely",
    "Misty","Moonlit","Mournful","Narrow","Pale","Pearled","Quiet","Raging","Restless","Sable",
    "Scarlet","Serene","Shattered","Shimmering","Silent","Silver","Smoldering","Starry","Still","Stormy",
    "Sunken","Tempest","Twilight","Verdant","Whispering","Wild","Windward","Winter","Witching"
  ],

  // evocative nouns (general/fantasy)
  noun: [
    "Abyss","Amber","Anchors","Angels","Ashes","Aurora","Banners","Basilisk","Bells","Bones",
    "Brine","Cinders","Crowns","Dawn","Depths","Desolation","Dragons","Dreams","Drowned","Echoes",
    "Embers","Fangs","Feathers","Frost","Ghosts","Giants","Glimmer","Gloom","Gold","Grief",
    "Harps","Haze","Hollows","Horizon","Isles","Ivory","Kings","Labyrinth","Lament","Lanterns",
    "Leviathans","Lights","Lotus","Maidens","Mariners","Masks","Mirrors","Mist","Moon","Naiads",
    "Night","Oath","Pearls","Phantoms","Promise","Reckoning","Reefs","Relics","Rime","Roses",
    "Ruins","Sapphires","Scales","Scars","Serpents","Shadows","Shards","Ships","Silence","Smoke",
    "Snow","Sorrow","Stars","Stones","Tempests","Thrones","Thunder","Tides","Tridents","Whispers",
    "Widows","Winds","Wyrms"
  ],

  // water-body terms (for oceans/lakes)
  hydro: {
    oceanTerms: ["Sea","Ocean","Mare","Thalassa","Pelagos","Bight","Reach","Expanse","Deeps","Gulf"],
    lakeTerms:  ["Lake","Mere","Lough","Loch","Lac","Lagoon","Basin","Pool","Tarn","Fen","Marsh"]
  },

  // island terms/suffixes
  insular: {
    heads: ["Isle","Island","Islet","Atoll","Skerry","Cay","Key","Archipelago"],
    suffixes: ["-holm","-ey","-eyja","-isle","-ia","-oa","-ora","-ara","-os","-is"]
  },

  // flavor packs (optional): pick one per world for subtle tone
  flavor: {
    norseAdj: ["Bitter","Iron","Rune","Salt","Slumbering","Wolfish"],
    norseNoun: ["Bjorn","Drakkar","Jarl","Njord","Raven","Skald","Ymir"],
    greekAdj: ["Aegean","Icarian","Orphic","Chthonic","Titanic"],
    greekNoun: ["Aether","Chimera","Elysium","Nereids","Helios","Nyx"],
    desertAdj: ["Amber","Sirocco","Dun","Miraged","Sunworn"],
    desertNoun: ["Caravan","Dune","Incense","Oasis","Scarab","Sunspire"]
  }
};

// Weighted templates per kind
const TEMPLATES = {
  ocean: [
    ["The ${adj} ${term}", 2],
    ["${term} of ${noun}", 3],
    ["${adj} ${noun} ${term}", 2],
    ["${noun} ${Reach}", 1],      // e.g., "Siren Reach"
    ["Mare ${Latin}", 1],         // "Mare Umbra"
    ["${adj} ${term} of ${noun}", 1]
  ],
  lake: [
    ["${waterTerm} ${noun}", 3],       // "Lake Sorrow"
    ["${adj} ${waterTerm}", 2],        // "Shimmering Lake"
    ["${noun} ${mereTerm}", 2],        // "Lotus Mere"
    ["${adj} ${noun} ${waterTerm}", 1] // "Silent Mirror Lake"
  ],
  island: [
    ["${noun} ${islandTerm}", 3],       // "Dragon Isle"
    ["${adj} ${islandTerm}", 2],        // "Verdant Island"
    ["${islandsTerm} of ${noun}", 2],   // "Isles of Echoes"
    ["${root}${suf}", 1]                // "Skullholm", "Ivorey", etc.
  ]
};

// Local helper pickers (seeded RNG in)
function choose(rng, arr, weights=null) {
  if (!weights) return arr[Math.floor(rng()*arr.length)];
  const sum = weights.reduce((a,b)=>a+b,0);
  let roll = rng()*sum;
  for (let i=0;i<arr.length;i++){ roll -= weights[i]; if (roll<=0) return arr[i]; }
  return arr[arr.length-1];
}

function expandOcean(rng, lex) {
  const tmpl = choose(rng, TEMPLATES.ocean.map(t=>t[0]), TEMPLATES.ocean.map(t=>t[1]));
  const term = choose(rng, lex.hydro.oceanTerms);
  const Reach = choose(rng, ["Reach","Bight","Run","Pass","Current","Way"]);
  const Latin = choose(rng, ["Noctis","Umbra","Astra","Vitae","Mortis","Ventorum","Fulgur"]);
  return tmpl
    .replace("${adj}", choose(rng, lex.adj))
    .replace("${term}", term)
    .replace("${noun}", choose(rng, lex.noun))
    .replace("${Reach}", Reach)
    .replace("${Latin}", Latin);
}

function expandLake(rng, lex) {
  const tmpl = choose(rng, TEMPLATES.lake.map(t=>t[0]), TEMPLATES.lake.map(t=>t[1]));
  const waterTerm = choose(rng, lex.hydro.lakeTerms);
  const mereTerm = choose(rng, ["Mere","Loch","Lough","Lagoon","Tarn","Basin"]);
  return tmpl
    .replace("${waterTerm}", waterTerm)
    .replace("${mereTerm}", mereTerm)
    .replace("${adj}", choose(rng, lex.adj))
    .replace("${noun}", choose(rng, lex.noun));
}

function expandIsland(rng, lex) {
  const tmpl = choose(rng, TEMPLATES.island.map(t=>t[0]), TEMPLATES.island.map(t=>t[1]));
  const islandTerm = choose(rng, lex.insular.heads);
  const islandsTerm = choose(rng, ["Isles","Islands","Keys","Skerries","Cays"]);
  const suf = choose(rng, lex.insular.suffixes);
  const root = choose(rng, [...lex.noun, ...lex.adj]).replace(/[^A-Za-z]/g,"");
  return tmpl
    .replace("${islandTerm}", islandTerm)
    .replace("${islandsTerm}", islandsTerm)
    .replace("${adj}", choose(rng, lex.adj))
    .replace("${noun}", choose(rng, lex.noun))
    .replace("${root}", root)
    .replace("${suf}", suf);
}

// Public API
export function makeNamer(seedRng, flavor = null) {
  // merge flavor pack lightly
  const lex = JSON.parse(JSON.stringify(NameLex));
  if (flavor && NameLex.flavor[flavor+"Adj"]) {
    lex.adj = [...lex.adj, ...NameLex.flavor[flavor+"Adj"]];
  }
  if (flavor && NameLex.flavor[flavor+"Noun"]) {
    lex.noun = [...lex.noun, ...NameLex.flavor[flavor+"Noun"]];
  }

  const used = new Set();

  function unique(gen) {
    for (let i=0;i<50;i++){
      const name = gen();
      if (!used.has(name)) { used.add(name); return name; }
    }
    // fallback: add numeric disambiguator
    const n = gen();
    let k = 2; while (used.has(`${n} ${k}`)) k++;
    const out = `${n} ${k}`; used.add(out); return out;
  }

  return {
    ocean: () => unique(() => expandOcean(seedRng, lex)),
    lake:  () => unique(() => expandLake(seedRng, lex)),
    island:() => unique(() => expandIsland(seedRng, lex))
  };
}
