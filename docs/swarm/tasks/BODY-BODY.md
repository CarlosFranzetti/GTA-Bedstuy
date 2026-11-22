# BODY-BODY (Corin Halloran, BODY seat), 22 Nov 2026 evening

Status: in progress. Files: pedBody*.ts, pedBodyTypes.ts, humanModel.ts, pedMesh.ts (dress block moves to CLOTHES' pedDress.ts), new pedProportions.ts, scripts/body-lineup.html and .mjs (my line-up harness), tests/unit/entities/body-measure-probe.test.ts (my measuring probe).
Scratch: /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/body/ (before.json, show.py, shots.sh, before/ and after/ sheets).

## How to measure and look
- Numbers: `BODY_OUT=<file>.json npx vitest run tests/unit/entities/body-measure-probe.test.ts --maxWorkers=1`, then `python3 -I show.py <file>.json [filter]` in the scratch folder. Real figures: ANSUR II (`ansur.py`, in scratch) and docs/reference/gta5-characters.md.
- Sheets: `scratch/shots.sh <outdir> <tag>` (front and side, bare grey body and dressed, men and women, elder/teen/kid), through scripts/body-lineup.mjs. Orthographic, ruler in metres on the left, brown lines every 1/7.5 of 1.75 m (head heights of a 7.5-head figure).

## Findings before any change (measured on the built bodies, hi level, average type, stature in metres)
(see the table at the end; filled in as I go)
