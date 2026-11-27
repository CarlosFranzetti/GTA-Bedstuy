# CARENTRY: getting in and out of a car, the camera cuts (27 Nov 2026)

Seat CARENTRY (Mira). Owner, 27 Nov: "make sure enter exit car is smooth and no glitching camera showing in between the models; for the car
should be instant like gta." Asked what instant means he chose: THE CAMERA CUTS, WITH A SHORT ANIMATION (the camera switches to the car view
at once, never blending through the car or the character; the character does a quick door-and-sit move of about half a second; the same in
reverse on leaving).

## What was wrong (measured before, `tests/unit/entities/carentry-sweep.ts`, the real camera, player, vehicle and physics)

Sweep: sedan, SUV, box truck, bus; driver side, passenger side, from behind, driver side with a wall 0.45 m behind the player; Classic and
Modern; 30, 60 and 144 updates a second (96 runs). Each run: 0.3 s standing, F, 1.6 s, 1.0 s driving, F, 2.0 s.

- The camera stayed on the on-foot rig until the character was in the seat, then did ONE 0.6 s blend of the whole rig (distance, height,
  yaw swing from "behind the player" to "behind the car", pivot from the door to the car's centre). The lens flew round the car at 10 to 37
  m/s (bus 36 m/s Classic, 37 Modern) and took 1.6 to 3.6 s to settle (3.6 s with a wall behind; exit 0.6 to 1.0 s).
- 44 of the 96 runs had a frame with the lens inside the car's box, inside the wall or nearer than the near plane (0.2 m + 5 cm) to the car
  or the character: 684 frames in all. Worst: Modern, box truck and bus, every approach (the lens inside the bus box at the press from behind,
  21 frames within the near plane). Classic put the lens 0.55 m from a bus.
- A door on the far side (passenger side, from behind) was reached by gliding the player STRAIGHT THROUGH the car's body (the body is taken
  out of physics for the glide): the character is inside the car box for the whole crossing, and the on-foot lens, told to ignore the car being
  entered, sat inside the box of a long vehicle while the player walked along it (Modern bus from behind: lens in the box at frames 30 to 34).
- On leaving, the camera blended 0.6 s from "behind the car" to the on-foot rig: 0.6 to 1.0 s of a lens swinging round the car.
- In the browser build (`scripts/dev/carentry-shoot.mjs`, strips `docs/swarm/teams/sheets/carentry-before.jpg`) the same.

What the owner means by "the camera showing in between the models": the blend flies the lens through the space between the character and the
car (and through the car, for a long one) for 0.6 s; for a far door the character is also inside the car's body, seen from a lens that is
itself near or inside it.

## What changed

1. `src/core/Camera.ts`: a change of mode (on foot to car, car to on foot) is ONE CUT in both styles. Pivot, rig, yaw (behind the car going in,
   behind the player coming out), pitch, wall reach, look-behind and side looks all start at their goals on that frame. For 0.1 s after
   (`MODE_CUT_HOLD`) the yaw and pivot follow the target exactly (the render pose of the press frame is half way between the two bodies) and
   the wall reach is re-measured every frame, so the lens is on the wall side of the line from the first frame, not glided in.
2. `src/entities/Player.ts` (entry and exit only):
   - `camVehicle`: the car being driven, or the car being entered once the camera has cut to it: on the press when the door is within 1.5 m
     of the player or the walk goes round the car; otherwise when the walk is within 0.6 m of the door.
   - Door: the one on the player's own side (the passenger door from the kerb side, then across the seat) as in GTA; `Player.doorOf(v, side)`.
     Exit from a car entered by the passenger door prefers the passenger side (the existing `enteredFar` rule).
   - A door the straight line to which crosses the car's body (from behind or in front) is reached by walking AROUND the car, 0.5 m clear of its
     box, nearer end first (`routeToDoor`, `EnterRoute`); never through it. If both ends are blocked by something solid the old glide is used.
   - The whole move is 0.5 s at a door (was 0.4 to 0.55; sink-in share of it 50 percent as before); a long walk round a car is up to 1.5 s
     (a sedan from 1.2 m behind it 1.2 s, a bus 1.5 s).
   - `cameraIgnoreId`: only a car being vaulted. The car being entered is no longer ignored by the lens (that was how the lens got inside a long
     car).
3. `tests/unit/entities/camfix-harness.ts` and `mechanics-measure.ts`: the rig drives the camera with `camVehicle` and `cameraIgnoreId` as main.ts
   will, and re-captures the player's render pose after F as main.ts will.
4. `src/main.ts` is the lead's: `docs/swarm/tasks/CARENTRY-main.diff` (six small lines). WITHOUT IT the camera keeps the old blend (it is
   still fed the old mode) and the car being entered is not released from the level-of-detail swap.

## Numbers (rig, `npx vitest run tests/unit/entities/carentry-measure.test.ts` with `CARENTRY_OUT=file.json`; table printer in the task folder of the lane)

| | before | after |
|---|---|---|
| runs with a frame of the lens inside the car, character or wall, or within the near plane | 44 of 96 (684 frames) | 0 of 96 |
| press to driving, at a door | 0.40 to 0.56 s | 0.50 to 0.51 s |
| press to driving, from behind a car | 0.55 s (through the car) | 1.2 s sedan, 1.5 s bus (round it) |
| lens settled after the press | 1.6 to 3.6 s | 0.02 to 0.23 s (0.2 only with a wall behind: the wall pull-in) |
| lens settled after leaving | 0.6 to 1.0 s | 0.02 s |
| biggest lens step relative to its subject outside a cut (m per frame) | 1.4 to 2.0 | under 0.03 |

## Things the owner may see as "glitching" (checked)

- The character model visible inside the car body during the move: yes before (far door, whole crossing); now never crosses the box. During
  the last 0.25 s of the sit-down the figure slides from the door to the seat INSIDE the car; through the glass it reads as a dark shape
  (CARCABIN). Not changed.
- The car's own level-of-detail swap at entry: `carLod.release` ran only after the car was claimed (end of the walk); `CARENTRY-main.diff` releases
  it on the press. Not seen in a frame: the swap distance is `tierConfig.carNearDist`; ask the lead to look.
- The first-person fade: the T look hides the head; on the cut `firstPersonAmount` falls to 0 at once, the head returns on the same frame. Fine.
- Shadows popping: the contact blob and the car are placed by the same code as before; not seen popping in a still. Not measured.
- The door not animating: there is no door part on any car (the bodies are lofted shells with the cabin inside, `carBodies.ts`, `carCabin.ts`);
  nothing to animate. A door swing would be a new part per car type: an option for the owner, not built.

## Choices for the owner (best reading used; the alternative with its number)

1. Door and walk: nearest door (passenger door from the kerb side, across the seat) = used. Alternative: always the driver's door, walking round the
   car from the passenger side (about 1.3 s for a sedan, 1.5 s for a bus): slower, but the seat is always entered from the left.
2. Time at a door: 0.5 s = used. Faster: 0.35 s (cuts the sit-down, the figure is in the seat as the camera cuts), slower and more visible: 0.7 s.
3. Camera on a long walk (door farther than 1.5 m): used = it cuts on the press when the walk goes round the car (an on-foot lens beside a bus
   runs along its flank and touched the near plane), and stays on the player on a short straight walk until within 0.6 m of the door.
   Alternative (the lead's brief): stay on foot until the door is reached in every case: the lens then sits on the flank of a long car for up to 1 s.
4. Exit: the character appears beside the door on the side the existing rule picks, the camera cuts BEHIND THE CHARACTER (it faces the car, so the lens
   is on the outside and the car is in front: the lens cannot be inside the car by construction). Alternative: the camera stays behind the car's
   heading (as before and as the old games did), the lens then looks at the character from the car's rear quarter.

## Not done / not seen

- Not seen: pictures of the real game on the real phone; medium and high tiers; anything heard (the door sound is unchanged).
- The exit hold (0.1 s) covers one render frame of half-interpolated pose; callers other than the F key (a mission ejecting the player, `ejectPlayer`,
  teleports) do not re-capture the pose: they get a one-frame step of the target at most, never a blend.
- Car-to-car (carjack) is the same path as entering; the lens of a car whose door is blocked by an NPC is not tested.
- The player's own physics body is removed for the glide, as before: walking round the car is not collision-checked against a wall other than at
  the route corners (`blockedAt`).
