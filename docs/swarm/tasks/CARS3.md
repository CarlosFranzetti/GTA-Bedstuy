# CARS3 (Marlowe Quill): vehicle handling, 21 Nov

Status: current (partial result; see "Not done")

Brief: handling the player can feel first, then geometry, paint, new types. This file covers what landed (handling) and what did not.

## What changed

* `src/entities/handling.ts` (new): the player handling model and its data table. A flat 2D dynamic bicycle model.
* `src/entities/Vehicle.ts`: a branch in `integrate()` that runs the model for the player's car; body roll, pitch and spring
  stiffness now come from the class row for every car; kerb bob; wheel spin / lock-up shown on the wheels; `yawRateRad`, `handling`,
  `useProfile()` accessors. `VEHICLE_SPECS` numbers are untouched.
* THE SWITCH: `Vehicle.aiHandling` (default `false`). Traffic and police keep the old kinematic model until it is set to `true`.
  `Vehicle.playerHandling` (default `true`) turns the new model off for the player (old behaviour) for A/B checks.
  `tests/unit/entities/ai-trajectory.test.ts` pins 15 AI-driven types to a trajectory recorded before any change (fixture
  `tests/unit/entities/fixtures/ai-trajectory.json`): all identical.

## How it works

Per axle: slip angle (relaxed over 0.35 m of travel) goes through a curve that rises to a peak angle and falls to a floor
(`tyreShape`), times the axle load, times grip (class mu x `VehicleSpec.grip` x `Vehicle.grip` x `Vehicle.roadGrip`).
Axle load is faked from the filtered longitudinal and lateral acceleration (`hcg` is the lever). A friction circle makes drive and
brake force take grip from cornering. Drive force is shared front/rear by `drivetrain` / `torqueBias` and clipped by traction
(wheelspin). Brakes split by `brakeBias`, ABS or lock-up (a locked rear loses cornering grip). The handbrake sets the rear grip to
`hbRear` fast and gives it back at 5 per second. Below 3 m/s and in reverse the old kinematic model is used (blend 3 to 6 m/s).
Recovery: with the stick released and the rear past its peak, rear and front floors rise to 0.97/0.95 and yaw is damped; yaw rate is
capped by `yawMax`; steering that would wind a rear slide up closes down (never below 30 percent), countersteer is free.
Steering: keys ramp (rate falls with speed, centring is faster at speed); a stick (any fractional value) follows quickly and may
use a larger angle (2.0 x the peak slip angle against 1.15 for keys). Lock falls with speed (`steerRef`), capped by the calm yaw
rate cap (`yawCap`) and by what the tyres can use.

## The table (`HANDLING_CLASSES`, one row per class; `HANDLING_OF` maps types; `HANDLING_OVERRIDES` per type)

| field | what it does |
|---|---|
| wheelbaseFrac, weightFront, hcg, yawK | wheelbase / length; front weight share (above 0.5 pushes); centre of mass height (m, load transfer); yaw inertia = yawK m a b |
| muF, muR, peakF, peakR, floorF, floorR | peak friction per axle; slip angle (deg) of peak grip; grip when sliding as a share of peak. Rear mu above front = understeer at the limit |
| loadSens, rollBias | grip cost of lateral load transfer; share paid by the front axle |
| brakeBias, abs | front brake share; ABS (false: rear can lock) |
| engineBrake, gears, gearFeel, shiftCut, tractionBoost | coast decel; torque saw-tooth per gear and shift pause; drive traction as a multiple of grip |
| hbRear | rear grip factor with the handbrake on |
| steerRef, steerRate, yawCap, yawAccel, yawMax | speed (m/s) at which lock halves; key steering rate; calm yaw-rate cap scale (how tight a class turns at 30 to 60 km/h); low-speed yaw acceleration; yaw rate cap |
| rollGain, pitchGain, rollMax, pitchMax, springK, springC | visual body roll and pitch per m/s^2, caps, spring stiffness and damping |

Classes: compact, hotcompact, sedan, bigsedan, limo, muscle, sports, supercar, suv, bigsuv, pickup, van, truck, heavy, bus.

## Measurements (headless, `tests/unit/entities/handlingMeasure.ts`; full table: `HANDLING_REPORT=<file> npx vitest run tests/unit/entities/handling-report.test.ts`)

Before (old model) against now, sedan: 0-93% top speed 6.2 s / 6.4 s; stop from 20 m/s 14.8 m / 15.9 m; handbrake turn at 15 m/s 60 / 78 degrees;
side slip at 0.7 steer, 20 m/s now about 2 m/s (was none). Stop from 20 m/s: supercar 11.7 m, coupe 13.9, sedan 15.9, SUV 16.9,
cargo van 18.6, box truck 19.3. Roll at 17 m/s full lock: coupe 3 degrees, sedan 4.7, SUV 5.7, box truck 6.1. A wet road (0.7) stops
27 percent or more later. These are from a headless simulation, not from playing it.

## Tests

`tests/unit/entities/handling-model.test.ts` (rest, clean stop, reverse, braking by class and wet, load dip and squat, corner limit and
understeer, class order, 90 degree corner, roll, lift-off, drive layout, handbrake turn and rear grip, spin recovery, key ramp, stick,
the switch, kerb strike), `ai-trajectory.test.ts`. Three older tests were retuned to the slip-angle tyres (`vehicle.test.ts`: side
slip 2.5 m/s, handbrake window 0.8 s).

## Not done

* New vehicle types, new geometry (wheel arches, interiors, lamps), paint and wear: not started; the 37 existing bodies are unchanged.
  Adding a type means entries in about ten files (types, specs, carBodies, carLook, carModel, vehicleSkin, audio tables); proposal below.
* Tyre smoke and skid marks: `Vehicle.slip`, `handling.wheelspin`, `handling.lockup` are there for an effect to read; no effect drawn.
* Reverse lights: no lamp meshes for them in the model.
* The driving camera: no change. Suggest the camera lifts 1 m and widens 5 degrees with speed.
* Kerb bob needs `setGround` (done at boot per map); tested with a stub ground only.

## Proposed types (not built; specs and handling class for whoever builds them; shares are suggestions for TrafficSystem)

| type | class | length x width x height | mass | maxSpeed | accel | traffic share | parked weight |
|---|---|---|---|---|---|---|---|
| hearse | bigsedan | 5.9 x 2.0 x 1.55 | 2300 | 28 | 6.5 | 0.003 | 0.3 |
| schoolbus | bus | 10.6 x 2.45 x 3.2 | 9500 | 17 | 1.8 | 0.004 | 0.2 |
| towtruck | truck | 6.6 x 2.3 x 2.6 | 5200 | 22 | 3.5 | 0.005 | 0.4 |
| flatbed | truck | 7.0 x 2.4 x 2.5 | 4800 | 21 | 3.2 | 0.006 | 0.5 |
| foodtruck | truck | 6.0 x 2.2 x 2.9 | 4000 | 20 | 3.2 | 0.006 | 0.8 |
| sweeper | heavy | 6.8 x 2.5 x 3.0 | 11000 | 12 | 1.6 | 0.003 | 0.1 |
| bucket truck | truck | 7.4 x 2.5 x 3.4 | 8500 | 19 | 2.6 | 0.004 | 0.2 |
| motorcycle | needs a two-wheel model (lean, no yaw-grip pair): not feasible in this lane; say so |

Two-wheelers (moped, e-bike) need their own handling model and rider animation; the table above does not cover them.

## HANDLING3 (Odell Pryce, 21 Nov): keyboard feel, handbrake, pursuit

Status: current. Nobody has driven this by hand; all numbers are from headless simulation.

Findings on arrival (HANDLING2 had left one uncommitted-looking edit in `handling.ts` and a scratch test):
* The edit is right and kept: the slide assist closed the steering to about 80 percent inside the kinematic blend (3 to 6 m/s), because the
  "rear slip angle" b r / u of an ordinary tight turn is large there without any slide. With it, `driving-feel.test.ts` and `pursuit.test.ts`
  were already green (the 32 and 54 degree turns and the pursuit rams came from this one cause: the junction speeds had a steering that was
  closed by the assist; the fleeing scripted driver steers by the raw lock and lost its turning circle). No test driver was changed.
* `pursuit.test.ts` "three stars, player flees" takes 30 to 40 s on this loaded box and trips vitest's 30 s default: run it with
  `--testTimeout=180000`. Not a physics failure.
* The real remaining red was the handbrake: a locked rear axle has almost no side force, and the bicycle model alone only turned the
  velocity along with the nose (3 degrees of slip after 0.5 s dry, 1.7 wet). The wet path was not wrong, just the same missing yaw moment.

Changes (all in `src/entities/handling.ts`):
* `HB_ROTATE` = 8.5 rad/s^2 yaw moment while the handbrake is held with the wheel turned, in proportion to how far the rear has let go (`hbK`),
  to the wheel, to speed (full above 8 m/s), and to the class (`(yawAccel - 2) / 5`, so a sedan 1.0, SUV 0.7, van 0.5, truck 0.3, bus 0.08:
  a bus does not drift). It fades out as the yaw nears `yawMax`, so the cap holds (pony stays under its cap).
* Slide assist is off while the handbrake is on (`hbK >= 0.5`): a hold is a slide, the assist only protects the normal drive.
* Recovery yaw damping 2.8 -> 4: release straightens in about 1 s (was 1.1 to 1.2 s once the slide was real).
* Key return to centre: `STEER_RETURN_MULT` 1.6 x (1 + u/12) -> 1.0 x (1 + u/24). A tap now returns in about 0.17 s instead of 0.04 s
  (`vehicle.test.ts` "steering is rate limited" needs a visible return; the old return was a snap).
* Tyres: `BASE` muF 1.05 -> 1.10, muR 1.20 -> 1.24 (sedan holds 50 km/h full lock a little tighter). SUV, bigsuv, pickup and van `yawCap`
  +0.1 (they turned 54 to 49 degrees in 2 s at 30 km/h against 65 to 66 in the old model; now 59 and 53).
* Deleted the scratch test `h2dbg.test.ts`. Kept `handling2-measure.test.ts` (it writes the table below to `$OUT`).
* No test assertion was changed. `Vehicle.aiHandling` stays false; `ai-trajectory.test.ts` green.

Table (headless; 2 s of held full lock with throttle holding the speed; steady radius = 30 km/h full lock; handbrake = 60 km/h, half lock, 0.5 s hold; stop from 72 km/h):

| type | model | turn 2 s @30 | turn 2 s @50 | radius @30 (m) | handbrake slip dry | wet | settles after release (s) | stop 72 (m) |
|---|---|---|---|---|---|---|---|---|
| sedan | old | 66 | 79 | 12.8 | 25 | 13 | 0.60 | 14.8 |
| sedan | new, before | 64 | 70 | 13.3 | 3 | 2 | 0.67 | 15.7 |
| sedan | new, now | 65 | 72 | 13.2 | 20 | 20 | 1.00 | 15.7 |
| hatch | old / before / now | 67 / 71 / 71 | 83 / 76 / 76 | 12.8 / 12.2 / 12.2 | 27 / 7 / 23 | 14 / 4 / 21 | 0.65 / 0.82 / 1.03 | 14.9 / 16.6 / 16.6 |
| SUV | old / before / now | 66 / 54 / 59 | 75 / 55 / 56 | 12.8 / 15.4 / 14.0 | 22 / 2 / 14 | 12 / 1 / 13 | 0.57 / 0.02 / 0.92 | 15.2 / 17.3 / 17.3 |
| cargo van | old / before / now | 65 / 49 / 53 | 72 / 48 / 49 | 12.9 / 16.5 / 15.0 | 18 / 1 / 8 | 11 / 0 / 9 | 0.48 / 0.02 / 0.77 | 18.2 / 19.6 / 19.6 |
| bus | old / before / now | 35 / 32 / 32 | 37 / 28 / 28 | 21.8 / 21.7 / 21.7 | 2 / 1 / 1 | 3 / 1 / 1 | 0.02 / 0.02 / 0.02 | 18.6 / 19.5 / 19.5 |

Reading it: the sedan now turns within 10 percent of the old model at 30 km/h and about 9 percent less at 50 (the tyres, not the key rate,
bind there: about 0.9 g). SUV and vans stay a little wider than before, on purpose (weight). Settling 1.0 s is the time for the slip to fall
under 3 degrees after the handbrake is released; the car is pointing straight before that. Stop distance is unchanged by this lane.

Not verified: any in-game drive, a gamepad, real keyboard timing. Stick steering code was not touched, only the key return rate.
