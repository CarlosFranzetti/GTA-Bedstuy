# TRAFFIC2: moving traffic follows the hour (22 Nov 2026)

Owner (22 Nov): "there is a bit too much traffic. Make it random but I'd like it cut overall at 25% and then only have it
be congested sometimes, early morning and afternoon. 9-5 kinda deal."

## Status
Built. Unit tests green, tsc clean (one unrelated red file from another lane: tests/unit/entities/cars5-measure.test.ts, no `fs` types). Sim runs: see the last section.

## Plan
- New pure module `src/game/trafficHours.ts`: `vehicleHourFactor(hour, rush, pmRush = rush)`, `drawDayRush(rng)`,
  and a wobble stepper.
- `src/game/TrafficSystem.ts`: `setHour` stores the vehicle factor; a private day roll (passing 4:00) and a +/-10 % wobble
  (60 to 120 s, eased) come from a private stream seeded by label, so no existing random stream changes; the spawn gate
  uses the effective cap; parked cars untouched.
- Tests: `tests/unit/game/traffic-hours.test.ts`.

## Design decisions
- Curve: baseline keys (0-5 h 0.30, 6 h 0.50, 11-15 h 0.70, 20 h 0.60, 23 h 0.40, 24 h 0.30) joined with smoothstep.
  Each rush peak is a raised-cosine bump (half-width 2 h, so 6.75-10.75 h and 15.5-19.5 h) that lifts the curve to the
  peak height at its centre: 0.80 + 0.45 x rush (0.80 at rush 0, 1.25 at rush 1). Outside the bumps the curve never passes
  0.70, so the 0.75 ceiling holds.
- The afternoon peak takes its own rush (`pmRush`): the day value times a second draw of 0.7 to 1.1, clamped to 1.
- A day rolls when the hour moves forward past 4:00. The first `setHour` call rolls the first day.
- Heavy day: probability 0.4, rush 0.7 to 1.0. Light day: rush 0.0 to 0.35.
- Wobble: +/-10 %, new target every 60 to 120 s of game time (advanced in `update(dt)`), eased with smoothstep.
- Cap: `effectiveMovingCap() = maxMoving` until `setHour` is called; after that
  `max(2, round(maxMoving * factor))`, and 0 when `maxMoving` is 0 (so the sims and tests that run with no cars do not
  start spawning: the bare floor of 2 would have spawned cars there).
- Over-cap cars are not deleted; spawning just stops, and the existing despawn rules thin them.

## The curve (pure function, `vehicleHourFactor`)
Sample values, light day (rush 0.15) and heavy day (morning rush 0.85, afternoon 0.77):

| hour  | light | heavy |
|-------|-------|-------|
| 0:00  | 0.30  | 0.30  |
| 3:00  | 0.30  | 0.30  |
| 5:00  | 0.30  | 0.30  |
| 6:00  | 0.50  | 0.50  |
| 8:45  | 0.87  | 1.18  | (morning peak centre)
| 11:00 | 0.70  | 0.70  |
| 13:00 | 0.70  | 0.70  |
| 15:00 | 0.70  | 0.70  |
| 17:30 | 0.87  | 1.15  | (afternoon peak centre; heavy pm rush 0.77 here)
| 20:00 | 0.60  | 0.60  |
| 23:00 | 0.40  | 0.40  |

Against today's cap (30 moving cars, the FULL_DENSITY and high-tier figure), averages (0.05 h steps; computed with a
Python copy of the formula, not from the running game):
- whole 24 h: about 0.57 (light day) and 0.62 (heavy day), so about 17 and 19 cars against 30.
- 9:00 to 17:00: about 0.73 (light) and 0.78 (heavy), so about 22 and 23 cars against 30.
- Expected over a random day (40 percent heavy): about 0.59 of today's cap over 24 h. The owner's "cut overall at 25%"
  is the daytime level (about 25 percent less), and the nights and evenings are cut further, so the 24-hour cut is about 40
  percent. Flagged for the lead to judge; the curve is one table in trafficHours.ts (BASE_KEYS) if it should be higher.

## Decisions to check
- `vehicleHourFactor(hour, rush, pmRush = rush)`: the brief's signature plus an optional afternoon rush, because the
  brief asks the afternoon to use its own draw.
- The stream is `new Rng(Rng.hash('traffic-hours'))`, not `this.rng.fork(...)`: `fork` draws a number from the traffic
  stream, which would change every existing car sequence.
- The cap floor of 2 applies only when `maxMoving` is above 0. The floor on 0 would start spawning cars in the tests that
  set maxMoving 0 (ped-hours.test.ts calls setHour with maxMoving 0 and a factory that throws).
- The day is rolled when the forward move passes 04:00; a backward `setHour` that wraps past 04:00 also rolls (a jump
  from 12:00 to 04:00 counts as a forward move of 16 hours).
- The wobble advances in `TrafficSystem.update(dt)` using the frame dt (game seconds).

## main.ts
No change needed. main.ts already calls `traffic.setHour(dayNight.timeOfDay)` every frame (line 834) and the debug
`setHour` at line 922 passes `snap`.

## Tests that call setHour
- tests/unit/game/ped-hours.test.ts: calls `TrafficSystem.setHour` with maxMoving 0, so the cap stays 0; numbers unchanged.
- tests/unit/game/ped-social.test.ts and the storefront tests call other `setHour`s (PedSocial, the storefront kit).
- tests/unit/sim/traffic-5min and realtraffic-5min do not call setHour: their cap is `maxMoving` as before.
- e2e and playtest scripts call `__gtaDebug.setHour` (main.ts), which does reach `traffic.setHour`; not run here.

## Files touched
- src/game/trafficHours.ts (new)
- src/game/TrafficSystem.ts (import, one field, `movingCap` getter, one line in setHour, one line in update, the spawn gate)
- tests/unit/game/traffic-hours.test.ts (new, 10 tests)
- docs/swarm/tasks/TRAFFIC2.md (this file)

## Verification
- `npx vitest run tests/unit/game/traffic-hours.test.ts`: 10 of 10 green.
- `npx vitest run tests/unit/game --maxWorkers=1`: 42 files, 487 tests, all green.
- `npx tsc --noEmit`: no errors from these files. One error from another lane's test file (cars5-measure.test.ts).
- Sim runs: tests/unit/sim/traffic-5min.test.ts and realtraffic-5min.test.ts, run together: 2 files, 30 of 30 tests passed, exit 0 (log in the session scratchpad, traffic2/sim.log). These sims never call setHour, so the cap equals maxMoving as before.
- Not verified: the feel in the running game; no browser run was made (not needed for this lane).
