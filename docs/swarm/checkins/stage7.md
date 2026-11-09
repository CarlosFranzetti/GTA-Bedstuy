# Stage 7 check-in: toward GTA4

MGR, 9 Nov 2026 ~22:00Z. Terse by request. Reviews in `transcript.md` (search `MGR review of`). HEAD 6256845. Not committed by MGR.

## Summary
Stage 7 opened 7 Nov on v16 with four lanes and two blind playtests. It was paused twice by usage limits (7 Nov 06:20Z → 9 Nov 04:07Z, and
9 Nov 10:01Z → 14:20Z). **Accepted:** GFX2 and SHOP7. **Still running:** CROWD (its audits and pop-in routes are queued on the render
lock), so Stage 7 closes without it. H7 finished and H8 ran partially (a rerun is owed).

## Lanes
| lane | result |
|---|---|
| GFX2 | **ACCEPT.** Medium < 500 on all seven views (428–489; v3 golden aerial is the worst at 489). Neon/sign bounce stays in the dry night band (22h 0.130, 0h 0.102). The clear coat was first wired only to the glTF paint; Fable then had it spliced into the default car material (SkinCarPaint) through SKINS' hook. Near-car mesh merge → Stage 9 (CARHI). |
| SHOP7 | **ACCEPT.** Sell/buy need a confirm on Enter; the highlight starts on a buyable row; Q/E switch tabs and V previews, with a hint that matches; "Head back outside inside" fixed; radio caption off the exit prompt; HOME board/valance/blade sign. 683 ui/game/world tests. The HOME frame was owed; the one-time home hint was approved. |
| CROWD | **Open.** Done in code: `crowd-audit.mjs --clutter`, a per-face clutter floor (0 flagged faces at low), the PedestrianSpawn scheduler, and `popin-check.mjs --route` for 3 routes. Owed: the full-day pedestrian audit and the two new pop-in routes, still queued on the render lock. Carried to Stage 8/9. |

## Playtests
**H7 (phone, v16).** Never found HOME (the harness then had no N key), but completed Crate Digger and drove 30 m.
- PT7-1 to PT7-10: SHOP7 fixed the shop and text items; the harness keys are fixed.
- Still open: PT7-9, a mission starting when you walk into its ring.

**H8 (desktop low, h8d).** Liked the dusk and the lit storefronts. Got pinned on the pavement by poles and bins, and ended on a harness error at step 14 before full night.
- PT7-11: a mission beam starts on drive-through (P2, DRIVE9).
- PT7-12: car boxed in by pavement furniture (P2, DRIVE9).
- PT7-13: an unexplained wanted star (P3).
- PT7-14: radio CORS in the harness (fixed with a Vite proxy).
- PT7-15: the harness error (P3).

A night-drive rerun is owed.

## Ladder
GTA3 is met on all seven viewpoints for the world. GTA4 items in: per-hour grading, haze, lamp bloom, wet reflections, contact shadows,
clear coat, neon bounce. The PIVOT (9 Nov) makes GTA4-realism characters and cars the new target (PRD §5.4).

## Decisions
- The night band is measured **dry** from 22h; wet nights may run to 0.15.
- Pop-in distance stays at 72 m.
- The medium headroom fix is the near-car mesh merge (CARHI).
- Playtests stay in the repo as cut mp4 + transcript + frames.

## Open → Stage 8/9
- CROWD audits and pop-in routes.
- The H8 rerun at real night.
- PT7-9/11 (missions starting on contact).
- PT7-12 (DRIVE9).
- Medium v3 at 489.
