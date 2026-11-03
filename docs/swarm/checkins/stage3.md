# Stage 3 check-in: the playtest loop

Written by the Opus manager (MGR) on 3 Nov 2026 at about 07:00Z. Stage 3 ran from 1 Nov 15:14Z to 3 Nov 06:45Z, with a gap of
roughly 35 hours after the account usage limit cut the swarm off on 1 Nov at about 19:20Z. Every review cited here is in
`transcript.md` (search `MGR review of`); the readable narrative for the user is `transcript-readable.md`.

## 1. Summary

The stage started with one bug from the user, **"I cannot get out of the car"**, and a new idea: let blind testers play the
game while a recording shows what they are thinking. Both landed. The car bug turned out to be a family of timing bugs that only
appear on slow machines, and it is fixed and confirmed in play: the first blind tester pressed F to get out three times on the
slow software renderer and it worked on the first press every time. The recorded playtest harness works and produced two
sessions with video and a subtitled transcript of the tester's thoughts; those sessions found one more serious enter/exit bug
(a parked car being shoved fourteen metres across the avenue), which is also fixed, and a list of fourteen defects and confusions
that now seed Stage 4.

Along the way the user widened the stage twice. On 1 Nov they asked for a phone tier, free car and character models, a radio
that plays their own music in eight genre stations plus an original talk show, and a "GTA 5 as the bible" design reference. On
3 Nov they asked for GTA 4/5-level graphics, real buildings from map data, GTA-style missions with a DJ storyline, interiors and a
SoundCloud station. The first wave is finished and reviewed. The second wave started at 06:32Z on 3 Nov and is still running;
it is recorded here as Stage 4 work already in flight.

Twenty-one lanes posted work this stage. Sixteen are reviewed and accepted (one with no report), one blind tester finished, one
was cut off mid-session, and six lanes are still running (H3, DRIVE, GFX, CLUTTER, MISS2, CLUB).

## 2. Per-agent outcomes

| id | lane | result |
|---|---|---|
| V1 | vehicle-exit-bug | ACCEPT. Root cause: the F key's "just pressed" flag lasted for every simulation step of a drawn frame, so on a slow frame the game got you out on step one and back in on step two. Fixed with `Input.consume()` for F, E, R and X; also fixed the gamepad A button being erased before it was read, a second F during the walk to the door being ignored, and a claimed rolling car coasting away. Later fixed the P1 from the playtests: walking to the far-side door slid the player's body through the car's box and shoved the parked car 14 m; the body now leaves physics when the walk starts (`main.ts:215`). Browser run 28/28 (keyboard, touch, gamepad, walls, neighbouring cars, after the pause menu, far side). Open: exit always uses the driver's side with no free-spot search. |
| PT | playtest-harness | ACCEPT. `scripts/playtest/session.mjs` + `docs/PLAYTEST.md`: turn-based sessions (game paused while the tester thinks), durations in game time, per-step frame + state JSON with plain-language directions to nearby things, subtitle bar burned into the video, webm/mp4 and a readable transcript. Bug PT-1 (actions cut to about half length under load) found by MGR from H1's step counts and fixed by Fable. Open: the subtitle blinks off while each screenshot is taken (88 % of running time covered) and covers the street name. |
| L10 | lighting-3 | ACCEPT. Shop glazing had shared the apartment windows' night glow and lit a whole shopfront like a cream wall; capped to 0.35/0.28. Night spawn view 0.240 → 0.127 (21h) / 0.130 (0h), inside the 0.085–0.13 band, blown ≤ 0.08 %. GTAO fringe proven to be the AO pass itself, not the proxies. Open: 0h sits on the band's upper edge; hour 7 and car/aerial baselines still missing. |
| W2 | world-fixes | ACCEPT. Areaway fences now collide (gaps kept at the stoop foot and basement door); avenue faces thinned to 3–5 shop lots each (MGR counted all 24 Tompkins/Throop/Garvey faces); granite curb texture applied. Open: Lafayette N and Greene S between Throop and Garvey still 10–11 shops of 30. |
| MOB | phone-tier | ACCEPT. New `phone` tier, automatic on touch: 83–114 draw calls and 259k–425k triangles on all seven viewpoints (low: 226–271 and over 1 M). MGR caught that it hid the fences W2 had just made solid (invisible walls); Fable restored fences and roll gates on phone. Open: two viewpoints now look into a brick wall after W2's density change; no headless frame-time comparison. |
| MDL | models-research | ACCEPT. Six CC0 models (Kenney cars, Quaternius characters) with licence evidence from a repackager's NOTICE plus a verified Quaternius LICENSE.txt. |
| MDLI | models-integrate | ACCEPT, no report (reviewed from disk). Cars fitted to our vehicle sizes with round wheels, synthesised head/tail lights, plates and a cop light bar, paint-only recolour; characters 1.75 m with Idle/Walk/Run; 94 glTF tests pass. |
| MDL2 | models-research-2 | ACCEPT for people (five Quaternius UAC civilians, CC0 verified at source). No reachable CC0 realistic car exists; CC-BY CarConcept and an unverified Ferrari held. Warning: all five characters would push the artifact to about 16 MB. |
| RADIO | radio-library | ACCEPT. Eight library stations with exactly the requested slots (147 in total) plus WBSY Talk; the user's own files only, picked at runtime; no audio in the repo; storage wrapped in try/catch; talk show read by speech synthesis. Open: DJ chatter, time-of-day programming, muffled radio outside the car, loudness matching. |
| WRITE | talk-show-writer | ACCEPT. 22-minute original script (1325 s, 57 segments, 3288 words), no real brands or people. |
| RADIO2 | radio-sc | ACCEPT. Radio SC through the official SoundCloud widget only, 8-second fallback to the procedural bed, nothing bundled. Optional wiring to the game clock recommended. |
| MUSIC | music-research | ACCEPT as research. Only AI-generated CC0 lo-fi is reachable; the user's own files stay the main source. |
| BIBLE | design-bible | ACCEPT. `docs/reference/BIBLE.md`: the yardstick "would someone want to live in this Bed-Stuy for a day?" with five properties and a ranked 15-item gap list; folded into PRD §1. |
| GEO | real-buildings-import | ACCEPT. OSM/PLUTO → `bedstuy.json` pipeline tested on a synthetic fixture; real import waits for the data hosts to be allowed. Map origin and PLUTO id are from memory and must be checked. |
| SCRIBE | scribe | ACCEPT. Readable English narrative of the whole project; needs one more pass to cover the end of this stage. |
| H1 | blind playtester, on foot | Done (rerun h1c, 32 steps, after a first run cut at 10 steps by a shell time limit). Findings in §4. |
| H2 | blind playtester, driver | Partial: cut off by the usage limit at step 23; findings relayed by Fable. |
| H3 | blind playtester, chaos/cops | Not run yet; waits behind V1's teleport fix, which is now in. |
| DRIVE, GFX, CLUTTER, MISS2, CLUB | Stage 4 lanes opened 3 Nov 06:21–06:40Z | Running; PRD rows written; not reviewed. Their in-progress work currently breaks 7 tests (see §6). |
| Fable | orchestrator | Board, all shared-file relays (radio wiring, R/X consume, phone fence fix, harness fix, `setWeather` for GFX), render lock, commits, artifacts v8/v9, H1–H2 launches. |

## 3. The roundtable (1 Nov)

At the user's request MGR asked every lane six questions in plain English. Nine lanes answered. The shared conclusions, and the
decisions drawn from them: a day in Bed-Stuy is made of small repeating moments tied to the clock (lamps coming on, gates coming
down, stoop sitting), so Stage 4 builds a day schedule and ambient events first; the camera needs a look-back, a corner lag, a
cinematic view and a mission letterbox; the phone tier is the same game made smaller, with lamps and sky carrying the time of day;
the radio should feel like tuning a station, not pressing shuffle; missions are funny when a very serious tone meets a very small
stake and the fail line beats the win line; and almost every lane named the overloaded machine as its hardest problem, which led
to the shared render lock.

## 4. What the blind testers did and thought

**H1, the on-foot explorer**, started at dusk on Throop Avenue and enjoyed it: it read the neon OPEN and EBT signs aloud, liked the
Corner Store with its blue roll-down shutters, peered down a dark basement stair, and walked up to a parked police car "to see
whether it bothers me". It looked for people and found none; at one point it walked towards "a person in a red top" that turned
out to be a red parked car. Its mood changed when it took a car: it pressed F once and was "suddenly sitting inside the red sedan
and it is already rolling", then spent six steps pressing every key in a car that would not move, concluding "the whole row of
cars along this block is nose to tail, so none of them can drive off". Getting out worked first time, three times out of three.
It ended wedged between parked cars and a box truck, unable to walk free.

**H2, the driver**, "wanted a car fast" and had one in two steps, but was seated fourteen metres away in the middle of the avenue
(the P1 V1 later fixed). It then fought the car: the speedometer "still says zero" after moving eight metres, a turn "spun the
SUV almost all the way around", and the car kept ending up on the sidewalk against a shop front, a tree and a stoop. It searched
for a mission for fifteen steps and gave up because "the minimap shows only little yellow dots". It finished by ramming parked
cars on purpose "to see whether the cops notice"; nobody did. It liked switching radio stations and the horn.

### Defects table (posted as `MGR: playtest triage`)

| id | severity | owner | what and where |
|---|---|---|---|
| PT3-1 | P1 → fixed | V1 | Entering a parked car shoved it 14 m across the avenue (s6 steps 5–6, h2 steps 1–2). Fixed 3 Nov 06:45Z. |
| PT3-2 | P2 | traffic/world | Parked cars stand nose to tail with ~20 cm gaps, so a parked car cannot be driven out (h1c 15–21, step-17.jpg). |
| PT3-3 | P2 | world/physics | On foot, wedged between parked cars and the box truck for eight steps (h1c 24–32). |
| PT3-4 | P2 | DRIVE | Cars mount the sidewalk easily and hang on curbs, trees, stoops, shop fronts (h2 7, 12, 15–19, 23). |
| PT3-5 | P2 | DRIVE/MISS2 | Missions are not findable; minimap dots not recognised (h2 13–18). |
| PT3-6 | P2 | world/ambient | The street feels empty of people at dusk (h1 0–10, h1c 10–11). |
| PT3-7 | P3 | DRIVE | Ramming parked cars and pavement driving raise no wanted level (h2 20–23). |
| PT3-8 | P3 | DRIVE/PT | Speedometer reads 0 in screenshots right after moving (captured after key release). |
| PT3-9 | P3 | V1 | F next to a rolling car seats you in a moving car (h1c 15). |
| PT3-10 | P3 | models/traffic | Traffic cars have a driver but none is visible (h1c 3–4). |
| PT3-11 | P3 | camera | Camera does not fade a vehicle right in front of the lens (h1c step-26.jpg). |
| PT3-12 | P3 | world | A dark square on the sidewalk reads as a hole (h1c 11–13). |
| PT3-13 | P3 | UX/CLUB | Shop doors look enterable but give no feedback (h1 8–10, h1c 7). |
| PT3-14 | P3 | DRIVE | Steering twitchy, car spins at low speed (h2 6–7, 16, 21). |
| PT-1 | fixed | PT/Fable | Harness cut actions to about half length under load. |

Confirmed working in play: exit with F (3/3), enter with F, radio with E, horn, crosswalks and signals, minimap street names, night signs.

## 5. Acceptance against PRD §5.4

| row | status | evidence |
|---|---|---|
| Global gates (Stage 3 tree, 1 Nov 18:17Z, ab689e1) | MET | tsc clean; vitest 81 files / 1413 pass / 2 todo; build ok; artifact 8.18 MB; smoke `errors: []` at low (239 draws) and medium (274 draws) |
| Global gates (current tree, 3 Nov 06:50Z, a5635c9 + uncommitted Stage 4 work) | NOT MET | tsc clean, build ok, artifact 9.51 MB, but 7 failing tests in 4 files from running lanes (§6); smoke blocked by the render lock |
| V1: exit from F, touch and gamepad | MET | unit tests per input path; browser run 28/28 |
| V1: 100 % of 50 headless attempts | MET in substance | 28/28 (not 50) on an overloaded machine, plus 3/3 in blind play |
| V1: never inside a collider; fallback when both doors blocked | PARTIAL | outside the footprint in every run; no free-spot search or refusal |
| PT: webm + thoughts transcript; ≥ 95 % steps subtitled | MET | 12/12 validation steps, h1c 32 steps; subtitle on screen ~88 % of running time |
| PT: command-file protocol, state export | MET | `docs/PLAYTEST.md`; per-step state JSON |
| L10: night spawn 0.085–0.13; blown < 0.5 % | MET | 0.127 / 0.130; ≤ 0.08 % |
| L10: GTAO artefact explained | MET | A/B with proxies off |
| L10: Stage 3 baselines incl. hour 7, car, aerial | PARTIAL | street/shops/signals only, in a Stage 3 section of stage2.md |
| W2: fences block peds | MET | collider tests |
| W2: 3–5 mixed lots per avenue face | MET | all 24 avenue faces counted |
| W2: graniteCurb applied | MET | tests + screenshots |
| MOB: ≤ 120 draws, ≤ 500k triangles on 7 views | MET | 83–114 / 259k–425k |
| MOB: headless frame time ≥ 2× faster than low | NOT MEASURED | machine load; real phone is the user's check |
| MDL / MDL2: ≥ 4 cars + ≥ 2 characters, licences | MET for MDL; MDL2 people only | no reachable CC0 realistic car |
| MDLI: models load, lights, artifact ≤ 12 MB | MET | 94 tests; artifact 8.18 → 9.51 MB with later lanes |
| RADIO: 147 slots, own files, no audio in repo | MET | station table, git check |
| WRITE: 1320 ± 30 s, no real brands/people | MET | 1325 s, 0 hits |
| RADIO2: official widget only, fallback | MET | 55 tests |
| GEO: pipeline, validator 0, no Google data | MET (fixture); real data DEFERRED | hosts blocked |
| BIBLE: checkable targets | MET | folded into PRD §1 |
| H1–H3: recorded sessions + reports | PARTIAL | H1 done, H2 partial, H3 not run |
| MGR: defects table | MET | posted, §4 |
| DRIVE, GFX, MISS2, CLUB, CLUTTER | IN PROGRESS | Stage 4 |

### Graphics ladder (new, PRD §5.4)

Judged on MOB's seven low-tier frames and the medium smoke frame: **not yet GTA3**. Night street views pass most GTA3 items
(textured surfaces, real car models with lights, lit windows and signs, fog at the edge). They fail on the aerial view, where the
row houses' side walls are large flat tan surfaces and the tar roofs repeat one blotch pattern; on sidewalk props, which are sparse;
and on people, who are rarely seen at street level. CLUTTER and GFX are working directly on these.

## 6. Open issues

1. **Seven failing tests on the current tree**, all in running lanes: `mission_content.test.ts` (MISS2: expects three missions, sees
   sixteen), `props.test.ts` mesh cap 16 > 15 (CLUTTER), `pursuit.test.ts` ×2 and `traffic-5min.test.ts` ped knock-down (DRIVE's
   crime and steering area). Must be green before the next commit that claims a stage.
2. Parked cars nose to tail (PT3-2) and the on-foot wedge (PT3-3): parked-car spacing of about 1 m and low-speed pivot steering.
3. Exit has no free-spot search or refusal when the driver's side is blocked (V1 row).
4. H2 cut off at step 23 and H3 not run: the chaos/cops playtest is still owed, now on the fixed build.
5. Realistic cars blocked by licensing and network: the user can allow-list kenney.nl, quaternius.com, poly.pizza, or supply licensed models.
6. Artifact budget: 9.51 MB now; adding all five MDL2 characters would reach ~16 MB. Hosted-only or meshopt for heavy models.
7. Real map data blocked: overpass-api.de, openstreetmap.org, data.cityofnewyork.us. GEO's origin and PLUTO id need checking on the first import.
8. Light baselines still lack hour 7 and car/aerial rows; night spawn sits on the band's upper edge.
9. Two screens.mjs viewpoints (noon-corner, night-corner) look into a wall after the density change; move the camera.
10. Harness: subtitle blinks off during screenshots and covers the street name; speedometer captured after key release.
11. Lafayette N / Greene S faces still very commercial; Street View pass with the user's screenshots.
12. Leftover scratch test `tests/unit/game/_dump.test.ts` broke tsc earlier; currently clean, but scratch tests must stay out of `tests/`.
13. GEO's three FOR FABLE items (facadeTexture field, facade mapping, ODbL credit) and RADIO2's game-clock wiring are pending.

## 7. Stage 4 list

1. Finish and review the running lanes: DRIVE (steering, crimes, mission pointer, speed), GFX (GTA3 then GTA4 ladder items with
   before/after frames of the seven viewpoints), CLUTTER (props, decals, wires within budget), MISS2 (BIBLE-template missions, side
   quests, DJ storyline, phone texts), CLUB (interiors, inventory, DJ mini-game).
2. Run H3 (chaos/cops) and a full H2 rerun on the fixed build; one tester on `?q=phone`.
3. Day schedule and ambient life (BIBLE gaps 1, 4, 9): hourly crowd and traffic curve, stoop sitting, ambient events every ~30 s; visible drivers in traffic cars.
4. Parked-car spacing and low-speed manoeuvring; exit free-spot search.
5. Camera: look-back, corner yaw lag, fade of near vehicles, cinematic view, mission letterbox.
6. Radio: DJ handoffs, dayparting, muffled outside the car, loudness matching; Radio SC on the game clock.
7. Ship one or two MDL2 characters in the artifact, the rest hosted; realistic cars when hosts or user models allow.
8. Real-data import once the hosts are allowed; the user's facade photos through `photo-to-facade.py`.
9. Tooling: move the two blocked viewpoints, complete the light baselines, raise vitest timeouts under load, harness subtitle crop.

## 8. Process notes

- **The render lock** (`scripts/swarm-render.sh`, added 1 Nov ~15:50Z) was the most important process change. Before it, several
  software-rendered Chromium instances at 2.6–4.8 GB each pushed the 16 GB box to a load average near 30 and killed PT's first three
  validation runs. After it, playtests ran one at a time and finished. Its cost is waiting: a playtest holds the lock for its whole
  session, so my final smoke run could not get it within 30 minutes.
- **Usage-limit cutoffs**: the swarm stopped on 1 Nov at about 19:20Z in the middle of H2's session; H2's harness ended on its idle
  timeout and kept a partial video and transcript. The container restarted before 3 Nov 06:20Z with the working tree intact and committed,
  and Fable resumed lanes from their transcript posts, as in Stage 2. Two lanes had shell-time issues: H1's first run hit a
  30-minute background-shell limit, fixed by splitting sessions and a 2-hour limit.
- **Silent lanes**: MDLI finished its code but never posted a report and did not answer nudges; it was reviewed from disk. Messages
  to V1 once reached PT's session instead; Fable resent them.
- **The roundtable** produced no answers until Fable relayed the questions into each session: broadcast questions in the transcript
  do not register as tasks for busy workers.
- **Playtesting found what tests did not**: the half-length harness actions and the 14 m shove were both found by reading the testers'
  step counts and positions against what they said they did. Reading a blind tester's thoughts next to the state file is a strong
  debugging tool and should stay part of every stage.
- **Scope**: the stage grew from four lanes to twenty-one. Closing it at V1's fix and carrying the 3 Nov lanes into Stage 4 keeps the
  check-in honest about what is finished.
