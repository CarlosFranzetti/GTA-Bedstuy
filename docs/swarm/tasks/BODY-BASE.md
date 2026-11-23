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
| 3 retire the deformers | DONE (all ten off by default, `VITE_BODY_OLD=1` restores); dressed check done, FIT list posted |
| 4 children, teens, elders | DONE: `kid_a` / `kid_b` from the child targets (child grid only), teen girls 60/40 child/young, street caps by age |
| 5 triangles | MEASURED, nothing moved: +800 on the body region did not smooth knees (the source itself steps 4.9 mm at the knee); build-aware decimation instead |

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

## Round 3, second shift (after the usage reset)

- Children: `kid_a` (boy, 1.34 m) and `kid_b` (girl, 1.32 m) from `universal-*-child-*` and the race child targets; their grid is the
  child band only, so no build can put an adult chest or muscle on a child. Raw shapes 6.8 / 7.0 heads; at run time the head is scaled to
  `HEADS_OF_STATURE.kid` 6.2 heads, which reads as about 7 to 9 years. Flat chest, round trunk, short legs. `shapeFor` kid -> kid_a / kid_b.
- Teenagers: teen_a 50/50 child/young (boys), teen_b 60/40 (girls: plainer chest). Sheets: `base-ages-bare.jpg`, `base-young-dressed-*.jpg`.
- Street caps (`pedMesh.STREET_CAP`): adults muscle 0.8, elders 0.6, teens 0.5 (weight 1.1), kids 0.3 (weight 1). The +1 muscle shape is
  NOT clean (trapezius swallows the neck, knee ledges: `base-muscle-cap.jpg`, second figure), so no gym type draws it.
- Decimation now respects the build (`DECIMATE_BUILD`: the four grid corners as simplifier attributes, weight 0.5): mid upper arms on
  muscular men went from 15 percent thinner than hi to 3 percent.
- Knees: the artist-made full-resolution source steps 4.9 mm per cm at the knee and 4.3 at the top of the arm (`scripts/dev/base-outline.mjs`);
  the hi level 3 to 6.3 mm. +800 triangles on the body region made it no better (and cost 260 kB), so not shipped.
- Thighs at the top: measured gap two centimetres below the fork: street-average man 28 mm, soft-heavy man 22 mm, strong woman 13 mm;
  obese (both), soft-heavy woman and strong man touch. A thigh-in stance (`HANG.thighInDeg`, env `THIGH_IN`) was tried: it moves knees and
  ankles 23 mm, so it is off.
- Sizes: 25 glb, 2,408,828 bytes (+591 kB on 1,817,868, two of the files new).

## Dead fields in pedBodyTypes.ts (for a later cleanup; my edit there was refused)

- `BMI_ANCHORS`, `MUSCLE_BMI`, `SAFE`, `weightOfBmi`, `bmiOf`: the mesh uses `pedGrid.GRID_BMI` / `GRID_SAFE` / `gridPointOf` instead.
  `bodyBuildOf(spec).bmi` and `.muscle` and `.statureM` ARE read; `.weight`, `.neckCm`, `.shoulderK`, `.legK` are not.
- BodyType factors `shoulders`, `chest`, `waist`, `hips`, `arms`, `legs`, `belly`: read only with VITE_BODY_OLD=1, except FIT's pedLegs.ts
  (`bt.legs`, `bt.hips`), pedHead.ts (`bt.shoulders`, hair width) and the arm splay in buildMhPedModel (`hips`, `chest`). `weight`,
  `muscle` of BodyType: read only with VITE_BODY_OLD=1. Kept: `head`, `stoop`, `h` (old path).
- The interim line registering new ids into `pedMass.TYPE_BMI`: pedMass is retired (mass deformer off) but still imported by
  pedBodyTypes (massTargets for `legs`); delete both together.

## Tests

- New `tests/unit/entities/base-build.test.ts` (8 tests): deformers off, grid shipped on every shape, bilinear blend, the shipped deltas
  equal the source shapes at the decimated vertices, hi/mid girths within 10 percent for 7 builds x 2 sexes, outline steps <= 7 mm
  (the brief said 3; the source itself steps 4.9), thighs meet for the heavy builds (others measured, see above), shoulder outline convex.
- `pedbodytypes.test.ts`: joints no longer follow the old factors by default (asserted both ways); the dressing test pins the grid centre.
- `body-pose-mesh.test.ts`: arm-out limits grow 1.5 deg per BMI point over 25 (heavy trunks now push the arms out, as on a heavy person).
- `population.test.ts`: ea-kid is `kid_a` now.

## Next

Dressed check (clothes-showcase) and FIT list; tests (old deformer tests, base-build.test.ts); child shapes; knee ledges.
