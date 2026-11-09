# The Bed-Stuy Build: A Readable Transcript

*What the AI team said to each other while building your GTA-style Bed-Stuy game, retold in plain English.*

This is a retelling of the team's shared log (`docs/swarm/transcript.md`, about 200 posts). Short phrases in "quote marks" are the agents' own words; everything else is paraphrase. Where an agent posted only numbers, I say so. Technical terms are explained in [square brackets] when they first appear, and in the glossary at the end.

Eight stages so far. Stage 1 (28 Oct) was research plus core mechanics. Stage 2 (28 to 29 Oct) made the neighbourhood accurate and added missions and a web-hosted build. Stage 3 (1 Nov, still running) began with your bug report that you could not get out of cars, then grew with your requests for a lighter phone version, your own music on the radio, and GTA 5 as the design "bible". Stages 4 to 8 (3 to 9 Nov) took the game to the GTA3 graphics bar, added a GTA-style camera, real-proportion cars and a better phone version, ran five more blind playtests (H4 to H8), and then turned toward GTA3 skins, SoundCloud radio stations and the real blocks.

---

## Cast list

**Running the show:** **fable**, the orchestrator (talks to you, grants permissions, edits the shared files nobody else may touch, settles disagreements). **MGR**, the manager (writes requirements, reviews every lane's work against them, escalates hard calls).

**Stage 1:** R1 (free textures), R2 (what each block looks like), R3 (real sunlight values), R4 (shop awnings and signs), R5 (car and clothing textures), M1 (lighting engineer), M2 (driving feel), M3 (traffic lights, AI drivers, pedestrians), M4 (performance, main loop), M5 (gamepad, menu, HUD, sound).

**Stage 2:** D1 (lot data schema), R2 again, B3 (buildings, stoops, fences), S4 (storefronts), X5 (missions), H7 (web-hosting build), P8 (performance), L9 (lighting and weather), Q10 (quality assurance), T11 (industrial textures), F12 (traffic bug-fixer).

**Stage 3:** V1 (car-exit bug), PT (playtest harness), H1, H2, H3 (the blind playtesters: on-foot explorer, driver, chaos player), L10 (lighting), W2 (world fixes), MOB (phone version), MDL, MDLI, MDL2 and MDLI2 (finding free car and character models, and integrating them), RADIO and RADIO2 (radio for your own music; Radio SC), WRITE (talk-show script), BIBLE (GTA 5 design bible), MUSIC (legal music research), GFX (graphics ladder), GEO (real-building pipeline), MISS2 (missions, phone, DJ storyline), CLUB (record shop, Aftersloth club, home, DJ game), CLUTTER (street clutter), WIRE (shared-file wiring), DRIVE (steering, crimes, mission finding), STUCK (wedged cars), TA2 (traffic deadlock), SCRIBE (an earlier me).

**Stage 4:** GTA3 (the GTA3 bar), H4 and H5 (blind phone-tier testers), SHOPUX (shop and DJ panel usability), MISSFIX (mission flow), RASC (random DJ sets from your ra-nyc app).

**Stage 5:** CARS2 (procedural cars), CAM (GTA-style camera), ART (art direction), PHONEGFX (phone shadows and grade), H6 (blind tester).

**Stage 6:** NAV6 (walkable streets, HOME marker), HUD6 (HUD and street signs), GTA4A (skyline, pop-in, liveries).

**Stage 7:** GFX2 (car paint and neon bounce), CROWD (crowds, clutter, pop-in routes), H7 and H8 (blind testers), SHOP7 (shop and mission fixes).

**Stage 8:** SKINS (GTA3 people and car skins), RADIO8 (SoundCloud stations and announcers), GEO2 (real blocks), SCRIBE2 (this extension).

---

# STAGE 1: Research and Mechanics
*28 October, 01:09Z to 03:33Z (about 2h 25m)*

**The rules of the game.** fable opened with the ground rules: each agent owns only its own files, asks questions by writing "@name:" in the log, and posts a start note, any decisions, and a final report. Nobody commits to git. Ten workers launched within seconds of each other.

## Hour 01:00Z

### The first wall: the internet is mostly blocked

Almost immediately R2, whose job was to map the real blocks from OpenStreetMap and New York City open data, found both sites refused by the network proxy. It asked fable to get them unblocked. fable's answer: the allowlist is an environment setting it cannot change from inside the session, so it had asked you. Meanwhile R2 should use whatever text sources it could reach (Wikipedia was blocked too).

By 01:15 R2 filed a partial report, each line tagged with a confidence level: blocks are mostly three- and four-storey brick and brownstone rows; churches sit on Throop, Greene and Marcus Garvey; the avenue order west to east (Tompkins, Throop, Marcus Garvey, Lewis) was confirmed; the only confirmed tree was the Lafayette magnolia landmark. Unverified: the north-south street order, one-way directions and road widths.

### The Kosciusko spelling: the first disagreement

R2 included a "correction": the in-game sign says "Kosciusko St", but the official spelling is "Kosciuszko". fable pre-empted the manager by noting this was "a deliberate user choice", meaning your choice. The data id keeps the official spelling and the sign keeps yours. MGR then reviewed R2 and formally rejected the correction on the same grounds: signs use your spelling, data uses the official one. MGR accepted the rest of R2's report as partial and added a hunch of its own, flagged low-to-medium confidence: the real street grid probably has DeKalb Avenue between Pulaski and Kosciuszko, and Van Buren might not run west of Throop. MGR told Stage 2 to treat the street order as the top verification item.

### The lighting researcher hands over its numbers

R3 delivered an hour-by-hour and material-by-material lighting reference, plus 15 places where the code differed from reality. Its top five for M1: the noon sun should peak near 58 to 60 degrees, not 80 to 90; add a separate moon light at night; lower night exposure and tame night bloom [the glow around bright lights]; vary fog by hour; and make glass, paint and painted metal far less mirror-like by setting metalness near zero.

MGR checked R3's math and accepted, with one caution: do not lower night exposure alone; pair it with moon, ambient and lamp values and check night streets stay readable. MGR also noted a 60-degree noon sun is stylisation (the real late-October noon sun is about 35 degrees), fine so long as long golden-hour shadows stay.

### Textures: what exists, what does not

R1 found 11 free CC0 texture sets (fabric, brushed steel, rust metal, wood, tiles, gravel) but could not find corrugated steel, chain-link, granite, cast iron, tar roofing or denim. MGR accepted it as partial but raised a licence problem: the Filament textures trace back to a source whose CC0 status one reference disputed, so none land until each asset is confirmed, and a set labelled "Plastic" with no traceable author "was rejected outright". The downloads also sat in a temporary folder that would vanish.

### R5 and the "nothing changes on screen" problem

R5 painted procedural [generated by code, no image files] textures for tyres, number plates and clothing. MGR's review names a theme that recurs in all three stages: **work that passes its own tests but is not connected to the game**. The new car-paint function had no caller and the model files still used the old materials. The human model was nobody's, so fable took the clothing hookup itself, "to avoid a third editor in src/entities during Stage 1".

### M1 finds a hidden trap in the graphics library

M1 reported something surprising: in the 3D library version the game uses, materials that carry their own reflection map **ignore the scene-wide reflection-strength setting**. So window glass, car glass and car paint reflected at full strength while everything else was dimmed to about 18 percent. MGR said to scale each material's own reflection strength by hour instead.

### The mechanics agents talk to each other

- **M4 to M2:** M4 wanted motion to look smooth even though physics steps a fixed 60 times a second, so it asked for each car's previous position, and asked M2 to stop creating small temporary objects every frame in the camera code, because that makes the browser stutter.
- **M5 to M2:** M5 needed a number for how much a car is sliding. M2: `slip`, from 0 to 1. M5 had already coded around a guess, and the guess was right.
- **M2 to M3:** steering is now rate-limited, brakes ramp in so wheels do not lock, and the box truck was slowed to 12 seconds for 100 km/h.

### The manager tightens the plan

On storefronts, R4 would draw phone numbers on awnings. MGR ruled only the fictional 555-01xx range may be used, and every sign is a parody. On traffic lights, MGR's plan said "6 avenue intersections" but M3 built all 18; MGR checked and agreed every crossing touches a north-south avenue, so its own reading was "superseded". MGR also noticed the plan required your position to survive a reload while M5's settings only saved quality and volume, so M5 added a small save helper within a minute.

M5, M2 and M3 each posted a numbered wiring recipe for M4. M3's signal poles were the most vivid: 72 collision posts, and 2 draw calls for about 500 traffic-light lamps, tuned so bloom picks them up when lit.

## Hour 01:30Z to 02:00Z

### M4's report and the 790 draw calls

M4 finished at 01:38, having applied everyone's wiring in the main file. The headline number was unflattering: with honest counting (the old counter only measured the last render pass), the game made **about 790 draw calls per frame** [separate things the graphics card must draw]. M4 split the city into 250 by 200 metre cells so far-away chunks are skipped; from four camera spots that gave 77 draw calls and 352,000 triangles in view, against 29 and 581,000 unsplit.

One disagreement settled politely: M2 had built an `applyInterpolated` function, but M4 declined to use it because it creates a small object on every call, and its own snapshot system did the same job without allocating. MGR: "accepted (alloc-free, single path)". MGR confirmed the connections by line number, and noted the auto-downgrade threshold (medium to low under 40 fps) was more conservative than the plan's 50, so it updated the plan. None of the smoothness could be verified without a real graphics card, because the test machine renders in software.

## Hour 02:00Z to 03:30Z

At 01:54 MGR asked M1 for status because every other lane had finished. At 02:09 M1 posted progress: an hour-by-hour day/night table, a 60-degree sun path, cool moonlight at night, and a fix for a bug it had found: a shadow helper moved the sun's position and the sky used that fake position, so there had been no stars at night and a dusk glow that never moved. Each audit run took about 15 minutes of software rendering.

M1's final report (03:09): the 19:30 "blowout" was fixed. In baseline frames **49 percent of a car view and 5.9 percent of a street view were pure white** from bloom over a hazy dusk sky; after the fix the maximum anywhere was 0.10 percent. Night street brightness landed between 0.081 and 0.094 (21 to 24 out of 255; the bar was 20). Headlights were retuned so bumpers stop blowing out, and the dusk sky got a gradient instead of a flat orange wash. M1 had **not** applied R3's material metalness changes.

MGR accepted with one pointed concern: fable had asked for those metalness fixes at 01:19 and M1 skipped them. (This is the "material metalness debate" in the loose sense: no argument, just a requested change that quietly did not happen, caught in review.) MGR also noted shadows were tested at one hour only and 0.081 sits right at the threshold, so "worth a real-GPU look".

### Closing the stage

MGR's check-in at 03:12: **753 automated tests passing**, artifact **6.69 MB** (about 170 KB more than before, budget 12 MB), smoke test clean. At 03:33 fable closed out: R3's metalness values applied (glass 0, car glass 0, paint 0.15, painted metals 0), leftover allocations removed, artifact version 6 published at 6.53 MB. The DeKalb Avenue question stayed with you.

## What the team learned in Stage 1

1. **Green tests are not a working feature.** Several features passed their tests but were not connected until M4 applied them. The fix: every final report must name where the feature is wired.
2. **Ownership gaps cost time.** Requests landed with the wrong owner (the world builder file, material numbers). List every touched file on the board before the stage starts.
3. **Research behind a locked network is partial.** Per-block facts need allowlisted websites or your Street View screenshots.
4. **Slow audits are a bottleneck.** M1 took two hours because each audit is a 15-minute software render.
5. **Review caught what lanes skipped:** the metalness fixes and the position save.

---

# STAGE 2: Block Accuracy, Missions and a Hosted Build
*28 October 21:48Z to 29 October 07:47Z*

**Decisions at the start.** fable rewrote the board with these calls: the map stays as drawn (no DeKalb Avenue); no allowlist or screenshots are available yet, so block faces come from R2's notes, web search and typical-street knowledge, every value tagged with a confidence level; hosting will be a static site on Vercel. Ten workers plus MGR launched.

## Hour 21:00Z

### Parallel start and the shape of the schema

The first twenty minutes were agents announcing plans. The key coordination was between **D1**, **B3** and **S4**, because D1's lot data feeds both the building generator and the storefront maker. D1 described a lot as a width, number of floors, a material family (brownstone, red brick, tan, painted, limestone, wood frame, church, vacant, new build), a stoop yes/no, a cornice style, a use, and a confidence tag of High, Medium or Low. B3 coded against a temporary local version rather than wait.

S4 proposed a split with B3: S4 builds the ground floor (awning and roll gate), B3 everything above. B3 agreed and posted the function at 22:09. S4 also negotiated night lighting with L9, who said night bloom starts at 0.9, so big flat glowing faces should stay at or below 0.6.

### R2's second pass: street by street

R2 had web search only, and posted a terse, source-tagged note per street. What the team learned: Antioch Baptist at 828 Greene is **outside** the map, east of Marcus Garvey, so a church planned there was moved. The Upper Room church is only confirmed at 180 Van Buren. A lot at 289 Kosciuszko has been vacant for over a decade, a good anchor. A day-care at 220 Throop has an enforcement note, so R2 told D1 not to use it. Tally: 9 street segments, 10 blocks, 40 block faces, four corrections.

MGR accepted it as partial and answered R2's block-numbering question. It raised two concerns: no web addresses were recorded, so nobody can re-check the notes, and real church and business names must stay in docs only. That second point came back at D1.

### T11 asks for new materials

T11 posted a long request for fable to add seven new material names (corrugated steel, two kinds of chain-link, granite curb, cast-iron fence, tar roof, graffiti) with exact specs. MGR recommended approval with one change: cast-iron fence is painted iron, so its metalness should be 0, not 0.2, following the rule from Stage 1. fable applied it all at 22:00 after T11 confirmed the painter code existed.

## Hour 22:00Z

### X5 delivers three missions in about ten minutes

X5 built a data-driven mission framework with nine kinds of objective, plus failure, retry, abandon, rewards and saving, and three non-violent missions:

- **Bodega Run:** pick up three bags at a deli and deliver them to three stoops in 120 seconds for $150.
- **Laundromat Getaway:** steal a bag on foot, get two wanted stars, get a car, get 110 metres away, hide in a garage, wait for the stars to clear, keep the car. $400.
- **Block Party:** gather a speaker, a table and ice and deliver them before 20:00. $250.

X5 flagged its own oddity: at the default 17:30 start, Block Party leaves only 150 seconds, doable by car but not on foot. fable approved four small shared-file changes X5 asked for, including a cleaner `raiseTo` function for wanted stars. MGR's reason: X5's workaround of faking "carjack" crimes would also trigger audio and cop systems that listen for crimes. MGR asked where the promised "cop escape" mission was. Answer: the second half of Laundromat Getaway. P8 wired it all in within three minutes.

### Q10 finds four real traffic bugs

Q10, the QA lane, ran a five-minute simulation on the real map (30 cars, 40 pedestrians, 2 cop cars). Good news first: the driving model holds up (stable at top speed, no jitter at walls, bounce settles within two frames, and a 60 km/h handbrake turn gave 25 degrees of slip and recovered in under a second). Then four defect reports, each with a failing test kept as a reminder.

- **D1: AI cars crash into each other.** About 30 hard impacts per five minutes. Q10 traced it frame by frame to one cause: the car's "look ahead" ray is cast from where the car *intends* to be, not where it is. When a car starts or cancels overtaking, the ray misses the car ahead and the driver floors it.
- **D2: impact spam.** A pedestrian pressed against a parked car produced **544** crash events in five minutes, each with sound, camera shake and a cop-hit check, and the check could wrongly add wanted stars.
- **D3: turning cars knock down pedestrians in the crosswalk.** Three in one seed, one in another, all while the pedestrian had a WALK signal. The car only looked straight ahead, not toward the crosswalk it was turning into.
- **D4:** (lower priority) a car pushed off its lane wedges forever on a signal pole.

MGR confirmed each root cause by reading the code, set priorities (D1 and D3 first), and noted nobody owned the entities folder. fable spawned a new lane, **F12**, and told Q10 to keep the failing tests as they are. F12 would flip them to passing.

### H7 and the "ultra" tier

H7 proposed build-config changes for two builds from one codebase: the single-file artifact, and a multi-file hosted version for Vercel. MGR confirmed the artifact path was byte-identical to before; fable applied it in a minute. Smoke test clean; artifact 6.83 MB, hosted 5.46 MB. MGR's note: `?q=ultra` existed only in the hosted build and for now just raised texture sharpness, since no 2K sets were in the repo pending licence checks.

### D1 lands 840 lots

D1 posted the finished data: **40 block faces, 840 lots, 107 KB**, 33 tests. MGR accepted with three concerns. The memorable one was commercial density: Throop faces had 5 to 9 shops out of 10 or 11 lots, and 46 bodegas over 10 blocks "reads as a strip mall". Second, real church names (Grace Baptist, Crossover Baptist, St. Ambrose, Bethany Baptist) sat in JSON notes that ship in the artifact; they should become source references. Third, floors 0 is allowed for vacant lots, which the plan had not said.

### The container restart

At about 22:45 the container restarted. fable's note at 22:52: it **killed MGR, B3, S4, P8, L9, Q10 and F12 mid-work**. The files on disk survived, so fable relaunched each lane in "resume mode": read your own earlier posts and the files you own, verify what is on disk, continue. Their resume posts show what survived: F12 had fixes for D1 to D3 and needed D4; Q10 had lost its QA document; L9's shadow and weather work was intact but unwired. MGR returned at 22:56 with a table of what each lane still owed, and a warning: "the machine is shared by 6 resumed lanes; post interim numbers rather than waiting on long headless renders."

### P8's big number

By 22:39 P8 had cut Throop street at medium from **2,837 draw calls to 390**. Its diagnosis: cars were about 60 percent of all draws (each car is roughly 17 meshes), and the GTAO [soft contact-shadow] pass re-rendered the whole scene a second time. The fixes: far-away cars as instanced copies [many identical copies in one call], simplified stand-in geometry for the shadow and occlusion passes, and instanced street furniture.

## Hour 23:00Z

### The ped-yield deadlock

At 23:05 Q10 reported D5, a **regression**: after F12's changes the five-minute sim failed its no-gridlock check. A car stood still from 62 seconds to the end, yielding to a pedestrian wedged beside its nose and creeping at 0.09 metres per second for over 40 seconds. The car's "stuck detector" never fired because yielding to a pedestrian resets the stuck timer. Neither would move: "ped-vs-car deadlock". MGR made it F12's job (P1) and set the bar: all four flipped tests **and** no gridlock on both seeds, fixed on both sides (the car counts a long slow yield as stuck; the pedestrian steers around a car it is pressing against).

### B3 delivers

B3's early post flagged that the chain-link top rail was set up opaque and would render as a black band; fable fixed it in a minute. B3's final report: stoop railings that follow the stair slope, spear-topped areaway fences, tar roofs, chain-link and corrugated-steel hoarding on vacant lots, fire escapes on tall buildings. Throop frames stayed at 314 to 378 total draw calls.

MGR accepted with three concerns: the "determinism" test compared counts, not actual position data; areaway fences had no colliders, so pedestrians walk through the iron; and a mesh-count test limit was raised from 30 to 36.

### The graniteCurb UV mismatch

P8 reported that the curb material from T11 was not used. The road builder's curb texture coordinates run face first, then chamfer, then top, but T11's painter has the top stone first. Swapping would need a remap in the road builder, which no Stage 2 lane owned. MGR recommended deferring it to Stage 3; fable agreed and logged it. This is the item W2 inherits in Stage 3.

### P8's report

P8's final, at 23:51. Medium draw calls: **Throop 376, Kosciuszko 358, corner 341, aerial-high 309, aerial-low 326, in-car 273, spawn-foot 296**, against a baseline of 2,118 to 2,919. A visual A/B showed the optimised and plain pictures differing by only 0.7 to 1.2 out of 255; the one large difference was X5's pulsing gold mission marker, which fable noted filled **14.7 percent** of the first view's pixels: "very large and partly fills the first view". fable shrank it at close-out.

MGR's concerns: no triangle count was reported (the plan caps the rise at 20 percent), menu Reset did not clear live mission state, and nothing tests that shadow culling skips far cells.

## Hour 00:00Z (29 October)

### The usage-limit warnings

At 00:02 MGR sent a second nudge: S4 had been silent since 22:56, F12 was moving, and Q10 and L9 should finish by about 00:30. The same sentence said MGR itself would run the global gates after that. Later events show why this mattered: **both MGR and Q10 hit the account's usage limit** before finishing some paperwork (MGR before writing the Stage 2 check-in; Q10 before its QA document). fable ended up covering the check-in.

### L9's shadow fix, then the cream-coloured wall

L9 built a test rig (a plane, a cube, a 0.15 m curb, a 3 m pole and a sun-parallel wall) at the low sun angles of 7:00 and 18:00. Finding: no acne [speckled false shadows] even with bias at zero, but the old flat 0.5 m offset **removed the curb's shadow entirely and floated the cube's shadow off its base** ("peter-panning"). L9 cut it to about one shadow-texel.

Then night. The night street mean had been 0.097 and 0.104, nicely in range. On the current tree it was **0.242 and 0.244**. L9's explanation: S4's storefront glazing beside the spawn was a huge flat cream emissive face, filling a third of the frame. It asked S4 to cap shop-window glow at 0.35. MGR backed the cap: the plan's number is a floor, so 0.24 was not a failure, but "a flat cream face a third of the frame is an illusion break". MGR suspected the glow might come from a shared window material rather than S4's, and asked L9 to name it. That stayed unresolved and became a Stage 3 open issue.

### F12, S4 and L9 finish

F12's results over two five-minute seeds: vehicle-to-vehicle impacts 121 and 102 **down to 5 and 5**; hard AI-to-AI impacts 30+ **down to 0**; pedestrian knock-downs on WALK 3 and 1 **down to 0 and 0**; impact events from one press 544 **down to at most 2**. D5 did not reproduce. MGR's caution: "not reproduced" is not the same as "fixed", because the yield path still has no time cap; a test pinning a slow pedestrian to a car nose for 40 seconds should be added.

S4: awnings and signs at true aspect (the old 2x stretch and its pre-squeeze hack gone), corner bodegas wrapping the corner, window stickers (ATM, EBT, lotto, neon OPEN), lightboxes lit after 19:30 at 0.55, roll gates down from 22:00 by shop type with graffiti on closed-down gates. S4 said its 22:00 screenshot kept crashing the browser "on this loaded box (load avg about 18-25)". One wiring gap: the main file had to call `setStorefrontHour`; fable did that at close-out.

L9: weather (dry, rain, wet, drying) with a puddle shader, and light baselines stored in the repo; blown highlights at most 0.09 percent everywhere.

## The close-out (07:47Z)

MGR was rate-limited, so fable closed the stage. It applied S4's wiring, shrank the mission marker, ran the gates, published artifact v7 and wrote the Stage 2 check-in:
- type checking clean;
- **1,169 tests passing**;
- artifact **6.89 MB** (budget 12);
- smoke test errors: none;
- hosted build 36 files, 5.5 MB.

## What the team learned in Stage 2

1. **Number-driven goals work.** The "under 500 draw calls" target took medium from 2,118 to 2,919 down to 273 to 376 with almost no visible change.
2. **A QA lane that tries to break things earns its keep.** Q10 found four real defects the other lanes' own tests missed, and kept running the long sim, which caught the regression.
3. **Fixes interact.** F12's crash fix risked gridlock; S4's night glow broke L9's lighting range. Re-baseline after each landing.
4. **Machine load shapes the schedule.** With six lanes on one box a headless render took 1.5 minutes or more, and some night shots crashed the browser.
5. **Restarts and usage limits happen.** Resume prompts pointing agents at their own earlier posts recovered every lane; MGR and Q10 ended on the usage limit, so snapshots were saved every few minutes.
6. **Real names stay out of shipped files.**

---

# STAGE 3: The Playtest Loop
*1 November, from 15:14Z (still running)*

**Your bug report.** fable's opening post was short: Stage 3 starts as a playtest loop. The bug from you is that you **cannot exit cars**, so lane V1 takes it. PT would build a harness that records video with a subtitle box showing what the tester is thinking. Three blind testers would then play with no access to the code and report what they felt. L10 and W2 carry over the Stage 2 open issues (night glazing, graniteCurb, areaway colliders, commercial density).

## Hour 15:00Z

### V1 finds the car-exit bug in six minutes

V1 posted at 15:20 that it had reproduced the bug in the real build. Pressing F entered the car fine. Pressing F again exited and then **immediately re-entered the same car**. The player was briefly out, then back in.

The root cause, in V1's words, is about timing. The game's input system says a key is "pressed" for every physics step inside one screen frame, and clears it only once per frame. On a fast machine a frame runs one step, so this never shows. On a slow machine, such as a phone, or this heavy game on a laptop, a frame can run two or more steps. Step 1 sees F and exits the car. Step 2 still sees F, and since the player is within 3 metres of that same car, enters it again. The same double-fire hit the radio key, E.

V1's fix: a new `Input.consume(code)` that returns true once per press and survives frames with zero steps. It added 11 unit tests, including one proving the old method would re-enter. V1 then asked fable to make the same swap for the mission retry and abandon keys (R and X), which had the identical double-fire: retry or abandon twice per slow frame. This neatly connects to your other complaint, that the game is too heavy for your phone. The heaviness helped cause the exit bug.

### Four new lanes from you

At 15:17 fable added lanes from your direction. The game is too heavy on your phone, so **MOB** builds a phone quality tier. **MDL** looks for free polished car and character models "as a guide". **RADIO** builds a radio that plays your own audio files. **WRITE** writes an original 22-minute AI talk show. Licensing stance stays: no copyrighted songs, no Street View pixels, CC0 models only, with credits. MGR added measurable rows: the phone tier must hit at most 120 draw calls and 500,000 triangles on the seven viewpoints and be chosen automatically on touch devices; radio must ship **no audio in the repo** and cost at most 50 KB.

### The radio grows to eight stations

At 15:19 fable relayed your station list. To the original Pop (15 slots), 80s (12), Rap (13) and House and Dub (22), you added Trap (25), Weird/Psych (28, "the user named Tame Impala and Abra as the vibe"), Folky Echo-Dub Rock (16) and Jazzy Rock "That Gets Lit" (16). That is **147 music slots** plus the WBSY Talk station. Artist names are search keywords only, never bundled audio. Each station needs a parody name, a jingle and its own synthesised fallback sound (trap hats and 808s, slow psychedelic arpeggios with tape wobble, echo-delay dub guitar, a jazz-rock walking bass) for empty slots.

RADIO had asked WRITE to confirm the script file's shape; WRITE answered quickly (title, station, total seconds, and segments with kind, speaker, voice and seconds, spoken segments at most 60 seconds) and RADIO coded to that.

### WRITE delivers in four minutes

WRITE's final report: 57 segments, 3,288 words, 1,325 seconds (target 1,320 plus or minus 30). MGR checked every number and scanned for 28 real AI and tech names: zero hits; the only real names are street names.

### MOB and L10: sharing two files politely

MGR spotted that **MOB and L10 both need to edit `Pipeline.ts` and `LightingConfig.ts`**. Ruling: L10 touches only night values and glazing; MOB only its tier branch and a new "phone" row; each posts its line ranges before saving and re-reads the file before each edit. MOB must also stay away from V1's F-key lines.

### MDL's licence hunt

MDL found only the raw GitHub host and the npm registry reachable (Kenney, Quaternius and Poly Pizza time out). On npm it found a wrapper whose notice says the art is CC0 and recommended a sedan, SUV, police car, delivery van (as box-truck stand-in), a hooded adventurer and a worker. It asked fable to unblock the original sites; fable said that is your environment setting, so it asked you, and told MDL to proceed with the source check marked pending. A true box truck exists but is Apache-2.0, not CC0; fable accepted it, since that licence is permissive with attribution.

### BIBLE lands and sets the yardstick

At 15:18 fable relayed your instruction: "Use GTA 5 as your bible", and at 15:20 your reason: GTA 5 was "the first to make a world people would live in for days at a time". So BIBLE opens with the principle that the target is "a place people want to stay in, not a demo". It landed in under six minutes (nine sections, 35 sources from search excerpts only, unsourced items tagged as guesses). Its top gaps, ranked by "would someone live here?": no "thing every 30 seconds"; only three flat missions; the radio has no station wrapper (DJ, ads, news, jingles); the day has no schedule (rush hours, school run, block party); no in-world phone. Also police are a 20-second timer rather than line-of-sight, and the camera lacks look-back and cinematic moments.

### You ask to hear them talk

At 15:21, fable posted your request: you want to read the team talking and figuring things out in plain English. Two changes took effect at once. MGR would host an open **roundtable**, and a SCRIBE lane (me) would compile the log into this narrative. All lanes were told to explain their reasoning in full sentences from here on.

### MGR reviews BIBLE and MDL; a new lane appears

MGR accepted BIBLE: it "does not tell us to copy GTA, it asks one question of every lane", and its ranked gap list is the most useful part because it says "our gap is content and life, not rendering". MGR folded the yardstick into the requirements. It accepted MDL after spot-checking two licences itself, noting the Kenney police car has no light bar, so at night "these cars will look dead". fable decided to ship the six CC0 files now, hold the Apache truck until its wheels are split, and launch **MDLI** to integrate them (loader, procedural fallback, night lights, under 12 MB).

## Hour 15:30Z

### RADIO finishes the music-and-talk station

RADIO's final report (15:36): the dial has 3 synth stops, 8 library stations (the 147 slots) and WBSY Talk. An empty slot plays 40 seconds of that genre's own synthesised pattern, never silence. Switching has dial static, a jingle, a half-second crossfade, and each station keeps its own virtual clock, so it resumes mid-song like a real broadcast. The talk station reads WRITE's script with the browser's built-in voices and says "WBSY Talk (voice unavailable on this device)" where there are none. No audio ships in the game; code is about 40 KB.

RADIO was candid about gaps: no time-of-day programming, no DJ chatter, and Firefox and Safari users must re-add their folder each session. It posted six exact line edits for fable because it does not own `main.ts`: the Stage 1 "name the wiring" lesson applied. MGR re-ran 243 tests, confirmed no audio file is in the repo, and liked one judgement call: bare "dub" goes to House and Dub, while only "echo-dub" goes to the folk station, so songs do not land on the wrong station at random. fable applied the edits within seconds.

### The roundtable is quiet, and the machine is struggling

At 15:37 MGR nudged: fifteen minutes after the six questions "no lane has answered yet", and "it now counts as part of each lane's job, not an extra". The silence has a cause. **PT** reported two validation runs dying with "Target crashed": the kernel was killing test browsers for memory (each took 2.6 to 4.8 GB on a 16 GB box with a load average of 30). MOB and W2 reported the same.

### MOB, W2 and MDLI

- **MOB (15:43):** the phone tier is wired in, automatic on touch devices. First measurement at a noon street: **212 draw calls and 1.21 million triangles against 350 and 1.90 million at low**, versus a target of 120 and 500,000, so "geometry work continues".
- **W2 (final):** granite curbs finally applied, closing the Stage 2 mismatch; areaway fences block pedestrians but leave the stoop-foot gap and a 1 m basement entry; avenue shops thinned from **3 to 9 per face (mean 6.4) to 3 to 5 (mean 4.5)**. MGR did not trust the summary and counted lots straight from the data: all 24 north-south avenue faces now have 3 to 5, "and Throop in particular no longer reads as a solid wall of shops". Concerns: Lafayette north and Greene south are still very commercial, and a thin dark sliver at one curb ramp might be a visible gap.
- **MDLI:** the Kenney cars are "toy-proportioned" with one colour palette for the whole car. It fits each car to the spec box per axis but keeps wheels round, recolours only the body patch of the palette, and synthesises headlights, taillights and the police light bar.

### MGR admits a mistake

At 15:45 MGR asked V1, PT and L10 for status, saying V1 had been silent for thirty minutes. Within a minute: "I was wrong to call V1 quiet; V1 posted a confirmed root cause at 15:20 and I missed it while reading." MGR then restated the bug in everyday words, adding that it explains "why the user, on a heavy scene, could never get out, and why a fast desktop might not show it", and recommended fable approve V1's change for the R and X keys.

## Hour 15:45Z

### PT's design, and a "render lock"

PT's harness is turn-based: the game is paused while the tester thinks, the subtitle bar is hidden in the tester's screenshots but burned into the video. The unvalidated part is a long recording under load, which keeps dying. MGR warned that starting three testers at once would produce "testers who blame the game for a harness crash", and recommended launching them one at a time. fable went further with a **render lock**: from 15:49 every headless browser run must go through `scripts/swarm-render.sh`, which lets only one render run at a time, at 640x360 or smaller.

### L10's first night result

L10 acknowledged the lock and reported progress on your night-glare problem: the storefront glass night glow is capped (0.35 and 0.28 per key), and the spawn view now reads **0.122 and 0.124** at 21:00 and midnight, inside the plan's 0.085 to 0.13 band. It also noticed that W2's density change had removed the big glazing face from the spawn view altogether, so it is doing a close-up A/B on a shop face to be sure the cap, not luck, is doing the work.

### MOB hits its phone target

At 16:04 MOB measured the phone tier on the current build (640x360, five of seven views so far): **96, 100, 98, 103 and 109 draw calls and about 410,000 to 425,000 triangles**, against 233 to 259 draw calls and 1.29 to 1.38 million triangles at low. Both targets (120 and 500,000) are met. Its levers: shadows off; no ambient occlusion, depth of field, anti-aliasing or bloom; a 110 m view cut-off with fog; culling of trees and lamps; small details (fire escapes, tanks, wires, fences) hidden from the phone camera; a 720-pixel-wide buffer.

---

## Hour 16:00Z

Between 16:00 and 16:25 the log held almost nothing but roundtable posts, plus one review of this narrative. At 16:13 MGR accepted the earlier version of this document ("written for a person rather than for the agents"), noted its limit (it stopped at 16:04, before the roundtable answers), and recommended fable resume SCRIBE after the stage closes so you get what the blind testers were thinking. V1 was "deep in the 50-attempt exit test" (MGR's words); V1 had posted nothing new since its root-cause finding. The blind playtests had not started.

---

# THE ROUNDTABLE
*Opened by MGR at 15:22Z at your request; answers 16:01 to 16:18; synthesis 16:25*

## How it got started

MGR asked six questions and wanted three to six plain sentences per question from each running lane, plus a reaction to another lane by name. Then nothing happened for almost 40 minutes. MGR's theory, sent to fable at 16:00: workers scan the log for their own name or for final-report items, and "a long list of questions addressed to everyone does not register as a task". Once fable pushed the questions into each lane's session, eight lanes answered within 17 minutes. Most opened with an honest "this is a guess", which is what MGR had asked for. (Of the lanes not named below, WRITE spoke through its script, and V1 was busy.)

## Question 1: What would make someone live in this Bed-Stuy for a whole day?

Everyone said the same thing in different words: a day is made of small, repeating, cheap moments tied to the clock, not big set pieces.

- **BIBLE** was the most specific: the place "has to keep moving without you and always offer something one choice away", meaning a stranger, an event or a gag within about 30 seconds, and an hour-by-hour day: school run, noon stoops, golden hour, block party, quiet night cops. "People stay when the street has moods and somebody is always talking to them."
- **L10**, the lighting engineer, sees it through light: "the sun lowers and the brick goes orange, the lamps and shop signs come on at dusk, some windows are lit and some are not, a roll gate comes down late." A player standing still at 19:30 should watch the street switch to night.
- **W2** wants a street that feels lived-in "and not like a strip mall": stoops and trees between a few shops, fences and curbs that act like real things. Its density pass today cut shops per face from about 6 to about 4.
- **MDLI** thinks small moving things sell it: a van with headlights on at dusk, brake lights, "a pedestrian who actually walks with legs instead of sliding".
- **PT** named a day's moments: the bodega gate rolling up at 6, school-hour foot traffic, a stoop conversation. **MOB** listed what reads as lived-in in its captures: tree canopies, awnings, stoops, lit windows, signals changing, adding that these are also the cheapest things to keep.
- **RADIO** argued the car radio is a big part of it: "a good radio makes the block feel lived-in even when nothing else is happening". **MDL** offered being known on a few streets: a corner shop with "a regular who remembers your order".

**MGR's decision:** the first Stage 4 world lane builds a day schedule (hourly crowd and traffic curve, evening stoop sitting, school run, late cops) and a small ambient-event system. These are cheap to render, which helps the phone too.

## Question 2: What does GTA 5 do with the camera that we do not?

Nobody here has tuned the camera, so most deferred to BIBLE, which was the only lane with a concrete list: a look-back, a separate cinematic camera, hood and first-person views, letterboxed mission intros, and a follow camera that lags and leans in corners. Ours "has shake and wall pull-in but none of those extras". BIBLE was careful to say the corner-lag claim comes from mod changelogs, not official sources.

Two useful additions came from lanes that stare at frames all day. **MOB**: on the phone tier the street ends in fog at about 110 m, and a low chase camera "makes that feel like atmosphere instead of a limit". **L10**: the pipeline already has depth of field and exposure control, but a fixed camera never uses them on purpose; a chase or cutscene could push them "to tell the player where to look". **W2**, **PT** and **MDLI** guessed that a lower, closer, speed-sensitive camera would sell the street and the new models; PT noted a tester cannot easily look at a pursuer. **RADIO** and **MDL** guessed the same list, and MDL told readers to check the style notes before trusting it.

**MGR's decision:** a Stage 4 camera lane: look-back and corner lag first, because chases need them, then cinematic and letterbox using L10's depth of field. The test is BIBLE's: after a minute of driving, a playtester should not mention the camera at all.

## Question 3: Is the phone tier a different game or the same game smaller?

Unanimous: **the same game, smaller.** Nobody wavered.

- **MOB**, who measured it, gave the clearest inventory. What survives: street layout, brick and stone facades, stoops and cornices, awnings and signs, trees, cars, time-of-day colour and night lamps. What goes: shadows, ambient occlusion, depth of field, bloom, fire escapes and rooftop tanks, wires, trash, iron fences, manholes and "two thirds of the crowd". On three captures "the street still reads as Bed-Stuy".
- **BIBLE** and **MDL** drew the line at rules: if the phone loses the events, the day schedule, the radio or the rules (physics, exits), "it stops being worth living in".
- **W2** warned that dropping shops, curb detail or fence colliders would make it a different game.
- **MDLI** gave a small example: the merged character now costs 2 draw calls instead of 6, and far cars are one instanced draw per type. It offered MOB shorter far distances for glTF cars, unmeasured.

**Who reacted to whom:** L10 agreed with MOB that without shadows "the fog and sky colour have to carry the time of day" and added that night lamps are cheap enough to keep. PT agreed a blind tester on the phone tier is the right test. MOB replied it would make sure the `?q=phone` flag works "and that the fog does not eat the shop signs".

**The one real conflict.** MGR spotted it in the synthesis: MOB hides the iron fences on the phone to save draw calls, but W2 just gave those fences colliders, so a phone player would walk into an invisible wall. **MGR's decision:** MOB keeps the thin, merged areaway fence meshes visible on the phone tier (or removes mesh and collider together); MGR prefers keeping them, "because W2 is right that the fences are part of what makes the block feel real". MGR also recommended fable have one playtester try part of a session on `?q=phone`.

## Question 4: How should the radio feel when your own songs come on?

Everyone wanted it to feel like tuning a station, not pressing shuffle.

- **RADIO** described what it built: each station keeps its own clock, "so you drop into the middle of a song"; half-second crossfades; a jingle and a blip of dial static; an empty slot plays that genre's synth loop "so nothing ever goes silent"; the HUD shows the file name. Then its candid worry: it has only tested with fakes and not heard it in a real browser, so "the exact loudness balance between a user's song and the quiet synth stations is a guess I expect to need tuning".
- **BIBLE**: start mid-song, duck under a short DJ line, a jingle or ad break every couple of tracks; the songs are the user's, "everything around them is our own parody wrapper". **MDL** added a DJ break or talk-show handoff and a clip of street noise when a song ends.
- **PT**: a short readable station card matters more than anything technical. **MDLI**: station name and track title plain, no effects on top. **W2**: a quick crossfade and the song title shown.
- **L10** warned lighting must not react to the music: "a pulsing screen would read as a gimmick". **MOB** asked that decoding happen when a station is chosen, not per frame, so audio does not fight the main thread.

**MGR's decision:** Stage 4 radio work is DJ handoffs, time-of-day programming, muffled sound outside the car, and loudness matching between the user's tracks and the synth fallback.

## Question 5: What makes a mission funny here?

Again a shared view: a very serious tone against a very small stake.

- **MDLI**: "being chased by police for a bodega sandwich", with a cop light bar flashing on a toy-sized car.
- **PT**: a serious objective line on an ordinary street, such as a timer ticking down for something small; failure is funny "if the retry line has a personality".
- **L10**: a lit OPEN sign at midnight while the clerk is clearly closing, or a getaway slowed by a double-parked van with its hazards on. **MOB** had a similar idea: the bodega cat or a double-parked box truck blocking the getaway, which "costs us nothing in rendering".
- **BIBLE**: a character who wants something very specific from a very specific block, "like a cat, a couch, a parking spot or a rival speaker"; the twist reverses the plan, the fail message is funnier than the win message, and "the best line is spoken by a person, not by the HUD", with banter every 10 to 15 seconds while travelling.
- **W2** and **RADIO** pointed to parody names (Troop Deli, Kosciusz-K-O-Mat) and deadpan, local detail; **MDL**: jokes should come from "the characters' ordinary logic, not random chaos".

**MGR's decision:** Stage 4 missions follow BIBLE's template, each with a character voice line and a fail joke, and MGR suggested reusing RADIO's speech player for mission dialogue, "spoken banter at no asset cost".

## Question 6: What was hardest today?

Five lanes named the same thing: the machine. Software rendering, a load average near 30 and out-of-memory kills made every screenshot take minutes.

- **PT**: its first three validation runs were killed. **MOB** learned to measure draw calls and triangles instead of frame time, "because those do not depend on the machine's load". **MDLI**: a screenshot run took ten minutes. **W2**: tests timing out at the 30-second default.
- **L10** had the subtlest problem: telling whether a brightness change was its own. It capped shop glazing so a lit face is 0.35 of its texture instead of 0.9, and the spawn view fell to 0.12 mean at night, but W2 had rebuilt the avenue faces the same hour, so the glazing face had already vanished from that frame. L10 solved it with a close-up A/B on one build: the glazing crop went from 0.395 to 0.300 luma and "still reads as lit". It noted that each of its frames took one to two minutes behind the render lock, matching PT's experience.
- Others named specific hard parts. **W2**: the data binder re-purposes the nearest lot, so a POI shop landing on a residential lot "would silently add a sixth shop". **MDLI**: the Kenney cars share one colour atlas, so tinting the material would turn the windows and tyres the car colour; it recoloured only the paint cell. **RADIO**: time shared between station clocks, a crossfade, files ending early and speech stalling; each needed a guard. **MDL**: licences resting on a repackager's notice because the primary sites do not resolve. **BIBLE**: GTA design facts are not public, so many numbers are marked as "our own targets rather than GTA facts".

**MGR's decisions:** the render lock stays for the rest of the project; light audits always compare A and B on one build; the 30-second test timeout under load is a Stage 4 tooling item.

## The manager's closing note

MGR said the guesses "agree more than I expected". It admitted a process failure: "several answers did not react to another lane by name, as the user asked", and said that next time it will ask for a short second round of reactions only. Reactions that did happen: MOB to PT, L10 to MOB and PT, MDLI to MOB and PT, and V1's root cause cited by PT.

---

# STAGE 3, CONTINUED: The Playtests and the Big Morning
*1 November 16:26Z to 19:20Z, then 3 November 06:20Z to 13:28Z*

## Hour 16:30Z (1 Nov)

### L10 explains the cream-coloured wall

L10's final report named the cause of the too-bright night shopfronts. Shop glass shared the same night glow (0.9) as apartment windows, but its glow map is one flat white sheet, so a single shopfront lit up like a cream wall. L10 gave shop glass its own value (0.35 and 0.28) and left apartment windows alone, so the upper floors keep their patchwork of lit and dark rooms. The night spawn view went from **0.240 to 0.127** at 21:00 and from 0.141 to 0.130 at midnight, inside the plan's 0.085 to 0.13 band. L10 also closed the old "GTAO outline" worry: with the stand-in shapes switched off the faint dotted fringe was identical, so it belongs to the ambient-occlusion pass itself, not to our proxies.

MGR accepted, praising the same-build close-up comparison, and added concerns: 0.130 sits exactly on the top edge of the band, "so any later brightening will push it out", and the baselines still lack hour 7 and the car and aerial views "for the third stage running", which MGR blamed on the overloaded machine.

## Hour 16:45Z

### PT is ready, and finds a strange jump

At 16:46 MGR nudged four silent lanes. A minute later PT posted **PT READY** and its final report. The harness serves a private copy of the game, records video with a subtitle bar showing the tester's thought, pauses the simulation while the tester thinks, and writes a readable transcript of every step. In PT's self-test, 12 of 12 steps worked and the subtitle was visible in the video. MGR accepted it: the pause-while-thinking design means "a slow model cannot miss anything", and the state file lists the five nearest things with plain directions like "ahead-left". Two concerns: the subtitle blinks off during each screenshot (visible in 28 of 32 sampled frames), and the bar covers the street name.

MGR then flagged something PT's scripted tester had stumbled on. The player stood with an SUV 1.4 m ahead, pressed F once, and was seated in an SUV **fourteen metres west**, parked on the sidewalk. MGR guessed either the wrong car had been picked or the player had shoved a car. V1 first answered that a claimed rolling traffic car coasts about 25 m, and added braking while you climb in. This explanation would turn out to be wrong, which is the next part of the story.

### MDLI, MOB and V1 report

- **MDLI** finally posted its report: six CC0 models installed (sedan, SUV, police car, delivery van, a worker, a hoodie character). Spawn draw calls fell from **307 to 233** and triangles from 1.89M to 1.28M, because each person's meshes were merged to 2 instead of 6 ("first attempt without the character merge was 461"). The artifact grew from 6.96 to **8.18 MB**.
- **MOB** gave its final table: street at low 233 draws and 1.29M triangles versus phone 96 and 409k, with all seven viewpoints inside 120 and 500k. MGR accepted but made the fence point formal: the phone tier hides iron fences that now have colliders, so players would hit invisible walls. fable fixed it at 17:02 (fences and roll gates stay visible on the phone) and published artifact version 8.
- **V1** reported more than the bug you asked about. It found a second cousin of it: a controller's A button was being wiped by the same frame's cleanup before any step read it, so gamepad players could never get out either.

## Hour 17:00Z

### H1's first run, and a harness that was cheating

H1, the on-foot tester, posted a partial report: it had reached step 10 of 60 when its background shell hit a 30-minute limit. It liked the dusk street and noted "no pedestrians" and shopfronts with no enter prompt. It also reported its early walking "felt sluggish" (2.3 m and 0.5 m in about two seconds).

MGR checked H1's own files instead of trusting the feeling. Step 1 asked for 2,000 ms of W (138 simulation steps) but the counter moved only from 0 to 63; step 2 asked for 126 and got 60; step 3 asked for 198 and got 113. "Every action ran at roughly half its requested length." The cause was in the harness: it gave up waiting after a wall-clock timeout, because the slow machine ran only about two simulation steps per real second, then released the key and recorded nothing. So H1 honestly reported what it saw. MGR removed "walking is sluggish" from the game's defect list and logged it as defect PT-1; fable fixed the waiting at 17:26 and made the harness record any shortfall as `actionsCutShort`. R and X were also switched to `consume()`.

### V1's final report, and MDLI's "silence"

V1's final: the F-key root cause, the gamepad bug, the queued second F, and **25 of 25** real-browser exit attempts across keyboard, touch and gamepad, including driving at 14 and 22 m/s and beside real walls. MGR accepted (60 tests re-run), noting the plan asked for 50 and that exit still has no fallback spot if the driver's side is blocked.

At 18:05 MGR told fable that MDLI had been silent for two hours. fable replied the report existed; MGR had missed it and reviewed MDLI from disk, accepting it with the caveat that the Kenney cars are toy-proportioned underneath "so the playtesters' comments on how the cars look will be the real verdict".

## Hour 18:30Z

### H1 gets into a car, and out again

H1's rerun covered 14 steps on foot (neon signs, the Corner Store, crosswalks) and then a car. It got in with one F, and "it started rolling at 13 km/h without input". Then, in its words, the speedometer "stayed at 0 km/h even holding forward 2.5 s". Exit with F worked on the first press at steps 21, 23 and 28. MGR looked at the frames and diagnosed it: the car was not dead, it was **boxed in**, nose to tail with parked cars about twenty centimetres ahead and behind, "while the travel lane to its left is empty". A real driver would shuffle out; our arcade steering does almost nothing at zero speed, and a speedometer reading 0 makes it look broken. fable added that H1's build may have pre-dated V1's braking change.

### The 14 m jump comes back

At 19:10 MGR found it again. In H2's session, built after V1's braking fix, the player stood at about (6, 17) with an SUV 1.5 m ahead that the state file marked **unoccupied**, so a parked car, not a coasting one. One F press and the player sat in an SUV at exactly (-8.2, 16.7). "So V1's explanation for the 14 m jump does not hold." fable resumed V1 on it. Soon afterwards the swarm hit the account usage limit (about 19:20Z); H2's harness ended on idle timeout at step 23 and kept a partial video.

---

## 3 November, 06:20Z: the resume and the triage

### What the testers were thinking

MGR's triage opened with the testers' moods, drawn from their subtitles.

- **H1** liked dusk Throop: it read the neon OPEN and EBT signs aloud, liked the Corner Store's roll-down shutters, peered down a dark basement stair, and walked up to a parked police car to see whether it "bothers me". It found no people (it once walked toward "a person in a red top" that was a red car). Its mood turned in the car, which it found "suddenly" rolling, then immovable: "the whole row of cars along this block is nose to tail, so none of them can drive off".
- **H2**, the driver, "wanted a car fast" and got one in two steps, but spent the session fighting curbs, trees and stoops; a turn "spun the SUV almost all the way around"; it never found a mission because "the minimap shows only little yellow dots", and it ended by ramming parked cars on purpose "to see whether the cops notice". Nobody did.
- **H3**, the chaos tester, wanted trouble and found it after the morning's fixes (below).

MGR's list had 14 defects. The headline: **H1 got out of cars three times out of three**, on the slow renderer where your bug was worst. The big ones: PT3-1 the 14 m jump (P1); PT3-2 parked cars wedged nose to tail with no room to leave (P2, later raised to P1); PT3-5 missions hard to find; PT3-6 an empty-feeling street; PT3-7 ramming parked cars or driving on pavement raises no wanted stars. Others were small: a speedometer that reads 0 because the picture is taken after the keys are released, drivers that cannot be seen through the glass, and a flat dark square on the sidewalk that "looks like a hole".

fable relayed H2's report and opened lane **DRIVE** for steering, crimes, a findable mission marker and a truthful speedometer. MGR asked DRIVE to say whether its steering change would let a boxed-in car pivot out.

### The user's new orders

At 06:32 fable relayed your instructions: send the next playtest video; get graphics to "at least GTA3-style" for the next push and "GTA V level by the end"; generate the actual buildings from map data and real-world textures; a missions agent for GTA-style missions, side quests and a DJ storyline (a secret afterhours club called Aftersloth, a fake record shop, a home with turntables); and a "Radio SC" streaming DJ mixes from SoundCloud. fable made the licensing calls up front: **no Google Maps or Street View data or pixels** (use OpenStreetMap and NYC PLUTO, running from a fixture until the hosts are unblocked, plus your own photos); **no copyrighted records bundled** (records come from your library, a drop folder or procedural); SoundCloud only through its official embedded widget. Six lanes launched: MDL2, GFX, GEO, MISS2, CLUB, RADIO2. fable also posted a graphics ladder, which MGR would judge every check-in against: GTA3 (no flat untextured surfaces, real models, lit windows, fog hiding the edge), GTA4 (wet reflections, per-hour grading, crowd variety, clutter, contact shadows), GTA5 (screen-space reflections, light shafts, filmic palette, ambient life). CLUTTER was added for density.

### The teleport that was a shove

At 06:45, V1 closed the case. It reproduced it headlessly with the real build, and found it was **not a teleport but a shove**. The SUV's driver door is on its street side, but the player stood on the sidewalk side. During the 0.4-second walk to the door, the player's body glided through the car's box, the contact pushed the parked SUV out at 7 to 9 m/s, and it slammed the neighbouring sedan across the lane, ending at exactly (-8.2, 16.7). A control run without the player left the car where it was. The braking fix had been unrelated. The fix: remove the player's body from the physics world when the walk to the door starts. MGR checked that entering can never be abandoned halfway and accepted: "It was a shove, not a teleport, and it also explains part of what H2 felt afterwards, because H2 started its drive in a car sitting crooked in the middle of the avenue." V1's browser run: 28 of 28.

### Reports from the big morning

- **GEO** built the real-buildings pipeline but changed nothing in the data: the map hosts are still blocked. It reads OpenStreetMap and PLUTO, protects hand-edited lots, and is tested on a synthetic fixture. It was honest that the default map origin and the PLUTO dataset id "are from memory". MGR accepted both caveats.
- **MDL2** found CC0 civilians (Quaternius) but no realistic CC0 car. MGR warned they were about 6 MB combined and would push the artifact past 12 MB. **MDLI2** answered by keeping only Idle, Walk and Run and compressing with meshopt: each person fell from 1.0 to 1.3 MB to about 0.3 MB, all five fit, the artifact is 9.58 MB, spawn draw calls went from 233 to 252 (+8 percent). Pedestrians now choose among six models; skin tones were recoloured because the pack's own skin "is near black". MGR's observation: in a noon sidewalk frame "there is still nobody on it". Variety is solved, density is not.
- **RADIO2** built Radio SC with the official widget only, falling back quietly after 8 seconds in the offline artifact. **MUSIC** reported the only reachable CC0 song source is AI-generated lo-fi, nothing rap, trap, house or dub, so your own files stay primary.
- **CLUB** delivered three procedural rooms (Wax Deli, Aftersloth, your home), a hidden club door that only exists after the password mission and opens 23:00 to 04:00, an Inventory that owns cash and records, a shop with previews, and a two-deck DJ game with a beat-match score. Its honest limit: nothing had been seen in a real browser yet.
- **MISS2** shipped 16 missions: six city stories, the four-chapter DJ storyline, three side quests, ten new objective kinds, a phone with texts. It spotted a timing trap: a game hour is one real minute, so a four-minute club set spans four game hours and could pass the 4 a.m. closing. WIRE froze the clock inside interiors.
- **DRIVE** found that a held key could turn the car 130 degrees in two seconds at 25 km/h. It capped the player's turn rate (at 15 km/h a two-second turn went from 88 to 49 degrees), added crimes for ramming parked cars and pavement driving, a gold minimap blip plus an on-screen "Mission: title, 85 m" pointer, and showed the 0 km/h H2 saw was "a real stop against an obstacle".

CLUB and MISS2 agreed their handshake in the open: **Inventory owns cash**, missions pay through it, and events are bridged by the wiring lane rather than imported. fable created **WIRE** to own all shared-file wiring, since five lanes now needed edits to `main.ts`.

## Hour 07:30Z to 08:00Z

CLUTTER reported its street layer: trash-bag piles that rotate by game day, newspaper boxes, bike racks, planters, road patches, tar snakes, manholes, posters, string lights with sneakers, and window air conditioners on about 17 percent of windows. MGR ran the global gates at 07:50: type check clean, artifact 9.51 MB, but 7 test failures in 4 files, "all in areas where a lane is working right now", so it routed them rather than alarming: MISS2's old three-mission test, a CLUTTER mesh-count cap, and DRIVE's pursuit tests. GFX reported its per-hour filmic grades, wet-road reflections, contact darkening, haze and film grain done, but its after-pictures were "stuck behind the render lock".

## Hour 08:15Z

### H3, the chaos tester

H3's report is the first evidence the morning's fixes worked. It ran for a parked SUV, rammed a parked sedan at 22 km/h, honked, drove onto the sidewalk at people, and watched the corner for stars. They came: one at step 14, three at step 18. At step 22 it wrote "a police car has now shown up right behind me, with a cop inside". It exited, re-entered and exited on single presses and finished flipping radio stations with E. Its spawn SUV stayed exactly where it was parked.

MGR triaged its four bugs. "Two F presses did nothing" was **not a bug**: H3 pressed F, waited 1.5 s and pressed F again, so the first seated it and the second exited, and the screenshot only came at the end (a harness blind spot, logged PT3-15). The car "stuck at 0 with forward held" was PT3-2 again: "Two of three testers have now lost several minutes to this, so I raise PT3-2 from P2 to P1". Reverse speed reading positive and Shift being handbrake in a car but sprint on foot were small. fable opened **STUCK** for parked-car spacing, wedge detection and a "Blocked: S to reverse, Shift handbrake" hint.

## Hour 12:30Z: the second cutoff and the last fixes

The swarm hit the usage limit again that morning; fable resumed everything at 12:31 and published artifact version 12 (9.58 MB; 1,694 tests passing, 2 failing in the five-minute traffic test on seed 21).

STUCK finished: parked cars now at least 6.5 m apart (was about 4.0 to 5.2), 8 m clear of corners, nothing parked within 7 m of the spawn car; a wedged car gets a 1.8 m/s push-out and a reverse assist; the video cut now matches the 30 action windows (3,771 s instead of 4,424 s). STUCK also found the seed-21 failures were not its parked-car spacing: they failed identically with the old placement.

### The seed-21 deadlock story

fable accepted that finding and opened **TA2**. TA2 reproduced it with a logging script and found a chain of three small things. On seed 21, a box truck turning left onto Throop stalled because its sensing ray grazed a parked car beside its exit lane. The cars behind it entered the intersection on green and stopped inside it. And there a left-turner and a straight-through car blocked each other with nothing to break the tie. The fix has one part per link: do not enter the box while the exit lane is jammed, the loser of a mutual block backs out, and a parked car your path clears is no longer a blocker. MGR verified the five-minute test passed and ran the full gate: tsc clean, **104 files and 1,702 tests passing**, "the first fully green run of this stage". One caution: a run started while TA2 was still committing failed the same two checks, "so for a while the result depended on timing".

### MGR on GFX

MGR reviewed GFX from disk because no final report existed. The rain frame at 21:00 showed "real reflections of tail lights and shop light, which is the single biggest step towards the GTA 4 look this stage". But reflections on car paint, the neon bounce and four of the seven after-frames did not land. Ladder verdict: **GTA3 not yet reached**. The night street passes most items, but the golden aerial still shows long flat party walls and identical tar roofs, the noon street has almost no sidewalk props and no people, and the flat black square on the sidewalk is still there.

### The check-in

At 13:27 MGR wrote `checkins/stage3.md`. In short: your car-exit bug is fixed and every blind tester confirmed it in play; the 14 m shove is fixed and confirmed by H3; the gates are green (tsc clean, 1,702 tests, 9.58 MB artifact, clean smoke at low and medium); the testers' biggest frustration, cars wedged at 0 km/h, is P1 and in STUCK's hands; WIRE, CLUTTER and STUCK had not posted final reports at close, so their reviews carry over.

---

## What the team learned in Stage 3

1. **A bug can be a symptom of performance.** The car-exit bug only appears when a frame runs two or more simulation steps: worst on heavy scenes and slow machines, which is exactly where you play. Its siblings (gamepad A, a second F, radio E) were found by asking "what else reads input per step?"
2. **Compare what a tester said with what the machine recorded.** The half-length harness actions, the 14 m "teleport" that was a shove, and H3's "F did nothing" were all found by reading thoughts next to step counts and positions. A first, plausible explanation (a coasting car) was wrong; the second look found the real cause.
3. **Blind testers find what builders cannot.** Three testers independently lost minutes to cars boxed in nose to tail, a problem no lane owned. They also confirmed fixes with fresh eyes: exit worked 3 of 3, cops came for pavement driving.
4. **Shared hardware is a hidden teammate.** Several browsers crashed validation runs until fable imposed the render lock; its price was long waits (GFX captured only three of seven after-frames).
5. **Review means checking, not trusting.** MGR counted W2's lots from the data, ran RADIO's tests, read H1's step counters, and admitted its own misreading of V1 and MDLI's report.
6. **A request to "everyone" is a request to no one.** The roundtable stalled for 40 minutes until pushed into each lane's session; messages once reached the wrong lane.
7. **Wiring needs an owner.** With five lanes needing edits to the same entry file, a dedicated WIRE lane kept the game connected.
8. **Fixes interact, and gates flicker while lanes overlap.** The gate was red for much of 3 November, and the traffic deadlock only showed on one random seed. Honest root-cause work (TA2) beat loosening a test.
9. **Licensing decisions made up front kept work moving**: no Street View, no bundled records, widget-only SoundCloud, CC0 models only.
10. **Honest limits matter.** CLUB's interiors, GEO's real data and GFX's after-frames were delivered with the unverified part stated.

---

# STAGE 4: Reaching the GTA3 Bar
*3 November, 13:31Z to about 23:00Z, with a long pause in the afternoon*

**The target.** Stage 3 had ended with green gates and your car-exit bug fixed. The manager's graphics ladder (a checklist of what the picture must look like, one rung per GTA generation) had not reached its first rung, "GTA3". Seven standard camera viewpoints are judged against it: a noon street, a noon corner, a golden-hour aerial, a dusk car view, a night car view, a night corner and a morning view of the traffic signals. fable opened Stage 4 at 13:31Z with two lanes: **GTA3** (a Sonnet agent to close the manager's gaps) and **H4** (a Haiku blind tester for the phone version and the record shop on build "v13").

## Hour 13:30Z: the black square turns out to be tree pits

GTA3 opened with its plan at 13:31: find and fix "the black square on the spawn sidewalk", add brick variants, soot and blind windows to the party walls (the tall side walls of buildings that you see above a lower neighbour), vary the roofs, and make the number of pedestrians "follow the hourly curve with two idle behaviours".

By 13:43 GTA3 reported the party walls (four brick colours, soot, ghost signs, blind windows), three tar-roof looks with vents, hatches and parapets, and pedestrians that thin out at night, all unit-tested. It asked fable for two lines in the main file so the street density would follow the clock; fable had them in by 13:43:38.

The mystery of the black square took longer. At 14:31 GTA3 reported the finding: the flat black squares on the spawn sidewalk "are the tree pits". They had been merged into the ground mesh with the darkest concrete variant, "about 10 percent albedo, near black in shade". [Albedo is how much light a surface reflects.] At 15:03 it added a second cause: their texture coordinates sat "at about 100 from the origin on a normal-mapped slab". It had changed `RoadBuilder.ts`, a file outside its lane, and asked fable to "accept or revert". fable answered at 14:33: "accepted: your line-local RoadBuilder.ts change ... is blessed; keep it, add a test that tree pits use a soil/mulch look, and carry on." The same pattern as before: a lane may edit a file it does not own if the edit is a few lines and it announces them.


## H4, the first phone-tier tester

H4 finished at 13:56Z. Its report: the phone picture "reads fine on Throop Ave (brick, signs and minimap are clear; distance fog is soft)", the mission pointer worked, and Crate Digger started at the gold ring after about six steps. Then two things went wrong. At the WAX DELI stairs, "my position did not change for four steps", the mission timer kept running, and the door prompt showed "at one exact spot". Inside, F at the counter opened the shop panel, but "the Throop Night Bus Buy button is clipped at the bottom of the 640x360 screen, and none of the keys I have (Tab, arrows, Space, Enter, F) can operate or close the panel". The state file even said `menuOpen false` while the panel was on screen. It also noticed that walking north made the pointer distance grow from 15 to 25 metres.

fable relayed it at 13:57 and opened a new lane, **SHOPUX**, for the shop and DJ panels. MGR later numbered the problems PT4-1 to PT4-5. [PT means playtest; the numbers are defect IDs, and P1 to P3 are severities with P1 the worst.]

## SHOPUX asks for four small edits

SHOPUX's plan at 13:57 was to make the panels fit small screens, add keyboard and gamepad control, pause the mission timer while a panel is open, widen the door prompt and open the blocked stoop. At 14:22 it posted three main-file edits for fable. The most telling: the pointer arrow should use the camera's heading, because "on foot the body heading differs from the camera". It added, to H4's credit and its own: "distance maths was already right: H4 really walked away from the giver". fable applied all three by 14:23.


At 14:51 SHOPUX found a fourth problem by experiment: while the mouse is captured by the game, "every click lands on the canvas, so the shop Close button cannot be clicked (proved headless)". fable applied the two-line fix within 30 seconds.

By 15:03 SHOPUX had a 3.2 m wide, 2.6 m deep door band, a gap in the Wax Deli fence, panels that fit, and nearly everything verified. What still failed was the last step of its own replay: "entering the home door and opening the decks". It promised a final report in about fifteen minutes.

## 15:45Z to 16:30Z: the build, the manager's verdict, and a tester who never got there

fable published artifact "v14" at 15:45: 110 test files, 1,743 tests passing, 9.60 MB. At 15:48 MGR posted a batch of reviews, including two for work that had been sitting unreviewed from Stage 3.

**STUCK (the wedged-cars lane): accepted.** Parked cars now keep "at least 6.5 m between them on each kerb and stay 12 m back from the intersection". A car pushing against an obstacle for more than 0.8 seconds "gets a gentle push-out and reverse assist, and after 1.5 s the HUD says 'Blocked: S to reverse, Shift handbrake'". The boxed-in test went from 0 metres of movement to at least 2 in three seconds. MGR also noted that STUCK had "correctly showed that the seed-21 traffic failure was an intersection deadlock and not its spacing", which TA2 then fixed. That closed the testers' biggest frustration from Stage 3, "pending H5's confirmation in play".

**GTA3: accepted, but the ladder only partly met.** GTA3 had never posted a final report, so MGR judged it from its 15:03 status and the frames. Verdict by viewpoint: noon street *met*; both corner views *cannot be judged*, because "the camera still sits against a brick wall since W2's density change in Stage 3"; golden aerial *mostly met* (near walls and roofs fixed, distant skyline still plain tan blocks); both car views *not met*, "for one reason: the box truck in the foreground has a flat, untextured lavender body that fills a third of the frame"; morning signals *met*. People were better but uneven: three pedestrians walking past the Wax Deli in one frame, and the same spot empty a minute later.

MGR also triaged H4, restating what H4 was thinking and splitting its trouble into five numbered defects, all of which SHOPUX had already addressed on paper. It noted that H4 starting Crate Digger after six steps "confirms DRIVE's findability fix (PT3-5) in play."

At 16:17 MGR sent a short nudge to SHOPUX: its fifteen minutes had become over an hour, so "please post what you have, even if the home-door and decks step is still failing, and say so plainly, because H5 is testing exactly that path". MGR added a fallback offer to fable: if SHOPUX had stopped, MGR would review "from disk, as I did for MDLI". There was no reply. The reason shows up only in the manager's check-in, which says Stage 4 had "one usage-limit pause in the afternoon". The log simply goes quiet for almost six hours.

### H5: the tester who could not get there

Before the pause, H5 (also Haiku, phone tier, build v14) had finished at 16:25Z and its report is the most downcast of the stage. "I could not get far." It followed the HUD pointer to Throop Ave and the Golden Cork shop but "never reached WAX DELI or my home". In order:

- Steps 4 to 5, 7, 12 to 13: walking "into brick walls with no clear way round", and "the glass deli front blocks the sidewalk with no visible gap".
- Step 11: "the Crate Digger mission was silently replaced by Laundromat Getaway with no toast, while the state JSON said mission null until step 15."
- Steps 16 to 22: "the duffel objective never triggered on F at the pink mat", and the timer ran "from 6:00 to 5:40".
- Steps 24 to 25: "P did nothing under either key name, so the phone could not be opened."
- Steps 27 to 30: "F gave no door prompt next to the box truck, so driving was untestable."

It still said something kind: "The HUD pointer and minimap are readable and fun, and the dusk street looks good."

fable relayed it and opened lane **MISSFIX** for the mission flow. MGR then wrote a long triage. Its retelling of what H5 was thinking is worth keeping: H5 "set out to do Crate Digger and visit the record shop and home decks", but "as it closed in on the Crate Digger marker, the pointer silently switched to Laundromat Getaway, and it walked into that giver and started the wrong mission without meaning to". Then it stood on the pink pad, "pressed F five times to 'grab the duffel'", watched the timer run, abandoned the mission, tried the phone and ended beside a truck with no "Enter car" prompt.


MISSFIX started at 16:28 and the first fix, the key whitelist, was done by 16:30 (P, Enter, Escape and Backspace now accepted, with Escape dropped unless a shop or deck panel is open "so it cannot open the pause menu").

## Evening: the pause ends, three accepted lanes and one surprise

The log resumes at **22:08Z**. SHOPUX posted a one-line FINAL: all five items done, 619 tests green, build ok, and a headless replay at 640 by 360 that "passes every check with errors []". MGR, who dislikes a one-line report, reviewed the work itself at 22:09 and accepted it: it ran 14 files and 118 tests and read the git changes. It noted "what is not yet proven is the same path in a blind playtest, because H5 never reached the shop."


### The review that was reversed

Then, at 22:40, MGR did something it does rarely: it **changed its own verdict**. "MGR: correction to my MISSFIX review. The global gate on b603440 has one failing test, and it is caused by MISSFIX's door-distance change, so I am changing MISSFIX from ACCEPT to DEFECT." The failing test was the enter-exit test: a car parked with its driver door against a wall. Before, a player on the street side was too far from that door to get in. The new distance counted the whole car body, "so the player can now get in from the street side, which is good for the box truck. But Player.exit still always puts you out of the driver's door, which here is against the wall, so the player ends up inside or beyond the wall." In MGR's words, "That is the same family as the user's original complaint", and it is the free-spot search MGR had flagged as an open item at the end of Stage 3. The fix it asked for: try the driver's side, then the passenger side, then the rear.

MISSFIX replied at 23:03: `Player.exit` now picks "driver side first (unchanged when free), then passenger side, rear, front, then a little further out; if walled in everywhere it steps back out where the player got in". It also made `tryEnter` refuse a far-flank entry when no side is free. 865 tests passed. The old test needed no change ("0 failing placements"), and a new wall-side test was added. fable wired a new line in the main file at 23:03.

The lesson MGR drew in the check-in is plain: "I had accepted MISSFIX on its tests, and only the full suite showed that its door change unlocked a bad exit."

## The user's new request: Radio SC from ra-nyc

At 22:34Z, in the middle of this, fable opened **RASC**: "Radio SC now sources random DJ sets (45 min minimum) from the user's ra-nyc API and shows 'title — DJ' on the HUD." [ra-nyc is the user's own app that lists New York DJs and events; Radio SC is the in-game radio station that plays SoundCloud mixes through SoundCloud's official widget.] fable also added a same-origin rewrite in `vercel.json`, `/ra-api` to `https://ra-nyc.vercel.app/api`, so the hosted build can call the app without being blocked by the browser's cross-origin rule.

RASC's plan was one line (a pool of 45-minute-plus sets in a file called `RaFeed.ts`, wired into the station, a library status line and a toggle, docs and tests). By 22:38 it had posted FINAL, with tsc clean, 319 audio and UI tests green, build ok. fable accepted it on the gates and asked MGR to review.


MGR's review at 22:40 checked the user's five requirements and found them met in code: sets of at least 45 minutes only, nothing requested before the first tune-in, a quiet fallback after a 429 ("too many requests") reply, no repeats until every set had been heard, and pasted links still playing. It had one thing to confirm: "SoundCloud itself reports milliseconds, and if ra-nyc passes those through, every set longer than 2.7 seconds would pass." It could not check because `ra-nyc.vercel.app` was "blocked from this sandbox (proxy 403)". It also listed three small defects: Retry-After recorded but never used, the just-finished set possibly repeating at a round boundary, and one failed artist lookup stopping the whole build.

This is where fable settled the unit question. At 22:40:11, a few seconds after MGR's review: "duration unit confirmed from ra-nyc source (api/_lib/artistLinks.ts: duration = Math.round(t.duration / 1000), so seconds; the ≥ 45 min filter is correct as written)." The three small defects went back to RASC, which posted a fix at 22:40:41: "RaFeed 429 now resumes after Retry-After (default 60 s), round reset excludes the last-played set, a single failed artist lookup is skipped (stop only on 429 or network failure). ra-feed tests now 15." (MGR's later note on 7 Nov still lists the unit as unconfirmed "from here". fable had read it from the source; MGR had not seen a live response. That small mismatch of who knew what persisted in the check-ins.)

## The phone gets too heavy

At 22:45 MGR added an alarm: the phone smoke test "loads with no errors, but at the spawn view it draws 209 calls and 815 thousand triangles, against the phone budget of 120 and 500 thousand that MOB met in Stage 3". The suspects were the new pedestrians, the wall and roof detail, the clutter, or PHONEGFX's work in progress. "The user's own complaint that started the phone tier was that the game is too heavy on their phone, so this matters." It sets up one of the better detective stories of the project.

## The Stage 4 check-in

MGR wrote `checkins/stage4.md` at 22:41: the GTA3 bar met on three of seven viewpoints and mostly on a fourth, two viewpoints that cannot be judged, two car views failing only because of one flat truck, and a gate with "one real failure" (the exit-into-wall bug, now P1). Its process note says lanes increasingly post "one-line final reports ... or none at all", so reviews have to be done from disk, and it proposed "a short template (files, tests run, numbers, what is not done)".

---

# STAGE 5: The Feel Lanes
*3 November, 22:12Z, then a pause, then 7 November, 03:44Z to 04:43Z*

**The user's verdict, and fable's reading of it.** At 22:12Z fable posted the user's latest message, dated 3 Nov 22:40Z: "Graphics do not yet feel like GTA3, let us get that working." (The timestamps on that post and the user's message disagree by about half an hour; I quote both as the log has them.) fable's reading of its own frames was blunt: "toy-proportioned cars, flat noon light, a camera too high and far, no shadows on the phone tier." That sentence became four lanes, all started within about 20 seconds of each other, all required to post "before/after frames of the same viewpoints":

- **CARS2:** "procedural GTA3-quality car bodies at real proportions replace the Kenney toys." [Kenney is a free pack of simple low-poly models; procedural means built by code.]
- **CAM:** "GTA-style lower/closer follow camera, look-back, speed FOV, idle cinematic."
- **ART:** "one coherent warm filmic look on every tier, sky with clouds and sun, baked facade AO, texture variation."
- **PHONEGFX:** "blob shadows + small shadow map + grading + sign bloom on phone within 140 draws."

### Neighbours negotiate

At 22:12:54 ART asked PHONEGFX to switch the hourly colour table on for phones, since the phone had "one grade all day with no hour variation"; PHONEGFX's 22:30 progress included "the phone grading LUT switch", so the request was accepted without argument. At 22:15 and 22:23 fable told ART and CARS2 their tests or types did not pass the type check ("Fine mid-edit, but npx tsc --noEmit must be clean before your FINAL REPORT"). CAM also posted a design decision at 22:18: "the camera pivot now rides rigidly on the car so there is no trailing lag at speed; only the rig distance, height and field of view ease, and a small extra pull-back of 0.9 m at top speed gives the sense of speed."

## The gap

PHONEGFX's 22:30 progress note is the last Stage 5 post of 3 November (MISSFIX and RASC, told above, posted a little later). The next Stage 5 entry is dated **7 November, 03:44Z**. Nothing in the raw log explains the three and a half days. MGR's Stage 5 check-in does: Stage 5 "picked up after the Stage 4 close on 3 Nov, paused for the usage limit, and closed after the feel lanes reported on 7 Nov". When the limit reset, the lanes simply carried on from the files on disk: CAM and CARS2 posted full final reports within eight minutes of each other, with no catch-up discussion in the log.

## 03:44Z on 7 November: the reports arrive

### CAM and "the truck question"

CAM's FINAL REPORT (03:44) lists the finished camera: car rig 4.6 m back and 1.7 m up, a yaw spring that re-centres in about 1.2 s, and a rig that "scales with vehicle size ... so the sedan is unchanged and the 7 x 3.2 m box truck sits 7 m back and 4.9 m up and now shows the road over its roof (test added)". On foot it is 3.2 m back and 1.55 m up, with look-back on C, a touch button or right-stick click, an idle cinematic after eight seconds and a mission letterbox.

fable's 03:44 handoff asked MGR to judge the dusk and night car frames. MGR's answer at 03:45 is the best example of reviewer and author converging by evidence:

"I think they now PASS the GTA3 bar. The truck's rear covers about a quarter of the frame's width and a bit over half its height. Both sidewalks, the road ahead, the storefronts and the sunset or night sky are visible over and around it. Following a box truck from behind looks like this in GTA3 too. More importantly for the ladder, the truck's rear is no longer a flat untextured slab: it now shows a ribbed roll-up door, tail lights and a plate."

### CARS2: ten draw calls, not six

## The ART night-brightness argument

This is the stage's clearest disagreement. ART's FINAL REPORT at 03:53:44 said, in short: warm grade on every hour key, clouds with a sun disc, haze, baked facade shading, ground variation, smoke run clean, and "night street 0.239 at 21h and 0.195 at 0h (no worse than the stage 2 baseline, the lit shop window sets that level)".

MGR checked the number against the rulebook, which says the night street should sit in a **band of 0.085 to 0.13** (average picture brightness, 0 black, 1 white). Its review, posted eight seconds later, is a DEFECT on that one item:

"ART argues this matches the Stage 2 baseline because the spawn view looks into a lit shop window. That claim cites a Stage 2 note that L10 superseded in Stage 3. L10 capped the shop glazing, and the Stage 3 section of docs/reference/light-baselines/stage2.md records 0.127 and 0.130 on the same view."

MGR then ruled out the other suspect: the new camera. "I also checked that the rise is ART's grade and not CAM's new framing. 6-night-corner looks at the same brick wall before and after, and its mean went from 0.090 to 0.211. 5-night-car went from 0.099 to 0.200, and 4-dusk-car from 0.069 to 0.258. So night now reads more like late dusk everywhere, and the BIBLE's 'it has moods' property depends on night feeling different from dusk."

The fix was specific (keep the day and dusk retune, pull the night keys back), and MGR left a door open: "If Fable or the user prefers brighter, more readable nights, that is a fair choice, but then the band in PRD §5.4 should be changed on purpose, not by accident."

fable relayed ART's response at 04:02, and ART posted the root cause at 04:04: "Cause was my cloud and haze light feeding the night environment capture; cut at night plus slightly lower night and deepNight lift." So both sides were partly right. The shop window did contribute, but ART's own new clouds and haze were lighting the night sky reflection. New audit numbers: street-level 0.126 at 21h and 0.103 at midnight, blown pixels at most 0.02 percent. (The whole-frame figures were 0.156 and 0.115; the difference between "whole frame" and "street-level, low half" was itself something fable asked MGR to rule on.)

MGR re-reviewed at 04:40 and accepted. At midnight, 0.115, "the street is now properly night again". At 21h, "the game clock is only just past dusk, and the frames read as deep blue hour rather than full night." Its concern led to a proposal and not a demand: "either trim the 21h key a little more, or agree that the night band applies from 22h, where GTA itself still shows a lit blue-hour sky at 21h. I recommend the second ... as a decision for Fable rather than a defect."

**Fable's decision**, at 04:43:52: "(1) yes, the night brightness band applies from 22h; 21h is blue hour, do not darken it further; record it in PRD §5.4." So the rule changed on purpose, in writing, rather than by accident, which was the whole point of MGR's complaint.

## The phone leak that was the shadow pass

This is the detective story begun in Stage 4. After ART's work MGR measured the phone tier again and wrote at 03:53 that the phone was "now at 202 to 227 draw calls and 738k to 949k triangles across the seven views (before ART: 113 to 155 and 333k to 518k). That is far over the budget of 120 and 500k. Not all of it is ART's, but ART's facade and ground work reaches the phone tier, so ART and PHONEGFX must say what each costs there." It was a fair suspicion: ART added facade shading, CARS2 added bodies, and both reached the phone.

PHONEGFX answered at 03:54:39 with evidence rather than defence: "the leak is the shadow pass, not the cars, pedestrians or clutter. ART's phone stats show scene 113 to 144 draws but shadow 81 to 89 draws and 370k to 454k triangles." The committed `Shadows.ts` had switched the phone sun shadow on, "but main.ts is not yet wired to my blob casters, so every world mesh casts into it." Put plainly: the game was drawing every building a second time into a shadow map, because a new feature had been switched on in one file while the cheap stand-ins that were supposed to feed it were not yet hooked up in another. "With my wiring the shadow pass is 3 draws and 8k triangles and the spawn view measures 125 draws and 414k triangles". PHONEGFX also made the shadow map "switch itself off until the casters exist, so an unwired main.ts can no longer leak", and thinned the phone fog to 30 to 100 metres to un-wash the aerial view.

fable applied the wiring at 03:59, and MGR's review (accept) says "Fable's diagnosis is right and is the most useful finding of the stage". The log shows PHONEGFX posting the finding itself, so I cannot say from the transcript who saw it first. The numbers afterwards were the proof: "The seven viewpoints at phone measure 108 to 141 draw calls and 301k to 480k triangles, against 202 to 227 and 738k to 949k before." ART measured its own share at 04:04: at most 4 draws and 13 thousand triangles. MGR's process note: "measure the shadow pass separately (`drawCallsShadow`) before blaming geometry."

## Two corner views were facing a wall

Another long-running problem finally got a decision. Corner viewpoints 2 (noon) and 6 (night) had been unjudgeable since Stage 3 because the camera stood "7 m inside the block west of Throop and faced a wall". At 03:54 fable moved them to "the SW sidewalk corner of Throop & Kosciuszko ... looking NE across the intersection", and ran a fresh capture, "v15". The phone drew 116 and 132 draws there (under 140), and MGR's triage at 04:46 passed both at low and phone: "textured buildings, signals, a cab, trees and crosswalks by day; lit windows, lamps with bloom and stars at night." Six of seven viewpoints were now met.

fable also published artifact **v15** at 04:11 (9.45 MB; 119 test files, 1,897 tests; "same link as before"), and started H6.

## H6: the first blind tester to get through the shop

H6 (Haiku, phone tier 640 by 360, port 4431) began at 04:08:45. It ended after 48 steps at 04:42, stuck near Lafayette Avenue. fable's summary at 04:43 and MGR's at 04:46 agree with the tester's own transcript. Here are H6's subtitles, in order, because they are the best window into a first-time player.

**Finding the shop.** Step 1: "Spawned on a busy street with a brick wall right next to me and a big yellow sign ahead. The top pill says Offer: Crate Digger 15 m with a down arrow, so the goal is behind me. I will turn around to find it." Step 4: "The offer turned into a mission called Crate Digger with a timer of 8:00 and the cash went from 120 to 180 somewhere along the way." Step 5, on turning: "I overshot ... The big half-turn I asked for only swung the view about 90 degrees." Step 8: "The prompt now says F Enter WAX DELI and the screen is going dark, so I am at the door."

**Buying a record.** Step 9, inside: "The mission log jumped to Buy Throop Night Bus, Spin Cycle Love and Fire Escape Sunrise, and the goal says 4215 m, which is odd since I am standing in the shop." Step 13: "I have $180, so I will press F to buy it." The toast read "Bought 1/3". Then, a very human decision at step 15: "I was only going to buy one record today, so I will leave the other two."

**The invisible wall.** Step 22: "I have walked into a corner between a brick wall and a shop window." Step 26: "I keep bumping into the same wall at the same spot, and the camera is pointing at a stoop with a doorway. I think the way west is blocked here." Step 28: "The walk west keeps stopping at the same spot, as if there is an invisible wall." Step 30, on the phone: "The arrow key did not switch the phone tabs. It turned my camera instead, so the phone seems to have no keyboard navigation for its tabs." Step 35: "a red dot at the corner of my minimap, which I cannot read."

MGR's triage gave the verdict on H6's significance: this was "the first blind tester to get through the record shop". So the Stage 4 shop fixes worked "in blind play". Then it listed ten defects, PT6-1 to PT6-10. The headline P1: "On-foot movement blocked where nothing is drawn", with the speeds at 0 recorded at specific coordinates, and at the last spots "the harness lists no obstacle within 6 m, so whatever stops the player is not a visible body". The P2s were no HOME marker, no minimap legend, the mission text overlapping the goal banner, and phone tabs not reachable by keyboard.

MGR also raised a housekeeping flag that became a decision: H6's session folder is "committed", 106 files including `playtests/h6/playtest.mp4`. Its suggestion: "move session folders back to the scratchpad and add playtests/ to .gitignore, so the repository does not grow by a video per playtest; that is your call, since it touches git history and shared files." The Stage 6 check-in repeats the figure (about 100 MB on disk). fable's reply is not in the log, but the repository shows the answer. The `.gitignore` now ignores the raw `playtest.webm` files and `video/` folders and keeps "the cut mp4" and the transcripts, and every later playtest (H7, H8, SHOP7) is committed under `playtests/`. So the decision was: playtests stay in the repo, trimmed to the cut video and the written record.

## Closing Stage 5

At 04:42 MGR wrote `checkins/stage5.md`: all four feel lanes accepted, both Stage 4 blockers closed, and the gate green on commit 2e69cc7 (tsc clean, 1,897 tests, 9.45 MB; smoke at low 273 draws, medium 323, phone 115 and 391 thousand triangles). fable closed the stage at 04:43 and launched Stage 6 in the same message: NAV6 for the invisible walls and HOME marker, HUD6 for the banner overlap, phone keys and "swapped street-sign suffixes", and GTA4A for the far skyline, the pop-in check, truck liveries and the SUV.

---

# STAGE 6: Getting Around, and the Last GTA3 Items
*7 November, 04:44Z to 05:31Z (47 minutes)*

Three Sonnet lanes launched in the same minute, one for each cluster of H6's findings. This is the fastest stage so far: from H6's report at 04:43 to a published build at 05:30, less than an hour.

## NAV6 and the two different traps

NAV6 planned a "sim walk test over grid.sidewalks, find collider cause, fix". At 04:48:04 it had the first cause: "scaffold-lot plywood hoarding collider stood 0.9 m off the facade = a 0.9 m slot a hugging player walks into and wedges (Throop W z56-63)." [A hoarding is the plywood fence around a lot under work; its invisible collision shape left a slot just wide enough to walk into and too narrow to turn around in.] The new `walkable.test.ts` reported it, and the offset became 0.3 m. It also proved parked cars never sit on a sidewalk and added the HOME sign, minimap icons, a navigation pointer and a legend. Its FINAL REPORT at 04:58 was three lines.

MGR reviewed it at 05:01 and accepted it, after answering the three checks fable had asked: does the walking test cover both sides of every street and the metre against the building? (yes, every 0.2 m, curb to building line); are parked cars off the sidewalk? (yes); is HOME marked? (yes). Then it found the catch:

"THE GAP: H6's last eight steps were stuck further south, at about (-12.9, 19.4) to (-11.5, 21.8), near Lafayette. The harness listed no static obstacle within 6 m there, and x = -12.9 lies on the building side of the lane the e2e walk uses (x = -10.6). NAV6's report does not say what stopped the player at that spot." MGR's guess was a stoop or areaway fence gap that the sweep, which stopped at the building line, could not see. "I count PT6-1 as fixed for the hoarding slot and open for that one spot."

NAV6 posted the answer at 05:06 and it was a *different trap*: "the H6 spot was inside the walled areaway yard of lot r2c0-E-8 (Throop W z19-26): building set back to x=-14, fence r2c0-E-8-areaway1/2 at x=-11.1 left a 1.0 m basement-entry gap (z19.7-20.7) and the stoop block r2c0-E-8-stoop0 sealed the other gap, so the yard was a room with one 1 m door." [An areaway is the sunken yard in front of a brownstone's basement door.] The entry gap became 1.6 m on every stooped lot, and the sweep now reaches 3.5 m past the building line. Both new tests "fail before, pass after", including one at H6's exact coordinates. fable applied and committed it at 05:06.

The check-in states the lesson: "'Fixed' needs a test at the tester's exact spot. NAV6 first fixed the trap it found, but H6's last stuck spot was a different trap a few metres away. Only a test at the coordinates the tester actually reported closed it."

## HUD6 and the street signs that were not swapped

HUD6 planned six items and by 04:51 had all of them coded. Its FINAL REPORT (04:56) listed: mission objective, step counter and timer moved to "their own column above the goal banner"; the goal distance hidden indoors (an "inside" flag); the location card restyled; a toast on mission start; phone keys; and street sign blades.

The signs were the interesting one. Both MGR and fable had read the v15 corner frames as showing "'Kosciuszko Ave' over 'Throop St'", suffixes swapped (defect PT6-9). HUD6 went and looked. MGR's review at 04:58 reports what it found: "HUD6 found that the suffixes were never swapped in the data. The two blades crossed at the pole, so each hid half of the other, and 'Kosciuszko St' and 'Throop Ave' read as 'Kosci... Ave' over '...p St'. The blades now stack and hang toward the block, with a test on the real data." MGR's verdict is a little humbling for the reviewers: "That is a better fix than the one I asked for." The Stage 6 check-in makes it a rule: "Reviewers should describe the symptom and leave the cause to the lane."

## GTA4A: no proxy layer, a pop-in check, and a restart

GTA4A had three jobs: the far skyline, a pop-in check, and cargo liveries, plus trimming the SUV. Its first progress note (04:54) corrects a premise. The brief said the distant blocks were a proxy layer of plain tan boxes; GTA4A "found no proxy layer exists (beyond-grid is void; tan blocks are real far lots)". So it built one: `src/world/Skyline.ts`, "1 mesh/1 material, window atlas, lit windows at night, 6 colours, parapets, tanks, masts". It trimmed the SUV from 2,816 to 2,492 triangles, and wrote the cargo-box livery painter.

At 05:10 it reported the first pop-in result. `scripts/popin-check.mjs` walks the camera 80 m down Throop and lists every mesh that first appears within 60 m. "Before: only offenders are CarLod near/far swaps at 24-29 m (8 cars, no props/buildings/clutter)." [CarLod is the system that shows a cheap merged model for far cars and swaps to the full model when they get close. At 24 to 29 m, you could see the swap.] The fix, raising the swap distance from 32 to 72 metres on low, medium and high (phone stays at 14), "moves the swap past 60 m; costs ~+25 mean draws on the walk (285 -> ~310)".

At 05:15 GTA4A posted "Status after restart: all four items and PRD note done on disk; re-queuing final popin (carNearDist 72) and vp3 low/phone renders now". The log does not say what restarted (the Stage 3 chapter has the same kind of event), but the effect is clear: the session was interrupted, and because the work was already on disk the lane only had to put its renders back in the queue.

MGR's review at 05:20 accepted all of it, with a cost ruling agreed with fable: the low-tier walk's mean draw calls rose from 285 to 317 (+11 %) and the golden aerial from 308 to 364 (+18 %), "both far below the 500 limit for medium, and car pop-in is exactly the kind of thing a player notices". The golden aerial row moved from "mostly met" to **met**. Pop-in: "Before the fix it found 41 rows, all the same thing: a car switching from its far merged model to its full body at 24 to 29 m. After raising carNearDist from 32 to 72 m ... it finds none, which closes the last GTA3 item."

## Closing Stage 6, and building v16

fable published artifact **v16** at 05:30: 127 test files, 1,947 tests, 9.47 MB, smoke at low 322 draws, phone 120 draws and 373 thousand triangles, all with `errors []`, a seven-view capture with zero console errors. It started H7 in the same message. MGR's check-in came at 05:31 with its headline: "LEVEL GTA3 is now met on all seven viewpoints at low and phone." One warning: medium now draws 447 calls at spawn against a limit of 500, "from the skyline plus the longer car range". A second, smaller one: H6's folder in the repository was about 100 MB.

fable closed Stage 6 at 05:31 and launched Stage 7: GFX2, CROWD, H7 and H8.

---

# STAGE 7: Toward GTA4, a Pause, and a Resume
*7 November, 05:31Z to 06:19Z; paused; resumed 9 November, 04:07Z*

## Four lanes and a measuring stick

fable's Stage 7 lanes at 05:31 were **GFX2** (car-paint reflections, neon bounce, a medium-tier budget check), **CROWD** (steady crowds by hour, clutter per block, two more pop-in routes), **H7** (the phone-tier tester replaying H6's route) and **H8** (a desktop player driving at night at 1280 by 720). At 05:33 MGR added section 5.4c to the requirements, "so everyone knows what I will check": medium under 500 draw calls on all seven viewpoints; a crowd audit showing "the street never empty for more than a minute of walking at noon or evening"; and "the night street still 0.085 to 0.13 from 22h, with blown pixels under 0.5 %". The night rule fable had decided on 7 Nov was now part of the measuring stick.

GFX2 had code in by 05:39: a clear-coat effect in `PaletteCarPaint` and `NightBounce.ts`, "additive sign/window/door bounce driven from NightLights". Then it also queued for the render lock, behind H7 and H8. For a long time the shared rendering machine, not any agent's pace, was what limited Stage 7.

## H7: the tester who looked for home and never found it

H7's session ran from 05:30 to 06:07 (58 steps, about 22.8 minutes of video). Its own summary: "Spawned on Throop Ave, could not find the HOME sign or house in about 20 steps of searching along Throop, Kosciusko and the sidewalks, so the home, turntables and DJ decks were never reached." The reason is in the first lines. H7's brief said the N key points the arrow at HOME, which was exactly what NAV6 had just built.

Step 2: "The brief says N cycles the pointer, so I'll try N to see where it points." The harness note: "ignored unknown key(s): KeyN". Step 3: "N did nothing, the harness ignores that key, so I'll rely on the minimap and the pointer." The fix NAV6 had delivered could not be tried, because the tester's tool refused the key. Step 12: "I didn't move at all. The camera was still angled south-west, so walking forward pushed me into the purple car." Step 18 was the first admission: "The street keeps going and still no HOME sign."

It then did something no earlier blind tester had managed. Step 23: "I walked into the Crate Digger ring and the mission started on its own." Step 31: "Bought Throop Night Bus for $14, so the bin count went to one of three." Step 33: "Two of three bought, $150 left." Then the long list: "The list is very long and I keep scrolling past records" (step 37). At step 39 it found Fire Escape Sunrise and the toast read: Ms. Odette: "Good. You do not buy what you like. You buy what you can mix." That is the first time a blind tester completed the shop half of a mission and heard the shopkeeper's line.

Then the troubles. Step 41: Ms. Odette said "There is a night I will not name. There is a door I will not name. Go be seen first." Step 45: "Oops, that Enter sold Stoop Season for $6 without any confirmation." Step 49: "The goal banner reads Head back outside inside, which is an awkward line."

### What MGR and fable did with it

fable's report at 06:08 gave the immediate fix for its own tool: "Harness fixes applied by me: KeyN/KeyQ/KeyC added to the whitelist, PLAYTEST.md half-turn corrected (1260 px)". That second part closes a small mystery. Back in H6's run, a requested half-turn "only swung the view about 90 degrees" (PT6-10); H7 also reported turns of "a quarter". The fault was in the tester's instructions: the documented number of pixels for a half turn was wrong, so testers who followed the document would turn too little. fable opened lane **SHOP7** (port 4439) for the game findings.

MGR's triage (also 06:08) numbered ten defects, PT7-1 to PT7-10: the missing keys; the HOME sign unseen for 20 steps ("the sign may be too small or face the wrong way"); selling a record with one Enter and no confirmation; Ms. Odette's cryptic line for a later chapter; E starting a preview instead of switching tabs; "Head back outside inside"; a late text; the radio caption over "Exit car"; and walking into an offer ring still starting a mission, flagged as a design choice for fable.

MGR ended with "Good news confirmed in blind play: the shop panel is usable with the keyboard, the mission pays out, entering and driving a car works, and the phone opens and shows the next job." Compared with H4 and H5 in Stage 4, that is a real change: a blind tester completed a mission.

## The user asked to pause

At **06:14:08** fable posted: "PAUSE: the user asked to pause. All lanes (H8, GFX2, CROWD, SHOP7, MGR): finish the step you are on, post a one-line status with what is done and what is left, and stop. Do not start new renders. Fable commits everything now." Only GFX2 replied at 06:19: "code done, tests green; still waiting for the render lock (H7 playtest holding it). Batch is queued." The repository history shows commits labelled "Pause: Stage 7 lanes WIP, playtest logs and transcript". The next post in the log is dated 9 November.

## 9 November, 04:07Z: the user returns with new direction

fable's RESUME post is the pivot of the whole project, so I quote it in full: "RESUME (user): keep iterating to at least GTA3. New direction: (1) models and skins must look GTA3 (chunky low-poly people with painted skins, baked car skins); (2) every music station becomes SoundCloud mixes with synthesized announcers, talk radio stays TTS; (3) the ten blocks must match the real Bed-Stuy from open sources; (4) a readable transcript at the end. Paused lanes SHOP7, CROWD, GFX2, H8 and MGR: resume where you stopped (limits reset, your work is committed). New lanes: SKINS 4440, RADIO8 4441, GEO2 4442, SCRIBE2."

The phrase "limits reset" explains the pause as the usage limit, and "your work is committed" is how each lane knew it could pick up where it stopped. Within 90 seconds the paused lanes posted a status:

- **SHOP7:** "all 10 items coded, unit tests green (679). Running build, then HOME render."
- **CROWD:** "Done on disk: crowd-audit.mjs (--clutter, --peds), clutter floor + test, PedestrianSpawn.ts scheduler + TrafficSystem wiring + tests. Now running baseline/after audits and 3 pop-in routes under the lock (port 4437)."
- **H8:** "old h8 session ended after 2 steps (idle timeout). Starting fresh session in playtests/h8b, port 4438, low 1280x720." (The old H8's transcript confirms it: it got into a white SUV, heard the radio say "WBED 88.9, Brownstone Boom-Bap", then ended with "idle timeout (600s without a command)". The log does not say why the tester stopped sending commands.)
- **GFX2:** resumed, checking whether its queued batch had run.

MGR resumed too and set the measuring stick for the new lanes (see Stage 8). GFX2's first results arrived at 04:08:58 and show it checking its own work against the rules MGR had written:

"Batch1 results: medium draws 444/437/487/470/434/423/446 (view 3 golden aerial 487 > 480, trimming); night bounce +0.008 at 22h (0.126->0.134, over band) so retuned gain 0.5; car coat too faint, strengthened. Batch2 queued."

In plain words: the golden aerial was above MGR's 480 warning line so GFX2 was trimming it; the new neon bounce had pushed the 22h street from 0.126 to 0.134, just over the 0.13 ceiling, so it halved the gain; and the clear coat was too faint, so it strengthened it. Nobody had to ask.

---

# STAGE 8 (the start): GTA3 Skins, SoundCloud Stations, Real Blocks
*9 November, 04:07Z onward*

Stage 8 is the user's second major redirection since the phone version. At 04:08 MGR added §5.4d to the requirements, with a measurable row for each new lane and a fourth for me.

**SKINS** (port 4440). Its plan at 04:09: build `pedBody.ts` and `painters/ped.ts` as the new default pedestrians, put the old glTF people behind a flag (`VITE_GLTF_PEDS`, as the cars were), and add baked car skins in `vehicle.ts` through `carModel.ts`. MGR's row: "chunky GTA3-style people of 600 to 900 triangles with painted skins, at least 12 civilian variants plus cop, shopkeeper and DJ, as the default; baked car skins; without breaking the phone (140) or medium (500) budgets." The board adds the style notes: PS2-era proportions, panel lines, door gaps, grime, chrome, decals.

**RADIO8** (port 4441), 04:10. The direction was "every music station becomes SoundCloud mixes with synthesized announcers". Its plan: a table of eight SoundCloud stations (house, techno/dub, hip hop/trap, disco/boogie, jazz/weird, reggae/dancehall, 80s/pop and Radio SC), each pulling 45-minute-plus sets from the ra-nyc pool "filtered by title keywords", with a fallback chain ("filtered pool > own links > any pool set"); and an `announcer` module, a persona per station, speaking station IDs and set titles every eight minutes and "never over talk". WBSY Talk stays text-to-speech; "My Library" becomes optional. MGR's row keeps the Stage 4 safeguards: nothing requested before first tune-in, and a quiet synth fallback offline.

**GEO2** (port 4442), 04:09. It wants the real map, and reported at 04:10: "Overpass (overpass-api.de, kumi) and NYC Open Data both DNS-blocked (ENOTFOUND). Doing BLOCKS.md from prior R2 docs + new WebSearch snippets." That is the wall R2 hit on the first day, 12 days earlier. MGR's row is strict: open sources only (OpenStreetMap, NYC PLUTO, LPC reports, Creative Commons photos), "never Google Maps/Street View data or pixels", a cited source and confidence for every changed lot, and a spot-check of five citations.

**SCRIBE2** (me) was told to cover Stages 4 to 8 in plain English "including the disagreements".

The log I have stops here: the three new lanes have posted only plans (and GEO2 its first blocker), and the first Stage 8 results had not been posted when I finished.

---

## What the team learned in Stages 4 to 7

1. **A lane can be right and still be wrong at the join.** MISSFIX's door change was correct for the box truck and made exits worse for every car beside a wall. Only the full test suite saw both. MGR's willingness to reverse its own ACCEPT, in public, is why the gate stayed meaningful.
2. **Measure the part before blaming the parts.** The phone tier came in at roughly double its budget, and ART, CARS2 and the pedestrians were all plausible culprits. Splitting out the shadow pass showed that one switched-on feature without its wiring was drawing every building twice.
4. **"Fixed" means fixed at the tester's exact spot.** NAV6's first fix was real and did not help H6's last eight steps.
5. **A rule that changes should change on purpose.** MGR refused to let night brightness drift (0.239 against a band of 0.085 to 0.13), and fable's answer was to move the band's start to 22h in writing, not to let the art team's grade stand by accident.
7. **Interruptions cost less when the work is on disk and committed.** The usage-limit pauses (the afternoon of 3 Nov, and 3 to 7 Nov), the user's own pause (7 to 9 Nov) and at least one restart did not lose work, because each lane had its code, tests and plan in the tree. The one thing that did go missing was the wait: renders queued before a restart had to be queued again.

---

# Where it stands now
*As of the last entries I read, 9 November, about 04:12Z*

**The GTA3 rung of the ladder is met.** The Stage 6 check-in says: "LEVEL GTA3 is now met on all seven standard viewpoints, at low and at phone." The checklist: no flat untextured surface; every car and pedestrian a real model with a shadow; lit windows and signs at night; decals; props on every sidewalk; fog hiding the world edge; no pop-in within 60 m. The last pieces were the lofted cars and truck (CARS2), the camera that no longer hides the street (CAM), the moved corner views, the windowed skyline and the 72 m car swap distance that cleared 41 pop-in rows (GTA4A). At the last full check the phone drew 120 calls and 373 thousand triangles at spawn (budgets 140 and 500 thousand), medium 447 (limit 500).

**The GTA4 rung is partly built.** Already in: per-hour grading, haze and lamp bloom, wet-road reflections, contact shadows, six pedestrian models and six car types with colour variants and liveries. In progress when the log paused: car-paint reflections and neon bounce (GFX2, code in and being tuned: the 22h night street is 0.134 after the bounce, just over the 0.13 ceiling, which GFX2 is bringing back down); steady crowds and clutter on every block (CROWD, scripts and a spawn scheduler written, audits waiting for the render lock); and a pop-in check on two more routes. The medium tier's golden aerial is 487 draws, above MGR's 480 warning line, and is being trimmed.

**Not yet proven in play.** H7 fixed the shop path, but no blind tester has yet found HOME, used the decks or tried the new HOME marker; SHOP7's ten fixes are coded and unit-tested but have not been replayed blind; H8, the night-driving tester, was restarted and had taken only its first step. Two older items are still open: a browser test of switching the phone tier to low while running, and a design question (PT6-7) whether the mission clock should pause while a player is stuck.

**Blocked by the network.** Real car models and real map data. GEO2 hit the same wall on 9 November that R2 hit on 28 October: the OpenStreetMap and New York City data servers refuse the connection from this machine. The Radio SC duration question (seconds or milliseconds) was settled by fable reading the ra-nyc source, though MGR never saw a live response.

**What Stage 8 is doing** (all three lanes started at 04:09 to 04:10Z on 9 November):

1. **SKINS: GTA3 skins.** Chunky, low-poly people (600 to 900 triangles) with hand-painted skins, at least 12 civilians plus a cop, a shopkeeper and a DJ, and baked car skins with panel lines, door gaps, grime and decals, replacing the current look while staying inside the phone and medium budgets.
2. **RADIO8: SoundCloud stations with announcers.** Eight music stations, each playing 45-minute-plus sets chosen from your ra-nyc pool by keyword, through the official SoundCloud widget only, each with its own synthesized announcer who reads station IDs, the DJ and set title, the hour and the weather. The talk station stays text-to-speech; your own files become an optional "My Library" station.
3. **GEO2: real blocks.** The ten blocks rewritten to match the real Throop and Kosciuszko area, from open sources only and with a citation per lot. Since the map servers are blocked, this lane works from earlier research notes and web search snippets and says how sure it is of each lot.

MGR will review these as their final reports land, and write the Stage 7 check-in when GFX2, CROWD, SHOP7 and H8 are in.

---

# Where this transcript stops

This extension stops at about **04:12Z on 9 November**. The last entries I read are the first plans of SKINS, RADIO8 and GEO2, GEO2's first blocker, and my own progress notes. Final reports from GFX2, CROWD, SHOP7, H8 and the three Stage 8 lanes, and MGR's Stage 7 check-in, had not yet been posted.

---

# Glossary

- **Acne / peter-panning:** speckled false shadows, and the opposite fault where shadows float away from objects.
- **Allocation (per-frame):** creating small temporary objects every frame, which makes the browser pause and stutter.
- **Artifact:** the finished game packed into one HTML file (about 6.9 MB, budget 12 MB).
- **Bloom / blown:** the soft glow around bright lights / pure white with detail lost.
- **CC0 / Apache-2.0:** a public-domain licence / a permissive licence that requires credit.
- **Collider:** an invisible shape physics uses to stop things passing through walls or fences.
- **Draw call / instancing:** one instruction to the graphics card to draw something; fewer is faster, especially on phones. Instancing draws many identical copies in one call.
- **Emissive:** a surface that glows by itself, like a lit sign.
- **FOR FABLE:** a request for the orchestrator to edit a shared file nobody else owns.
- **Gates:** the automated checks before a stage closes: type check, tests, build size, smoke test.
- **GTAO:** a shading effect that darkens creases and contact points.
- **Headless / smoke test:** a browser with no screen, used by robots to check the game loads without errors. Here it renders in software, so frame rates mean nothing.
- **Interpolation:** blending between two physics steps so motion looks smooth.
- **Metalness:** how mirror-like a material is; paint, glass and painted metal are near zero.
- **Procedural:** made by code rather than loaded from an image.
- **Regression:** something that worked and then broke after a later change.
- **Repro:** a reliable recipe, usually a failing test, that reproduces a bug.
- **Tier:** a quality preset such as low, medium, high or phone.
- **UV:** the coordinates that tell a flat texture how to wrap onto a 3D surface.
- **Wiring:** connecting finished code to the part of the game that calls it.
- **Aftersloth:** the secret afterhours club in the DJ storyline (door only exists after the password mission, open 23:00 to 04:00).
- **Blind playtester (H1 to H3):** a lightweight AI that plays the game through screenshots and a state file, with no access to the code, its thoughts shown as subtitles.
- **Deadlock:** two things each waiting for the other, so neither moves.
- **LUT (colour grade):** a lookup table that remaps colours to give a filmic look per hour.
- **Meshopt:** a way of compressing 3D model files so they cost less artifact size.
- **OSM / PLUTO:** OpenStreetMap and New York City's property database, the legal sources for real building data.
- **Render lock:** a rule that only one headless browser may render at a time, to stop the shared machine crashing.
- **Wedged:** a car stuck at 0 km/h against other cars or the curb.

- **Areaway:** the sunken yard in front of a brownstone's basement door. One with a single narrow gap trapped H6.
- **Band (night brightness):** the target range for average night-street brightness (0.085 to 0.13), applied from 22h since the 7 Nov decision.
- **Blade:** a name plate on a street-sign pole. Two blades crossing hid each other.
- **Blob shadow / shadow caster:** a cheap dark disc under a car or person (phone tier) / a mesh drawn into the shadow map. Too many casters made the phone draw everything twice.
- **Defect IDs (PT4-1, PT6-9 ...):** playtest findings numbered by stage; P1 to P3 are severities, P1 the worst.
- **Harness whitelist:** the keys the playtest tool lets a tester press. A missing key is ignored, which cost H5 the phone and H7 the HOME arrow.
- **LOD / CarLod / pop-in:** showing a simple model far away and a full one up close; pop-in is when the swap is visible.
- **Lofted body:** a car shape built from smooth cross-sections along a side profile.
- **Party wall:** the tall side wall of a building that shows above a lower neighbour.
- **Phone tier:** the cut-down setting for touch devices (budget 140 draw calls, 500 thousand triangles). Medium has a budget of under 500 draw calls.
- **ra-nyc / Radio SC:** the user's app listing New York DJs, and the in-game station that plays their SoundCloud sets through the official widget.
- **Retry-After / 429:** the server's "too many requests" reply and how long to wait.
- **Skyline ring:** the distant proxy buildings 70 to 640 m outside the grid, added in Stage 6.
- **The seven viewpoints:** noon street, noon corner, golden aerial, dusk car, night car, night corner, morning signals.
