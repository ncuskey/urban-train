// names.js — robust fantasy names for oceans, lakes, islands
// API preserved:
//   export function makeNamer(rng) -> { ocean(size=1), lake(size=0.5), island(clusterSize=1) }
// Notes:
// - Uniqueness now guards *roots* (e.g., avoid repeating "Everdark …") across one namer instance.
// - Oceans use adjectival directions (Northern/Western), epic "of the …" constructs, and descriptors.
// - Lakes follow grammar guards: adjective-before vs. "Lake of the {plural/abstract}".
// - Island type selection is size-aware; clusterSize>1 biases to small/medium forms.

export function makeNamer(rng) {
  // ---------- RNG helpers ----------
  const R = typeof rng === "function" ? rng : Math.random;
  const pick = (a) => a[(R() * a.length) | 0];

  // ---------- Lexicons ----------
  const DESCRIPTORS = [
    "Crystal","Silver","Golden","Verdant","Shattered","Frozen","Silent","Black","White",
    "Crimson","Azure","Emerald","Iron","Broken","Hidden","Everdark","Sapphire","Obsidian",
    "Pale","Gleaming","Somber","Stormy","Glacial","Misty","Sunlit","Moonlit","Starlit"
  ];

  const QUALIFIERS = [
    "Foul","Swift","Raging","Wandering","Burning","Churning","Whispering","Weeping",
    "Shimmering","Drowned","Forgotten","Cursed","Endless","Eternal","Blighted","Roaring",
    "Howling","Restless","Fading","Shifting","Never-Ending"
  ];

  const DIRECTIONS_ADJ = ["Northern","Southern","Eastern","Western","Far Northern","Far Southern","Far Eastern","Far Western"];

  const FEATURES = {
    oceanlike: ["Ocean","Sea","Expanse","Deep","Abyss","Gulf","Current","Tide","Shoals"],
    lakelike:  ["Lake","Mere","Tarn","Pool","Basin","Mirror","Reservoir","Waters"],
  };

  // Noun pools
  const NATURAL_SING = ["Wind","Storm","Gale","Thunder","Mist","Fog","Flame","Fire","Ash","Ice","Frost","Wave",
                        "Tide","Current","Depth","Abyss","Rain","Moon","Sun","Star","Cloud","Reef","Boulder",
                        "Willow","Pine","Reed","Lily","Lotus"];
  const NATURAL_PLUR = ["Winds","Storms","Gales","Thunders","Mists","Fogs","Flames","Fires","Ashes","Waves",
                        "Tides","Currents","Depths","Rains","Stars","Clouds","Reefs","Boulders"];

  const MYTH_SING = ["Dragon","Serpent","Leviathan","Kraken","Giant","Titan","Wraith","Phantom","Shadow","Spirit","Witch","Demon"];
  const MYTH_PLUR = ["Dragons","Serpents","Leviathans","Giants","Titans","Wraiths","Phantoms","Shadows","Spirits","Witches","Demons"];

  const ANIMALS_SING = ["Crow","Raven","Eagle","Gull","Whale","Shark","Seal","Otter","Wolf","Bear","Stag","Fox"];
  const ANIMALS_PLUR = ["Crows","Ravens","Eagles","Gulls","Whales","Sharks","Seals","Otters","Wolves","Bears","Stags","Foxes"];

  const FLORA_SING = ["Oak","Pine","Ash","Willow","Briar","Rose","Reed","Lily","Lotus"];
  const FLORA_PLUR = ["Oaks","Pines","Ashes","Willows","Briars","Roses","Reeds","Lilies","Lotuses"];

  const ABSTRACT_SING = ["Dream","Hope","Silence","Memory","Night","Dawn","Dusk","Twilight","Fate","Fortune","Doom","Echo"];
  const ABSTRACT_PLUR = ["Dreams","Memories","Echoes","Hopes","Nightfalls","Dawns"];

  const SING_POOLS = [NATURAL_SING, MYTH_SING, ANIMALS_SING, FLORA_SING, ABSTRACT_SING];
  const PLUR_POOLS = [NATURAL_PLUR, MYTH_PLUR, ANIMALS_PLUR, FLORA_PLUR, ABSTRACT_PLUR];

  // Island types by size bucket
  const ISLAND_TYPES_BY_SIZE = {
    huge:   ["Continent", "Mainland", "Great Island"],
    large:  ["Island", "Great Isle"],
    medium: ["Island", "Isle", "Atoll"],
    small:  ["Isle", "Atoll", "Holm"],
    tiny:   ["Key", "Cay", "Skerry", "Rock", "Islet"]
  };

  // ---------- Inflection ----------
  const IRREGULAR_PLURALS = new Map([
    ["Ash","Ashes"], ["Willow","Willows"], ["Reef","Reefs"], ["Gull","Gulls"],
    ["Wolf","Wolves"], ["Leaf","Leaves"], ["Life","Lives"], ["Knife","Knives"],
    ["Man","Men"], ["Woman","Women"], ["Child","Children"], ["Mouse","Mice"],
    ["Goose","Geese"], ["Ox","Oxen"], ["Lotus","Lotuses"], ["Lily","Lilies"]
  ]);
  const IRREGULAR_SINGULARS = new Map(Array.from(IRREGULAR_PLURALS, ([s,p]) => [p,s]));

  function pluralize(word) {
    if (IRREGULAR_PLURALS.has(word)) return IRREGULAR_PLURALS.get(word);
    if (/(ch|sh|s|x|z)$/i.test(word)) return word + "es";
    if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, "ies");
    if (/(?:fe|f)$/i.test(word))   return word.replace(/fe?$/i, "ves");
    return word + "s";
  }
  function ensurePlural(word) {
    if (IRREGULAR_SINGULARS.has(word)) return word; // already plural irregular
    if (/(s|xes|ches|shes|ies|ves)$/i.test(word)) return word; // looks plural
    return pluralize(word);
  }

  // ---------- Utilities ----------
  const usedFull = new Set();   // exact name uniqueness
  const usedRoots = new Set();  // "root" uniqueness to reduce near-dupes

  function title(s) { return s.replace(/\s+/g,' ').replace(/\b\w/g, m=>m.toUpperCase()).trim(); }
  function withArticle(s){ return `The ${s}`; }
  function maybeDirectionAdj(){ return R()<0.35 ? pick(DIRECTIONS_ADJ)+" " : ""; }

  function pickNoun(pluralOK=true) {
    if (pluralOK && R()<0.55) { const pool = pick(PLUR_POOLS); return [pick(pool), true]; }
    const pool = pick(SING_POOLS); return [pick(pool), false];
  }
  function combineQualifierNoun(q, noun, forcePlural) {
    return `${q} ${forcePlural ? ensurePlural(noun) : noun}`;
  }

  const BLOCKED_ROOTS = new Set([
    "Isle","Island","Atoll","Key","Cay","Skerry","Holm","Rock",
    "Continent","Mainland","Great","Great Island","Great Isle","of","the"
  ]);
  function extractRoot(name) {
    const tokens = name.replaceAll(",", "").split(/\s+/);
    for (const t of tokens) if (!BLOCKED_ROOTS.has(t)) return t;
    return name;
  }

  function uniqName(builder, tries=20) {
    for (let i=0;i<tries;i++) {
      const n = builder();
      const root = extractRoot(n);
      if (!usedFull.has(n) && !usedRoots.has(root)) {
        usedFull.add(n); usedRoots.add(root); return n;
      }
    }
    // fallback: allow full-name uniqueness only
    for (let i=0;i<tries;i++) {
      const n = builder();
      if (!usedFull.has(n)) { usedFull.add(n); return n; }
    }
    // final fallback: suffix with counter
    let n = builder(), k=2;
    while (usedFull.has(`${n} ${k}`)) k++;
    n = `${n} ${k}`; usedFull.add(n);
    return n;
  }

  // ---------- Size helpers ----------
  function bucketFromSize(size) {
    // size: 0..1 (relative to world). Adjust thresholds to taste.
    if (size >= 0.80) return "huge";
    if (size >= 0.55) return "large";
    if (size >= 0.30) return "medium";
    if (size >= 0.12) return "small";
    return "tiny";
  }

  // If caller only provides clusterSize (legacy island API),
  // bias groups (clusterSize>1) toward small/medium; singletons can be any size.
  function bucketFromClusterSize(clusterSize) {
    if (clusterSize > 4) return pick(["small","small","medium"]);   // many members -> small
    if (clusterSize > 1) return pick(["small","medium"]);           // few members -> small/med
    return pick(["tiny","small","medium","large"]);                 // single island can be larger
  }

  // ---------- Builders ----------
  function oceanName(size=1) {
    // size influences feature term a bit (not required)
    return uniqName(() => {
      const feature = pick(FEATURES.oceanlike);
      const mode = R();
      if (mode < 0.25) {
        // Directional + feature: "The Western Sea"
        return title(withArticle(`${maybeDirectionAdj()}${feature}`.trim()));
      } else if (mode < 0.55) {
        // Descriptor + feature: "The Shattered Sea"
        return title(withArticle(`${pick(DESCRIPTORS)} ${feature}`));
      } else if (mode < 0.85) {
        // "{feature} of {qualifier} {plural_noun}"
        const q = pick(QUALIFIERS);
        const [noun] = pickNoun(true);
        return title(`${feature} of ${combineQualifierNoun(q, noun, true)}`);
      } else {
        // "The {descriptor} Deep/Expanse/Abyss"
        const deepish = pick(["Deep","Expanse","Abyss","Reaches","Current"]);
        return title(withArticle(`${pick(DESCRIPTORS)} ${deepish}`));
      }
    });
  }

  function lakeName(size=0.5) {
    return uniqName(() => {
      const feature = pick(FEATURES.lakelike);
      const mode = R();
      if (mode < 0.45) {
        // "{Adj} Lake" or "Lake {Noun}" depending on euphony
        if (R() < 0.6) return title(`${pick(DESCRIPTORS)} ${feature}`);
        const [noun, isPlural] = pickNoun(false);
        if (isPlural || /s$/.test(noun)) return title(`${pick(DESCRIPTORS)} ${feature}`);
        // prefer "Lake {Noun}" if short; else "{Noun} Lake"
        const oneSyll = ((noun.toLowerCase().match(/[aeiouy]+/g)||[]).length <= 1);
        return title(oneSyll || R()<0.6 ? `${feature} ${noun}` : `${noun} ${feature}`);
      } else if (mode < 0.80) {
        // "Lake of the {qualifier} {plural_noun}"
        const q = pick(QUALIFIERS);
        const [noun] = pickNoun(true);
        return title(`${feature} of the ${combineQualifierNoun(q, noun, true)}`);
      } else {
        // Standalone watery terms inside FEATURES already cover variety (Mere/Tarn/Pool/Waters)
        // If chosen feature is "Waters/Reservoir", prefer adjective-first
        if (/(Waters|Reservoir)/i.test(feature)) return title(`${pick(DESCRIPTORS)} ${feature}`);
        // fallback to simple descriptive
        return title(`${pick(DESCRIPTORS)} ${feature}`);
      }
    });
  }

  function islandName(clusterSize=1) {
    // Back-compat signature kept. Internally we pick a size bucket:
    const bucket = bucketFromClusterSize(clusterSize);
    const base = pick(ISLAND_TYPES_BY_SIZE[bucket]);

    return uniqName(() => {
      const mode = R();
      if (mode < 0.40) {
        // "{Adj} {Base}"
        return title(`${pick(DESCRIPTORS)} ${base}`);
      } else if (mode < 0.75) {
        // "{Base} of the {noun}"
        const [noun] = pickNoun(false);
        return title(`${base} of the ${noun}`);
      } else {
        // "{Noun} {Base}"
        const [noun] = pickNoun(false);
        return title(`${noun} ${base}`);
      }
    });
  }

  return { ocean: oceanName, lake: lakeName, island: islandName };
}
