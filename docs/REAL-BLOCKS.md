# Real blocks: building footprints from open data, textures from your own photos

Status: the pipeline is built and tested against a synthetic fixture. The map hosts (overpass-api.de, openstreetmap.org, data.cityofnewyork.us) were blocked in the sandbox when this was written, so no real data has been imported yet. Everything below runs from files you download yourself; once those hosts are allowed the same commands work with `curl` straight into the importer.

Sources used, and nothing else: OpenStreetMap (building outlines, levels, heights, shops) and NYC Open Data MapPLUTO (year built, floors, land use). No Google Maps or Street View data or imagery is read, copied or traced anywhere in this pipeline (PRD 2.1). Facade pictures come only from photos you take yourself.

## 1. Get the data

### OpenStreetMap footprints (Overpass)

Save this as `query.overpassql`. The box is generous (about 1.3 km by 1.4 km around the Throop Ave / Kosciuszko St area) because the importer ignores anything outside the ten blocks anyway. The coordinates are approximate and come from the default origin in `src/world/data/geo.ts`, which is marked "approximate, verify"; widen or move the box if the first import reports many footprints "outside".

```
[out:json][timeout:90];
(
  way["building"](40.6875,-73.9500,40.6995,-73.9340);
  relation["building"](40.6875,-73.9500,40.6995,-73.9340);
  node["shop"](40.6875,-73.9500,40.6995,-73.9340);
  node["amenity"](40.6875,-73.9500,40.6995,-73.9340);
);
out geom;
```

Run it (or paste it into https://overpass-turbo.eu, Export, "raw OSM data" or GeoJSON):

```
curl -sS --data-urlencode data@query.overpassql https://overpass-api.de/api/interpreter -o osm.json
```

`out geom;` matters: it puts each outline on the way itself. The importer also understands plain node-and-way output and GeoJSON with Polygon, MultiPolygon and Point features. A query that only returns `out center;` has no outlines and cannot give widths.

Tags the importer reads: `building`, `building:levels`, `height`, `building:material`, `building:colour`, `addr:housenumber`, `addr:street`, `shop`, `amenity`, `cuisine`, `name` (shops and amenities may be separate points; a point inside a footprint is merged into it).

### NYC PLUTO (optional, adds year built, floors, land use)

1. Open the MapPLUTO / PLUTO dataset on https://data.cityofnewyork.us (search "PLUTO"; the Socrata dataset id I remember is `64uk-42ks`, verify it on the page).
2. Filter to Brooklyn and the neighbourhood ZIPs (11206, 11216, 11221 appear in the notes in `docs/reference/block-faces.md`), keep the columns `address, bbl, yearbuilt, landuse, numfloors, bldgclass, zipcode`, export CSV. Through the API that is, for example:
   ```
   curl -sS -G "https://data.cityofnewyork.us/resource/64uk-42ks.csv" \
     --data-urlencode "\$select=address,bbl,yearbuilt,landuse,numfloors,bldgclass,zipcode" \
     --data-urlencode "\$where=borough='BK' AND zipcode in('11206','11216','11221')" \
     --data-urlencode "\$limit=60000" -o pluto.csv
   ```
3. The importer joins PLUTO to a footprint by address ("442 Throop Avenue" matches "442 THROOP AVE"; Kosciusko matches Kosciuszko). Only footprints that carry `addr:housenumber` and `addr:street` in OSM can be joined. Column names are matched case-insensitively.

## 2. Run the importer

```
node scripts/import-osm.mjs osm.json                         # dry run: prints a diff summary, writes nothing
node scripts/import-osm.mjs osm.json --pluto pluto.csv       # same, with PLUTO attributes
node scripts/import-osm.mjs osm.json --pluto pluto.csv --write
```

Options: `--origin lat,lon` (the Throop/Kosciuszko corner, see below), `--bearing <deg>|fit` (default `fit`), `--overwrite` (replace hand-edited lots too), `--target <file>` and `--out <file>` (read one JSON, write another), `--verbose` (print every lot).

The fixture run, which must always print `validator: 0 errors`:

```
node scripts/import-osm.mjs tests/fixtures/osm-sample.geojson
```

### What it does

1. **Projection.** Equirectangular local projection around an origin, rotated by a bearing so the street grid is axis-aligned in game metres (+x east, +z south). The origin defaults to `ORIGIN_LATLON` in `src/world/data/geo.ts`: approximately 40.6935, -73.9420, written from memory and explicitly marked "approximate, verify". Check it by clicking the Throop Ave / Kosciuszko St corner on openstreetmap.org (right-click, "Show address" or read the URL) and pass the exact value with `--origin`. The bearing is fitted from the building edges within 45 m of Throop (edge directions folded modulo 90 degrees, length weighted); the summary prints its strength (1.0 is a perfect grid, below 0.5 is flagged). The fit is ambiguous modulo 90 degrees and is returned in (-45, 45]; give `--bearing` if the real grid is turned further than that (try the fitted value plus or minus 90 and compare how many footprints each run reports as outside).
2. **Face assignment.** Every footprint centroid lands in one block; the face is the nearest building line, with a 6 m bias toward the avenue faces so corner buildings join the east/west faces (which own the corners, as in `schema.ts`). When the address names one of the block's streets, only those faces compete. The position along the face and `widthM` come from the footprint extent along the street; `depthM` from its extent into the block. Footprints in the roadway or off the grid are counted and ignored.
3. **Lot fields.** `floors` = `building:levels`, else `height / 3.1`, else PLUTO `numfloors`, else a default (3, or 4 on avenues). `use`: shop/amenity (or a retail building) gives `mixed` with a storefront guessed from the shop or cuisine; `place_of_worship` or a church building gives `church`; school, parking and garage tags give `school` and `garage`; PLUTO land use 04/05 gives `mixed`, 11 gives `vacant`, building class M gives church. Gaps of 3.5 m or more between neighbouring footprints become `vacant` lots (floors 0); smaller gaps are absorbed, overlaps are trimmed at the midpoint, footprints under 3 m (sheds) are skipped and anything over 40 m is split into equal lots.
4. **Confidence and source.** A lot gets `confidence: "H"` when it has a footprint and a storey count from OSM or PLUTO, and `"M"` when the storey count is a default or the lot is a derived vacant gap. Every imported lot's `note` starts with `[import]` and names the OSM way, the storey source, the address and the PLUTO year, so each value can be traced.
5. **Merge over `bedstuy.json`.** Only faces that receive footprints change. On those faces a lot is kept untouched if a person wrote about it: any `note` that is not an `[import]` note or one of the old generator notes ("typology default", "W2 density pass", "filler"), or confidence H/M that the importer did not set. Everything else is replaced by the imported lot, which inherits the style fields OSM does not know (family, stoop, cornice, bays, trees) from the lot it replaces. A hand note that starts with an address ("226 Hart: ...") is pinned to the footprint with that address; other kept lots are placed proportionally along the face, so after the first import a second import (which now knows the real positions) is the more exact one. `--overwrite` drops all of it. Re-running the import on its own output converges.
6. **Check and write.** The result must pass `validateFaces` and `validateAgainstGrid` (zero errors) or nothing is written. The file keeps its layout (one lot per line), and a `geo` block records origin, bearing and the attribution line.

After a real import: `npx vitest run tests/unit/world`, then look at the blocks in the game. Expect to hand-fix corners and special buildings; add a `note` to anything you fix and the next import will leave it alone.

## 3. Facade photos that work

Photos are used for ONE lot front each, with `scripts/photo-to-facade.py`:

```
python3 scripts/photo-to-facade.py photo.jpg r1c1-E-3 --floors 4 --width-m 6.5 \
  --corners 212,140,1710,118,1745,1380,190,1402 --preview /tmp/check.jpg
```

`r1c1-E-3` is the lot id (`<block>-<side>-<index>`: block id like `r1c1`, side of the block N/S/E/W, index along the face counted in the same order the game lays lots, i.e. `PlacedLot.id` from `lotsForFace`). `--corners` are the four corners of the facade in the photo in pixels: top-left, top-right, bottom-right, bottom-left (any image viewer shows pixel coordinates). `--preview` writes the rectified facade so you can check the corners; `--auto` gives a crude straight crop when you have no corners.

The script rectifies the quad, splits it at the ground-floor line (3.3 m storefront/parlour floor, 2.9 m per upper floor, same numbers as `facade.ts`), runs both tiles through the `photo-to-pbr.py` steps separately and writes `src/assets/textures/user/facade-<lotId>_{color,normal,rough}.jpg` (upper floors on top, ground floor at the bottom) plus an entry in `src/assets/textures/user/facades.json` (`texture`, `floors`, `groundShare`, `widthM`, `heightM`, `atlasPx`). That entry is the lot's `facadeTexture`; until the schema field and the consumer exist (posted to Fable) the game does not read it.

How to shoot:

- Stand on the opposite sidewalk, as square-on to the facade as you can; a long lens (2x) from farther away distorts less than a wide lens up close. Keep the phone level, not tilted up.
- Overcast or open shade; no direct sun, no hard shadows, no flash. Avoid dusk.
- No people, cars, trees or scaffolding in front of the facade if you can avoid it; shoot early on a weekday or from a gap between parked cars. Roll-down gates closed or open as you like, but be consistent.
- Get the whole front in one frame with a little margin: sidewalk edge to cornice. Do not crop to the windows.
- Shoot in landscape if the building is wide, portrait if narrow, at full resolution (at least 1500 px on the long side).
- One photo per lot. Take a second of the next lot rather than stitching.

Surface (tileable) textures like brick or sidewalk still go through `scripts/photo-to-pbr.py`; see `docs/PHOTO-TEXTURES.md`.

## 4. Licensing and credits

- Building data: **(c) OpenStreetMap contributors**, licensed under the Open Database License (ODbL) 1.0. https://www.openstreetmap.org/copyright. The importer writes this line into the `geo.attribution` field of `bedstuy.json`; the game's credits screen must show it as long as OSM-derived lots are in the data. ODbL is share-alike for the derived database: the imported lots in `bedstuy.json` are a derived database, so if the data file is published it is published under ODbL with that attribution.
- NYC MapPLUTO: NYC Open Data, public data published by the Department of City Planning; credit "NYC Department of City Planning, MapPLUTO, via NYC Open Data".
- Photos: yours. Do not use anything taken from Google Maps, Street View, or any other service. Screenshots of Street View stay reference-only for the person making the game and never go through these scripts.
- The test fixture `tests/fixtures/osm-sample.geojson` is synthetic (generated by `tests/fixtures/make-osm-sample.mjs`) and contains no OpenStreetMap data.

## 5. Known limits

- Default origin and bearing are placeholders until you verify them; the fit only needs footprints, not a correct origin, but the blocks of the game grid and the real blocks line up only if the origin is the real intersection.
- The game grid is a simplified ten-block layout, 2 columns by 5 rows (see `block-faces.md`: the street order and DeKalb are unverified). Footprints that do not fit it are ignored, not forced.
- OSM `building:levels` counts floors without the roof and is often missing in Brooklyn; PLUTO fills most of it. Heights are divided by 3.1 m.
- Style (brownstone vs brick, stoops, cornices) is not in OSM and is inherited from the old lot; photos or `note`-protected hand edits are how to fix it.
