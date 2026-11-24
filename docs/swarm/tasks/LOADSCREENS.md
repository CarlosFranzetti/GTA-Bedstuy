# LOADSCREENS (seat: Marisol Quade)

Owner's ask (23-24 Nov): "load screens with that graffiti look". Drawn in code (no image generator here).

## Plan
- `src/ui/loadart/`: 2D kit (`kit.ts`: seeded rng, brick and concrete wall, spray strokes with halo and overspray, drips,
  stencils, thick-outline two-tone figures), `letters.ts` (block lettering built from the game's own Anton: per-letter tilt,
  slant, bounce, 3D block, hard two-tone fill, glints, drips), `panels.ts` (seven panels), `index.ts` (order by seed,
  render once per panel to an offscreen canvas, hand out a blob URL, release the canvas).
- Hook: `src/render/Loading.ts` shows the panels in place of the in-engine shots when a canvas 2D context exists
  (jsdom and old browsers fall back to the old shots). Spray-painted bar and a row of stencil marks for the boot steps.
- Rules kept: rule 1 (nothing from any game, no lookalike lettering: Anton with our own distortion), rule 4 (invented
  words), rule 9 and 10.

## Status
(updated as the work goes)
