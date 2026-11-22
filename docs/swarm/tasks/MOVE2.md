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

## Findings (kept current below)
