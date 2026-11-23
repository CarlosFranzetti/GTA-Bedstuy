# BODY-BASE (round 3): bodies from the source shapes

Seat: BASE, Mira Castellan. Started 23 Nov 2026. Charter: `docs/swarm/teams/BODY-TEAM.md`, "Round 3".

Files: `scripts/people-pipeline.mjs`, `src/assets/models/people/**`, `src/entities/models/pedMesh.ts` (body part only),
`pedMass.ts`, `pedProportions.ts`, `pedTorso.ts`, `pedLimbs.ts`, `pedAges.ts`; test `tests/unit/entities/base-build.test.ts`.

## Status

| Step | State |
|---|---|
| 0 baseline + before sheets | in progress |
| 1 shoulder (hang arms with the 163-bone skeleton) | not started |
| 2 muscle x weight grid as morphs, all levels | not started |
| 3 retire the deformers (VITE_BODY_OLD=1 restores) | not started |
| 4 children, teens, elders from the source | not started |
| 5 triangles | not started |

## Findings

- The lead's diagnosis holds so far (read the pipeline): build = `dw`/`dm` on hi only + deformers in `dressLodBody` and `massApply`;
  arms hung with the 12-bone game weights (`buildBody`, the `limbs` loop).
- EXTRA: `deltaTargets()` tested `shape.sex === 'f'`, but shapes carry `'female'`: every female shape shipped the MALE weight and
  muscle deltas.
- Geometry is cached per variant (`shape:variant:detail`), so build must be a pure function of the spec.

## Interface with SOMATO

Proposed: `bodyBuildOf(spec): { weight: number; muscle: number }` from `pedBodyTypes.ts`, pure function of the spec, both in
[-1, 1]. Until it exists BASE reads `bodyTypeOf(spec).weight / .muscle`.
