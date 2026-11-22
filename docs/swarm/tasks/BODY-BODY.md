# BODY-BODY (Corin Halloran, BODY seat), 22 Nov 2026 evening

Status: in progress. Files: pedBody*.ts, pedBodyTypes.ts, humanModel.ts, pedMesh.ts (dress block moves to CLOTHES' pedDress.ts), new pedProportions.ts, scripts/body-lineup.html and .mjs (my line-up harness), tests/unit/entities/body-measure-probe.test.ts (my measuring probe).
Scratch: /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/body/ (before.json, show.py, shots.sh, before/ and after/ sheets).

## How to measure and look
- Numbers: `BODY_OUT=<file>.json npx vitest run tests/unit/entities/body-measure-probe.test.ts --maxWorkers=1`, then `python3 -I show.py <file>.json [filter]` in the scratch folder. Real figures: ANSUR II (`ansur.py`, in scratch) and docs/reference/gta5-characters.md.
- Sheets: `scratch/shots.sh <outdir> <tag>` (front and side, bare grey body and dressed, men and women, elder/teen/kid), through scripts/body-lineup.mjs. Orthographic, ruler in metres on the left, brown lines every 1/7.5 of 1.75 m (head heights of a 7.5-head figure).

## Findings before any change (measured on the built bodies, hi level, average type, stature in metres)
(see the table at the end; filled in as I go)

| Measure (adult man, average type, 1.775 m) | before | after (this pass) | real (ANSUR II / canon) |
|---|---|---|---|
| heads tall | 7.19 | 7.49 | 7.5 |
| elbow height / stature | 0.651 | 0.626 | 0.63 |
| wrist height / stature | 0.507 | 0.484 | 0.485 |
| fingertip height / stature | 0.425 | 0.374 | 0.375 (mid-thigh) |
| upper arm, joint to joint (m) | 0.259 | 0.308 | about 0.30 to 0.33 |
| hand length (m) | 0.146 | 0.195 | 0.193 |
| bideltoid width (m) | 0.462 | 0.494 | 0.510 |
Women: heads 7.19 -> 7.49, fingertips 0.443 -> 0.374, hand 0.121 -> 0.181 (real 0.181), bideltoid 0.403 -> 0.429 (real 0.450). Kid: heads 5.6 -> 6.2, hand 0.095 -> 0.135 m.
Hips (0.195 of stature across), knee 0.29, ankle 0.043, crotch half the person: already right, untouched.

## What was wrong (confirmed by measuring, not assumed)
- Arms: elbow and wrist too high, upper arm a fifth short, hand a third short. Hands hung at hip height. Fixed at load by pedProportions.normalizeShape (arm re-spaced along its length with the skin weights, rig, rings and landmarks together).
- Head 4 percent too big on every adult (7.19 heads), and children's heads shrunk twice (5.6). HEADS_OF_STATURE now 7.5 / 7.5 / 7.1 / 6.2.
- Shoulders 9 percent narrow at the deltoid: every body type x1.08 (teens 1.04). Chest depth x1.07, waist +7 percent, belly and back +12 mm, men's 5 percent waist wedge removed.
- Not wrong: legs (crotch 0.48), hips, feet (bare male foot 0.158 of stature, real 0.154; the long feet REVIEW saw are shoes: CLOTHES).
## Variety
Stature: normal draw (sd 3.2 percent adults, 4 percent children) around the sex's base height, the body type contributes 65 percent of its factor; width and depth are separate normal draws (sd 2.8 and 3 percent), taller people a little broader; arm length sd 1.5 percent. 21 types and their pools unchanged.
## Interface
src/entities/models/pedProportions.ts: normalizeShape, legLength, legSegments, armLength, armSegments, torsoHalfWidthAt.
