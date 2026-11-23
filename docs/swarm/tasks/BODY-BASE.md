# BODY-BASE (round 3): bodies from the source shapes

Seat: BASE, Mira Castellan. Started 23 Nov 2026. Charter: `docs/swarm/teams/BODY-TEAM.md`, "Round 3".

Files: `scripts/people-pipeline.mjs`, `src/assets/models/people/**`, `src/entities/models/pedMesh.ts` (body part only),
`pedMass.ts`, `pedProportions.ts`, `pedTorso.ts`, `pedLimbs.ts`, `pedAges.ts`, new `pedGrid.ts`; tools in `scripts/dev/base-*`;
test `tests/unit/entities/base-build.test.ts`.

## Status

| Step | State |
|---|---|
| 0 baseline + before sheets | DONE: `build` reproduces all 23 glb byte for byte; `PEOPLE_HANG=old` still does |
| 1 shoulder | DONE: arms hung with the source skeleton, dual quaternion skinned; the fold was mostly made at RUN TIME (step 3) |
| 2 muscle x weight grid, all levels | DONE: 8 grid deltas per shape on hi, mid/far look them up; joints move with build; face front masked |
| 3 retire the deformers | DONE (all ten off by default, `VITE_BODY_OLD=1` restores); dressed check and tests in progress |
| 4 children, teens, elders | not started (kids are still the teen shapes scaled; teen_b has a chest) |
| 5 triangles | not started (knee ledges on muscular builds, foot spikes) |

## How it works now

- Pipeline (`buildBody` -> `hangWithSkeleton`): clavicle turns 3 deg down, the upper arm the rest about the shoulder joint, the forearm to a
  0.2 rad bend, the leg to vertical; dual quaternion blend of MakeHuman's 163-bone weights (`skinDQ`). Rig joints: shoulder, elbow, wrist
  6 to 9 mm lower than before (the clavicle); legs identical.
- Grid (`buildShape`): keys 'mw' (0 min, 1 avg, 2 max; '11' is the base, its target file is empty). Each shape bakes the 8 others from its own
  sex and age band (teens 50/50 child and young, mx_x 50/50 sexes). Face front masked (`faceKeep`): eyes, nose, mouth stay; jaw, jowls, cheeks
  at the side, neck, skull keep their build (close-ups: `docs/swarm/teams/sheets/base-faces-build.png`). Shipped as int8 attributes `_Gmw`
  on the hi level at a 1.5 mm step (`GRID_STEP`, `GRID_LODS`), joint moves in `extras.people.gridRig`.
- Runtime (`pedMesh.ts`): `buildOf(spec)` -> `gridCoeffs` (bilinear, as the source blends its macro targets) -> `applyBuild`, and
  `gridJoint` moves the rig. Mid and far take each vertex's delta from the hi vertex at the same place (93 / 84 percent are the same source
  vertex), else the nearest hi vertex on the same main bone.
- Reach: weight to 1.4 at average muscle or less (1.5 looked clean), muscle not past 1 (at (1.5, 1) knees and thighs break into ledges).
- Build placement: `bodyBuildOf(spec)` (SOMATO) gives BMI and a muscle tendency; `pedGrid.gridPointOf` places it on the MEASURED BMI table
  `GRID_BMI` (mesh volume x 1.01 kg/L / stature^2, `scripts/dev/base-bmi.mjs`). The source's axes are not BMI and muscle: man at average
  muscle, weight -1/0/+1 = BMI 19.2/21.1/23.2; min muscle max weight 39.6 (obese); max muscle max weight 30.7; min-min 13.8.
- Stature: `bodyBuildOf(spec).statureM`. Not read yet: neckCm, shoulderK, legK.
- Not edited (permission refused): `pedBodyTypes.ts`. Its BMI_ANCHORS / SAFE / old factors no longer drive the mesh.

## Deformers (bodyStack in pedMesh.ts)

All ten retired by default: torso, wedge, shtop, depth, hipx, arms, legs, flatten, mass, r2 (the stub hooks stay as files and calls, behind
`r2`). Evidence: `docs/swarm/teams/sheets/base-deformers-1.png`, `-2.png` (each one removed from the full stack) and `base-after-*`.
`shtop` alone made the corner worse when removed, but only because it patched `torso` and `arms`. `legs` and `mass` fought each other
(jodhpurs). Kept: lean (stoop), head size, pedProportions arm re-spacing. `torsoHalfWidthAt` now measures the built body.

## Sizes

23 glb: 1,817,868 -> 2,217,280 bytes (+399 kB). Triangles unchanged (hi about 5,300-5,350, mid about 1,100-1,170, far about 400).

## Sheets

`docs/swarm/teams/sheets/base-before-{front,back,side}.png`, `base-after-{front,back,side}.png`, `base-grid-front.png`.

## Next

Dressed check (clothes-showcase) and FIT list; tests (old deformer tests, base-build.test.ts); child shapes; knee ledges.
