# STUCK lane (Ines), 27 Nov 2026

Owner, 27 Nov: "there are collision issues, the car and player get stuck sometimes, and controls aren't as smooth as gta yet."

Status: in progress. This file is kept current; the last section is the result.

## Method

`tests/unit/sim/stuck-soak-lib.ts` (+ `stuck-soak.test.ts`, off unless `STUCK_SOAK=<folder>`): the real World2D, Vehicle (player
handling), Player and map colliders (the grid, and the real-street map with 37,682 streamed building colliders around 36 sites).
Car trials throw one car at a wall, a corner or a prop (5 to 16 m away, 0 to 80 degrees off the normal, 0 to 16 m/s start, forwards,
reverse, weaving, held lock) with 0 to 3 parked cars near the path. Walker trials: wall, run, gap between two parked cars, along a
car parked against a wall, and a traffic car driven at a walker standing at a wall.

Definitions (exact, in the file header): pinned = input held 2 s, moved < 0.3 m; hard stuck = pinned and none of five escape inputs
(car) or eight directions (walker) moves it 1 m within 2 s (1.5 s) each; overlap = overlapped > 0.04 m with something solid for
0.5 s in a row AFTER the step's own resolution; tunnel = centre ends inside a static polygon.
Run: `STUCK_SOAK=<dir> STUCK_TAG=x STUCK_CARS=500 STUCK_WALKERS=500 npx vitest run tests/unit/sim/stuck-soak.test.ts --maxWorkers=1 --testTimeout=900000`.
