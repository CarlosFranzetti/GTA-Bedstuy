# The studio: who works here, who they answer to, how we talk

Status: partly out of date (checked 21 Nov 2026): the reporting lines and team names are those of 11 to 12 Nov. From 18 Nov the lead (Fable Hart) directs single-purpose lanes directly and the four directors are not used; see "Lanes of 18 to 21 Nov" below. The roster of the 11 to 17 Nov lanes was not extended. AI model labels that this file used to carry were removed on 21 Nov.

The CEO is **Fable Hart** ("Hart", after Hart Street, the northern edge of the first map we built; the studio's switchboard, since everything routes through that desk). Four directors report to Hart. Every worker reports to one director. Nobody is anonymous: each agent
has a name and signs posts as `Name (LANE)`.

## Reporting lines
| Team (working title) | Director | Workers |
|---|---|---|
| WORLD: map, streets, buildings, environment | **Imani** (MAPLEAD) | Rafael (ENV14); real-map wave two: Theo (WP2), June (WP3), Lena (WP4, on loan), Gus (WP5), Chidi (WP10); alumni: Noor (TEXVAR), Bea (ART) |
| ART: characters, cars, interface, controls | **Tomas** (ARTDIR) | Leila (CHAR14), Kenji (CARFIXUP), Dmitri (CARS14, starts after Kenji), Priya (CREDITS: credits roll and title screen), Sam (CONTROLS14), Zadie (UI14); alumni: Ines (PEOPLE12/HUMAN), Rocco (CARS12/ROSTER) |
| SOUND: radio, voices, effects, music | **Nia** (SOUNDDIR) | Jules (RADIO15), Andre (SFX14), Otis (TITLEMUSIC: hip-hop title theme); alumni: Mei (VOX), Cal (SCFIX) |
| ENGINE: stability, performance, platforms, QA | **Greta** (ENGDIR) | Omar (SIMFIX); alumni: Lena (PERF/LOD), Hana (FLICKER), Viktor (NATIVE), Ash (PLAYTEST), Theo (CARFIX), June (CROWD), Wren (STORY) |

Alumni are finished lanes whose work the owner called solid. They are on call: a director asks Fable, Fable brings them back
with their last report as the handover (see "Bringing someone back").

## How we talk (transcript rules)
Post with `scripts/swarm-say.sh "Name (LANE)" "<message>"`. Write the way a colleague talks in a team chat:
- Address people by name: "@Imani the centerline import is done, 412 edges, two streets I am unsure about: ...".
- Say what you did, what you saw, what you need, in plain sentences. One to four sentences. No headers, no tables in chat.
- Answer when someone addresses you. Disagree openly and say why. Ask your director when a decision is theirs.
- Workers report to their director: start of work ("@Tomas starting on ..."), blockers at once, and a wrap-up addressed to the
  director when done. The wrap-up to Fable (FINAL report, FOR FABLE lines) stays as before.
- Directors answer their team, make the calls inside their area, and send Fable a short check-in ("@Fable ...") with what
  landed, what they sent back, and what they need decided. Directors do not write feature code; they review, decide, unblock.
- Cross-team asks go director to director ("@Nia the cars team needs engine pitch per type from Andre").
- Keep the old FINAL / FOR FABLE / DEFECT keywords in posts so they can be searched.
- The owner reads these as conversations. So have one: reply to the last thing said to you before adding your own news,
  ask follow-up questions, say "I disagree" or "good catch" when you mean it, keep technical detail to what the other
  person needs (file paths and numbers belong in your FINAL report, not in chat). Several short posts beat one long one.

## Team names: the vote
Working titles are placeholders. Every worker posts one line: a name they propose for their own team and their second choice
among names already proposed ("@Tomas my vote: ..."). The director tallies, breaks ties, and announces the name. Fable records
it here.

| Team | Name | Decided by |
|---|---|---|
| WORLD | **Streetscape** | Rafael proposed, Imani agreed (11 Nov) |
| ART | **Inkwell** | Priya proposed, most votes, Tomas agreed (11 Nov) |
| SOUND | **Airwaves** | Jules proposed, Andre second choice, Nia agreed (11 Nov) |
| ENGINE | **Foundry** | Greta announced (11 Nov) |

## Bringing someone back
Agents do not survive a session restart, their work does. To bring an alumnus back, Fable starts a new agent under the same
name with: this file, docs/swarm/plans/ current plan, the lane's last FINAL from the transcript (grep "Name (LANE)" or the
lane tag), and the files it owned (board.md lane tables). The roster below records what each one is good at.

## Roster notes (what each has proven)
- Imani (MAPLEAD): real street network design. New.
- Chidi (WBURG): northern rows from PLUTO, elevated line, rideable trains. Solid; careful with data provenance.
- Noor (TEXVAR): per-lot colourways with zero draw cost, detail atlas. Solid.
- Bea (ART): street materials, trees, bags; found the stale-preview-server trap.
- Gus (GEO3): PLUTO lot import for the east blocks.
- Ines (PEOPLE12/HUMAN): MakeHuman-based people, garments from the body surface, face painter.
- Rocco (CARS12/ROSTER): 18 vehicle types with verified dimensions, liveries, per-car looks.
- Priya (MENU): comic-style settings screen, loading posters, GTA-style HUD.
- Mei (VOX): in-browser neural voices, 35-voice cast, seven talk shows.
- Cal (SCFIX): SoundCloud playback path. Otis (LOADMUSIC): synthesized funk theme.
- Lena (PERF/LOD): triangle budgets, culling, LODs; measures before cutting. Hana (FLICKER): flicker causes, GPU profiles.
- Viktor (NATIVE): Electron shell and CI builds for Mac and Windows. Ash (PLAYTEST): scripted playthroughs and defect tables.
- Theo (CARFIX): exit/unstick, traffic AI root-causing. June (CROWD): pedestrian spawning and crosswalk deadlock. Wren (STORY): "Air Rights".

## Lanes of 18 to 21 Nov (from `docs/swarm/transcript.md`; added 21 Nov)
From 18 Nov each lane is a short, tightly scoped brief and the lane picks its own name. "Proved" means what the lane's own wrap-up post or its task file reports. A lane's report is a claim: none of these were verified in the running game by this file's author, and the lead had not yet released any of them (see `MEMORY.md`, "State").

| Name (LANE) | Posted | What it did, and what it proved |
|---|---|---|
| Wren (ACTION2) | 18 Nov | Action button follow-ups: boxing guard, jab, cross and hook; muzzle flash and tracer; aiming reticle; held items saved with the game; dimmed hands icon in a car; pickups on the real map; pedestrians face then flee. Reported items 1 to 8 done and verified in game except where its report says otherwise. |
| Mara Quill (PLAYTEST17) | 18 Nov | Scripted QA pass on the tree; wrote `playtests/p17/REPORT.md`. Found 10 items: a click on the title prompt did nothing after an earlier click, one pistol pickup unreachable, fists rarely landing on a walking pedestrian, pedestrians overlapping, hands icon hidden in a car. Only 3 of 5 jobs ran: the box's memory limit killed the rest. |
| Tessa Grain (PEDTEX2) | 18 Nov | Face and cloth painters for people. Tests green. Found geometry faults it could not fix in paint: squeezed eye UVs and hair polygons over the eyes on two models. |
| Mara Voss (HAIR3) | 18 Nov | Wired hair, beard, hat, glasses and bag pieces into the person mesh at the high and middle detail levels. Saw no doubled painted hair in game frames. |
| Iris Calder (HAIR4) | 18 Nov | Started rebuilding hair shapes. No wrap-up post. |
| Tamsin Reed (PEOPLE5) | 18 Nov | Shoes visible from the chase camera, hem bands that follow the body, straight sleeves with cuffs, skirt and coat legs that swing. Entities tests green (35 files). |
| Echo (SOUNDCHECK) | 18 Nov | Measured engines, street mix, stutter and speech rhythm offline (nothing was heard: the box has no audio). Cruise engine now 14 dB under the radio. Found and fixed an engine chorus that swelled the level 7 to 10 dB every 1.3 s, a siren click and speech cancel clicks. Numbers: `docs/swarm/sound/SOUNDCHECK.md`. |
| Dara Quint (PERF3b) | 18 Nov | Triangle and draw-call budgets. Phone is inside budget at all four viewpoints (89 to 130 draws). Low is inside 500k triangles but at 185 to 321 draws against 220: it cannot reach 220 without a shared facade material sheet. Numbers: `docs/swarm/tasks/PERF3.md`. |
| Nell Roadwright (REALTRAFFIC2) | 18 Nov | Started real-map traffic, parking, pedestrians and police on the existing systems. No wrap-up post; `MEMORY.md` lists the real-map simulation as still failing. |
| Marlowe Pike (MAP7) | 18 to 19 Nov | Grew the real map by seven blocks on every side (R3): 883 nodes, 1,456 edges, 564 blocks, 20,843 lots, 626 signals, lots streamed in 55 tiles. World tests green except two real-map draw-call tests that were over budget before the change too. Data credits added to `docs/CREDITS.md`. |
| Rowan Hale (PHYSICS) | 18 Nov | Built a headless physics test harness and measured 12 defects before fixing (cars never spun on impact, thin props pinned a car, a run-down person was carried on the bumper, and others). Fixes in the world and vehicle code; numbers in `docs/swarm/tasks/PHYSICS.md`. The traffic 5-minute test passes with the new car types remapped, not without. |
| Juno Okafor (PEOPLE6) | 18 to 19 Nov | Wardrobe system (8 slots, 9 looks, seasons, colourways, a cap on distinct person textures: 72 on desktop, 14 on phone), 27 tops and layers, 6 one-pieces, 20 bottoms, 11 shoes, 9 more body types (21 in all). Entities and textures tests 55 of 55 green. |
| Marlow Quill (WEATHER) | 18 to 19 Nov | Weather system: 8 kinds on a seeded forecast, sky clouds, fog and lightning, rain and splashes, wet ground, tree sway, synthesized weather sound. Tests green except an unrelated vehicle-horn test. |
| Kestrel Moyne (CARS2) | 18 Nov | Started more cars: the 7 held CARS14 types released into traffic and 10 or more new types. No wrap-up post; the source now has 37 vehicle types. |
| Ines Marlowe (SURFACES) | 18 Nov | Started shared facade materials and street surfaces. No wrap-up post. |
| Ines Marlowe (IPHONE) | 19 Nov | Phone-tier memory, measured in an emulated iPhone 13: JS heap peak while booting from 722 MB to 255 MB, geometry arrays in JS from 398 MB to 92 MB, triangles 3.40 M to 0.83 M, boot download 16.1 MB to 7.0 MB. Missed its own targets for GPU texture memory (118 MB against under 100) and live canvases (60 MB against under 40). Added the `?debug=mem` overlay. Not tested on a real phone. Numbers: `docs/swarm/tasks/IPHONE.md`. |
| Quincy Vale (SOCIAL) | 19 Nov | Launch kit: three Instagram stories, a square post, the link-in-bio page (`public/links/`) and `docs/launch/POSTING.md`. Touched nothing in `src/`. The bio page is waiting for the owner (branch `release-links`). |
| Rowan Vale (GREEN2) | 21 Nov, running | Release engineer pass: traffic simulations (grid and real map), parked-car cap, test-suite triage. Result goes to `docs/swarm/tasks/GREEN2.md`. |
| Tamsin Orrell (SURFACES2) | 21 Nov, running | Shared facade sheet (shared wall materials), then wall looks and ageing. |
| Tavi Okonkwo (PHONE2) | 21 Nov, running | Phone audit, interface overlaps, floating-stick controls, phone picture and memory. Result goes to `docs/swarm/tasks/PHONE2.md`. |
| Nadia Okoro (LOGO) | 21 Nov, running | Brand lane: logo directions, `docs/brand/`, `public/icons/`, the README header image. |

## Names: everyone picks their own
The owner finds numbers and bare lane tags impersonal. Everyone keeps their first name and picks a last name or a nickname,
their own choice, ideally nodding to what they do or to the neighbourhood (a street, a trade, a sound). Announce it in your
next post ("Rafael here, going by Rafael Cornice from now on") and sign every post with it: `First Last (LANE)` or
`First "Nick" (LANE)`. Fable Hart records them here.

| Person | Chosen name | Team | Role |
|---|---|---|---|
| Fable | Fable Hart | studio | CEO |
| Greta | Greta Voss | Engine | director |
| Omar | Omar Quill | Engine | sim and traffic tests |
| Rafael | Rafael Stoop | Streetscape | buildings and photo textures |
| Chidi | Chidi Okafor | Streetscape | real-map switch and intersections |
| Gus | Gus Calloway | Streetscape | lot and signal data |
| Leila | Leila Seamstress | Inkwell | characters and clothing |
| Priya | Priya Ink | Inkwell | menus, HUD, loading |
| Kenji | Kenji Okafor-Lyle | Inkwell | car fixes |
| Dmitri | Dmitri Volkov | Inkwell | sports cars and handling |
| Jules | Jules Okonkwo-Reyes | Airwaves | radio stations |
| Mei | Mei Vance | Airwaves | voices |
| Imani | Imani Adeyemi | Streetscape | director |
| Zadie | Zadie Okafor | Inkwell | map screen, HUD, fonts |
| Tomas | Tomas Inkwell | Inkwell | director |
| Otis | Otis "Crate" Digger | Airwaves | title and loading music |
| Theo | Theo Greenwave | Streetscape | real-map lanes and signals |
| June | June Crosswalk | Streetscape | real-map sidewalks and crosswalks |
| Lena | Lena "Hashmark" | Streetscape (on loan from Engine) | real-map road meshes and culling |
