/**
 * LANDMARKS: the table. Plain data (no imports beyond types) so it can be tested alone.
 *
 * Every row stands for a real kind of place in the neighbourhood under an INVENTED name. What is kept: the massing (footprint,
 * height, storeys, materials, roof), the position on the map and the function. What is changed: every name, sign and detail.
 * Facts come only from open sources (NYC Open Data: MapPLUTO, Building Footprints, Parks Properties, Facilities Database;
 * Wikipedia for style and year, facts only, nothing copied or traced). Where a place could not be sourced it is built from its
 * footprint, height and building class and the row says so in `look`.
 *
 * `site` is a frame in world metres (x east, z south): origin (ax, az) at the street-side corner, local x along (fx, fz) for `w`
 * metres, local z INTO the site along (nx, nz) for `d` metres. `poly` (block sites) is the block's building ring.
 * Generated from the real-map lot data by the lane's site script; tests/unit/world/landmarks.test.ts checks every site against
 * the live lot and block data.
 */
import type { LandmarkRow } from './types';

export const LANDMARKS: readonly LandmarkRow[] = [
  {
    id: "thistledown-park", name: "Thistledown Park", kind: "park", district: "Thistledown Park, Marcy to Tompkins",
    blurb: "The big neighbourhood park: lawns, a bandshell plaza, courts and a playground.",
    lots: [],
    site: { ax: -474.7, az: 91.3, fx: 1, fz: -0.0009, nx: 0.0009, nz: 1, w: 224.6, d: 147.1, block: 433, poly: [-474.5, 91.8, -474.5, 91.7, -474.4, 91.6, -474.4, 91.4, -474.3, 91.4, -474.1, 91.3, -474, 91.3, -251, 91.3, -250.9, 91.3, -250.8, 91.4, -250.7, 91.4, -250.6, 91.5, -250.6, 91.7, -250.5, 91.8, -250.2, 155, -250.1, 173.6, -250.5, 237.7, -250.5, 237.8, -250.5, 238, -250.6, 238.1, -250.7, 238.1, -250.8, 238.2, -251, 238.2, -474.1, 238.4, -474.2, 238.4, -474.3, 238.3, -474.4, 238.3, -474.5, 238.2, -474.5, 238.1, -474.6, 238, -474.6, 237.9, -474.5, 174, -474.5, 155.2] },
    look: {"trees":90,"plaza":"bandshell","courts":2,"playground":1,"recCentre":1,"paths":"diagonal"},
    sources: [
      {
        "what": "Parks Properties (acreage, kind of park)",
        "url": "https://data.cityofnewyork.us/resource/enfh-gkve.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "extent and boundaries (acres, four bounding avenues)",
        "url": "https://en.wikipedia.org/wiki/Herbert_Von_King_Park",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ],
  },
  {
    id: "calle-verde-park", name: "Calle Verde Park", kind: "park", district: "Calle Verde Park",
    blurb: "A square park block with a fountain plaza, a ballfield and shade trees.",
    lots: [],
    site: { ax: 1638.6, az: -1012.7, fx: 0.7101, fz: -0.7041, nx: 0.7041, nz: 0.7101, w: 200.8, d: 141.3, block: 131, poly: [1640, -1011.7, 1639.8, -1011.9, 1639.6, -1012.3, 1639.5, -1012.7, 1639.5, -1013, 1639.6, -1013.4, 1639.8, -1013.8, 1640, -1014.1, 1779.8, -1152.7, 1780.1, -1153, 1780.5, -1153.2, 1781, -1153.2, 1781.4, -1153.2, 1781.8, -1153, 1782.2, -1152.7, 1823.2, -1111.6, 1837.8, -1096.8, 1878.9, -1054.4, 1879.2, -1054.1, 1879.3, -1053.7, 1879.4, -1053.2, 1879.3, -1052.8, 1879.2, -1052.4, 1878.9, -1052, 1739.2, -913.5, 1738.9, -913.3, 1738.6, -913.1, 1738.2, -913.1, 1737.8, -913.1, 1737.4, -913.1, 1737.1, -913.3, 1736.8, -913.6, 1696.1, -955.4, 1681, -970.6] },
    look: {"trees":80,"plaza":"fountain","courts":1,"playground":1,"ballfield":1,"paths":"ring"},
    sources: [
      {
        "what": "Parks Properties (acreage, kind of park)",
        "url": "https://data.cityofnewyork.us/resource/enfh-gkve.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "extent (6.87 acres, four bounding streets)",
        "url": "https://en.wikipedia.org/wiki/Maria_Hernandez_Park",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ],
  },
  {
    id: "merrow-pool", name: "Merrow Pool", kind: "pool", district: "Merrow Pool",
    blurb: "Public outdoor pool and brick bathhouse.",
    lots: ["3017790027"],
    site: { ax: -511.1, az: -8.8, fx: -1, fz: 0.0005, nx: -0.0004, nz: -1, w: 112, d: 40, block: 395 },
    look: {"basin":1},
    sources: [
      {
        "what": "Parks Properties (acreage, kind of park)",
        "url": "https://data.cityofnewyork.us/resource/enfh-gkve.json",
        "licence": "NYC Open Data terms of use"
      },
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
    ],
  },
  {
    id: "bramwell-playground", name: "Bramwell Playground", kind: "playground", district: "Bramwell Playground",
    blurb: "Handball and basketball courts, a playground and a sprinkler plaza.",
    lots: ["3016430013"],
    site: { ax: 1406.9, az: 649.5, fx: -1, fz: -0.0014, nx: 0.0011, nz: -1, w: 143.6, d: 48, block: 534 },
    look: {"courts":3,"handball":1,"playground":1},
    sources: [
      {
        "what": "Parks Properties (acreage, kind of park)",
        "url": "https://data.cityofnewyork.us/resource/enfh-gkve.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      }
    ],
  },
  {
    id: "larkspur-houses", name: "Larkspur Houses", kind: "housing", district: "Larkspur Houses",
    blurb: "Public housing: brick slabs in the park, one block of lawns and paths.",
    lots: ["3017380150"],
    site: { ax: -752.4, az: -730.6, fx: 1, fz: 0.0012, nx: -0.0012, nz: 1, w: 259.1, d: 224.5, block: 235, poly: [-752.4, -728.6, -752.4, -728.9, -752.2, -729.3, -752, -729.6, -751.7, -729.8, -751.4, -729.9, -751, -730, -495.1, -730.3, -494.8, -730.3, -494.5, -730.2, -494.2, -730, -494, -729.8, -493.8, -729.5, -493.7, -729.2, -493.7, -728.9, -493.6, -671.3, -493.6, -649.6, -493.7, -589.7, -493.7, -567.9, -493.6, -507.2, -493.6, -506.9, -493.8, -506.6, -493.9, -506.3, -494.1, -506.1, -494.4, -506, -494.7, -505.8, -495, -505.8, -751.2, -506.1, -751.6, -506.1, -751.9, -506.3, -752.2, -506.5, -752.4, -506.8, -752.5, -507.1, -752.6, -507.5] },
    look: {"slabs":11,"floors":6,"brick":"brickRed","plan":"rows","trees":70,"wall":"#92493b"},
    sources: [
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
        "what": "building count, six storeys, acres (public housing superblock)",
        "url": "https://en.wikipedia.org/wiki/Marcy_Houses",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ],
  },
  {
    id: "whitcomb-houses", name: "Whitcomb Houses", kind: "housing", district: "Whitcomb Houses",
    blurb: "Public housing: seven and fourteen storey slabs around green courts.",
    lots: [],
    site: { ax: -232.1, az: -505.9, fx: 0.0041, fz: -1, nx: 1, nz: 0.0041, w: 224.6, d: 220.9, block: 237, poly: [-230.3, -728.8, -230.3, -729.1, -230.2, -729.4, -230, -729.6, -229.8, -729.9, -229.5, -730, -229.2, -730.1, -228.9, -730.2, -101.9, -729.9, -79.4, -729.9, -11.6, -729.4, -11.3, -729.3, -10.9, -729.2, -10.7, -729, -10.4, -728.7, -10.3, -728.4, -10.3, -728, -11.2, -507.4, -11.2, -507, -11.3, -506.7, -11.6, -506.4, -11.9, -506.2, -12.2, -506, -12.6, -506, -230.4, -505.9, -230.8, -505.9, -231.2, -506.1, -231.5, -506.3, -231.8, -506.6, -232, -506.9, -232.1, -507.3, -232.1, -507.6, -230.6, -569.2, -230.4, -588.5, -230.5, -651.5, -229.5, -672.1] },
    look: {"slabs":8,"floors":7,"tall":3,"tallFloors":14,"brick":"tanBrick","plan":"courts","trees":70,"wall":"#b08e68"},
    sources: [
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
        "what": "building count and storeys (seven and twelve)",
        "url": "https://en.wikipedia.org/wiki/Sumner_Houses",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ],
  },
  {
    id: "caldwell-towers", name: "Caldwell Towers", kind: "housing", district: "Caldwell Towers",
    blurb: "Fifteen-storey housing slab with a lawn.",
    lots: ["3015950024"],
    site: { ax: 641.8, az: -238.3, fx: 1, fz: 0, nx: 0.0004, nz: 1, w: 61, d: 28, block: 367 },
    look: {"slabs":1,"floors":15,"height":41,"brick":"brickRed","plan":"tower","wall":"#8a4a3a"},
    sources: [
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
    ],
  },
  {
    id: "st-osric-church", name: "St. Osric's Church", kind: "church", district: "St. Osric's Church",
    blurb: "Red brick church with stone trim and a corner tower.",
    lots: ["3018130041"],
    site: { ax: -536.9, az: 504.2, fx: 1, fz: 0, nx: -0.0007, nz: 1, w: 44.3, d: 30, block: 526 },
    look: {"family":"brick","tower":"square","spire":1,"cruciform":1,"wall":"#8c4636"},
    sources: [
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
        "what": "style, brick with stone trim, cruciform plan",
        "url": "https://en.wikipedia.org/wiki/St._George%27s_Protestant_Episcopal_Church_(Brooklyn)",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ],
  },
  {
    id: "bellweather-methodist", name: "Bellweather Methodist Church", kind: "church", district: "Bellweather Methodist Church",
    blurb: "Big corner church with an octagonal tower and a hall.",
    lots: ["3033670004"],
    site: { ax: 2003.2, az: 521.5, fx: 0.7103, fz: -0.7039, nx: 0.7039, nz: 0.7103, w: 47.5, d: 30, block: 497 },
    look: {"family":"tanBrick","tower":"octagon","spire":0,"cruciform":0,"wall":"#b49468"},
    sources: [
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
        "what": "Bushwiki entry for the building (octagonal corner tower, 1901 addition)",
        "url": "https://bushwiki.nyc/1123-bushwick-avenue/",
        "licence": "facts only, no text or image used"
      }
    ],
  },
  {
    id: "harrowgate-armory", name: "Harrowgate Armory", kind: "armory", district: "Harrowgate Armory",
    blurb: "Castle-like armoury: crenellated towers and a vast drill hall.",
    lots: ["3022330001"],
    site: { ax: -724.3, az: -1408.5, fx: 0.8493, fz: -0.5279, nx: 0.5279, nz: 0.8493, w: 191.4, d: 63.9, block: 35, poly: [-723.3, -1407, -723.5, -1407.4, -723.6, -1407.9, -723.6, -1408.3, -723.4, -1408.7, -723.1, -1409.1, -722.8, -1409.4, -563.2, -1508.6, -562.9, -1508.8, -562.5, -1508.9, -562.1, -1508.9, -561.7, -1508.8, -561.4, -1508.6, -561.1, -1508.4, -560.9, -1508.1, -529.1, -1456.6, -528.9, -1456.2, -528.9, -1455.8, -528.9, -1455.3, -529.1, -1454.9, -529.3, -1454.6, -529.7, -1454.3, -689.2, -1355.1, -689.5, -1354.9, -689.9, -1354.8, -690.3, -1354.9, -690.6, -1354.9, -691, -1355.1, -691.3, -1355.3, -691.5, -1355.6] },
    look: {"towers":4,"hall":1,"wall":"#7c3a30"},
    sources: [
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
        "what": "listing (1883-84 regimental armory on this block)",
        "url": "https://en.wikipedia.org/wiki/List_of_armories_and_arsenals_in_New_York_City_and_surrounding_counties",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ],
  },
  {
    id: "penhallow-high-school", name: "Penhallow High School", kind: "school", district: "Penhallow High School",
    blurb: "Grand old high school: brick and terracotta, a round tower, a yard.",
    lots: ["3018230038"],
    site: { ax: -492.5, az: 731.9, fx: -1, fz: 0.0008, nx: -0.0007, nz: -1, w: 120.3, d: 36, block: 548 },
    look: {"plan":"U","floors":4,"tower":"round","wall":"#9a4a38"},
    sources: [
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
        "what": "style (Romanesque Revival), round corner tower and campanile, 1891",
        "url": "https://en.wikipedia.org/wiki/Boys_High_School_(Brooklyn)",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ],
  },
  {
    id: "wexcombe-medical-center", name: "Wexcombe Medical Center", kind: "hospital", district: "Wexcombe Medical Center",
    blurb: "Hospital campus: a tall tower slab, low wings and an entrance plaza.",
    lots: [],
    site: { ax: 14.3, az: -978.8, fx: 1, fz: 0.0005, nx: -0.0005, nz: 1, w: 239.5, d: 224.8, block: 182, poly: [14.3, -975.6, 14.4, -975.9, 14.5, -976.2, 14.7, -976.5, 14.9, -976.7, 15.2, -976.8, 15.5, -976.8, 208.7, -978.7, 208.9, -978.6, 209.1, -978.6, 209.3, -978.5, 209.5, -978.4, 253.4, -933.7, 253.6, -933.5, 253.7, -933.2, 253.8, -932.9, 253.8, -932.6, 253.7, -932.3, 253.5, -932.1, 228.6, -902.6, 228.2, -837.3, 228.2, -814.2, 228.7, -755.3, 228.7, -755, 228.5, -754.7, 228.4, -754.4, 228.2, -754.2, 227.9, -754, 227.6, -753.9, 227.3, -753.9, 15.6, -754, 15.3, -754, 15, -754.1, 14.8, -754.3, 14.6, -754.5, 14.4, -754.8, 14.3, -755.1, 14.2, -755.4, 14.5, -814.9, 14.5, -836.9, 14.4, -896.5, 14.4, -918.9] },
    look: {"floors":9,"height":75,"wall":"#cbc3b0"},
    sources: [
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
        "what": "Facilities Database (kind and extent of the facility)",
        "url": "https://data.cityofnewyork.us/resource/ji82-xba5.json",
        "licence": "NYC Open Data terms of use"
      }
    ],
  },
  {
    id: "tillery-library", name: "Tillery Branch Library", kind: "library", district: "Tillery Branch Library",
    blurb: "Classical branch library: stone steps, tall arched windows.",
    lots: ["3032410018"],
    site: { ax: 1214.7, az: -168.3, fx: 0.699, fz: -0.7151, nx: 0.716, nz: 0.6981, w: 43.5, d: 23.2, block: 371 },
    look: {"style":"carnegie","wall":"#a8553f"},
    sources: [
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
        "what": "Facilities Database (kind and extent of the facility)",
        "url": "https://data.cityofnewyork.us/resource/ji82-xba5.json",
        "licence": "NYC Open Data terms of use"
      }
    ],
  },
  {
    id: "ironside-station-house", name: "Ironside Station House", kind: "stationhouse", district: "Ironside Station House",
    blurb: "Old police station house: Romanesque brick and a stone arch.",
    lots: ["3032460005"],
    site: { ax: 1733.4, az: -625.3, fx: -0.7026, fz: -0.7116, nx: 0.7128, nz: -0.7014, w: 24, d: 28, block: 221 },
    look: {"style":"romanesque","wall":"#7f4636"},
    sources: [
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
        "what": "year (1894), style (Romanesque Revival), station and stable",
        "url": "https://en.wikipedia.org/wiki/83rd_Precinct_Police_Station",
        "licence": "CC BY-SA 4.0 (facts only, no text or image used)"
      }
    ],
  },
  {
    id: "engine-901-firehouse", name: "Engine 901 Firehouse", kind: "firehouse", district: "Engine 901 Firehouse",
    blurb: "Narrow three-storey firehouse with a big arched bay.",
    lots: ["3018170048"],
    site: { ax: -800.1, az: 586.3, fx: 1, fz: 0, nx: 0.0003, nz: 1, w: 7.8, d: 30.5, block: 538 },
    look: {"wall":"#8e4034"},
    sources: [
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
        "what": "Facilities Database (kind and extent of the facility)",
        "url": "https://data.cityofnewyork.us/resource/ji82-xba5.json",
        "licence": "NYC Open Data terms of use"
      }
    ],
  },
  {
    id: "ridgeway-sanitation", name: "Ridgeway Sanitation Garage", kind: "depot", district: "Ridgeway Sanitation Garage",
    blurb: "Sanitation depot: truck bays, a yard and a salt shed.",
    lots: ["3017180001"],
    site: { ax: -834.3, az: -804.1, fx: 0, fz: -1, nx: 1, nz: 0, w: 61, d: 28, block: 180 },
    look: {},
    sources: [
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
    ],
  },
  {
    id: "fiddlehead-garden", name: "Fiddlehead Garden", kind: "garden", district: "Fiddlehead Garden",
    blurb: "Community garden: raised beds, a shed and a mural wall.",
    lots: ["3017890047"],
    site: { ax: -492.3, az: 93.1, fx: 0, fz: 1, nx: -1, nz: 0, w: 48.4, d: 14, block: 441 },
    look: {},
    sources: [
      {
        "what": "MapPLUTO tax lot facts (class, floors, year)",
        "url": "https://data.cityofnewyork.us/resource/64uk-42ks.json",
        "licence": "NYC Open Data terms of use"
      },
      {
        "what": "Facilities Database (kind and extent of the facility)",
        "url": "https://data.cityofnewyork.us/resource/ji82-xba5.json",
        "licence": "NYC Open Data terms of use"
      }
    ],
  },
  {
    id: "street-stairs", name: "Subway entrances", kind: "subway", district: "Subway entrance",
    blurb: "Stairs down to the underground lines, with a globe lamp and an invented station board.",
    lots: [],
    site: { ax: -1062.6, az: 91.1, fx: 1, fz: -0.001, nx: 0.001, nz: 1, w: 6, d: 2.4, block: -1 },
    look: {},
    entrances: [{"x":-1062.6,"z":91.1,"fx":1,"fz":-0.001,"nx":0.001,"nz":1,"station":"Cormorant Square","colour":"#3fae5c"},{"x":-1062.8,"z":74.3,"fx":1,"fz":-0.001,"nx":-0.001,"nz":-1,"station":"Cormorant Square","colour":"#3fae5c"},{"x":-777.2,"z":90.7,"fx":1,"fz":-0.001,"nx":0.001,"nz":1,"station":"Cormorant Square","colour":"#3fae5c"},{"x":-771.5,"z":67.2,"fx":0.001,"fz":1,"nx":-1,"nz":0.001,"station":"Cormorant Square","colour":"#3fae5c"},{"x":-503.7,"z":-503.5,"fx":1,"fz":0.001,"nx":0.001,"nz":-1,"station":"Ferrier Cross","colour":"#3fae5c"},{"x":-460.7,"z":-503.5,"fx":1,"fz":0,"nx":0,"nz":-1,"station":"Ferrier Cross","colour":"#3fae5c"},{"x":-491.6,"z":-968.5,"fx":-0.001,"fz":1,"nx":-1,"nz":-0.001,"station":"Tern Yard","colour":"#3fae5c"},{"x":-465.6,"z":-1007.7,"fx":0.856,"fz":-0.517,"nx":-0.517,"nz":-0.856,"station":"Tern Yard","colour":"#3fae5c"},{"x":2275.1,"z":-964.9,"fx":0.67,"fz":0.742,"nx":-0.742,"nz":0.67,"station":"Bellrope","colour":"#8a8d94"},{"x":2256.2,"z":-977,"fx":0.711,"fz":-0.704,"nx":-0.704,"nz":-0.711,"station":"Bellrope","colour":"#8a8d94"},{"x":2285.6,"z":-986.6,"fx":0.722,"fz":-0.691,"nx":0.691,"nz":0.722,"station":"Bellrope","colour":"#8a8d94"}],
    sources: [
      {
        "what": "MTA Subway Entrances and Exits (positions of the stairs)",
        "url": "https://data.ny.gov/resource/i9wp-a4ja.json",
        "licence": "NY open data terms of use (public data); only the positions were read"
      }
    ],
  },
];

export const LANDMARK_BY_ID: ReadonlyMap<string, LandmarkRow> = new Map(LANDMARKS.map((l) => [l.id, l]));
/** every BBL a landmark owns: the generic building on these lots is not built */
export const OWNED_BBLS: ReadonlySet<string> = new Set(LANDMARKS.flatMap((l) => l.lots));
