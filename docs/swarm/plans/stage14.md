# Stage 14 plan (user direction, 11 Nov): teams, order, gates

Goal: AAA-feeling native apps (Mac Apple Silicon, Windows) and the best web build we can make; phone build stays limited.
Area: Bed-Stuy and Bushwick first; Williamsburg and a corner of Ridgewood later; Queens much later; most of south Brooklyn never.

## Rules that do not change
- Fan tribute, non-commercial. Original or openly licensed assets only (CC0, CC-BY, CC-BY-SA with credit rows in docs/CREDITS.md and a LICENSE file per set).
- No Google Maps / Street View pixels or data in the repo (their terms forbid it). Street-level reference comes from open sources:
  Mapillary and KartaView (CC-BY-SA), Wikimedia Commons, NYC open data (MapPLUTO, building footprints, street centerlines), NYC Municipal Archives where the licence allows.
- No game assets. GTA, Yakuza, Saints Row are style references only: study the look, make our own.
- Radio: SoundCloud only through its official player; internet radio only as public stream links; real artist and show names shown.
- Single-file artifact stays ≤ 12 MB: everything heavy is hosted-only or native-only and loads lazily.
- Only Fable edits src/main.ts. Lanes never use git stash, never commit, keep src/ compiling, one render job at a time.

## Phase 0: stabilise (blocks publishing, not the other teams)
- Find the cause of the page crash in the combined build (probe queued).
- SIMFIX: seven red traffic/sim tests.
- PERF2: low tier back to budget after the northern rows, trains and new cars (measure first).
- Then full gate, publish web + artifact, tag a native build.

### The release gate: `scripts/gate.sh` (ENGINE owns it)
Run it from the repo root before every publish. It prints one table and exits 0 only when every row is PASS. It exits 1 on any FAIL, and 2 when steps were skipped (`--skip-render` is a quick pre-check and never a release). Each step writes a log to `--logs <dir>`; the default is a fresh temp dir, and the table prints the path.

| Step | Command | Pass when |
|---|---|---|
| tsc | `npx tsc --noEmit` | no error under `src/` (errors under `tests/` are counted and shown, not failing) |
| vitest | `npx vitest run --maxWorkers=2` | summary has no failed tests |
| build | `npm run build` | single-file `dist/` builds |
| artifact | `node scripts/make-artifact.mjs` | `dist/artifact.html` ≤ 12 MB |
| hosted | `VITE_HOSTED=1 vite build --outDir dist-hosted` | hosted build (web and native payload) builds |
| size | `scripts/artifact-breakdown.mjs` (source-mapped hosted build in the log dir) | informational: top three categories in the table, the full breakdown in `size.log` |
| native | `npm --prefix native test` | Electron shell tests green |
| smoke | `tests/e2e/smoke.mjs` on `dist/` (render lock) | WebGL2 up, `errors: []` |
| gameplay | `scripts/playtest/live-gameplay.cjs` on `dist-hosted/` (render lock) | every check PASS, no crash |
| perf | `scripts/perf-breakdown.mjs --dist dist --q phone,low,medium` (render lock) | triangles and draws ≤ `TIER_BUDGET` at views 1, 4 and 10 for each tier |

The browser steps go through `scripts/swarm-render.sh` one at a time, so on a busy box the gate waits for a slot. Expect 20 to 40 minutes in total. To change tiers, pass `--tiers phone,low,medium,high`.

## Teams
| Team | Lead model | Lanes | Scope |
|---|---|---|---|
| MAP | opus (design lead) | MAPLEAD, then workers | Real Brooklyn street geometry (curves, diagonals, Bushwick's rotated grid) from NYC street centerlines; +20 blocks toward Bushwick; map screen showing real Brooklyn with built streets lit and the rest dark |
| ENVIRONMENT | sonnet + haiku fetchers | ENV14 | Building accuracy per lot; textures from licensed street photos; more real surface detail |
| CARS | sonnet | CARS14 (after CARFIXUP) | Sports cars, electric wedge pickup parody, per-type handling |
| CHARACTERS | sonnet | CHAR14 | Realistic clothing (no letters or logos like "BK"), fix hijab/seams/hems, people talk to each other and react |
| SOUND | sonnet | RADIO15, SFX14, (VOX follow-up) | 15 stations (2 talk, one 80s; Dekmantel, Boiler Room, RA sets; internet radio streams); distinct engine and horn per vehicle; ped voices |
| CONTROLS/UI | sonnet | CONTROLS14, UI14 (after MENU) | Camera view shortcuts and swap, jump, iPhone-style phone, GTA 5 style loading screen with load bar |
| QA | haiku | PLAYTEST | Re-run after each team lands |

## Order
1. Now: MAPLEAD (design + data pipeline), RADIO15, SFX14, CHAR14, ENV14, CONTROLS14; CARS14 starts when CARFIXUP posts FINAL; UI14 when MENU posts FINAL.
2. When MAPLEAD's design is accepted: map workers (road mesh, traffic graph, lots, culling) on a branch-free feature flag (`?map=real`) so the grid map keeps working until parity.
3. PLAYTEST after each landing; full gate; publish.
