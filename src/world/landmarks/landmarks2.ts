/**
 * LANDMARKS2: the second table (generated from the real-map lot data by the lane's site script, then edited). Same row format as
 * landmarks.ts. The real identity of each row is in docs/swarm/tasks/LANDMARKS2.md; the names here are invented.
 */
import type { LandmarkRow } from './types';

export const LANDMARKS2: readonly LandmarkRow[] = [
  {
    "id": "wrenfield-church",
    "name": "Wrenfield Church",
    "kind": "church",
    "district": "Wrenfield Church",
    "blurb": "A white terracotta church front between two bell towers, buff brick wings and wide granite steps.",
    "lots": [
      "3033060006"
    ],
    "site": {
      "ax": 1903.9,
      "az": -160.5,
      "fx": 0.7103,
      "fz": -0.7039,
      "nx": 0.7039,
      "nz": 0.7103,
      "w": 42.7,
      "d": 28.1,
      "block": 352
    },
    "look": {
      "plan": "twin",
      "style": "baroque",
      "facade": 25,
      "towerW": 5.4,
      "towerLower": 27,
      "bodyH": 17,
      "wall": "#c9b07b",
      "trim": "#fbf8f0",
      "cornice": "#d8d0bd",
      "metal": "#3b281c"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "year (1910), parish, architects",
        "url": "https://en.wikipedia.org/wiki/St._Barbara%27s_Church_(Brooklyn)",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "front elevation, tower stages, portico, colours (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Main_entrance_of_St._Barbara’s_Roman_Catholic_Church_in_New_York_City.jpg",
        "licence": "CC BY 4.0 (Wiktoriapopek)"
      }
    ]
  },
  {
    "id": "alder-theatre",
    "name": "The Alder Theatre",
    "kind": "theatre",
    "district": "The Alder Theatre",
    "blurb": "A white terracotta movie palace on a wedge corner: round tower, fluted marquee, tall arched windows.",
    "lots": [],
    "site": {
      "ax": 1755.3,
      "az": 583.8,
      "fx": 0.685,
      "fz": 0.728,
      "nx": -0.728,
      "nz": 0.685,
      "w": 79.7,
      "d": 44.1,
      "block": 537,
      "poly": [
        1755.3,
        583.8,
        1777.5,
        608.4,
        1791.6,
        622.8,
        1809.2,
        641.1,
        1809.5,
        641.4,
        1809.6,
        641.7,
        1809.7,
        642.1,
        1809.6,
        642.5,
        1809.4,
        642.9,
        1809.2,
        643.2,
        1808.9,
        643.4,
        1808.5,
        643.5,
        1808.2,
        643.6,
        1807.8,
        643.5,
        1757.1,
        649.6,
        1756.7,
        649.5,
        1756.4,
        649.4,
        1756,
        649.2,
        1755.8,
        648.9,
        1755.6,
        648.6,
        1755.4,
        648.3,
        1755.4,
        647.9
      ]
    },
    "look": {
      "height": 21,
      "towerR": 4.5,
      "wall": "#e9e0cf",
      "paint": 0.9,
      "trim": "#eee6d6",
      "cornice": "#d9cdb5"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "opened 1911, corner of two avenues, architect, 2,500 seats",
        "url": "https://en.wikipedia.org/wiki/RKO_Bushwick_Theatre",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "corner tower, marquee, window rhythm, colour (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:RKO_BUSHWICK_THEATER_IN_BROOKLYN,_NEW_YORK_CITY._BROOKLYN_REMAINS_ONE_OF_AMERICA'S_BEST_SURVIVING_EXAMPLES_OF_A_19TH..._-_NARA_-_555919.jpg",
        "licence": "Public domain (Danny Lyon, US National Archives)"
      }
    ]
  },
  {
    "id": "hobart-brewhouse",
    "name": "Hobart Brewhouse",
    "kind": "brewery",
    "district": "Hobart Brewhouse",
    "blurb": "A four-storey round-arch brick brewery with a corbelled cornice and a tall chimney.",
    "lots": [
      "3031350034",
      "3031350036",
      "3031350020"
    ],
    "site": {
      "ax": 635,
      "az": -754.1,
      "fx": -0.7032,
      "fz": 0.711,
      "nx": -0.711,
      "nz": -0.7032,
      "w": 56,
      "d": 42,
      "block": 211
    },
    "look": {
      "floors": 4,
      "floorH": 3.7,
      "mainW": 46,
      "mainD": 27,
      "chimney": 34,
      "chimneyX": 40,
      "chimneyZ": 36,
      "wall": "#8d4733",
      "trim": "#a66a52"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "four buildings 1872 to 1890, German round-arch style, brew house, office, engine house",
        "url": "https://en.wikipedia.org/wiki/William_Ulmer_Brewery",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "corner view: window rhythm, hoods, pilasters, cornice, colours (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Ulmer_Brewery_Bushwick_Av_Belvedere_St_jeh.jpg",
        "licence": "CC0 1.0 (Jim Henderson)"
      }
    ]
  },
  {
    "id": "tamsins-pizza-yard",
    "name": "Tamsin's Pizza Yard",
    "kind": "eatery",
    "district": "Tamsin's Pizza Yard",
    "blurb": "A dark block-built pizzeria behind a boarded yard fence, picnic tables and string lights.",
    "lots": [
      "3031010022",
      "3031010025"
    ],
    "site": {
      "ax": 1001.6,
      "az": -1355.9,
      "fx": -0.9954,
      "fz": 0.0954,
      "nx": -0.0954,
      "nz": -0.9954,
      "w": 51.6,
      "d": 30.9,
      "block": 60
    },
    "look": {
      "wall": "#3b3029",
      "paint": 0.95
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "a well-known pizzeria and garden on a back street of Bushwick (written facts only)",
        "url": "https://en.wikipedia.org/wiki/Roberta%27s",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ]
  },
  {
    "id": "marigold-court-north",
    "name": "Marigold Court North",
    "kind": "housing",
    "district": "Marigold Court Towers",
    "blurb": "A 21-storey co-op tower on a lawn.",
    "lots": [
      "3030770001"
    ],
    "site": {
      "ax": -81.2,
      "az": -1531.4,
      "fx": -0.0274,
      "fz": 0.9996,
      "nx": -0.9996,
      "nz": -0.0274,
      "w": 122.3,
      "d": 21.7,
      "block": 22
    },
    "look": {
      "plan": "tower",
      "floors": 21,
      "height": 59,
      "brick": "tanBrick",
      "wall": "#b79a7e"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "14-acre Mitchell-Lama co-op completed 1965, 2,702 units",
        "url": "https://en.wikipedia.org/wiki/Lindsay_Park_(housing_cooperative)",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ]
  },
  {
    "id": "marigold-court-south",
    "name": "Marigold Court South",
    "kind": "housing",
    "district": "Marigold Court Towers",
    "blurb": "A second 21-storey co-op tower with its own lawns.",
    "lots": [
      "3030780001"
    ],
    "site": {
      "ax": 52,
      "az": -1507.6,
      "fx": -0.026,
      "fz": 0.9997,
      "nx": -0.9997,
      "nz": -0.026,
      "w": 100.8,
      "d": 60,
      "block": 24
    },
    "look": {
      "plan": "tower",
      "floors": 21,
      "height": 62,
      "brick": "tanBrick",
      "wall": "#b79a7e"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "14-acre Mitchell-Lama co-op completed 1965, 2,702 units",
        "url": "https://en.wikipedia.org/wiki/Lindsay_Park_(housing_cooperative)",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ]
  },
  {
    "id": "brightwater-houses",
    "name": "Brightwater Houses",
    "kind": "housing",
    "district": "Brightwater Houses",
    "blurb": "A nineteen-storey public housing tower on a green block.",
    "lots": [
      "3030980001"
    ],
    "site": {
      "ax": 364.1,
      "az": -1401.3,
      "fx": 1,
      "fz": 0,
      "nx": 0,
      "nz": 1,
      "w": 161.5,
      "d": 75,
      "block": 68,
      "poly": [
        365.4,
        -1340.3,
        365.1,
        -1340.3,
        364.7,
        -1340.5,
        364.5,
        -1340.7,
        364.3,
        -1341,
        364.1,
        -1341.3,
        364.1,
        -1341.7,
        364.5,
        -1399.6,
        364.6,
        -1399.9,
        364.7,
        -1400.3,
        364.9,
        -1400.6,
        365.2,
        -1400.9,
        365.5,
        -1401.1,
        365.9,
        -1401.2,
        366.2,
        -1401.3,
        487.5,
        -1399.5,
        487.9,
        -1399.5,
        488.3,
        -1399.3,
        488.6,
        -1399.1,
        488.9,
        -1398.8,
        489.1,
        -1398.4,
        495.8,
        -1380.8,
        507.7,
        -1357.2,
        518,
        -1339,
        525.6,
        -1326.1,
        523.1,
        -1330.3
      ]
    },
    "look": {
      "plan": "courts",
      "slabs": 1,
      "tall": 1,
      "tallFloors": 19,
      "floors": 13,
      "brick": "tanBrick",
      "trees": 40,
      "wall": "#b39a72"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "buildings of 13, 19 and 20 storeys, 1960",
        "url": "https://en.wikipedia.org/wiki/Bushwick-Hylan_Houses",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ]
  },
  {
    "id": "gablewood-row",
    "name": "Gablewood Row",
    "kind": "rowhouses",
    "district": "Gablewood Row",
    "blurb": "A row of three-storey brick tenements with round-arched windows under dark hoods.",
    "lots": [
      "3032110042",
      "3032110041",
      "3032110040",
      "3032110039",
      "3032110038",
      "3032110037"
    ],
    "site": {
      "ax": 2115,
      "az": -1283.4,
      "fx": -0.7229,
      "fz": 0.6909,
      "nx": -0.6909,
      "nz": -0.7229,
      "w": 57.6,
      "d": 30.6,
      "block": 73
    },
    "look": {
      "style": "tenement",
      "bay": 9.6,
      "floors": 3,
      "wall": "#9b4c3a",
      "cornice": "#4a4650"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "50 brick tenements 1902 to 1904, three storeys, terracotta detail",
        "url": "https://en.wikipedia.org/wiki/Willoughby%E2%80%93Suydam_Historic_District",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "arched windows, dark hoods, cornice, colours (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:RIDGEWOOD-GLENDALE-FRESH_POND_008.JPG",
        "licence": "CC BY-SA 3.0 (ALT55 - Victor M)"
      }
    ]
  },
  {
    "id": "dogwood-row",
    "name": "Dogwood Row",
    "kind": "rowhouses",
    "district": "Dogwood Row",
    "blurb": "A block of brownstone houses with high stoops and heavy cornices.",
    "lots": [
      "3016260008",
      "3016260007",
      "3016260006",
      "3016260005",
      "3016260004",
      "3016260003"
    ],
    "site": {
      "ax": 750.2,
      "az": 386.2,
      "fx": 0.0024,
      "fz": -1,
      "nx": 1,
      "nz": 0.0024,
      "w": 29.9,
      "d": 7,
      "block": 489
    },
    "look": {
      "style": "brownstone",
      "bay": 5,
      "floors": 2,
      "wall": "#79503f",
      "cornice": "#6a4535",
      "trim": "#a69884"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      }
    ]
  },
  {
    "id": "paintbox-row",
    "name": "Paintbox Row",
    "kind": "mural",
    "district": "Paintbox Row",
    "blurb": "A long warehouse wall covered in painted panels, each its own picture.",
    "lots": [
      "3031770045",
      "3031770035",
      "3031770030"
    ],
    "site": {
      "ax": 1956.1,
      "az": -1460.5,
      "fx": -0.7234,
      "fz": 0.6904,
      "nx": -0.6904,
      "nz": -0.7234,
      "w": 61.6,
      "d": 30.5,
      "block": 32
    },
    "look": {
      "height": 7.4,
      "pal": 0,
      "wall": "#a9a094",
      "paint": 0.8
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      }
    ]
  },
  {
    "id": "ashgrove-medical",
    "name": "Ashgrove Medical Center",
    "kind": "hospital",
    "district": "Ashgrove Medical Center",
    "blurb": "A brick medical centre with a curved glass bay and a slender tower.",
    "lots": [
      "3032600001"
    ],
    "site": {
      "ax": 2344.7,
      "az": -1064.4,
      "fx": -0.7224,
      "fz": 0.6914,
      "nx": -0.6914,
      "nz": -0.7224,
      "w": 61.1,
      "d": 23.8,
      "block": 134
    },
    "look": {
      "style": "corner",
      "towerH": 46,
      "wall": "#c58b5f",
      "paint": 0.5,
      "trim": "#e8e2d4"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "teaching hospital in the Wyckoff Heights part of Bushwick, opened 1899 as a German hospital",
        "url": "https://en.wikipedia.org/wiki/Wyckoff_Heights_Medical_Center",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "podium, glass-block bay, tower and grey upper block, brick colour (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Wyckoff_Heights_Medical_Center.jpg",
        "licence": "CC BY-SA 3.0 (Jim Henderson)"
      }
    ]
  },
  {
    "id": "fenwick-post-office",
    "name": "Fenwick Post Office",
    "kind": "library",
    "district": "Fenwick Post Office",
    "blurb": "A red brick branch post office of 1936 with tall arched windows and a roll-up door.",
    "lots": [
      "3031200016"
    ],
    "site": {
      "ax": 318.6,
      "az": -1101.1,
      "fx": -0.9996,
      "fz": -0.0273,
      "nx": 0.0273,
      "nz": -0.9996,
      "w": 30.5,
      "d": 28,
      "block": 109
    },
    "look": {
      "style": "post",
      "wall": "#8b3f33",
      "trim": "#d9d3c1",
      "paint": 0.3
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "built 1936, two storeys, Colonial Revival, central pavilion, listed on the National Register 1988",
        "url": "https://en.wikipedia.org/wiki/United_States_Post_Office_(Williamsburg,_Brooklyn)",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "arched ground-floor windows, brick arch rings, belt course, door canopy, colours (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Brooklyn-9-27-2013_038_-_US_Post_Office_-_Metropolitan_Station,_47_Debevoise_Street.JPG",
        "licence": "CC BY-SA 3.0 (photographer credited on the file page)"
      }
    ]
  },
  {
    "id": "cedarvane-church",
    "name": "Cedarvane Church",
    "kind": "church",
    "district": "Cedarvane Church",
    "blurb": "A cream brick Romanesque church with a tall tower, a triple-arched porch and a round turret.",
    "lots": [
      "3016120035"
    ],
    "site": {
      "ax": 1172.2,
      "az": 91.6,
      "fx": 1,
      "fz": -0.0004,
      "nx": 0.0004,
      "nz": 1,
      "w": 22.5,
      "d": 30.5,
      "block": 440
    },
    "look": {
      "plan": "romanesque",
      "wall": "#d3c49c",
      "paint": 0.35,
      "trim": "#a99b84",
      "cornice": "#a99b84",
      "metal": "#2a2420"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "built 1898-99, Romanesque Revival, cream brick with beige brick and terracotta trim, central gable between asymmetrical towers",
        "url": "https://en.wikipedia.org/wiki/Christ_Evangelical_English_Lutheran_Church",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "tower, triple-arched porch, round window, turret, colours (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Rugged_Cross_BC_Lafayette_jeh.JPG",
        "licence": "CC0 1.0 (Jim Henderson)"
      }
    ]
  },
  {
    "id": "redmoor-armory",
    "name": "Redmoor Armory",
    "kind": "armory",
    "district": "Redmoor Armory",
    "blurb": "A red brick castle of an armory: two great round towers with corbelled battlements around a tall arched gate.",
    "lots": [
      "3016490001"
    ],
    "site": {
      "ax": 356.3,
      "az": 813.8,
      "fx": -1,
      "fz": 0.0012,
      "nx": -0.0012,
      "nz": -1,
      "w": 43.1,
      "d": 60.1,
      "block": 559
    },
    "look": {
      "towers": 4,
      "hall": 1,
      "wall": "#8d4a3a",
      "paint": 0.3,
      "trim": "#b49a7e"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Building Footprints (roof height, year)",
        "url": "https://data.cityofnewyork.us/resource/5zhs-2jue.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "built 1892-94 to the designs of Rudolph L. Daus, castle style with machicolations, now a shelter",
        "url": "https://en.wikipedia.org/wiki/13th_Regiment_Armory",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "round towers with corbelled crenellated caps, tall arched gate panel, colours (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:13th_Regiment_Armory,_August_2025.jpg",
        "licence": "CC0 1.0 (public domain dedication)"
      }
    ]
  }
];
