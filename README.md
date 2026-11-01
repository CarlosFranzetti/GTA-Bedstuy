# GTA Bed-Stuy

A small, **non-commercial fan tribute** in the spirit of GTA 5, set on ten real blocks of
Bedford-Stuyvesant, Brooklyn, around the corner of Throop Avenue and Kosciuszko Street.
Walk, jack cars, drive, dodge traffic, annoy the cops, and visit parody versions of the
storefronts you actually find on those blocks.

**Not affiliated with, endorsed by, or connected to Rockstar Games or Take-Two Interactive.**
"Grand Theft Auto" and "GTA" are their trademarks. This project uses none of their assets,
code, music, characters, or logos. Every business name in the game is a parody of a *type*
of business, not of any real shop or person.

## Play

Runs in a desktop browser. No install.

- `npm install`
- `npm run dev` then open the printed URL, or
- `npm run build` and open `dist/index.html` (a single self-contained file).

Controls: **WASD** move · **Shift** run · **F** enter/exit car · **Space** brake ·
**Shift** handbrake (in car) · **H** horn · **E** change radio station · **mouse** look ·
click once to start (audio + mouse capture).

## Graphics quality

The game picks `medium` on desktop and `phone` on touch devices. Override with a URL parameter:
`?q=phone`, `?q=low`, `?q=medium` or `?q=high` (high adds 4K shadows, 16-sample ambient occlusion and SMAA).
`phone` renders at most 720 px wide, drops ambient occlusion, depth of field and SMAA, runs bloom only at dusk and night,
uses one small shadow map, 4 street lamps, a 110 m view distance hidden by fog, and about a third of the traffic and
pedestrians. A touch device left on `low` steps down to `phone` by itself if it stays under 30 fps for 8 seconds
(an explicit `?q=` disables the automatic changes).

## How it is built

Geometry, signage, cars, people and audio are procedural, generated in code from a small
hand-authored data file (`src/world/data/bedstuy.json`) describing the streets and the
parody points of interest. The large surfaces (brick, brownstone, sidewalks, asphalt, roofs)
use photo-based PBR textures derived from CC0 ambientCG sets; see `docs/CREDITS.md`.
No models or audio files are shipped.

Google Street View was used only as a **visual reference** while authoring that data.
No Street View imagery is stored in this repo or in the game.

- `src/core` loop, input, camera, seeded RNG, event bus
- `src/world` grid → roads, lots, buildings, street furniture
- `src/textures` canvas-painted materials
- `src/physics` flat 2D collision world
- `src/entities` player, vehicles, pedestrians, traffic and cop AI
- `src/game` wanted level, traffic and cop systems, day/night
- `src/ui` HUD and minimap
- `src/audio` Web Audio engine, horn, impacts, ambience, parody radio

Design spec: `docs/superpowers/specs/2026-10-24-gta-bedstuy-design.md`.
Implementation plan: `docs/superpowers/plans/2026-10-24-gta-bedstuy-v1.md`.

## Tests

- `npm test` unit tests (Vitest)
- `npm run typecheck`
- `npm run build && npm run test:e2e` headless render smoke test (Playwright + Chromium)

## Deploy on Vercel

The game is a static site: no server, no functions, no runtime network. Vercel only has to run the Vite build and serve the output.

**Project settings** (Import Project, then these; `vercel.json` in the repo already pins the same values, so they only need to be right if you edit them in the dashboard):

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Build Command | `npm run build` (`vercel.json` runs it as `VITE_HOSTED=1 npm run build`) |
| Output Directory | `dist` |
| Install Command | default (`npm install`) |
| Node.js | 20.19+ or 22.x (Vite 8 requirement; the Vercel default is fine) |
| Environment variables | none needed |

`vercel.json` also sets the cache headers: everything under `/assets/` is content-hashed and cached for a year (`immutable`), while `/` and `/index.html` are always revalidated, so a new deploy shows up on the next load. No SPA rewrite is needed (single page, no client routes).
If you ever delete `vercel.json`, add the environment variable `VITE_HOSTED=1` (Production and Preview) in the dashboard, otherwise Vercel serves the single-file artifact build, which works but ships every texture as base64 in one 6.7 MB page.

**The two builds** come from one codebase and differ only by the `VITE_HOSTED` flag:

| | single-file artifact | hosted (Vercel) |
|---|---|---|
| Command | `npm run artifact` (= `vite build` then `node scripts/make-artifact.mjs`) | `npm run build:hosted` (output `dist-hosted/`; on Vercel `VITE_HOSTED=1 npm run build` writes `dist/`) |
| Output | `dist/artifact.html`, everything inlined, about 6.7 MB, budget 12 MB (hard limit 16 MB) | `index.html` + hashed `assets/` files: game code, `three-<hash>.js` as its own chunk, textures as JPG files, about 5.3 MB |
| Textures | 1K photo sets inlined as base64 | the same 1K sets as files; larger tiers load lazily after first paint |
| Quality | `?q=phone`, `low`, `medium`, `high` | adds `?q=ultra` |

`node scripts/build-hosted.mjs` builds both and prints the sizes (`npm run build:all`); it fails if the artifact goes over 12 MB, if a texture ends up inlined in the hosted JS, or if the three.js chunk is missing. `npm run smoke:hosted` additionally serves `dist-hosted/` on port 4307 and loads it headless with `?q=low` and `?q=ultra`, failing on any console error or failed request.
To look at the hosted build locally: `npm run build:hosted && npx vite preview --outDir dist-hosted --port 4307`.

**`?q=ultra` (hosted only)** renders as `high` and additionally sets anisotropic filtering to 16 on every photo texture and uses the 2K texture tier where one exists. In the single-file artifact `?q=ultra` is simply `high`.

**Adding 2K textures later.** The hosted build is ready for them; nothing is shipped yet because every new texture set needs its CC0 licence recorded in `docs/CREDITS.md` first. To add one, drop the files into `src/assets/textures/2k/` named `<materialKey>.<variant>_color.jpg` (required), `_normal.jpg` and `_rough.jpg` (optional; the 1K maps are kept when missing), for example `asphalt.0_color.jpg`. Repeat and normal strength are taken from the matching 1K entry in `src/textures/packs.ts`. Only the hosted build picks that folder up (the artifact never inlines it), and the files are fetched after first paint and swapped in through `MaterialLibrary.overrideMaps` (`src/textures/hosted.ts`). A 2K colour map costs about 22 MB of GPU memory with mipmaps, so use 2K for the big surfaces only (asphalt, sidewalk, brick, brownstone, roof).

## Street grid

Two avenue-to-avenue columns (Tompkins Ave → Throop Ave → Marcus Garvey Blvd) by five
street-to-street rows (Hart St, Pulaski St, Kosciuszko St, Lafayette Ave, Van Buren St,
Greene Ave). Dimensions are approximate; corrections go in the data file.
