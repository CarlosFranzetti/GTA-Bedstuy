/**
 * LANDMARKS3: the third table (Bed-Stuy places on the grown map, generated from the lot data by the lane's site script, then edited).
 * Same row format as landmarks.ts. The real identity of each row is in docs/swarm/tasks/LANDMARKS3.md; the names here are invented.
 */
import type { LandmarkRow } from './types';

export const LANDMARKS3: readonly LandmarkRow[] = [
  {
    "id": "thornbury-academy",
    "name": "Thornbury Academy",
    "kind": "school",
    "district": "Thornbury Academy",
    "blurb": "A red-brick Victorian school on a brownstone base: central tower with a belfry and slate spire over a columned entrance, mansard wings.",
    "lots": [
      "3018440001"
    ],
    "site": {
      "ax": -675.8,
      "az": 1062.1,
      "fx": -1,
      "fz": 0.0031,
      "nx": -0.0031,
      "nz": -1,
      "w": 76.9,
      "d": 28.1,
      "block": 907
    },
    "look": {
      "plan": "gothic",
      "floors": 3,
      "wall": "#9a4a38",
      "trim": "#b79a72",
      "cornice": "#4a3a35",
      "metal": "#2c2724"
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
        "what": "girls high school, 1885-86, Victorian Gothic, architect, Nostrand Avenue",
        "url": "https://en.wikipedia.org/wiki/Girls%27_High_School_(Brooklyn)",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "front elevation: central tower, portico, window rhythm, mansard, colours (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Girls_HS_Nostrand_Av_jeh.jpg",
        "licence": "CC0 1.0 (Jim Henderson)"
      }
    ]
  },
  {
    "id": "tamarind-flats",
    "name": "The Tamarind Flats",
    "kind": "housing",
    "district": "The Tamarind Flats",
    "blurb": "A long tan-brick apartment house with terracotta pilasters, a corner bay under a pyramid roof, red tile mansard and a shop arcade.",
    "lots": [
      "3018430020"
    ],
    "site": {
      "ax": -774.2,
      "az": 998.2,
      "fx": 0.0012,
      "fz": 1,
      "nx": -1,
      "nz": 0.0012,
      "w": 64.2,
      "d": 24.7,
      "block": 906
    },
    "look": {
      "plan": "moorish",
      "floors": 3,
      "bayAt": 0.42,
      "wall": "#cba66f",
      "trim": "#b3623f",
      "cornice": "#7a4634",
      "shop": "Pennywhistle Corner Market"
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
        "what": "apartment house 1889-90, Moorish Revival, Nostrand Avenue",
        "url": "https://en.wikipedia.org/wiki/Alhambra_Apartments",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "street front: pilasters, corner bay and pyramid roof, tile mansard, dormers, chimneys, shop arcade (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Alhambra_Apts_Nostrand_Av_jeh.jpg",
        "licence": "CC0 1.0 (Jim Henderson)"
      }
    ]
  },
  {
    "id": "marrowgate-church",
    "name": "Marrowgate Church",
    "kind": "church",
    "district": "Marrowgate Church",
    "blurb": "A dark stone Gothic church with a street gable, a big round window, a pointed porch and pale stone buttresses.",
    "lots": [
      "3018530001"
    ],
    "site": {
      "ax": 65.2,
      "az": 1144,
      "fx": -1,
      "fz": 0,
      "nx": 0,
      "nz": -1,
      "w": 55.7,
      "d": 28,
      "block": 919
    },
    "look": {
      "plan": "gothicgable",
      "wall": "#4b5054",
      "trim": "#cdc6b2",
      "metal": "#7c1f22"
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
        "what": "Roman Catholic church on Throop Avenue, 1890s, Gothic Revival",
        "url": "https://en.wikipedia.org/wiki/Our_Lady_of_Victory_Church_(Brooklyn)",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "gable front: round window with tracery, pointed porch, buttresses, lancet groups, dark stone, red fence (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Victory_RCC_Throop_Av_jeh.jpg",
        "licence": "CC0 1.0 (Jim Henderson)"
      }
    ]
  },
  {
    "id": "juniper-row",
    "name": "Juniper Row",
    "kind": "rowhouses",
    "district": "Juniper Row",
    "blurb": "A long row of orange-tan three-storey houses on brownstone basements: stoops, projecting bays and heavy bracketed cornices.",
    "lots": [
      "3016650083",
      "3016650082",
      "3016650081",
      "3016650080",
      "3016650079",
      "3016650078",
      "3016650077",
      "3016650076",
      "3016650075",
      "3016650074",
      "3016650073",
      "3016650072"
    ],
    "site": {
      "ax": 606.5,
      "az": 1061.8,
      "fx": -1,
      "fz": 0.0008,
      "nx": -0.0008,
      "nz": -1,
      "w": 78.4,
      "d": 30.6,
      "block": 900
    },
    "look": {
      "style": "brownstone",
      "bay": 6.5,
      "floors": 3,
      "wall": "#c78a50",
      "arched": true,
      "cornice": "#6b3b2a",
      "trim": "#a45a3b"
    },
    "sources": [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Stuyvesant Heights Historic District, rows of 1880s and 1890s houses, brownstone and brick",
        "url": "https://en.wikipedia.org/wiki/Stuyvesant_Heights_Historic_District",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      },
      {
        "what": "a row in the same district (Decatur St): orange brick, brownstone base, arched windows, projecting bay, heavy cornice (looked at, measured by eye)",
        "url": "https://commons.wikimedia.org/wiki/File:Decatur_Stuyvesant_Heights_HD_1.JPG",
        "licence": "CC BY-SA 3.0 (Smallbones)"
      }
    ]
  }
];
