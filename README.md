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

## How it is built

Everything is procedural: geometry and textures are generated in code from a small
hand-authored data file (`src/world/data/bedstuy.json`) describing the streets and the
parody points of interest. No image, model, or audio files are shipped.

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

## Street grid

Two avenue-to-avenue columns (Tompkins Ave → Throop Ave → Marcus Garvey Blvd) by five
street-to-street rows (Hart St, Pulaski St, Kosciuszko St, Lafayette Ave, Van Buren St,
Greene Ave). Dimensions are approximate; corrections go in the data file.
