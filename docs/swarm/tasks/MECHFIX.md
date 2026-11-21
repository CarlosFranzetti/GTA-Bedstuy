# MECHFIX: regressions from the MECHANICS lane (Wren Calloway)

Status: 21 Nov 2026. Fixed and measured headless. Not checked in the running game.

## 1. Camera (src/core/Camera.ts)
- Frame rate: the pivot spring (`dampStep`) was exact only for a target that stands still. The target moves every frame, and the update measured
  the spring against the new target position, so the lag depended on the frame cut (0.126 m between 30 and 144 fps). Now the update is exact for a
  target moving at the constant speed it had during the frame: the spring is stepped in the frame that rests at its equilibrium (2u/omega behind the
  target). A jump above 60 m/s (a teleport under the 6 m snap) keeps the old step reading. Jitter metric and 30/144 pose test are green.
- Wall: the pull-in did nothing on the first frame. `reach` is kept above the lens distance (the "slack"), and the 16 m/s limit on moving in only
  ate that slack, so the lens did not move for a frame or more. `reach` is now capped at the lens distance + 5 cm before the move in, so a wall that
  appears starts the pull-in at once (16 m/s, no pop). `ignoreId` was not the cause: it only excludes the car being entered.
- Look rule untouched (camera-gta green).

## 2. Knock-down (src/entities/Player.ts `onContact`)
- Cause: the new foot braking (12 m/s2 at rest, was 28) lets a car that keeps its throttle on push the player along while its own speed creeps up; at
  3 m/s the old test "speed of the other body >= KNOCK_SPEED" then fired on a push, not a hit. Before, the stronger brake held the car at 2.4 m/s.
- Fix: a knock also needs a closing speed at the contact of at least 1.5 m/s (`contact.impulse`, closing speed along the normal). A car that hits
  at speed has it at the moment of contact; a car pushing someone it already touches does not. All the knock-down scenarios stay green.

## 3. Getting into a car (src/entities/Player.ts `tryEnter`)
- Could not reproduce the "stands frozen" case headless with a van beside the cab (new test, 6 headings, 120 placements of a van, cab or box truck
  within 4.6 m: always seated within 1.5 s, about 0.6 s). The walk to the door is a straight Hermite glide with no collision, so it cannot be blocked.
- What can leave the player standing: `tryEnter` took the single nearest car (door or body box) and, if that car was refused (far door and jammed),
  returned null, even with another car right there. Now candidates are ranked by door distance (a car reached only by its body box is ranked 1.5 m
  behind one whose door is in range), and a refused candidate is skipped for the next. Test: the nearest car refused, the next taken (fails on the
  old code, passes now).
- Not found, not mine to edit: in `main.ts` F goes first to `interiors.interact` and `missions.interact`; a shop door or mission marker within range
  of the parked cab eats the press. If the in-game check still fails, look there (log which branch consumed F).

## Tests
- Added tests/unit/sim/enter-beside.test.ts (17 tests, real Input key events, Player, Vehicle, World2D).
- No existing test weakened or changed.
