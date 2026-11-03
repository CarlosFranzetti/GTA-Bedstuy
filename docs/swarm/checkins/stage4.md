# Stage 4 check-in: the GTA3 bar

Written by the Opus manager (MGR) on 3 Nov 2026 at about 22:50Z. Stage 4 ran from 3 Nov 13:31Z (after the Stage 3 close) to
22:50Z, with one usage-limit pause in the afternoon. Every review cited here is in `transcript.md` (search `MGR review of`).

## 1. Summary

Stage 4 had one target: get every one of the seven standard viewpoints to the **GTA3 level** on the graphics ladder (PRD §5.4),
and keep fixing what the blind playtesters run into. It moved the picture a long way. The black squares on the sidewalk turned out to
be tree pits and are gone, party walls and roofs now vary from lot to lot, sidewalks fill and empty with the hour, and stoop sitters
and loiterers appear. **GTA3 is met on three viewpoints and is close on the others** (§3). The two playtests of the stage both
ran on the phone tier. Both said the phone picture reads well. Both also got trapped by game flow rather than graphics. H4 got stuck
in the record-shop panel, and SHOPUX fixed that. H5 was pulled into the wrong mission and could not pick up the duffel, and MISSFIX
fixed most of that. The user also asked for Radio SC to play random DJ sets of at least 45 minutes from their own ra-nyc app. That
works (RASC), with one data unit still to confirm.

**Gates at close** (HEAD b603440): tsc clean; vitest 112 files, **1750 pass and 1 fail**; build ok; artifact 9.60 MB of 12; headless
smoke `errors: []` at low (265 draw calls) and medium (321). The phone-tier smoke was still waiting for the render lock when this was
written. The one failing test is a real regression and is described in §5.

## 2. Per-lane outcomes

| id | lane | result |
|---|---|---|
| GTA3 | GTA3 bar | ACCEPT, ladder partly met. Tree pits fixed (they were the near-black squares); party walls in four brick colours with soot, ghost signs and blind windows; roofs with three tar variants plus vents, condensers, hatches, masts and parapet caps; pedestrian density follows the BIBLE §7 hour curve, with 12–13 % idle at noon and evening and none at 4 a.m.; rank-1 clutter confirmed on low. No final report found in the transcript; reviewed from its 15:03 status and the `scratchpad/g3/final`, `ex-after2` and `ex-after6` frames. |
| STUCK | stuck cars | ACCEPT (reviewed this stage). Parked cars at least 6.5 m apart and 12 m from corners; a car pushing against an obstacle for 0.8 s gets push-out and reverse assist; HUD hint after 1.5 s; harness video cut fixed. |
| SHOPUX | shop and decks UX | ACCEPT. All five H4 defects addressed. Panels fit 640×360 with a footer that cannot be pushed off screen. Panels work and close from keyboard, gamepad and click (Escape and Start close them). The mouse is released while a panel is open. Mission timers freeze while a panel is open. The door prompt is now a 3.2 m band, the Wax Deli fence has a gap, and the mission arrow follows the camera. 118 tests in my run; headless replay of H4's path passes. |
| MISSFIX | mission flow | **DEFECT** (was ACCEPT, changed after the gate). What landed: a running mission is no longer replaced by walking into another giver's ring, every start shows a toast, the pointer clears after abandon and routes around blocks, the duffel is now an F pickup with a prompt, the harness accepts P/Enter/Escape/Backspace, and the box truck can be entered from beside its cab. The regression: the new `doorDistance` lets you enter a car from the street side when its driver's door is against a wall, and `Player.exit` still always uses the driver's side, so you can end up inside the wall (22 placements fail in `tests/unit/sim/enter-exit.test.ts`). The duffel also lacks a test that the drawn pad and the objective circle coincide. |
| RASC | Radio SC sets | ACCEPT. Random SoundCloud DJ sets of at least 45 minutes from the user's ra-nyc API, shown as "title — DJ". Nothing is requested before the first tune-in. A 429 stops requests quietly. Order is random with no repeats until every set has been heard. Pasted links still play, alternating with the pool. **To confirm:** the code assumes `duration` is in seconds; if ra-nyc passes SoundCloud's milliseconds through, the 45-minute rule would let almost anything in. ra-nyc is blocked from this sandbox, so I could not check. Small defects: Retry-After is never used to retry, the just-finished set can repeat at a round boundary, and one failed artist lookup stops the whole pool build. |
| H4 | playtest, phone tier + record shop | Done. Findings in §4. |
| H5 | playtest, phone tier + missions | Done. Findings in §4. |
| SCRIBE | readable transcript | Final pass to 13:27Z (~12,100 words). |
| CARS2, CAM, ART, PHONEGFX | feel lanes | Running at close; they become the core of Stage 5 (§7). |
| WIRE, CLUTTER | Stage 3 carry-overs | No final reports. Their wiring and clutter layer are in the tree and green in tests; reviews still owed. |

## 3. Graphics ladder verdict (LEVEL GTA3)

Judged on GTA3's final frames (`scratchpad/g3/final`, 15:41Z, low tier, `errors: []`, 237–298 draw calls) and the extras.

| viewpoint | verdict | why |
|---|---|---|
| 1 noon street | **MET** | Everything textured, real car and player models with shadows, sidewalk props, the black square gone. |
| 2 noon corner | **CANNOT BE JUDGED** | The camera sits against a brick wall since W2's density change in Stage 3; the brick is well textured, but the viewpoint must move. |
| 3 golden aerial | **MOSTLY MET** | Nearby party walls and roofs are varied and detailed; the distant skyline is still plain tan blocks. |
| 4 dusk car | **NOT MET** | A box truck with a flat, untextured lavender body fills a third of the frame; everything else passes. |
| 5 night car | **NOT MET** | Same box truck; lit windows, stars, lamps and a milk-crate prop all pass. |
| 6 night corner | **CANNOT BE JUDGED** | Same wall-facing camera as viewpoint 2. |
| 7 morning signals | **MET** | Textured street, taxi, distant pedestrians, signals. |

Pop-in within 60 m is still unchecked on all seven. People: three pedestrians walk past the Wax Deli in `x5-walk-noon.png`, each
with a shadow, but the same spot a minute later (`y4-noon-after-60s.png`) is empty, so density is uneven.

**To finish GTA3:** texture the box truck (CARS2 is replacing the car bodies, which should cover it), move the two wall-facing
viewpoints, give the far skyline a cheap facade texture, and run one pop-in check.

## 4. What the blind testers did and thought

**H4 (phone tier, build v13)** judged the phone picture fine: "brick, signs and minimap are clear; distance fog is soft". It followed
the new mission pointer and started Crate Digger at the gold ring after six steps, which confirms the Stage 3 findability fix. Then
it stood at the Wax Deli stairs for four steps without moving while the mission timer ran, found the door prompt at only one exact
spot, got into the shop, and was trapped: the Buy button was cut off at the bottom of the 640×360 screen and no key it had could use
or close the panel.

**H5 (phone tier, build v14)** set out for Crate Digger and the record shop, trusting the pointer ("readable and fun, and the dusk
street looks good"). It spent several steps pressed against brick walls and a glass shop front looking for a way round. As it closed
in on Crate Digger the pointer silently switched to Laundromat Getaway, and H5 walked into that giver and started the wrong mission.
It stood on the pink pad pressing F five times to "grab the duffel" while the timer ran, abandoned the mission, tried to open the
phone (the harness refused the P key), and ended beside a box truck that offered no "Enter car" prompt.

| id | severity | owner | what | status |
|---|---|---|---|---|
| PT4-1 | P1 | SHOPUX | Shop panel unusable and un-closable at 640×360; Buy clipped | fixed, replay pending |
| PT4-2 | P2 | SHOPUX | Stoop and fence block the Wax Deli door; prompt at one spot | fixed |
| PT4-3 | P2 | SHOPUX | Mission timer runs while trapped in a panel | fixed |
| PT4-4 | P3 | SHOPUX | Pointer arrow used body heading, not camera | fixed |
| PT4-5 | P3 | SHOPUX/PT | Harness said menuOpen false with a panel open | fixed (modal flag) |
| PT4-6 | P1 | MISSFIX | Duffel pickup never completed on the pink pad | prompt added; pad/circle coincidence untested |
| PT4-7 | P2 | MISSFIX | Pointer switches giver silently; walking past a giver starts its mission | fixed |
| PT4-8 | P3 | MISSFIX | Stale "here" pointer after abandon | fixed |
| PT4-9 | P3 | MISSFIX | Harness refused P (phone) | fixed |
| PT4-10 | P3 | MISSFIX | No enter prompt beside the box truck | fixed, but caused PT4-13 |
| PT4-11 | P3 | world | Walls and glass fronts block straight paths | pointer now routes round blocks |
| PT4-12 | P3 | PT | State file mission null while the HUD showed a pointer | fixed (HUD and state agree) |
| PT4-13 | **P1** | MISSFIX/V1 | Exit puts the player inside a wall when the driver's door faces it (found by the gate, not a tester) | **open** |

## 5. Open issues

1. **PT4-13, exit into a wall** (gate red): `Player.exit` needs a free-spot search (driver's side, passenger side, rear) against
   static colliders. This also closes the Stage 3 V1 open item.
2. RASC's duration unit must be confirmed against the real ra-nyc API; plus Retry-After, round-boundary repeat, one bad artist stops the build.
3. Duffel: add a test that the drawn pad and the objective circle coincide (PT4-6).
4. Ladder: box truck texture, two wall-facing viewpoints, far skyline, pop-in check (§3).
5. Neither H4's nor H5's path has been replayed blind on the fixed build; the shop and decks remain untested by a tester.
6. Final reports and reviews still owed by WIRE and CLUTTER, and GTA3 and GFX never posted theirs in the transcript.
7. The phone-tier smoke at close was still queued behind the render lock.
8. Carried from Stage 3: realistic cars blocked by licensing and network; real map data blocked; light baselines incomplete.

## 6. What went well and what did not

The playtest loop keeps paying for itself. Both H4 and H5 were stopped by flow problems that unit tests could not see. Each problem
was fixed by a dedicated lane within hours, with a headless replay of the tester's own path. The gate caught what review missed: I had
accepted MISSFIX on its tests, and only the full suite showed that its door change unlocked a bad exit. Lanes increasingly post
one-line final reports (SHOPUX, MISSFIX, RASC) or none at all (GTA3, WIRE, CLUTTER), so reviews take longer because they have to be
done from disk. A short template (files, tests run, numbers, what is not done) would help.

## 7. Stage 5 list, toward GTA4

1. **Fix PT4-13** and get the gate green; then run a blind replay of H4's and H5's paths on the fixed build (shop, decks, Crate Digger, Laundromat).
2. **Finish GTA3**: box truck and other flat vehicle bodies through CARS2's lofted cars; move the two corner viewpoints; far skyline; pop-in check.
3. **Feel lanes now running** and to be reviewed as they land: CARS2 (real-proportion procedural cars), CAM (lower, closer GTA-style
   camera, look-back, idle cinematic), ART (warmer grade, cloud sky, baked AO), PHONEGFX (blob shadows and a small sun shadow on phone).
4. **GTA4 items**: reflections on car paint (GFX's unfinished half), crowd density that stays up across the hour (not only bursts),
   an LOD pop check with before/after frames, neon bounce at night, clutter on every block measured per tier.
5. **Real cars** once the user allow-lists kenney.nl, quaternius.com or poly.pizza, or supplies licensed models; hosted-only if heavy.
6. RASC follow-ups (§5.2) and a check that Radio SC works on the hosted build through the `/ra-api` rewrite.
