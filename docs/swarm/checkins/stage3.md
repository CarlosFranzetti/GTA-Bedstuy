# Stage 3 check-in: the playtest loop

Written by the Opus manager (MGR) on 3 Nov 2026 at about 13:30Z. Stage 3 ran from 1 Nov 15:14Z to 3 Nov 13:30Z, interrupted twice by
the account usage limit (1 Nov ~19:20Z to 3 Nov 06:20Z, and again on the morning of 3 Nov). Every review cited here is in
`transcript.md` (search `MGR review of`); the readable narrative for the user is `transcript-readable.md`.

## 1. Summary

The stage started with one bug from the user, **"I cannot get out of the car"**, and one new idea: let blind testers play the game
while a recording shows what they are thinking. Both landed. The car bug turned out to be a family of timing bugs that only show up on
slow machines; it is fixed, and all three blind testers confirmed it in play by getting out of a car on the first press of F every
time they tried. The recorded playtest harness produced three sessions with video and a subtitled transcript of each tester's thoughts.
Those sessions found a serious second bug (entering a parked car shoved it fourteen metres across the avenue), which is also fixed and
re-confirmed by the third tester, and they found the single most frustrating thing in the game today: **cars that end up wedged at
0 km/h against nose-to-tail parked cars**. All three testers lost minutes to it, and the STUCK lane is fixing it now.

The user widened the stage twice. On 1 Nov they asked for a phone tier, free car and character models, a radio that plays their own
music in eight genre stations plus an original talk show, and "GTA 5 as the bible". On 3 Nov they asked for GTA 3 to GTA 5 level
graphics, buildings from real map data, GTA-style missions with a DJ storyline, interiors, a record shop, a club and a SoundCloud
station. Almost all of it is built and reviewed. The game now has sixteen missions, three interiors, a DJ mini-game, six pedestrian
models, wet-road reflections, an hourly film grade, crimes that bring the police, a findable mission pointer, a phone tier that
runs at under half the cost, and a radio with 147 slots for the user's own songs.

**Final gates** (§5): tsc clean and vitest fully green on HEAD 25001c6 (104 files, 1702 tests, 2 todo); build, artifact (9.58 MB of a
12 MB budget) and the headless smoke at low and medium (`errors: []`, 259 and 308 draw calls) green on 602fa63, the tree 30 minutes
earlier. Three lanes are still finishing (STUCK, WIRE, CLUTTER), and the graphics ladder is not yet at GTA3 (§6).

## 2. Per-agent outcomes

| id | lane | result |
|---|---|---|
| V1 | vehicle-exit-bug | ACCEPT. The F key's "just pressed" flag lasted for every simulation step of a slow frame, so the game got you out on one step and back in on the next. Fixed with `Input.consume()` for F, E, R and X, plus the gamepad A button and a second F during the walk to the door. Then fixed the playtest P1: walking to the far-side door slid the player's body through the car and shoved it 14 m; the body now leaves physics when the walk starts (`main.ts:215`). Browser run 28/28. Open: no free-spot search when the driver's side is blocked. |
| PT | playtest-harness | ACCEPT. Turn-based sessions (game paused while the tester thinks), per-step frame and state, subtitles burned into the video, readable transcript. PT-1 (actions cut to half length under load) found by MGR from H1's step counts, fixed. Open: subtitle blinks off during screenshots; mid-step state changes are not reported (PT3-15). |
| L10 | lighting-3 | ACCEPT. Shop glazing capped; night spawn 0.240 → 0.127 / 0.130 (band 0.085–0.13); blown ≤ 0.08 %; GTAO fringe explained. Open: hour 7 and car/aerial baselines. |
| W2 | world-fixes | ACCEPT. Areaway fences collide; avenue faces 3–5 shop lots; granite curb applied. |
| MOB | phone-tier | ACCEPT. Phone tier 83–114 draw calls and 259k–425k triangles on all seven viewpoints; fences and roll gates restored on phone after MGR caught invisible walls. |
| MDL / MDL2 | models research | ACCEPT. Kenney cars and Quaternius people, CC0, licence evidence quoted. No reachable CC0 realistic car. |
| MDLI / MDLI2 | models integrate | ACCEPT (MDLI reviewed from disk, no report). Cars with synthesised lights and paint recolour; six pedestrian models compressed to ~0.3 MB each; +19 draw calls at spawn; artifact 9.58 MB. |
| RADIO / RADIO2 / WRITE / MUSIC | radio | ACCEPT. Eight stations, 147 slots for the user's own files, WBSY Talk with an original 22-minute script, Radio SC through the official SoundCloud widget only, no audio bundled. |
| BIBLE | design-bible | ACCEPT. "Would someone want to live in this Bed-Stuy for a day?" with five properties and a ranked gap list; folded into PRD §1. |
| GEO | real-buildings-import | ACCEPT. OSM/PLUTO pipeline tested on a fixture; real import waits for the hosts to be allowed. |
| SCRIBE | scribe | ACCEPT. Readable narrative; needs a final pass for 3 Nov. |
| DRIVE | driving-feel-2 | ACCEPT. Player steering capped at low speed (two-second turn at 15 km/h: 88° → 49°), crimes for ramming parked cars and pavement driving, a pulsing mission blip with an on-screen pointer, speed from the car's real movement. Open: reverse speed shows no sign. |
| MISS2 | missions-2 | ACCEPT. Sixteen missions on the BIBLE template (six city stories, a four-chapter DJ storyline, three side quests), ten new objective kinds, fail jokes, phone texts; every mission has a success test and a fail-and-retry test. |
| CLUB | interiors-dj | ACCEPT. Wax Deli, Aftersloth (hidden, 23:00–04:00, after The Password) and the player's home; Inventory owning cash and records; shop; two-deck DJ game. Not yet seen in a real browser. |
| GFX | graphics-gta | ACCEPT (partial). Hourly film grade, wet-road reflections, haze, grain, contact darkening. Not done: car-paint reflections, neon bounce, four of seven after-frames. No final report found in the transcript. |
| TA2 | traffic deadlock | ACCEPT. Seed-21 intersection deadlock found and fixed at its cause; five-minute city test green on both seeds. |
| H1, H2, H3 | blind playtesters | H1 done (32 steps), H2 cut off by the usage limit at step 23, H3 done (30 steps). |
| STUCK, WIRE, CLUTTER | Stage 4 lanes | Running at close; PRD rows written; reviews carry over (§7). |
| Fable | orchestrator | Board, every shared-file relay, the render lock, commits, artifacts v8 to v12, playtest launches and video delivery. |

## 3. The roundtable (1 Nov)

At the user's request MGR asked every lane six questions in plain English. Nine lanes answered once Fable relayed the questions into
their sessions. The shared conclusions: a day in Bed-Stuy is made of small, repeating moments tied to the clock, so build a day schedule
and ambient events first; the camera needs a look-back, a corner lag, a cinematic view and a letterbox; the phone tier is the same game
made smaller; the radio should feel like tuning a station; missions are funny when a very serious tone meets a very small stake; and
almost every lane named the overloaded machine as its hardest problem, which led to the shared render lock.

## 4. What the blind testers did and thought

**H1, the on-foot explorer**, started at dusk on Throop Avenue and enjoyed it. It read the neon OPEN and EBT signs aloud, liked the
Corner Store's blue roll-down shutters, peered down a dark basement stair, and walked up to a parked police car "to see whether it
bothers me". It looked for people and found none, and once walked towards "a person in a red top" that turned out to be a red parked
car. Its mood changed when it took a car: it was "suddenly sitting inside the red sedan and it is already rolling", and then spent six
steps pressing every key in a car that would not move, concluding that "the whole row of cars along this block is nose to tail, so
none of them can drive off". Getting out worked first time, three out of three. It ended wedged on foot between parked cars and a box
truck.

**H2, the driver**, "wanted a car fast" and had one in two steps, but found itself seated fourteen metres away in the middle of the
avenue (the shove V1 later fixed). It then fought the car: a turn "spun the SUV almost all the way around", and the car kept ending up
on the sidewalk against a shop front, a tree and a stoop. It searched fifteen steps for a mission and gave up because "the minimap
shows only little yellow dots". It finished by ramming parked cars on purpose "to see whether the cops notice"; on that build nobody
did. The usage limit cut it off at step 23.

**H3, the chaos tester**, played after the morning's fixes. It wanted trouble: it ran for a parked SUV, rammed a parked sedan at
22 km/h, honked, and drove onto the sidewalk towards people while watching the corner of the screen for stars. They came, one at
step 14 and three at step 18, and at step 22 it wrote "a police car has now shown up right behind me, with a cop inside". It got out,
back in and out again on single presses, the stars decayed on foot, and it ended flipping through three radio stations. Its spawn SUV
stayed exactly where it was parked, which confirms the shove fix. It, too, lost eleven steps to a car stuck at 0 km/h after ramming a
parked car in the parking lane.

### Defects table (`MGR: playtest triage` and its H3 addendum)

| id | severity | owner | what and where | status |
|---|---|---|---|---|
| PT3-1 | P1 | V1 | Entering a parked car shoved it 14 m across the avenue (s6 5–6, h2 1–2) | fixed, confirmed by H3 |
| PT3-2 | P1 (raised) | STUCK | Car wedged at 0 km/h against nose-to-tail parked cars; cannot pull out (h1c 15–21, h3 13–23) | in progress |
| PT3-3 | P2 | STUCK | On foot, wedged between parked cars and a box truck (h1c 24–32) | in progress |
| PT3-4 | P2 | DRIVE/STUCK | Cars mount the sidewalk and hang on curbs, trees, stoops (h2 7–23) | partly fixed (steering); wedge assist in progress |
| PT3-5 | P2 | DRIVE | Missions not findable (h2 13–18) | fixed (pulsing blip + pointer), not yet playtested |
| PT3-6 | P2 | world/ambient | Sidewalks feel empty (h1, h1c 10–11; MDLI2 sidewalk frame) | open: variety solved, density not |
| PT3-7 | P3 | DRIVE | No wanted level for ramming or pavement driving (h2 20–23) | fixed, confirmed by H3 |
| PT3-8 | P3 | DRIVE | Speedometer 0 after moving (h2 2–9) | explained (real stops); readout now from body velocity |
| PT3-9 | P3 | V1 | F next to a rolling car seats you in a moving car (h1c 15) | open |
| PT3-10 | P3 | models/traffic | No visible driver in traffic cars (h1c 3–4) | open |
| PT3-11 | P3 | camera | Camera does not fade a vehicle in front of the lens (h1c step-26.jpg) | open |
| PT3-12 | P3 | world | Flat black square on the sidewalk reads as a hole (h1c 11–13; still in GFX and MDLI2 frames) | open |
| PT3-13 | P3 | UX/CLUB | Shop doors look enterable but give no feedback (h1, h1c 7) | partly addressed by CLUB's three interiors |
| PT3-14 | P3 | DRIVE | Twitchy steering, spins at low speed (h2 6–21) | fixed (steering cap) |
| PT3-15 | P3 | PT | Harness hides mid-step changes: H3's "F did nothing" was enter then exit inside one step (h3 9) | open |
| PT3-16 | P3 | DRIVE | Reverse speed has no sign (h3 18) | STUCK checking |
| PT3-17 | P3 | UX | Shift is sprint on foot but handbrake in a car (h3 21) | open |
| PT-1 | — | PT/Fable | Harness cut actions to half length under load | fixed |

Confirmed working in play: exit with F (every attempt by all three testers), enter with F, radio with E, horn, crosswalks and
signals, minimap street names, night signs, crimes and police response.

## 5. Acceptance against PRD §5.4

| row | status | evidence |
|---|---|---|
| Global gates | MET | tsc clean, vitest 104 files / 1702 pass / 2 todo on 25001c6; build ok, artifact 9.58 MB, smoke `errors: []` at low (259 draws) and medium (308 draws) on 602fa63 |
| V1: exit from F, touch, gamepad | MET | unit tests; browser 28/28; all three testers |
| V1: 50 headless attempts at 100 % | MET in substance | 28/28 on an overloaded machine |
| V1: never inside a collider; blocked-door fallback | PARTIAL | no free-spot search |
| PT: webm + thoughts transcript, ≥ 95 % steps subtitled | MET | three sessions; subtitle on screen ~88 % of running time |
| L10: night spawn 0.085–0.13, blown < 0.5 % | MET | 0.127 / 0.130; ≤ 0.08 % |
| L10: Stage 3 baselines incl. hour 7, car, aerial | PARTIAL | street/shops/signals only |
| W2: fences, 3–5 mixed lots, granite curb | MET | tests; 24 avenue faces counted |
| MOB: ≤ 120 draws, ≤ 500k tris on 7 views | MET | 83–114 / 259k–425k |
| MDL/MDL2/MDLI/MDLI2 | MET for people; cars PARTIAL | no reachable CC0 realistic car |
| RADIO, WRITE, RADIO2 | MET | 147 slots; 1325 s; widget only |
| GEO | MET on fixture; real data DEFERRED | hosts blocked |
| BIBLE | MET | PRD §1 |
| DRIVE | MET | steering numbers, crime tests, pointer, H3 confirmation of crimes |
| MISS2 | MET | 16 missions, success + fail/retry tests |
| CLUB | MET in tests; browser DEFERRED | 6 test files; not yet seen in a browser |
| GFX | PARTIAL | grade, wet reflections, haze, contact darkening; no car-paint reflections or neon; 3/7 after-frames |
| TA2 | MET | five-minute sim green on both seeds |
| STUCK, CLUTTER, WIRE | IN PROGRESS | rows written |
| H1–H3 recorded sessions and reports | MET (H2 partial) | h1c, h2, h3 |
| MGR defects table | MET | §4 |

## 6. Graphics ladder verdict

The ladder (PRD §5.4) is judged on the seven standard viewpoints. **GTA3 is not reached yet, but it is close.** Already true: textured
walls and roads, real car and pedestrian models with shadows, lit windows and signs at night, fog hiding the world edge, and since this
morning wet roads that reflect tail lights and shop light. Still failing GTA3: the golden aerial view shows long flat party walls and
identical tar roofs; noon sidewalks have almost no props and almost no people; the flat black square on the sidewalk is still visible;
and only three of the seven after-frames exist, so pop-in within 60 m is unchecked on the other four. CLUTTER's layer (bags, racks,
planters, posters, decals, wires, window AC units) is built and targets most of these.

**For GTA4, what is missing:** crowd density at street level (variety is there with six models, the numbers are not), clutter on every
block (pending CLUTTER), a check that LOD changes do not pop, and reflections on car paint. Per-hour grading, haze, lamp bloom, wet
reflections and contact darkening are already in. GTA5 items (volumetric light, ambient life by hour, detailed interiors in a browser)
are Stage 4 and later.

## 7. Open issues

1. STUCK, WIRE and CLUTTER finished their code but had not posted final reports at close; their reviews carry to the next MGR pass.
   STUCK's work directly addresses PT3-2 and PT3-3, the testers' biggest frustration.
2. CLUB's interiors, the DJ game and MISS2's DJ storyline have only been tested in unit tests; nobody has walked into the club in a
   browser yet.
3. Sidewalk density (PT3-6): the street still reads empty at noon.
4. Exit free-spot search; F next to a rolling car; visible drivers; near-camera fade; the sidewalk black square; reverse sign; Shift
   meaning two things (PT3-9 to PT3-17).
5. GFX's car-paint reflections, neon bounce and the four missing after-frames.
6. Realistic cars are blocked by licensing and network; the user can allow-list kenney.nl, quaternius.com and poly.pizza or supply
   licensed models.
7. Real map data blocked (overpass-api.de, openstreetmap.org, data.cityofnewyork.us); GEO's origin and PLUTO id to be checked on first import.
8. Light baselines still lack hour 7 and car/aerial; two screens.mjs viewpoints look into a wall after the density change.
9. Harness: report mid-step changes; subtitle blinks during screenshots; the mp4 dead-time cut (STUCK is fixing).
10. Some tests are timing-sensitive under machine load (one entity test, and the traffic sim while files were changing); keep an eye on flakiness.
11. Lafayette N and Greene S faces are still very commercial; the Street View pass with the user's own screenshots is still owed.

## 8. Stage 4 list

1. Review STUCK, WIRE and CLUTTER; then a fresh blind playtest round on the new build (one tester on `?q=phone`, one who goes into
   the record shop and the club, one who plays two missions start to finish).
2. Reach GTA3 on all seven viewpoints: clutter landed and measured, roof and party-wall variety, the sidewalk square fixed, all seven
   after-frames; then GTA4: crowd density by hour, LOD pop check, car-paint reflections.
3. Day schedule and ambient life (BIBLE gaps 1, 4, 9): hourly crowds and traffic, stoop sitting, an event every ~30 s, visible drivers.
4. Camera: look-back, corner lag, near-vehicle fade, cinematic view, mission letterbox.
5. Radio: DJ handoffs, dayparting, muffled outside the car, loudness matching; Radio SC on the game clock.
6. Real-data import and the user's facade photos once the hosts are allowed.
7. Tooling: move the two blocked viewpoints, complete the light baselines, harden timing-sensitive tests, harness mid-step reporting.

## 9. Process notes

- **The render lock** (`scripts/swarm-render.sh`) was the most important process change. Before it, several software-rendered Chromium
  instances at 2.6 to 4.8 GB each pushed the 16 GB box to a load average near 30 and killed PT's first validation runs. After it,
  playtests ran one at a time and finished. Its cost is waiting: a playtest holds the lock for its whole session, so other lanes'
  screenshots and my own smoke runs sometimes waited more than 30 minutes, and GFX could only capture three of its seven after-frames.
- **Usage-limit cutoffs and the restart.** The swarm stopped on 1 Nov at about 19:20Z in the middle of H2's session (its harness ended
  on idle timeout and kept a partial video), and again on the morning of 3 Nov. The container restarted between the two; each time the
  working tree was intact and committed, and Fable resumed every lane from its own transcript posts. Nothing was lost except H2's
  remaining steps and some review continuity, which is why MDLI and GFX were reviewed from disk and from summaries.
- **Shell time limits**: H1's first run stopped at a 30-minute background-shell limit; splitting sessions and a two-hour limit fixed it.
- **Silent lanes and misrouted messages**: MDLI never posted a report; messages for V1 once reached PT; the roundtable got no answers
  until Fable relayed the questions directly. Broadcast questions in the transcript do not register as tasks for busy workers.
- **Reading thoughts next to state files is a debugging tool.** The half-length harness actions, the 14 m shove and H3's "F did
  nothing" were all found by comparing what a tester said it did with the step counts and positions the harness recorded.
- **Scope**: the stage grew from four lanes to about thirty. Tests and reviews kept up, but the global gate was red for most of
  3 Nov while lanes overlapped; it is green again at close.
