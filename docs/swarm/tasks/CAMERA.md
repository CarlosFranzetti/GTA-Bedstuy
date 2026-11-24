# CAMERA: "fix the camera and make it just like Vice City" (24 Nov 2026)

Seat CAMERA (Ines Calloway). Owner, 24 Nov: "fix the camera and make it just like Vice City" (22 Nov before it: "sometimes the camera screws
up getting in and out of car or changing views"). Rule 1 stands: the 2002 game is a STYLE reference. Nothing is taken from it. Every number
below is my own reading of how that kind of camera behaves (a fixed far chase rig, a lazy follow, a soft yaw lag in cars), written from
memory and public descriptions, and tuned by tests. Nobody has looked at it running: see "Not checked".

Two styles, one class (`ThirdPersonCamera`, `src/core/Camera.ts`; views in `src/core/CameraViews.ts`):
- Classic (new default in the game): this document.
- Modern: the camera that shipped on 22 Nov (over the shoulder on foot, 4.6 m / 1.7 m car rig). Untouched. The class itself still starts in
  `modern`, so every older test sees the old camera; the game picks the style at start (`loadCameraStyle()`, default classic) and Settings
  switches it (`setCameraStyle`). A switch is one clean cut.

## What Classic does

On foot
- One fixed rig, fairly far and high, no shoulder offset, no roll, no sway, no idle drift. The whole body and the street ahead are in frame.
- It follows the direction of movement lazily: once the look input has been quiet for 2 s, the view swings round behind the way you are going,
  first order, time constant about 0.3 s at full pace, slower for sideways movement (40 % at 90 degrees off), not at all when you run toward the
  lens (no spin). It never snaps. Standing still it stays exactly where it is.
- Mouse, right stick or a touch drag orbits freely (yaw and pitch). After 2 s without a look it eases back behind: while moving through the lazy
  follow; standing still, only if it had been turned, at 1.6 per second. Pitch goes back to the rig's pitch 1 s after the last vertical look.
- Hold T: a first-person look (cut in, cut out). Hold C: look behind. Hold `[` or `]`: look left or right (90 degrees).
- Aiming holds the view where it is (`holdView`, as before) and no longer slides over the shoulder.
- The wall pull-in is the old one (three rays, glide in at 14 per second, never faster than 16 m/s, ease out at 3 per second with a 5 cm dead band,
  roof lift). New: `bodyFade` 0..1, the character's opacity when the lens comes within 2 m (horizontally) of the head, 0 at 0.6 m. NOT wired
  to the model: see the hand-back.

In a car
- Views cycled with V: Near chase, Middle chase (default), Far chase, Bumper, Cinematic. Remembered per style (`gta-bedstuy.camera-views.classic.v1`).
  Bumper and Cinematic are clean cuts, the three chases blend in 0.25 s (existing rule). On foot V does nothing (one rig).
- Locked behind the heading through a critically damped spring on yaw (omega 5 per second): it trails in a turn (about 23 degrees behind at a turn
  rate of 1 rad/s, 11 degrees at 0.5) and catches up (95 % of the way in 0.6 s after the car straightens). No corner swing, no slip look, no roll.
- Higher and looking slightly down (about 14 degrees at the middle rig); pulls back 1.6 m at 30 m/s; the lens widens from 64 to 70 degrees.
- Hold C: look behind, reached in about 0.07 s (a spring at 45 per second: close to a cut but not a frame jump). It does NOT flip when reversing:
  the view stays behind the car, the player uses C. Hold `[` or `]` to look left or right.
- A mouse or stick look in a car is held 1.0 s, then returns behind over 0.6 s (the spring's stiffness ramps).
- Getting in and out: unchanged from CAMFIX (one 0.6 s blend, cuts to or from the bumper and cinematic views). The style tests rerun all 26
  CAMFIX scenarios at 30, 60 and 144 fps in Classic.

## The numbers

"Own" means my judgement, not measured from anything. There is nothing to measure against: the reference is a memory of a feel.

| What | Value | Where | Source |
|---|---|---|---|
| On foot: distance behind (along the view) | 5.4 m | `CLASSIC_FOOT_VIEWS` | own |
| On foot: height of the rig | 1.9 m plus distance x sin(pitch) | same | own |
| On foot: rest pitch | 0.28 rad (16 degrees) | same | own |
| On foot: resulting lens | 5.2 m behind, 3.4 m up, looks at 1.2 m: 23 degrees down | derived | own |
| On foot: field of view | 60 degrees (modern 64) | same | own, "modest" |
| On foot: shoulder, roll, sway, idle drift | none | | the owner's brief |
| On foot: pitch limits | -0.05 to 0.8 rad | `CAM_CLASSIC.pitchFoot` | own |
| On foot: look-return delay | 2.0 s | `footReturnDelay` | owner, 18 Nov ("two seconds"); same as modern |
| On foot: lazy follow rate at full pace | 3.4 per second (time constant 0.29 s) | `footFollowRate` | own |
| On foot: pace sideways (90 degrees) | 40 % | `footFollowSide` | own; the modern rule is 35 % |
| On foot: pace running at the lens | 0 from 130 degrees | derived | own, keeps "left" from becoming a circle |
| On foot: moving threshold | 0.6 m/s | `footMoveSpeed` | own |
| On foot: settle after a look, standing | 1.6 per second | `footSettleRate` | own |
| On foot: pitch return | after 1.0 s, 2.5 per second | `pitchDelay`, `pitchRate` | own |
| Car, middle: distance, height, look | 6.2 m, 2.7 m, 1.2 m | `CAM_CLASSIC.vehicle` | own (modern 4.6, 1.7, 1.3) |
| Car, near | 0.8 x distance, 0.85 x height (5.0 m, 2.3 m) | `CLASSIC_VEHICLE_VIEWS` | own |
| Car, far | 1.45 x distance, 1.4 x height (9.0 m, 3.8 m) | same | own |
| Car, bumper | at the nose (0.5 of the length ahead of centre), 0.55 of the roof height + 0.25 | same | own |
| Car: bigger vehicles | the existing scaling by length and height over a sedan | `Camera.update` | CAMFIX, unchanged |
| Car: pull-back with speed | 1.6 m at 30 m/s | `speedDistance` | own (modern 0.9) |
| Car: field of view | 64, widening to 70 at 30 m/s, plus the view's own | `CAM_CLASSIC.vehicle` | own (modern 70 to 82) |
| Car: yaw spring | omega 5 per second | `carYawOmega` | own |
| Car: look return | held 1.0 s, ramp 0.6 s | `carReturnDelay`, `carReturnRamp` | own (modern 2.0 and 1.4) |
| Car: pitch limits | -0.05 to 0.5 | `pitchVehicle` | own |
| Look behind / sideways: spring | omega 45 per second (95 % in 0.07 s) | `lookOmega` | own, "instantly" |
| Look sideways angle | 90 degrees | | own |
| Chase to chase blend | 0.25 s; in or out of a car 0.6 s | CAMFIX | unchanged |
| Character fade | 1 at 2.0 m horizontal from the head, 0 at 0.6 m | `fadeNear`, `fadeFar` | own |
| Keys: first person, look left, look right | T, `[`, `]` (raw codes, not in the binding table) | `LOOK_*_KEY` | own; the lead may rebind |

## Tests

`tests/unit/core/camera-classic.test.ts` (new) and `tests/unit/entities/camfix-harness.ts` (a `style` option, and the bumper view excluded
from the inside-car test like the hood). Results are at the end of this file.

## Hand-back

See the report to the lead (exact lines for `src/main.ts` and the Settings row) and the end of this file.
