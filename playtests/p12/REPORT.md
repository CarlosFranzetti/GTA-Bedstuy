# Playtest p12 (11 Nov) — automated pass by the PLAYTEST agent

Scripts: `scripts/playtest/full-pass.cjs` (flags `--live`, `--phone-only`, `--seed`, `--out`), `live-gameplay.cjs`, `live-radio.cjs`.
Results: `results.json` (phone profile), `results-desktop.json` (desktop run 2). No frame rates are reported (software renderer).

## Pass / fail
- live-gameplay, local build: 10/10. Live site: 10/10.
- live-radio, live site: pass (a SoundCloud mix reached 45.7 s).
- full pass, desktop: 31/34, then the page navigated at New game (see D8). 300 m drives failed (D7).
- full pass, phone profile (iPhone 13 landscape, touch): 4/7. CAR, RADIO and the stick pass. MAP and PHONE failed only because the script looks for text and the buttons are icons (harness gap).

## Defects
| ID | Sev | Where | What | Screenshot | Lane |
|---|---|---|---|---|---|
| D1 | major | phone 844x390 | CAR, MAP, RUN/BRAKE and phone buttons overlap each other, the speed number and the street label | P4-map.png, P3-stick.png | MENU |
| D2 | minor | desktop driving | radio ticker overlaps speedometer and street label, bottom right | 03c-suv-exit.png | MENU |
| D3 | minor | map | "Laundromat Getaway" and "WAX DELI" labels collide | 07-waypoint.png | MENU |
| D4 | minor | phone open, desktop | hard vertical colour seam mid-frame (warm left, cool right); unconfirmed render artifact | 08-phone.png | render |
| D5 | minor | mission start | untextured grey block on the sidewalk next to the player | 05-mission-start.png | TEXVAR |
| D6 | minor | van | camera too close behind the van; body fills the frame | 03a-cargovan-drive-mid.png | CARS12 |
| D7 | major | drives | cars covered 126 to 198 m in 150 game-seconds under random steering; script steering or kerb stalling, unconfirmed | results-desktop.json | physics |
| D8 | note | new game | New game reloads the page. This is by design (the player model is rebuilt for the new look) | | none |
| D9 | major | load, run 1 only | load restored the player 4214 m from the save point after a failed interior exit; not reproduced in run 2 | 09-loaded.png | save/interiors |
| D10 | minor | local radio | local build shows "No sets yet" (feed proxy returns 502 in the container); live radio plays | 03c-radio-0.png | none |

## Not covered
Missions were completed by teleporting through objectives; no shop purchase; no cop chase; no bus (none spawned); no crosswalk targeting.
