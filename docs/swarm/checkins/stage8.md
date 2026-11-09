# Stage 8 check-in: GTA3 skins, SoundCloud stations, real blocks

MGR, 9 Nov 2026 ~22:00Z. Terse. HEAD 6256845. Not committed by MGR.

## Summary
The user's four asks:
- GTA3 people and car skins (SKINS);
- every music station as SoundCloud mixes with synthesized announcers (RADIO8);
- the ten blocks from real open data (GEO2);
- a readable transcript (SCRIBE2).

RADIO8, GEO2 and SCRIBE2 are accepted. SKINS met its brief but is **superseded by the PIVOT** (9 Nov 21:5xZ): the user rejected the
blocky look ("more along the lines of Roblox") and asked for GTA4/5 realism. SKINS continues as PEDHI.

## Lanes
| lane | result |
|---|---|
| RADIO8 | **ACCEPT.** 8 SoundCloud stations through the official widget, plus WBSY Talk and an optional My Library. Fallback order: matching pool set → the station's own links → any pool set. Synth announcers: 8 personas, ≥ 8 min between IDs, never over talk, music ducked to 22 %. No audio bundled; WBSY Talk unchanged. 406 tests. Hardening: `topUp` now refuses before the first tune-in (Fable). ra-nyc durations are confirmed to be in seconds. |
| GEO2 | **ACCEPT.** BLOCKS.md: 5/5 facts I spot-checked hold; no Google data used. PLUTO import: 1,836 rows → 509 lots at H confidence, widths ~5 m, mostly 2–4 floors, filler lots labelled. All 15 POIs unchanged. 309 world tests; smoke `errors: []`. MapPLUTO attribution added. OSM (Overpass) is still blocked. |
| SCRIBE2 | **ACCEPT.** `transcript-readable.md` is ~21.5k words through Stage 8's start, including the disagreements. One more pass is due at close. |
| SKINS → PEDHI | The look met the user's GTA3 construction rule (welded body, short neck, painted faces, originals, 19 variants), but the draw cost was a **DEFECT**: in the isolated A/B, view 1 low went 320 → 416 (+30 %), because each person drew as ~11 parts. The one-draw-per-person fix is committed; its A/B is unread. The look is now **moot** (PIVOT). **The rule carries to PEDHI: a near person costs ≤ 3 draws (+ shadow), and the A/B must be measured.** The GTA3 bodies survive only as far LOD (> 40 m) or as a phone fallback. The car-skin pipeline and its hook stay. |

## Ladder (after PIVOT)
- **World:** GTA3 is met on all seven viewpoints.
- **Characters and cars:** the target is now LEVEL GTA4 realism (PRD §5.4 updated). Today's blocky people and the CARS2/SKINS cars
  fail it within 40 m.

## Open → Stage 9
- **PEDHI:** realistic people, 2,500–4,000 tris near, ≤ 3 draws, skeleton animation, 512–1024 px albedo + normal + roughness.
- **CARHI:**
  1. the near-car mesh merge (≤ 6 meshes);
  2. the real-car roster at GTA4 fidelity (plan A.6).
- **GRID9 and GEO3:** the expansion toward Halsey and Broadway (`plans/stage9.md`).
- **DRIVE9:** PT7-11/12.
- CROWD's owed audits.
- The H8 rerun.
- SCRIBE2's final pass.
