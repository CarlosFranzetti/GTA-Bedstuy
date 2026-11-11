# Street photos and observed facades (ENV14)

Rule: no Google Maps / Street View pixels or data. Only openly licensed sources, with licence and author recorded. Everything is fetched and baked at build time by scripts; the player's browser never contacts these hosts.

## Pipeline
1. `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/fetch-street-photos.mjs [--only commons|kartaview|mapillary]` downloads photos near the PLUTO lots into `cache/street-photos/` (git-ignored) with `manifest.json` (source, id, author, licence, licence url, page url, lat/lon, heading, date). Mapillary needs `MAPILLARY_TOKEN` (free client token); without it the step is skipped and the manifest says so.
2. `node scripts/derive-facade-palette.mjs [--debug dir]` projects every MapPLUTO lot into each photo (position + compass heading, pinhole model, per-column occlusion), samples the facade band, and writes `src/world/data/facade-observed.json` (wall colour, material class, quality, shop awning; keyed by BBL) plus `facade-observed.provenance.json` (which photos, authors and licences fed each lot; not bundled).
3. `node scripts/attach-bbl.mjs --write` puts the tax-lot id on each lot of `bedstuy.json` (address in the lot note joined to MapPLUTO); `scripts/import-pluto.mjs` now writes `bbl` itself. All per-lot observed data keys on BBL, so a re-gridded street network keeps working.
4. `src/world/buildings/colourway.ts` (`applyObserved`) and `src/world/LotSubdivider.ts` (`specFromData`) use an observation when its quality is at least 0.45; every other lot keeps the procedural per-lot colourway (TEXVAR). `VITE_ENV14=0` builds without any of the ENV14 layer for A/B captures.
5. `scripts/fetch-street-trees.mjs` aggregates the NYC Street Tree Census per game street into `src/world/data/raw/street-trees.json`; `FurnitureGen` scales each street tree by a trunk-size draw from its street's real mix (no extra triangles).

## Licence handling
- CC0 / public domain: free to use, credit kept anyway.
- CC BY: credit required (author, source, licence) in `docs/CREDITS.md` and the provenance sidecar.
- CC BY-SA (Mapillary, KartaView, most Commons street photos): we publish only facts derived from them (a wall colour, a material class, an awning colour per lot). A hex colour is not a copy or an adaptation of the picture, so share-alike does not attach to `facade-observed.json`; attribution is kept in the sidecar and CREDITS regardless. No CC BY-SA pixels are copied into any texture, atlas or the single-file artifact. If real-photo texture crops are added later, use CC0 and CC BY sources only for the artifact; a CC BY-SA crop would make the atlas a share-alike derivative and is kept out.
- Nothing from Google, nothing from a commercial street-view product.
