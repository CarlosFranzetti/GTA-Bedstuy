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
