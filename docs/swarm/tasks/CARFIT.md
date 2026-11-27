# CARFIT: making the tree whole after CARENTRY and STUCK, steering in between (27 Nov 2026)

Seat CARFIT (Marlowe). Owner's choices: steering feel IN BETWEEN quick and weighty; nearest door then slide across; exit camera behind the
car's direction. Status: in progress, kept current.

## 1. Red tests where CARENTRY and STUCK meet (cause, and whether code or test changed)

| test | cause | fixed in | why |
|---|---|---|---|
| `tests/unit/sim/enter-exit.test.ts` "enter/exit cycles on one spot 20 times" | The loop put the player back 0.5 m along world +x from the door. For a sedan at heading 1.0 that spot is on the far side of the car's box from the door, so (CARENTRY) the walk goes ROUND the car, 1.45 s, never through it. The test wanted 0.6 s. The first cycle (start beside the door) takes 0.55 s, as built. | TEST | The old test asserted a walk through the car's body, which the owner has replaced. Now each cycle starts where the exit left the player (beside the door, 0.6 s asserted), and one extra round starts at the old far-side spot and asserts the walk round the car ends inside within 1.6 s. |
| `tests/unit/render/camera-smooth.test.ts` "getting in or out glides" | CARENTRY made a mode change ONE CUT; the first frame now jumps 1.75 m. The owner chose a cut. | TEST | Replaced by "getting in or out is ONE CUT": the first frame must move more than 1 m (it cut), then with the pivot still the lens never moves more than 5 cm a frame and ends within 15 cm of where the cut put it. A glide would fail the first check, a drift the others. |
| `tests/unit/entities/vault-pinned.test.ts` (4 "pinned by a car that has stopped against them") | Red earlier because STUCK's rescue moves a body overlapped for 0.5 s, so the player was already out before Jump. It passes now with the rescue switched off in the file. | TEST (added) | Switching it off is fair for the Jump tests (they exist to show Jump), but it hid whether the rescue itself leaves the player clear. New block "pinned, with the STUCK rescue switched on": all scenes, rescue on, wait for the prompt, press Jump once, run 3 s, assert the player is not inside a collider and has 1.5 m of free run. Passes (30 tests in the file). |
| `npx tsc --noEmit`, `yawRate` private in `tests/unit/sim/stuck-controls-lib.ts` | `Vehicle.yawRate` is private; there is a public getter `yawRateRad`. At the time of this lane the file already used the getter and tsc (which covers `src` and `tests`) reported nothing. | nothing to fix | Clean at the start and at every check since. |

## 2. Steering feel, three sets side by side
(in progress: see the table below once filled)
