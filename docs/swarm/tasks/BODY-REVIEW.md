# BODY-REVIEW: the body team's eyes (REVIEW seat, Wren Calloway)

Status: current, first audit done 22 Nov 2026 evening. Edits no game source. Owner of: scripts/body-review.html and .mjs, tests/unit/entities/body-review-measure.test.ts.

## How to re-shoot the same sheets (same cameras every time)
- Sheets: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/shoot.sh <tag> [views]` (script at /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/shoot.sh; views default lineup~pose=stand, lineup~pose=walk, strips, startstop, near3, crowd20). Written to /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/<tag>/<view>-<tag>.png. Dev-server harness: scripts/body-review.html, driver scripts/body-review.mjs (run through SWARM_SMALL=1 scripts/swarm-render.sh). Late-afternoon light (low warm sun), people posed as the game poses them (AnimController with the person's own gait, then Pedestrian.reactionPose arm splay), close level forced in the ortho line-ups. Yellow bar = 1.75 m (tick each 0.25 m); cyan ticks = head heights counted from the ground (landmark head length of that person).
- Numbers: `BODY_REVIEW_TAG=<tag> npx vitest run tests/unit/entities/body-review-measure.test.ts --maxWorkers=1` writes /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/measure/<tag>-people.md (and -people-T.md, one column per person), -people.json, -aggregate.json (all 57 civilians' arm angle) and -gait.json (foot slide on real bodies, ankle bone in stance).
- Baseline tag "before" = the tree at about 21:35 UTC, when only footlock.ts had changed.

## Sheets (before)
- /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/before/lineup_pose_stand-before.png  (12 people, front then side, standing)
- /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/before/lineup_pose_walk-before.png   (same 12, mid-stride)
- /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/before/strips-before.png             (one adult: walk, jog, sprint, 8 frames a cycle)
- /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/before/startstop-before.png          (start from rest to jog; stop from jog)
- /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/before/near3-before.png              (6 people at 3 m, foot-camera fov 64)
- /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/before/crowd20-before.png            (20 people at 14 to 26 m)
- Tables: /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/measure/before-people-T.md, before-aggregate.json, before-gait.json

## Audit, worst first (before numbers; real figures from docs/reference/gta5-characters.md, ANSUR II shares)
See the channel post of the same time; numbers per item are in the table above. Real: crotch 0.48 H, hand 0.11 H, foot 0.154 H, fingertips of a hanging arm about 0.37 H, adult 7.5 heads.
