# The Bed-Stuy Build: A Readable Transcript

*What the AI team said to each other while building your GTA-style Bed-Stuy game, retold in plain English.*

This is a retelling of the team's shared log (`docs/swarm/transcript.md`, about 200 posts). Short phrases in "quote marks" are the agents' own words. Everything else is paraphrase. Where an agent posted only numbers, I say so rather than invent conversation. Technical terms are explained in [square brackets] the first time they appear, and again in the glossary at the end.

Three stages are covered. Stage 1 (28 Oct, early morning) was research plus the core mechanics. Stage 2 (28 to 29 Oct) made the neighbourhood itself accurate and added missions and a web-hosted build. Stage 3 (1 Nov, still running as I write) started with your bug report that you could not get out of cars, then grew with your requests for a lighter phone version, your own music on the radio, and GTA 5 as the design "bible".

---

## Cast list

**Running the show**
- **fable**, the orchestrator. The one who talks to you, grants permissions, edits the shared files nobody else may touch, and makes the final call on disagreements.
- **MGR**, the manager. Writes the requirements, reviews every lane's finished work against them, and sends hard decisions up to fable.

**Stage 1 (research and mechanics)**
- **R1**, hunts for free-to-use (CC0) photo-realistic textures.
- **R2**, researches what each Bed-Stuy block really looks like.
- **R3**, researches real-world sunlight and material values.
- **R4**, paints shop awnings and signs.
- **R5**, paints car and clothing textures.
- **M1**, the lighting engineer.
- **M2**, driving feel (cars, player, camera).
- **M3**, traffic lights and AI drivers and pedestrians.
- **M4**, performance and the main game loop.
- **M5**, gamepad, menu, HUD and sound.

**Stage 2 (accuracy, missions, hosting)**
- **D1**, the data-schema engineer (what a "lot" is in data).
- **R2** returns for a second research pass.
- **B3**, building generator (brownstones, stoops, fences).
- **S4**, storefronts (bodegas, awnings, roll gates).
- **X5**, missions.
- **H7**, the web-hosting build.
- **P8**, performance, take two.
- **L9**, lighting, take two, plus weather.
- **Q10**, quality assurance (tests and bug-hunting).
- **T11**, industrial textures (fences, curbs, graffiti).
- **F12**, traffic bug-fixer.

**Stage 3 (now)**
- **V1**, the "can't exit the car" bug.
- **PT**, builds a recorded playtest harness.
- **L10**, lighting, take three.
- **W2**, world fixes.
- **MOB**, phone version.
- **MDL**, hunts for free car and character 3D models.
- **RADIO**, the radio that plays your own music.
- **WRITE**, writes the talk-show script.
- **BIBLE**, writes the GTA 5 design bible.
- **SCRIBE**, me, writing this.

---

# STAGE 1: Research and Mechanics
*28 October, 01:09Z to 03:33Z (about 2h 25m)*

**The rules of the game.** fable opened with the ground rules: each agent owns only its own files, asks questions by writing "@name:" in the log, and posts a start note, any decisions, and a final report. Nobody commits to git. Ten workers launched within seconds of each other.

## Hour 01:00Z

### The first wall: the internet is mostly blocked

Almost immediately, R2 hit a problem. Its job was to map the real blocks using OpenStreetMap and New York City open data. Both sites were refused by the network proxy. R2 asked fable to get the two addresses unblocked. fable's answer, a minute later: the allowlist is an environment setting it cannot change from inside the session, so it had asked you. In the meantime R2 should use whatever text sources it could reach. Wikipedia was blocked too.

By 01:15 R2 filed a partial report. It found several things worth recording, with a confidence rating on each line. The average block is three- or four-storey brick and brownstone rows. Churches sit on Throop, Greene and Marcus Garvey. The avenue order west to east (Tompkins, Throop, Marcus Garvey, Lewis) was confirmed. The only confirmed tree was the Lafayette magnolia landmark. R2 also listed what it could not verify: the north-south street order, one-way directions and road widths.

### The Kosciusko spelling: the first disagreement

R2 included a "correction": the in-game sign says "Kosciusko St", but the official spelling is "Kosciuszko". fable pre-empted the manager by noting this was "a deliberate user choice", meaning your choice. The data id keeps the official spelling and the sign keeps yours. MGR then reviewed R2 and formally rejected the correction on the same grounds: signs use your spelling, data uses the official one. MGR accepted the rest of R2's report as partial and added a hunch of its own, flagged low-to-medium confidence: the real street grid probably has DeKalb Avenue between Pulaski and Kosciuszko, and Van Buren might not run west of Throop. MGR told Stage 2 to treat the street order as the top verification item.

### The lighting researcher hands over its numbers

R3 delivered a lighting reference with a table for every hour of the day and every material, plus 15 specific places where the existing code differed from reality. Its top five for M1: the noon sun should peak around 58 to 60 degrees, not 80 to 90; add a separate moon light at night; lower the night exposure and tame the night bloom [the glow around bright lights]; make fog change by hour; and make glass, car paint and painted metal much less mirror-like by setting their metalness near zero.

MGR checked R3's math and accepted the report, with one caution for M1: do not drop night exposure on its own. Pair it with the matching moon, ambient and lamp values and then check the night streets are still readable. MGR also noted that a 60-degree noon sun is a stylistic choice (the real late-October New York noon sun is about 35 degrees), which is fine as long as long golden-hour shadows are kept.

### Textures: what exists, what does not

R1 reported finding 11 free CC0 texture sets (woven fabric, brushed steel, rust metal, dark wood, planks, tiles, gravel, and so on) in two places: an npm package called aframe-enviropacks and Google's Filament project. It also listed what it could not find: corrugated steel, chain-link, granite, cast iron, tar roofing, rubber, leather, denim.

MGR accepted this as partial but raised a licence problem. The Filament textures trace back to a source whose CC0 status one reference disputed, so none of them land until the licence is confirmed per asset. One set labelled "Plastic" could not be traced to any original author and was rejected outright. MGR also pointed out that the downloads were in a temporary folder that would vanish at session end, and that 2K images would have to be shrunk to 1K to fit the file-size budget.

### R5 and the "nothing changes on screen" problem

R5 painted procedural [generated by code, no image files] textures for tyre sidewalls, number plates and four kinds of clothing, and listed the exact texture-coordinate rules for anyone who uses them. It asked fable to add the new texture names to the shared type list, which fable did within a minute.

MGR's review is the first example of a theme that recurs all three stages: **work that passes its own tests but is not connected to the game**. The new car-paint detail function had no caller, and the car and human model files still used the old materials. Nothing would look different on screen. MGR asked M4 to call the paint function from the main game file. The car model was handed to M2. The human model was nobody's, so fable decided to do the clothing hookup itself after the mechanics agents finished, "to avoid a third editor in src/entities during Stage 1". (It did, at 01:39.)

### M1 finds a hidden trap in the graphics library

M1, the lighting engineer, reported something that surprised everyone: in the version of the 3D library the game uses, materials that carry their own reflection map **ignore the scene-wide reflection-strength setting**. So window glass, car glass and car paint were reflecting at full strength while everything else was dimmed to about 18 percent. MGR confirmed this matched R3's notes and told M1 the fix is to scale each material's own reflection strength by hour of day.

### The mechanics agents talk to each other

This was the busiest conversation of the stage, with agents negotiating the shape of each other's code.

- **M4 to M2 (physics smoothness).** M4, who owns the main loop, wanted the game to look smooth even when the physics steps at a fixed 60 times a second and the screen refreshes at a different rate. It asked M2 to expose each car's and player's previous position so the screen can blend between steps. M4 also asked M2 to stop creating small temporary objects every frame in the camera code, because that makes the browser stutter.
- **M2 to M5 (tyre squeal).** M5 needed a number for how much a car is sliding so it could play tyre squeal. M2 answered that the field is called `slip`, from 0 to 1, with two more fields for sideways speed and steering angle. M5 had already coded around a guess, and the guess was right.
- **M4 to M5 (pausing).** M4 wanted audio to pause when the browser tab is hidden. M5 had already built it, and it even listens for the tab-hidden event by itself.
- **M2 to M3 (driving model).** M2 told M3 the car model changed: steering is now rate-limited so a full turn takes about 0.3 seconds, brakes ramp in over a tenth of a second (so wheels do not lock), and a light throttle now holds a speed rather than accelerating forever. The box truck was slowed so it takes 12 seconds to reach 100 km/h.

### The manager rewrites the plan around real needs

MGR pushed several decisions in this hour. On storefronts, R4 would draw phone numbers on awnings. MGR ruled that only the fictional 555-01xx range be used, so no real person gets called. Real business names stay reference-only; every sign is a parody. On M3's traffic lights, MGR had said "6 avenue intersections" in the plan, but M3 built all 18 intersections. MGR checked and agreed: every crossing touches a north-south avenue, so all 18 make sense and MGR's own reading was "superseded".

On M5's gap, MGR noticed the plan required that your position survive a reload, and M5's settings only saved quality and volume. MGR decided on the spot that M5 add a small save helper, and M5 did within a minute.

M5 posted a detailed eight-step wiring recipe for M4: the menu, gamepad, pause rules, minimap timing, audio hooks, and so on. M2 and M3 posted theirs. M3's signal poles were the most vivid: 72 collision posts, 2 draw calls for about 500 traffic-light lamps, and lamp colours tuned so the bloom picks them up when lit.

## Hour 01:30Z to 02:00Z

### M4's report and the 790 draw calls

M4 finished its report at 01:38. It had applied everyone's wiring in the main file and made the game's drawing loop smoother. The headline number was less flattering: with honest counting (M4 found the old counter only measured the last render pass), the game was making **about 790 draw calls per frame** [separate things the graphics card must draw]. M4 split the city into 250 by 200 metre cells so far-away chunks are skipped. In a geometry test from four camera spots, that trade gave 77 draw calls with 352,000 triangles in view, compared with 29 draw calls and 581,000 triangles unsplit.

One disagreement was settled politely. M2 had built an `applyInterpolated` function for smoothing movement. M4 said it would not use it, because that function creates a small object on every call, and M4 had built its own allocation-free snapshot system doing the same job. MGR agreed: "accepted (alloc-free, single path)".

MGR's review confirmed the connections by looking at line numbers: the paint call, the save-load, the true sun direction, the camera context. It worried about the 790 number and noted the target auto-downgrade threshold (medium to low when frames fall below 40 per second) was more conservative than the plan's 50. MGR accepted that and updated the plan to match. It also noted that none of the smoothness could be verified without a real graphics card, because the test machine renders in software.

At 01:39 fable finished the pedestrian clothing job itself, and an hour of quiet followed while M1 kept grinding.

## Hour 02:00Z

At 01:54 MGR asked M1 for status, because every other lane had finished. M1 had edited a shadow file not on its list. fable blessed it, since it was on M1's owned list anyway. At 02:09 M1 posted progress:

- the day/night settings now live in an hour-by-hour table;
- the sun path peaks at 60 degrees;
- a cool moonlight takes over at night;
- the sky now receives the **true** sun direction. This fixed a bug M1 had found where a shadow helper moved the sun's position and the sky used that fake position. The result had been no stars at night and a dusk glow that never moved.

M1 also reported that its audit script was working but each run took about 15 minutes of software rendering.

## Hour 03:00Z

### M1's final report and what the numbers say

M1 posted the full list at 03:09. Highlights:

- The 19:30 "blowout" was fixed. In baseline frames, **49 percent of a car view and 5.9 percent of a street view were pure white** from bloom over a hazy dusk sky. After the fix, the maximum anywhere was 0.10 percent.
- Night street brightness landed between 0.081 and 0.094 (about 21 to 24 out of 255). The plan's bar was 20 out of 255.
- Headlights were retuned so they no longer blow out the car bumper.
- The dusk sky now has a gradient instead of a flat orange wash.
- A lens-flare effect was stopped from drawing into the depth-and-outline passes where it caused artefacts.

M1 said it had **not** applied the material metalness changes R3 had asked for, and that needed no help from fable.

MGR's review accepted with one pointed concern: fable had asked for those metalness fixes at 01:19, and M1 had skipped them. (This is the **"material metalness debate"** in the loose sense. There was no argument, just a requested change that quietly did not happen, caught in review.) MGR also noted shadows had been tested at one hour only, that M3's glowing signal lamps at night went unmentioned, and that 0.081 sits right at the threshold, so "worth a real-GPU look".

### Closing the stage

At 03:12 MGR wrote the Stage 1 check-in. The gates on the integrated tree: type checking clean, **753 automated tests passing across 49 files**, artifact **6.69 MB** (about 170 KB more than before, against a 12 MB budget), and the end-to-end smoke test without console errors.

At 03:33 fable finished the close-out. The material metalness values from R3 were applied (glass 0, car glass 0, paint 0.15, painted metals 0). Leftover per-frame allocations were cleaned out. R1's licence evidence was saved to the repo. The artifact was published as version 6, now 6.53 MB. The DeKalb Avenue question was left for you, since the sandbox cannot verify it.

## What the team learned in Stage 1

1. **Green tests are not a working feature.** Several features passed their own tests but were not connected to the game until M4 applied them in the main file. The fix that worked: every final report must name where the feature is wired, and agents who do not own the main file post exact lines for someone who does.
2. **Ownership gaps cost time.** Requests landed with the wrong owner (the world builder file went to fable instead of M4; material numbers had no clear owner). Lesson: list every touched file, new ones included, on the board before the stage starts.
3. **Research behind a locked network is partial research.** R1 and R2 both delivered less than hoped. Per-block facts needed either allowlisted websites or your Street View screenshots.
4. **Slow audits are a bottleneck.** M1 took two hours because each light audit is a 15-minute software render. Start the audit harness first, or give it its own lane.
5. **Review caught what lanes skipped.** Two requested items (the metalness fixes, the position save) were missed and caught by MGR checking against the requirements table.

---

# STAGE 2: Block Accuracy, Missions and a Hosted Build
*28 October 21:48Z to 29 October 07:47Z*

**Decisions at the start.** fable rewrote the board with these calls: the map stays as drawn (no DeKalb Avenue); no allowlist or screenshots are available yet, so block faces come from R2's notes, web search and typical-street knowledge, every value tagged with a confidence level; hosting will be a static site on Vercel. Ten workers plus MGR launched.

## Hour 21:00Z

### Parallel start and the shape of the schema

The first twenty minutes were mostly agents announcing plans and coordinating. The biggest piece of coordination was between **D1**, **B3** and **S4**, because D1's lot data feeds both the building generator and the storefront maker.

D1 described its design as it went: a lot has a width, a number of floors, a material family (brownstone, red brick, tan brick, painted brick, limestone, wood frame, church, vacant, new build), a stoop yes/no, a cornice style, a use (residential, mixed, church, school, vacant, garage), and a confidence tag of High, Medium or Low. B3, seeing this early, wrote its code against a temporary local version so it did not have to wait. S4 asked specific questions: how will a lot's storefront type arrive, and does a lot know which cross street it sits on? D1 answered later with corrected names; the cross street was included.

S4 also made a proposal to B3 about who builds which part of a shop building. S4 would build the ground floor (up to 4.0 metres, including awning and roll gate) and B3 would build everything above. B3 agreed and posted a function for it at 22:09. S4 also pre-negotiated night lighting with L9: how bright shop signs may glow without causing haze. L9's answer: night bloom starts at 0.9, so keep lightbox glow at or below 0.55 and neon at or below 0.8.

### R2's second pass: the real streets, street by street

R2 had to work with web search only. It posted a typology note per street, in terse, source-tagged form. Things the team learned:

- Antioch Baptist at 828 Greene is **outside** the map, east of Marcus Garvey. A church that had been planned there was moved off.
- The Upper Room Gospel Baptist church is only confirmed at 180 Van Buren, not at the Marcus Garvey corner.
- A vacant lot at 289 Kosciuszko has been empty for over a decade, a good anchor for the data.
- A day-care at 220 Throop has an enforcement note against it, so R2 told D1 not to use it.

R2's final tally: 9 street segments, 10 blocks, 40 block faces, four corrections. One more LPC (Landmarks Commission) host was blocked.

MGR's review accepted it as partial, and answered R2's question about how blocks are numbered (correct against the grid code). It also raised two concerns. First, the notes contained no web addresses, so a later reader could not re-check them. Second, real church and business names must stay in docs only. That second point came back at D1.

### T11 asks for new materials

T11 posted a long request for fable to add seven new material names (corrugated steel, two kinds of chain-link, granite curb, cast-iron fence, tar roof, graffiti) with exact specs. MGR recommended approval with one change: cast-iron fence is painted iron, so its metalness should be 0, not 0.2, following the rule from Stage 1. fable applied it all at 22:00 after T11 confirmed the painter code existed.

## Hour 22:00Z

### X5 delivers three missions in about ten minutes

X5's first interesting post was a long wiring request for P8, then a report: a data-driven mission framework with nine kinds of objective (go to, pick up, deliver, survive wanted level, lose wanted level, timer, hold speed below, escape radius, enter vehicle), plus failure, retry, abandon, rewards and saving. Three missions, all non-violent:

- **Bodega Run:** pick up three bags at a deli and deliver them to three stoops in 120 seconds for $150.
- **Laundromat Getaway:** steal a bag on foot, get two wanted stars, get a car, get 110 metres away, hide in a garage, stop for five seconds, wait for the stars to clear, keep the car. $400.
- **Block Party:** gather a speaker, a table and ice and deliver them before 20:00. $250.

X5 flagged one oddity itself: at the default 17:30 game start, Block Party leaves only 150 seconds, doable by car but not on foot.

fable approved four small shared-file changes X5 asked for (mission events on the shared event bus, a minimap blips parameter, and a cleaner `raiseTo` function for wanted stars). The reason for the last one, from MGR: X5's workaround of faking "carjack" crimes would also trigger audio and cop systems that listen for crimes. MGR's one question to X5: where is the "cop escape" mission the plan promised? X5's answer, built into the review: it is the second half of Laundromat Getaway.

P8 wired it all into the main game within three minutes (22:04).

### Q10 finds four real traffic bugs

Q10, the QA lane, ran a five-minute simulation on the real map with 30 cars, 40 pedestrians and 2 cop cars. It posted its good news first: the driving model holds up (stable at top speed, no jitter at walls, bounce settles within two frames, handbrake drift works, and 60 km/h with handbrake and half lock gave 25 degrees of slip, recovering in under a second). Then the bad news, in four separate defect reports, each with a failing test that stays as a reminder.

- **D1: AI cars crash into each other.** About 30 hard impacts per five minutes. Q10 traced it frame by frame to one cause: the car's "look ahead" ray is cast from where the car *intends* to be, not where it is. When a car starts or cancels overtaking, the ray misses the car ahead and the driver floors it.
- **D2: impact spam.** A pedestrian pressed against a parked car produced **544** crash events in five minutes, each with sound, camera shake and a cop-hit check, and the check could wrongly add wanted stars.
- **D3: turning cars knock down pedestrians in the crosswalk.** Three in one seed, one in another, all while the pedestrian had a WALK signal. The car only looked straight ahead, not toward the crosswalk it was turning into.
- **D4:** (lower priority) a car pushed off its lane wedges forever on a signal pole.

MGR confirmed each root cause by reading the code, set priorities (D1 and D3 first), and noted nobody owned the entities folder. fable spawned a new lane, **F12**, and told Q10 to keep the failing tests as they are. F12 would flip them to passing.

### H7 and the "ultra" tier

H7 proposed shared-file changes to the build config (two builds from one codebase: the single-file artifact and a multi-file hosted version for Vercel with textures as separate cacheable files). MGR said the diff was additive and the artifact branch was byte-identical to before, so approval was safe. fable applied it in a minute (22:08). H7's smoke test of the hosted build had no console errors and no failed requests; artifact 6.83 MB, hosted 5.46 MB with the three.js library split off.

MGR's closing notes: the `?q=ultra` setting existed only in the hosted build, at this point it just raised texture sharpness, and no 2K texture sets were in the repo because the licence checks were pending.

### D1 lands 840 lots

D1 posted the finished data: **40 block faces, 840 lots, 107 KB**, with 33 tests. MGR accepted with three concerns, the most memorable of which was the commercial density. Throop faces had 5 to 9 mixed shop lots out of 10 or 11. MGR's words: 46 bodegas over 10 blocks "reads as a strip mall". Throop and Tompkins on these blocks are mostly row houses with only corner shops. The second concern was that real church names (Grace Baptist, Crossover Baptist, St. Ambrose, Bethany Baptist) were still sitting in the JSON notes that ship in the artifact; they should be replaced with a source reference. The third: floors 0 is allowed for vacant lots, which the plan had not said.

### The container restart

At about 22:45 the container restarted. fable's note at 22:52 said it **killed MGR, B3, S4, P8, L9, Q10 and F12 mid-work**. The files on disk survived. fable relaunched each lane in "resume mode": read your own earlier posts and the files you own, verify what is on disk, continue. The finished lanes (R2, D1, X5, H7, T11) were not relaunched.

The resume posts are a useful picture of what survived. F12 reported its fixes for D1, D2 and D3 on disk, D4 remaining. Q10 listed its test files on disk and what was lost: its QA document and any screenshot baseline had not been written. P8 listed its perf tools and said which wiring was pending. L9 found its shadow-bias and weather work intact but unwired. S4 had one failing test.

MGR returned at 22:56 with a table of what each lane still owed and a warning: "the machine is shared by 6 resumed lanes; post interim numbers rather than waiting on long headless renders."

### P8's big number

By 22:39, before the restart, P8 had posted the headline perf result: Throop street, medium quality, dropped from **2,837 draw calls to 390**. Its investigation had found that parked and moving cars were about 60 percent of all draws, since each car is roughly 17 separate meshes. And the GTAO [ambient-occlusion shading, which adds soft contact shadows] pass was re-rendering the whole scene a second time. P8's fixes: far-away cars drawn as instanced copies [many identical copies drawn in one call], simplified stand-in geometry for the shadow and occlusion passes, and instanced street furniture.

## Hour 23:00Z

### The ped-yield deadlock

At 23:05, Q10 reported D5, a **regression**. After F12's changes, the five-minute sim now failed the no-gridlock check. A car stood still from 62 seconds to the end. Q10's diagnosis: the car was yielding to a pedestrian who was wedged beside its nose, walking at 0.09 metres per second for over 40 seconds. The car's "stuck detector" never fired because yielding to a pedestrian resets the stuck timer. Neither would move. "Ped-vs-car deadlock". Q10 suggested capping the yield time.

MGR ruled this was F12's job (P1) and set F12's acceptance bar: all four flipped tests **and** no gridlock on both seeds. MGR suggested fixing both sides: the car counts a long, slow ped-yield as stuck, and the pedestrian steers around a car body it is pressing against. F12 later added the pedestrian walk-around and the car-side "ped beside body" hold.

### B3 delivers, and one material trap

B3's early post at 22:58 flagged that chain-link top-rail had been set up opaque, which would render as a black band. fable fixed it in a minute. B3's final report at 23:22: stoop railings that follow the stair slope, spear-topped areaway fences along the building line, tar roofs, chain-link and corrugated-steel hoarding on vacant lots, fire escapes on tall buildings. Building group draw calls went up by 4; Throop frames stayed at 314 to 378 total.

MGR accepted with three concerns. The "determinism" test compared counts, not actual position data, so a same-count different-geometry change would slip through. The areaway fences had no colliders, so pedestrians walk through the iron. A mesh-count test limit was raised from 30 to 36.

### The graniteCurb UV mismatch

P8 reported that the curb material from T11 was not used. The road builder's curb texture coordinates run face first, then chamfer, then top, but T11's painter has the top stone first. Swapping would need a remap in the road builder, which no Stage 2 lane owned. MGR recommended deferring it to Stage 3; fable agreed and logged it. This is the item W2 inherits in Stage 3.

### P8's report

P8 posted its final at 23:51. Medium draw calls across the seven viewpoints: **Throop 376, Kosciuszko 358, corner 341, aerial-high 309, aerial-low 326, in-car 273, spawn-foot 296.** The pre-lane baseline had been 2,118 to 2,919. A visual A/B showed the optimised and unoptimised pictures differing by only 0.7 to 1.2 out of 255. The only large difference was X5's pulsing gold mission marker.

That marker became a small side issue. fable noted it filled **14.7 percent** of the first view's pixels: "very large and partly fills the first view". Fable later shrank it.

MGR's concerns on P8: no triangle count was reported (the plan says triangles must not rise more than 20 percent); the menu Reset did not clear the live mission state; and no test checks that shadow-culling actually skips far cells.

## Hour 00:00Z (29 October)

### The usage-limit warnings

At 00:02 MGR sent a second nudge: S4 had been silent since 22:56, F12 was moving, and Q10 and L9 should finish by about 00:30. The same sentence said MGR itself would run the global gates after that. Later events show why this mattered: **both MGR and Q10 hit the account's usage limit** before finishing some paperwork (MGR before writing the Stage 2 check-in; Q10 before its QA document). fable ended up covering the check-in.

### L9's shadow fix, then the cream-coloured wall

L9's work at the midnight hour has a nice arc.

First, shadows. The old setting for shadow offset (normal bias) was a flat 0.5 metres. L9 built a test rig with a plane, a cube, a 0.15 metre curb, a 3 metre pole and a sun-parallel wall, at the low sun angles of 7:00 and 18:00 (11.5 and 17.2 degrees). Finding: no acne [speckled false shadows] even with bias set to zero, but the old 0.5 m bias **removed the shadow of the 0.15 m curb entirely and floated the cube's shadow away from its base** ("peter-panning"). L9 cut the bias to about one shadow-texel: 0.10 low, 0.06 medium, 0.04 high.

Second, night. On the previous tree the night street mean was 0.097 and 0.104, nicely in range. On the current tree it was **0.242 and 0.244**. L9's explanation: S4's storefront glazing beside the spawn point was a huge flat cream-coloured emissive face, about 0.85 brightness, filling a third of the frame. L9 asked S4 to cut shop-window glazing glow to 0.35 or lower. MGR backed the cap, noting that the plan's number is a floor, not a ceiling, so 0.24 was not a failure, but "a flat cream face a third of the frame is an illusion break". MGR also suggested the glow may come from a shared window material rather than S4's, and asked L9 to name the material. In the end this was not resolved and became a Stage 3 open issue.

### F12 and S4 finish

F12's final report: all four of Q10's tests flipped to passing, and five-minute sim results (two seeds):
- vehicle-to-vehicle impacts 121 and 102 **down to 5 and 5**;
- hard AI-to-AI impacts 30+ **down to 0**;
- pedestrian knock-downs on WALK 3 and 1 **down to 0 and 0**;
- impact events from one press 544 **down to at most 2**.

F12 also noted D5 did not reproduce after the fix. MGR accepted with this caution: "not reproduced" is not the same as "fixed", because the yield path still has no time cap. A test that pins a slow pedestrian to a car nose for 40 seconds should be added.

S4 reported at 00:23 and 00:27: awnings and signs now drawn at true aspect from atlases sized to real geometry (so the old 2x stretch and its pre-squeeze hack are gone); about 19 shared materials city-wide; corner bodegas that wrap the corner with a chamfered diagonal door; window stickers (ATM, EBT, lotto, 24 HRS, neon OPEN); lightboxes lit after 19:30 at 0.55; roll gates down from 22:00 on by shop type, with graffiti on closed-down gates. S4 also said its 22:00 screenshot crashed the test browser repeatedly "on this loaded box (load avg about 18-25)", which is why night checks were slow all stage. One wiring gap: the main file must call `setStorefrontHour` for gates to come down in game. fable did that at close-out.

L9 also posted its final: weather (dry, rain, wet, drying) with a puddle shader on roads and sidewalks, and light baselines stored in the repo, blown highlights at most 0.09 percent everywhere.

## The close-out (07:47Z)

MGR was rate-limited, so fable closed the stage. It applied S4's wiring, shrank the mission marker, ran the gates, published artifact v7 and wrote the Stage 2 check-in:
- type checking clean;
- **1,169 tests passing**;
- artifact **6.89 MB** (budget 12);
- smoke test errors: none;
- hosted build 36 files, 5.5 MB.

## What the team learned in Stage 2

1. **Number-driven goals work.** The "under 500 draw calls" target, with P8 reporting per-view numbers, took medium from 2,118 to 2,919 down to 273 to 376 with almost no visible change.
2. **A QA lane that tries to break things earns its keep.** Q10 found four real traffic defects the other lanes' own tests missed, each with a repro. Fixing one produced a new bug (the ped deadlock), which Q10 caught because it kept running the long sim.
3. **Fixes interact.** F12's fix for crashes and pedestrian knock-downs created a gridlock risk; S4's night glow broke L9's lighting range. Re-baselining after each landing matters.
4. **Machine load shapes the schedule.** With six lanes sharing one box, a single headless render took 1.5 minutes or more, and some night shots crashed the browser.
5. **Restarts and usage limits happen.** The container restart cost about 15 minutes, and resume prompts pointing agents at their own earlier posts recovered every lane. Two lanes (MGR, Q10) ended on the usage limit, not by choice, so snapshots were saved every few minutes.
6. **Real names stay out of shipped files.** MGR repeatedly pushed real institutions out of anything that ships in the artifact.

---

# STAGE 3: The Playtest Loop
*1 November, from 15:14Z (still running)*

**Your bug report.** fable's opening post was short: Stage 3 starts as a playtest loop. The bug from you is that you **cannot exit cars**, so lane V1 takes it. PT would build a harness that records video with a subtitle box showing what the tester is thinking. Three blind testers would then play with no access to the code and report what they felt. L10 and W2 carry over the Stage 2 open issues (night glazing, graniteCurb, areaway colliders, commercial density).

## Hour 15:00Z

### V1 finds the car-exit bug in six minutes

V1 posted at 15:20 that it had reproduced the bug in the real build. Pressing F entered the car fine. Pressing F again exited and then **immediately re-entered the same car**. The player was briefly out, then back in.

The root cause, in V1's words, is about timing. The game's input system says a key is "pressed" for every physics step inside one screen frame, and clears it only once per frame. On a fast machine a frame runs one step, so this never shows. On a slow machine, such as a phone, or this heavy game on a laptop, a frame can run two or more steps. Step 1 sees F and exits the car. Step 2 still sees F, and since the player is within 3 metres of that same car, enters it again. The same double-fire hit the radio key, E.

V1's fix: a new `Input.consume(code)` that returns true once per press and survives frames with zero steps. It added 11 unit tests, including one proving the old method would re-enter. V1 then asked fable to make the same swap for the mission retry and abandon keys (R and X), which had the identical double-fire: retry or abandon twice per slow frame. This neatly connects to your other complaint, that the game is too heavy for your phone. The heaviness helped cause the exit bug.

### Three new lanes from you

At 15:17 fable added four lanes from your direction. The game is too heavy on your phone, so **MOB** builds a phone quality tier. **MDL** looks for free polished car and character models "as a guide". **RADIO** builds a radio that plays your own audio files. **WRITE** writes an original 22-minute AI talk show. Licensing stance stays: no copyrighted songs, no Street View pixels, CC0 models only with credits.

MGR added measurable rows to the requirements for each: the phone tier must hit at most 120 draw calls and 500,000 triangles on the seven viewpoints, and be chosen automatically on touch devices. Radio must ship **no audio in the repo** and cost at most 50 KB of artifact size.

### The radio grows to eight stations

At 15:19 fable passed on your station list. To the original Pop (15 slots), 80s (12), Rap (13) and House and Dub (22), you added Trap (25), Weird/Psych (28, "the user named Tame Impala and Abra as the vibe"), Folky Echo-Dub Rock (16) and Jazzy Rock "That Gets Lit" (16). That makes **147 music slots** plus the WBSY Talk station. Artist names are search keywords only, never bundled audio. Each station needs a parody name, a jingle and its own synthesised fallback sound (trap hi-hats and 808s, slow psychedelic arpeggios with tape wobble, echo-delay dub guitar, a jazz-rock walking bass with ride cymbal) for when a slot is empty.

RADIO acknowledged within a minute. It had also asked WRITE to confirm the shape of the script file, and WRITE answered quickly: the file has a title, station name, total seconds and a list of segments, each with kind (host, caller, ad, jingle, news, sting), speaker, voice and seconds. Spoken segments are at most 60 seconds. RADIO coded to that shape and made its parser tolerant of the older voice names.

### WRITE delivers in four minutes

WRITE's final report at 15:20: 57 segments, 3,288 words, 1,325 seconds (target 1,320 plus or minus 30). MGR's review checked every number and added a scan of 28 real AI and tech company or person names: zero hits. The only real names are street names. MGR's one comment on tone: the show host "Garvey Cutz" takes its name from the street and is fine as a street-derived parody.

### MOB and L10: sharing two files politely

MGR spotted early that **MOB and L10 both need to edit `Pipeline.ts` and `LightingConfig.ts`**. The ruling: L10 touches only night values and glazing; MOB touches only its tier branch and a new "phone" row. Each posts the line ranges they edit before saving and re-reads the file before each edit. MOB must also stay away from V1's F-key lines.

### MDL's licence hunt

MDL first re-checked what the sandbox can reach: only the raw GitHub content host and the npm registry answer. Kenney, Quaternius and Poly Pizza all time out. MDL found a package on npm, a wrapper whose notice says the art is CC0 (Kenney's Car Kit plus Quaternius characters). It recommended a sedan, an SUV, a police car and a delivery van as a stand-in for the box truck, plus two characters (a hooded adventurer and a worker), with animation clips renamed Idle, Walk, Run. It could only offer secondary evidence for the licence. It asked fable to unblock the original sites. fable's answer: that is your environment setting, not something it can change, so it asked you; meanwhile proceed with the package notice and mark the source-page check as pending.

A genuine decision came up: a true 8.8-metre box truck exists, but it is Apache-2.0, not CC0. fable accepted it: Apache-2.0 is permissive as long as attribution and the licence text are included. Record it in the credits file, and keep it to the hosted build if it is large.

### W2's progress

By 15:22 W2 had finished two of three tasks. Its design decision at 15:15 was simple: areaway fences become segment colliders, up to three per lot, with no world-builder change needed. Result: collision tests pass, and avenue commercial density was thinned across 20 east-west faces from **3 to 9 shops per face (mean 6.2) down to 3 to 5 (mean 4.4)**, with corners, 15 POIs and all confidence tags kept. This is exactly the "strip mall" fix MGR had asked for in Stage 2. The graniteCurb texture remap was next.

### BIBLE lands and sets the yardstick

At 15:18 fable relayed your instruction: "Use GTA 5 as your bible". You wanted the views, mechanics, graphics, funny missions, open world and soundtrack for nights and days in Bed-Stuy. At 15:20 fable added your reason: GTA 5 was "the first to make a world people would live in for days at a time". So BIBLE should open with this principle: the target is "a place people want to stay in, not a demo", with ambient life, something to do every 30 seconds, a radio you leave on, and days and nights worth watching. MGR was asked to review everything against the question "would someone live here for a day?"

BIBLE landed in under six minutes: `docs/reference/BIBLE.md`, nine sections, 35 sources. WebFetch is blocked, so it worked from search excerpts only, and it tagged unsourced items as memory or tuning guesses. Its top five gaps ranked by the live-in test:
1. there is no "thing every 30 seconds" (events, strangers, collectibles);
2. only three flat missions, and they need a richer template;
3. the radio has no station wrapper (DJ, ads, news, jingles, ducking and crossfades);
4. the day has no schedule (rush hours, school run, stoops, block party, night cops, and a 24-minute day);
5. there is no in-world phone.

It added that police are a 20-second timer rather than line-of-sight, and the camera lacks look-back, cinematic moments and letterbox.

### You ask to hear them talk

At 15:21, fable posted your request: you want to read the team talking and figuring things out in plain English. Two changes took effect at once. MGR would host an open **roundtable**, and a SCRIBE lane (me) would compile the log into this narrative. All lanes were told to explain their reasoning in full sentences from here on.
