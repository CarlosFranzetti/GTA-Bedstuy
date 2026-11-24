# MODS lane (Ines Okafor), 24 Nov 2026

Owner's ask: players load their own model and texture packs (glTF, and RenderWare .dff / .txd from the early-2000s community packs) as mods. Nothing is bundled or uploaded.

## Plan and status
- [ ] src/mods/limits.ts, binary.ts (safe reader), rw/dff.ts, rw/txd.ts (own parsers, from the public chunk layout)
- [ ] src/mods/manifest.ts (mod.json schema and validation), convert.ts (DFF/TXD to three), registry.ts, store.ts (IndexedDB), files.ts (classify dropped files)
- [ ] src/ui/ModsPanel.ts, harness scripts/dev/mods-harness.html/.mjs
- [ ] docs/MODS.md, tests/unit/mods/**
- [ ] hooks: `registerGltfVehicle` in VehicleSource.ts (far-car LOD); everything else uses existing hooks (`Vehicle.sources[type]`, `MaterialLibrary.overrideMaps`).

## Hooks found
- Vehicles: `Vehicle.sources[type]` is a `GltfVehicleSource`; `Vehicle` calls `.instantiate(spec)`; `GltfVehicleSource.fromGltf({scene})` already fits length/width/height, finds wheels by /wheel/i names, paint by /paint|body/ material name, lights by /head.*light/.
- Textures: `MaterialLibrary.overrideMaps(key, variant, {map, normalMap, roughnessMap, repeat})`.
- People: skinned to our skeleton; out of first pass (see docs/MODS.md "Not yet").

## What I read about the formats
Written from memory of the public format descriptions (GTAMods wiki "RenderWare Binary Stream File", "DFF", "TXD"; the `rwanalyze` style chunk tables). No code from any library was read or copied. Details in docs/MODS.md.

## Notes
(filled in as work lands)
