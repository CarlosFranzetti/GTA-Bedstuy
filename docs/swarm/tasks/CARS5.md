# CARS5: vehicle sizes, the hovering look, real-vehicle shapes (22 Nov 2026)

Status: in progress (written early, kept current). Lane CARS5, vehicle artist-programmer.

## Owner's words (22 Nov)
- Large cars, SUVs and trucks feel larger and longer than they should against sedans and sports cars.
- "The car geometry feels off: model them on real world vehicles."
- Car shadows look wonky from some views: the car hovers over the street without wheels.

## Part 1: what I measured (before any change)
Tool: `tests/unit/entities/cars5-measure.test.ts` (writes `scratchpad/cars5/measure-before.csv`), builds every type at the
high and low detail level and takes bounding boxes of the drawn meshes and the instanced wheel set.
Finding 1: the drawn mesh equals the spec to within 0.01 to 0.03 m for every passenger type (loft is scaled to spec / style `dims`),
so the collider (OBB halfW x halfL from the spec) and the picture agree. The sizes are not a model-versus-spec bug.
Finding 2: the specs ARE published figures, but of the biggest common model of each class: sedan = a current mid-size sedan (4.88 m),
pickup = the F-150 crew cab 5.5 ft bed (5.885 x 2.03 x 1.96, matches Edmunds 2022 exactly), bigsuv 5.55 m (a 2022 Tahoe is 5.35),
cargo van = high-roof extended (5.98 x 2.78). Next to a compact or typical sedan these read as a different scale of thing.
Finding 3: truck and van wheels look small: ground clearance of the body is 0.14 to 0.45 m on vans and trucks, wheel diameter 0.74 to 0.81.
Tables: see below. Line-up: `scratchpad/cars5/lineup/before-side.jpg`, `before-front.jpg` (`scripts/carlineup.mjs`).
