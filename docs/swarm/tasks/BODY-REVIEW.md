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

## Method notes
- Tags: base = the tree before the team started (git worktree of fe3ab94, same measuring test); r2 = 22:12; r4 = 22:30; r5 = final. Sheets for before = /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/before/ (21:38 tree).
- Street mix = 300 pedestrian draws as the game picks them (pickWardrobeVariant); aggregate files list P5/P50/P95 of adults.
- Foot slide is the ankle bone in stance on real built bodies (threshold: within 3 cm of the lowest ankle height of the run), not the generic rig of gait-measure.test.ts.
- In-game: /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/game.cjs (hosted build, ?q=low, 640x360). Frames in /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/game/<tag>/.
- Caveats: the ba-elder hand/fingertip rows include the cane (ignore); head width includes hats; 'cloth_*' are dressed minus undressed at rest on the shape's close level.

## Final state (tag r5, tree of 22:40 UTC)
- Demo pairs: /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/demo/demo1-standing-lineup.png, demo2-walking-lineup.png, demo3-walk-jog-sprint.png; walk strip /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/demo/demo4-walk-strip-after.png.
- In-game (hosted build, ?q=low, 640x360, 17:30): /tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/bodyteam/review/game/before-low, r5-low, r5-phone (montages game/*-player.png and *-peds.png). Low: 460k tris / 266 draws before, 438k / 262 after (no rise; still over the 220 low draw budget, as MEMORY says). Phone: 293k tris / 111 draws at the start (budget 300k / 150).
- Per person triangles, close / mid / far: 6391 / 1626 / 360 mean over the 12, identical before and after.
- Open: foot slide on speed changes got worse (start to jog max 2.5 -> 27 cm, GAIT), NaN bake line in pedMesh.skinMaterial (torn dark hems), feet 0.188 of stature (real 0.154), chest/waist depth 14-17 percent thick and bideltoid 8 percent wide (coats), 5 red tests (see channel).
