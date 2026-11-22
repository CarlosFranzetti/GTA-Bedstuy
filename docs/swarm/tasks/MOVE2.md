# MOVE2: over the hood, and more human movement (lane MOVE2)

Status: 22 Nov 2026, in progress. Part 1 (vault) first, then part 2 (gait). Nothing here is played by hand; numbers are headless.
Owner, 22 Nov: "some more realistic character movement" and "make sure you can jump over car hoods such that if you're pinned
between two you can get away."

## Plan
1. Reproduce the pinned cases headless (real Player, World2D, Vehicle): `tests/unit/entities/vault-pinned.test.ts`.
2. `src/entities/vault.ts` (pure planning: hood and deck height from the car's spec and body profile at run time, landing search,
   refusals) and Player.ts (state machine: Space toward a low part of a car, auto-vault at sprint, pinned rescue).
3. Animation: check the clip pack for a vault clip; else a hand-keyed pose sequence.
4. CAMFIX harness scenario for the vault. One run in the real game, frames looked at.
5. Part 2: gait (foot slide, starts, stops, turns, upper body, sprint, kerbs, bumps).

## Part 1: over the hood (landed, headless-tested; game frames below once looked at)

Reproduced first (tests/unit/entities/vault-pinned.test.ts, scenes in vault-scenes.ts, harness vault-harness.ts: the real Player, World2D, Vehicle, stepped like main.ts):
the player walking with every escape key for 3 s cannot leave (moved under 1.6 m, no clear 2 m run) in: nose to tail 1.12 m (0.32 m to spare) with a kerb wall and a
double-parked car beside; the strip between a car and a wall closed at both ends; a traffic jam (cars front, back and both sides, 0.25 m off the flanks); a dead-end lane with a
car stopped against them; a sealed alley (walls hug the cars); and the same alley of vans.

How it works (src/entities/vault.ts, Player.ts):
- Space on foot: first `planVault`, else the plain jump. Cars come from the host hook `player.vehiclesNear(p, r)` (main.ts: `physics.queryCircle` + userData).
- Heights are read at run time: `topProfile(spec)` builds the hood and deck height from the car's own `STYLES` profile in carBodies.ts (secs scaled by spec length and height,
  windshield base, rear glass base), so CARS5's new sizes move the zones. Hood = forward of the windshield base, deck = behind the rear glass. Vaultable only where the
  surface is at most 1.15 m (`VAULT_MAX_HEIGHT`); the cabin is never crossed; a body 2.0 m or taller (vans, step vans, box trucks, buses, tow trucks) has no profile and is refused.
- Needs: within 0.9 m of the outline (1.15 m pinned), facing within 50 degrees (the held direction if any), car under 4 m/s (over: refused, the knock-down rules stand).
- Landing: candidates round the outline in the car's own frame (so a rolling car carries them along), two offsets (0.43 and 0.6 m), the path sampled 28 times in the car's
  predicted frame for the surface height and for walls and other cars (thin 0.26 m body on the way, 0.4 m foot at the landing). The cheapest clear one wins (length, how far off the
  heading, 2 x peak height). None: refused, a small stumble, never a spot inside a collider. The path is a Hermite curve that leaves at the run's speed and arrives at 78 % of it.
- The body is lifted along a profile that rises in at least 0.24 s, rides about 0.12 m over the paint, and falls the same way. For the length of the vault the host takes the body out
  of the physics world (`onVaultStart`/`onVaultEnd`, like the walk to a door), `vehiclePass` is on as a fallback, and `body.height` is the drawn height.
- Pinned (`boxedT`): every 0.2 s sixteen 2 m runs are probed; none clear for 1.5 s = `player.vaultPrompt` (main.ts shows "Jump: climb over"). Pinned, the vault is always tried:
  the hood or deck of any neighbour in any direction, and if none fits the whole car is climbed over lengthwise (roof included, up to 1.95 m: SUVs and pickups yes, vans no), and if
  that fails the player squeezes out sideways to the nearest ground that leads somewhere (glides through cars, never through a wall or prop, up to 9 m).
- Auto-vault: sprinting (sprint ramp 0.85, 4.8 m/s, straight at it) at a low part of a car vaults without a key; the sprint-at-a-wall braking is skipped for a feasible vault.
  `vaultSettings.autoVault` (exported from vault.ts) turns it off.
- `player.held` (POLICE2): true = no vault and no prompt. Breaking free is theirs.
- Camera: while vaulting, and while within 4 m of the car for up to 4 s after, `player.enteringId` returns the vaulted car's id, so the existing `camCtx.ignoreId` line in
  main.ts stops the lens shying from it. Needs the body out of the physics world (else the camera's ray starts inside the player and cannot skip two bodies).
- Animation: no vault, climb or hurdle clip is in the pack (it holds walk, jog, run, jump, stumble, sit, stand, turn, idles). A hand-keyed five-key vault (`VAULT_KEYS`,
  `keyVault` in controller.ts: run stride, plant, over, land, recover; mirrored by side) is mixed over the run in 0.1 s and out in 0.25 s; the foot lock is off meanwhile.

## Part 2: more human movement (headless numbers; nothing played by hand)

Measured with `tests/unit/entities/gait-measure.test.ts` (`MOVE2_OUT=<file> npx vitest run ...`): the ANIM2 fake rig at 60 Hz, the entity travelling at the player's own
acceleration curve (accel 9 falling to 4.6, brake 12 rising to 17), foot slide = net travel of the ball of the foot over the ground between touchdown and lift-off, cm.
Before = the tree as I found it (`scratchpad/move2/gait-before.json`).

| scenario (lock on) | mean / max cm per stance |
|---|---|
| walk 1.6, jog 3, run 4.5, sprint 6.5 m/s steady | 0.4 / 1.3, 0.3 / 1.2, 0.7 / 3.9, 0 / 0 |
| rest to jog | 0.6 / 6.1 (the first step) |
| jog to sprint | 1.4 / 19 (one stance in the 3 to 5 m/s blend) |
| sprint to stop | 2.9 / 16 (the stop's last two stances) |
With the lock OFF the clips themselves skate 3.7 to 4.1 cm a stance at walk, jog and run, 0.8 at sprint, so the lock is doing the work at steady speed (`footLockOn` flag on the controller).
The steady numbers were already good (ANIM2); the transitions are where the skate remains.

What changed in part 2 (small, because the steady gait was already planted by ANIM2 and I had one budget):
- Lean into a turn (controller.ts `write`): hips and chest roll together by `-yawLead x speed x 0.0105`, capped at 0.2 rad (about 11 degrees at a sprint turning at 3 rad/s, nothing standing).
  It replaces the old chest-only 2 % roll; a pedestrian turning at a run gets it too (the same code path, no extra cost: two multiplies).
- Shoulder check (Player.ts `onContact`, `shoulderCheck`): running into a person at 2 m/s or more, head on (not brushing past), gives a small stumble layered on the stride, takes a fifth of
  the speed and a tenth of a camera kick, once per 0.7 s; the physics still separates the bodies. A big hit still uses the old brace.
- Vault: see part 1.
- `AnimController.footLockOn` and `leanGain` (tests and the showcase).
- Not done: start weight shift and first short step (the captured `startRun` is there and unchanged), settling steps after a sprint stop (the captured `stopRun` plays; the 43 degree elbow jump
  in it is ANIM2's open item), a skid step on a sharp reversal (MECHANICS' align scale handles the speed, there is no skid clip), kerb steps (Ground.ts eases 0.15 m in about 0.2 s; left),
  being pushed by a slow car (no animation for it), counter-rotation of shoulders and hips (the captured clips carry it), stamina and a tired state (no stamina exists in the game).
- The remaining skate is in the transitions (table above). I did not change the clip blending: it is shared by every pedestrian and I had no way to see the result in the running game.

## Tests added or changed
- `tests/unit/entities/vault-pinned.test.ts` (24): each pinned scene holds the player (cannot walk out, prompt after 1.5 s), Jump gets them out at 30, 60 and 144 fps, vans squeeze out.
- `tests/unit/entities/vault-moves.test.ts` (17): a key press at a hood, a press looking away, refusals (box truck, bus, cargo van, walled both sides, car over 4 m/s, held), a car rolling at 3 m/s,
  auto-vault at three frame rates and with the setting off, no tunnelling through a wall.
- `tests/unit/entities/gait-move2.test.ts` (7), `gait-measure.test.ts`: key response within two frames, foot slide bounds, lean into a turn, vault pose continuity and mirror, shoulder check.
- `camfix-harness.ts` wires `vehiclesNear`, `onVaultStart`, `onVaultEnd` like main.ts; `camfix-scenarios.ts` has `vault-walk-into-hood` and `vault-sprint-hood` (all three frame rates, the 250 ms hitch, rest pose).

## Camera
- The vault itself does not move the lens: the camera follows the ground position. With `enteringId` returning the vaulted car and the body out of the physics world, the two scenarios pass
  every CAMFIX check at 30, 60 and 144 fps. Without those two things the lens was pulled in at 16 m/s and lifted over the roof (0.6 m in a frame, view pitching at 670 degrees a second).
- NOT solved, not mine: a vault in a tight pocket (walls behind the lens, as in a closed strip between a building and a car) still has the camera's own wall pull-in fire after the landing
  (0.64 m in a frame at 30 fps, view pitch 680 degrees a second for about 0.1 s) when the player ends on the other side of a wall that was behind the lens. It is the same pull-in
  and lift-over-the-roof any walk round a corner does. If the lead wants it gone: in Camera.ts, ease `liftS` with the lens's pull-in (LIFT_UP 9) while `snappedThisFrame` is false and
  the pull-in is above 10 m/s; I did not touch it.
