# Stage 6 check-in: getting around, and the last GTA3 items

Written by the Opus manager (MGR) on 7 Nov 2026 at about 05:30Z. Stage 6 opened at 04:43Z, straight after the Stage 5 close and
H6's blind playtest, and ran three lanes: NAV6, HUD6 and GTA4A. Reviews are in `transcript.md` (search `MGR review of`).

## 1. Summary

H6 was the first blind tester to get through the record shop and buy a record, which shows the Stage 4 shop fixes work in real
play. After that it could not find home, and it spent its last twenty steps stuck against walls nobody could see. Stage 6 fixed
both problems at their cause:

- **Invisible walls.** Two pieces of street furniture formed traps. Scaffold hoardings stood 0.9 m off the facade, leaving a slot
  a wall-hugging player wedged into. One areaway yard had a single 1 m door. A new test now walks every sidewalk, including the
  3.5 m past the building line where stoops and yards sit.
- **Wayfinding.** HOME is now marked, and the minimap has a legend.

HUD6 cleaned up the small-screen HUD and found that the "swapped" street signs were really two blades hiding each other.

GTA4A closed the last two GTA3 gaps:
- **Far skyline.** The distant city was plain tan blocks; it now has windows.
- **Pop-in.** Cars switched from their far model to their full model 24–29 m from the camera, close enough to see. That switch
  now happens 72 m away.

**LEVEL GTA3 is now met on all seven standard viewpoints, at low and at phone.**

**Global gates on HEAD 9ad3c19, all green:**
- `npx tsc --noEmit` is clean.
- vitest: 127 files, 1947 pass, 2 todo.
- The build is fine and the artifact is 9.47 MB of the 12 MB budget.
- The headless smoke shows `errors: []` on every tier:

| tier | draw calls at spawn | triangles at spawn | budget |
|---|---|---|---|
| low | 322 | 1.63 M | — |
| medium | 447 | 2.35 M | < 500 |
| phone | 120 | 373 k | ≤ 140 |

**Watch the medium tier:** at 447 it has little headroom left (§6).

## 2. Per-lane outcomes

| id | lane | result |
|---|---|---|
| NAV6 | navigation | **ACCEPT.** See below. |
| HUD6 | small-screen HUD | **ACCEPT.** See below. |
| GTA4A | GTA3 gaps / GTA4 start | **ACCEPT.** See below. |

**NAV6.** The scaffold hoarding collider moved from 0.9 m to 0.3 m off the facade. The areaway basement entry widened from 1.0 m
to 1.6 m on every stooped lot; the yard on lot r2c0-E-8 was H6's last trap. `walkable.test.ts` checks every sidewalk on both
sides of every street:
- It sweeps a foot-sized body across the sidewalk every 0.2 m, from the curb to 3.5 m past the building line.
- It fails on any blocked span, any slot narrower than 0.5 m and longer than 1.5 m, or any cut.
- It includes a test at H6's exact spot.
- It asserts that no parked car overlaps a sidewalk (three seeds, more than 50 parked cars each).

On the wayfinding side, the home door gets a HOME sign and awning. The minimap shows a green house for HOME and a gold D for
the Wax Deli. The pause menu explains the minimap dots, and N or a tap points the navigation arrow at HOME. NAV6 also added an
e2e walk of Throop's west sidewalk (`tests/e2e/walk-throop.mjs`).

**HUD6.** At 640×360, the mission objective, step counter and timer sit in their own column above the goal banner. The goal
distance is hidden while you are inside a room. Starting a mission shows a toast that explains the advance. The phone tabs work
from the keyboard. The location card hides behind open panels, and the street name is fully visible.

The street signs were never misnamed in the data. The two blades crossed at the pole and hid half of each other. They are now
stacked and hang toward the block, with a test on the real street data.

**GTA4A.**
- `src/world/Skyline.ts` adds a merged ring of proxy buildings 70–640 m outside the grid. It is one mesh with one material, has
  windows in six colours with lit windows at night, and is hidden under the phone fog.
- `scripts/popin-check.mjs` walks the camera 80 m down Throop and lists every mesh that first appears within 60 m.
  - Before: 41 such rows, all car model swaps at 24–29 m.
  - After raising `carNearDist` from 32 to 72 m on low, medium and high: none.
- Cargo boxes get liveries for three invented businesses, plus plain white.
- The SUV was trimmed from 2,816 to 2,492 triangles.
- The night-band decision is recorded in PRD §5.4.

**Cost ruling on pop-in.** The pop-in fix costs +11 % mean draw calls on the low-tier walk (285 → 317) and +18 % on the golden
aerial (308 → 364). I agree with Fable that it is worth it: car pop-in is what players remember. The phone tier keeps its own
near distance and is unchanged.

## 3. Graphics ladder (LEVEL GTA3), current

| viewpoint | low | phone | what changed this stage |
|---|---|---|---|
| 1 noon street | MET | MET | — |
| 2 noon corner | MET | MET | Recaptured from the new corner (v15). The sign blades no longer hide each other. |
| 3 golden aerial | **MET** (was MOSTLY MET) | MET | The far skyline now shows windowed blocks and a few towers instead of plain tan boxes. The phone fog hides the ring by design. |
| 4 dusk car | MET | MET | Cargo liveries. |
| 5 night car | MET | MET | — |
| 6 night corner | MET | MET | Recaptured from the new corner (v15). |
| 7 morning signals | MET | MET | — |

The pop-in check now finds nothing within 60 m on the Throop walk.

**GTA3 is complete.**

**GTA4 status:**
- Already in:
  - per-hour grading, haze and lamp bloom
  - wet-road reflections and contact shadows
  - six pedestrian models and six car types with colour variants and liveries
  - LOD switches without visible pop on the tested walk
- Missing:
  - car-paint reflections
  - crowd density that holds through the day
  - clutter measured per block and tier
  - neon bounce at night
  - a full pop-in sweep on more routes than one street

## 4. H6 triage, closure

| id | severity | what | status |
|---|---|---|---|
| PT6-1 | P1 | Invisible walls on Throop | **fixed:** hoarding offset, and the areaway entry gap widened to 1.6 m; walkable sweep plus a test at H6's exact spot |
| PT6-2 | P2 | No HOME marker | **fixed:** HOME sign, minimap house icon, navigation arrow |
| PT6-3 | P2 | Minimap dots unexplained | **fixed:** legend in the pause menu |
| PT6-4 | P2 | Objective overlapped the goal banner; 4215 m shown inside the shop | **fixed:** column layout; goal distance hidden indoors |
| PT6-5 | P2 | Phone tabs not keyboard-reachable | **fixed** |
| PT6-6 | P3 | Offer ring changed cash without explanation | **fixed:** toast names the advance |
| PT6-7 | P3 | Mission timer runs while stuck | **open as a design question;** less pressing now that the trap is gone |
| PT6-8 | P3 | Parked truck on the sidewalk path | **fixed:** test asserts no parked car overlaps a sidewalk |
| PT6-9 | P3 | Street-sign suffixes "swapped" | **fixed:** blades hid each other |
| PT6-10 | P3 | A half-turn command turned only ~90° | **open, low:** harness mouse scale or camera easing |

Not yet confirmed in blind play: everything fixed above. H7 should replay H6's route, from the record shop to home on foot,
on the phone tier.

## 5. Decisions recorded this stage

- **The night brightness band (0.085–0.13) applies from 22h** (Fable, 7 Nov; PRD §5.4). 21h is blue hour.
- **Pop-in distance 72 m** on low, medium and high, accepted at +11–18 % draw calls on low.
- **Phone viewpoint 6** from the new corner draws 132 (budget 140); nothing to trim.

## 6. Open issues

1. **Medium headroom.** The spawn view at medium now draws 447 calls (it was 323 at the Stage 5 close), from the skyline ring
   plus the longer car range. The limit is 500. Measure all seven viewpoints at medium before the next artifact. If any view
   passes 480, merge the far cars more aggressively (CarLod) rather than shortening the pop-in distance again.
2. **Repository size.** `playtests/h6` (about 100 MB on disk, including an 11 MB mp4) is committed. Fable's call whether to move
   sessions to the scratchpad and ignore `playtests/`.
3. PT6-7 (timer while stuck) and PT6-10 (turn scale).
4. Carried forward:
   - the ra-nyc duration unit
   - a browser test of a live phone → low tier switch
   - realistic cars and real map data, both still blocked by the network allowlist

## 7. Stage 7 list, toward GTA4

1. **Blind playtest H7 on the phone tier:** record shop → home → decks on foot. Then a desktop tester who drives at night and
   judges the camera, cars, pop-in and mood.
2. **Medium budget check** on all seven viewpoints (§6.1).
3. **GTA4 items:**
   - car-paint reflections (the second half of GFX's SSR work)
   - neon bounce on wet and dry streets
   - crowd density by hour that holds rather than bursts
   - clutter measured per block and tier
   - pop-in sweep on two more routes (an east–west street and an avenue drive)
4. **Real cars:** once the user allow-lists kenney.nl, quaternius.com or poly.pizza, or supplies licensed models
   (hosted-only if heavy).

## 8. Process notes

- **The playtest-to-fix loop is now quick.** H6 reported at 04:43Z; all six of its P1/P2 items were fixed, tested and
  committed by 05:07Z.
- **"Fixed" needs a test at the tester's exact spot.** NAV6 first fixed the trap it found, but H6's last stuck spot was a
  different trap a few metres away. Only a test at the coordinates the tester actually reported closed it. Every navigation
  defect from now on should have one.
- **Look before naming the fix.** HUD6's sign diagnosis was a better fix than the one I asked for: I assumed swapped names, and
  the real cause was the blades' geometry. Reviewers should describe the symptom and leave the cause to the lane.
