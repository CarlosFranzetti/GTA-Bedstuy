# AUDIOFIX (22 Nov 2026): stuck engine, silent radio, engine level, Engine sound setting

Status: in progress. Notes kept current as the work goes.

## Owner report
"some radio station issues (sometimes it wont play) and the car engine sound gets stuck, starts to loop and stutters; engine
should be 45% lower by default and an option in settings to turn engine off."

## Found so far (reading, not yet proven)
- Player engine voice = `EngineNodes` in `src/audio/vehicle/nodes.ts`, owned by `VehicleAudio`. It is created when a type is set
  and keeps ~20 oscillators running even on foot. `main.ts` passes `type = player.vehicle?.spec.type ?? null` every frame.
- `EngineNodes.apply` writes `lim.gain.setTargetAtTime` every frame with no change check (others use `aim`).
- `retire()` zeroes `acc.gain`, nothing ever raises it again.
(to be confirmed by the harness below)
