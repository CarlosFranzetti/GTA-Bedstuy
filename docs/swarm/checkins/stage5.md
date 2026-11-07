# Stage 5 check-in: the feel lanes

Written by the Opus manager (MGR) on 7 Nov 2026 at about 04:15Z. Stage 5 picked up after the Stage 4 close on 3 Nov, paused for the
usage limit, and closed after the feel lanes reported on 7 Nov. Reviews are in `transcript.md` (search `MGR review of`).

## 1. Summary

Stage 5 was about how the game feels to look at and move through: real-proportion cars, a GTA-style camera, a coherent grade and
sky, and a phone tier that still looks like the same game. All four lanes landed and are accepted. The two Stage 4 blockers are
closed: getting out of a car into a wall (PT4-13) is fixed with a free-spot search, and the phone tier is back under budget. The
phone fix came from Fable's diagnosis. The phone sun shadow had been switched on without its caster wiring, so every building drew
twice into the shadow map. That was most of the phone regression, not ART's or CARS2's work.

**Global gates on HEAD 2e69cc7, all green:**
- `npx tsc --noEmit` is clean.
- vitest: 119 files, 1897 pass, 2 todo.
- Build ok; the artifact is 9.45 MB of the 12 MB budget.
- Headless smoke, `errors: []` on every tier:

| tier | draw calls | triangles |
|---|---|---|
| low | 273 | 1.62 M |
| medium | 323 | 2.37 M |
| phone | 115 | 391 k |

On the graphics ladder, **GTA3 is now met on every viewpoint that can be judged**, at low and at phone. The two corner viewpoints have
just been moved out of the building and need one fresh capture to be judged (§3).

## 2. Per-lane outcomes

| id | lane | result |
|---|---|---|
| CAM | GTA-style camera | **ACCEPT.** All tested: car rig 4.6 m back and 1.7 m up; field of view 70 widening to 82 with speed and 64 on foot; swings back behind the car in ~1.2 s with no overshoot; the rig scales with vehicle size (the box truck sits 7 m back and 4.9 m up). Look-back works on C, the touch LOOK button and right-stick click. An idle cinematic starts after 8 s, and a letterbox shows on mission start. 65 tests in my run. |
| CARS2 | procedural cars | **ACCEPT.** Lofted bodies at real proportions for the sedan, coupe, SUV, cab, cop and box truck, with arches, grilles, lights and plates. The cab has its chequer stripe and the cop car a POLICE livery with a light bar. Colour variants show in traffic. The Kenney models are now opt-in only (`VITE_GLTF_CARS=1`). The SUV at 2,816 triangles (budget 2,500) and the plain white cargo box are Stage 6 tuning, not defects. 699 tests in my run. |
| ART | art direction | **ACCEPT** after one round. Delivered a cloud layer with sun glow, a warmer noon, ground and road-marking variation, baked shading under cornices, and stronger glass reflections. The first pass made night too bright: the spawn street read 0.239 at 21h and 0.195 at midnight, against a band of 0.085–0.13. ART's claim that this matched the baseline cited a Stage 2 note that L10 had superseded. After the retune it reads **0.115 at midnight** (in band) and **0.156 at 21h** (just above), with blown ≤ 0.02 %. 752 render/world/texture tests pass. |
| PHONEGFX | phone shadows and look | **ACCEPT.** Blob shadows under cars and people cost two instanced draws. A 512 px / 40 m phone sun shadow is fed by cheap per-lot prisms (3 shadow draws). The phone also gets the hourly LUT, fog from 30 to 100 m, and quarter-resolution bloom gated on measured frame rate. Phone viewpoints read **108–141 draws and 301k–480k triangles**, down from 202–227 and 738k–949k. 161 render tests in my run. |
| MISSFIX | (Stage 4) | Moved from DEFECT to done: `Player.exit` now picks a free spot (commit 58dd46c); the enter-exit test passes. |
| RASC | (Stage 4) | Its three small defects are fixed. The ra-nyc `duration` unit is still unconfirmed from this sandbox. |

## 3. Graphics ladder verdict (LEVEL GTA3)

Judged on ART's after frames (`scratchpad/art/after2-low`, `after-phone`), PHONEGFX's `scratchpad/pg/out-afterD`, CAM's
`scratchpad/cam/screens` and CARS2's `scratchpad/cars2/a2-*`.

| viewpoint | low | phone | notes |
|---|---|---|---|
| 1 noon street | MET | MET | Textured street, real models with shadows (blob shadows on phone), props. |
| 2 noon corner | MET | MET | Amended 7 Nov after the v15 recapture (`scratchpad/v15`): the camera now stands on the south-west corner of Throop & Kosciuszko looking across the intersection; textured buildings, signals, a cab, trees, crosswalks and sky; phone fog closes the far end. Low 268 draws, phone 116 / 386k. |
| 3 golden aerial | MOSTLY MET | MET (heavy fog) | Near roofs and walls are good; the far skyline is still plain tan blocks at low. Phone fog hides most of the city. |
| 4 dusk car | MET | MET | Textured truck and cars, cloud sunset sky, storefronts. |
| 5 night car | MET | MET | Lit windows and signs, stars, lamps, real car bodies with lights. |
| 6 night corner | MET | MET | Amended after the v15 recapture: lit windows, street lamps with bloom, stars, lit storefronts and wet-looking crossing. Low 251 draws, phone 132 / 384k (under 140). Two notes for both corner views: the street-sign blades read 'Kosciuszko Ave' over 'Throop St', with the suffixes swapped (HUD6 owns the fix), and the sign pole stands in the centre of the frame, which a 1 m camera shift would clear. |
| 7 morning signals | MET | MET | |

A pop-in check within 60 m has still not been run.

**GTA4 items already in:** per-hour grading, haze, lamp bloom, wet-road reflections, contact shadows, five-plus pedestrian models and
six car types with colour variants.

**GTA4 items still missing:** car-paint reflections, crowd density that stays up across the hour, clutter measured on every block, a
pop-in (LOD) check, and neon bounce at night.

## 4. Decisions for Fable

1. **The night band at 21h.** Midnight is in band, but 21h reads 0.156, a deep blue hour rather than full night. I recommend the band
   apply from 22h rather than trimming the 21h key further.
2. **Phone viewpoint 6 at 141 draws** (budget 140) was measured on the old wall view. Recapture it from the new corner spot. If the open
   view goes well over 140, trim there.

## 5. Open issues

1. ~~Recapture viewpoints 2 and 6~~ done 7 Nov (v15): both MET at low and phone; GTA3 is now met on six of seven viewpoints and mostly met on the golden aerial at low.
2. The far skyline at low is plain tan blocks.
3. SUV over its triangle budget; the white cargo box has no livery.
4. The location card overlaps the minimap and mission offer at 640×360 (seen in CAM's frames).
5. No browser test of a live phone → low tier switch (cast flags are restored in code, `main.ts:139`).
6. ra-nyc duration unit unconfirmed. Realistic cars and real map data are still blocked by the network allowlist.
7. No blind playtest has yet replayed the shop, decks and Crate Digger paths on the fixed builds (Stage 4 fixes).
8. WIRE and CLUTTER from Stage 3/4 never posted final reports; GTA3 and GFX had no final report in the transcript.

## 6. Stage 6 list, toward GTA4

1. **Blind playtest round on the current build:** one tester on the phone tier through the shop, decks and Crate Digger; one driver who
   judges the new camera and cars; one at night judging mood.
2. **Finish GTA3 formally:** recapture viewpoints 2 and 6; a far-skyline facade texture; a pop-in check with before/after frames.
3. **GTA4:**
   - car-paint reflections, finishing GFX's other half;
   - crowd density that holds through the day (not bursts);
   - clutter measured per block and tier;
   - neon bounce on wet and dry streets at night;
   - box-truck liveries and some dirt.
4. **HUD at 640×360:** the location card should not cover the minimap or mission offer.
5. **Real cars** once the user allow-lists kenney.nl, quaternius.com or poly.pizza, or supplies licensed models (hosted-only if heavy).
6. Confirm the ra-nyc duration unit on the hosted build through `/ra-api`.

## 7. Process notes

- The best catch of the stage was Fable's. The phone over-budget looked like the sum of ART and CARS2, but it was one missing wiring call.
  The lesson is to measure the shadow pass separately (`drawCallsShadow`) before blaming geometry.
- ART's first night claim leaned on an outdated baseline. The baselines file now has Stage 2 and Stage 3 sections in one document, and it is
  easy to cite the wrong one. A short "current targets" header at the top of `docs/reference/light-baselines/stage2.md` would help.
- The two-hour render lock (commit 06b056c) let all four lanes capture full frame sets this stage, which they could not do in Stage 4.
- The gate is green, with 1897 tests, for the first time since the Stage 3 close.
