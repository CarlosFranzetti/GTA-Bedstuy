# MEMORY: what every session on this project needs to know

Read this first. It is the project's standing memory: the owner's rules, how we work, where things are, and what is open.
Update it when a rule changes or a decision is made. Keep it short; history lives in `docs/swarm/transcript.md` and the PRD.
Last full update: 21 Nov 2026.

## The project in one paragraph

"GTA Bed-Stuy" is a free, non-commercial fan tribute: an open-world game of Bedford-Stuyvesant, Brooklyn, played in a
browser (desktop and phone) and as Electron apps for macOS and Windows. Three.js 0.186, Vite, TypeScript, vitest. Nearly
everything is generated in code: world, people, cars, textures, sound. Owner: Carlos Franzetti (credited as "Carlos
Franzetti presents"). Live at https://gta-bedstuy.vercel.app (Vercel builds `master`). Source:
https://github.com/CarlosFranzetti/GTA-Bedstuy.

## The owner's standing rules (do not bend)

1. No assets, fonts, logos, sounds, animations or traced art from GTA, Rockstar or any other game. GTA III, IV and V (and
   Yakuza, Saints Row, Borderlands) are STYLE references only. No Pricedown or lookalike fonts. No copyrighted audio bundled.
2. No Google Maps or Street View DATA or PIXELS in the game or the repository, and nothing traced from them. Since 21 Nov
   the owner allows LOOKING at Street View to learn what a place looks like, then building it from scratch (the lead is
   not certain Google's terms allow even that for a published work: keep it to looking). Map data: NYC Open Data only
   (centreline, tax lots, footprints, signals), recorded in `docs/CREDITS.md`. Photos and textures only from open sources
   (Wikimedia Commons, KartaView or Mapillary under their licences, with credit) or the owner's own photos.
3. Third-party assets must be CC0, or CC-BY / CC-BY-SA with credit, recorded in `docs/CREDITS.md`. MakeHuman DATA is CC0;
   its AGPL code must not be used. The neural voice's phonemizer (eSpeak NG, GPL-3.0) is fetched from a CDN, never vendored.
   CMU motion capture is free to use (not to resell as data). Mixamo, LaFAN1 and Bandai Namco sets are ruled out.
4. Real places appear under invented names. Shops, brands and liveries are parodies with invented wording. Real DJ and
   artist names appear only for real public radio streams. No lettering, logos or numbers on clothes.
5. Tone: no blood, no gore, nobody dies on screen. People go down, get up and run.
6. Privacy: the owner's email is private and never goes to an outside service. Prompts to outside services never carry
   the project's or the owner's name.
7. Never put AI model identifiers in commits, code or docs. Commits end with the two attribution lines the session gives.
8. ElevenLabs is OFF (owner decision); spend no credits there. SoundCloud only through its official widget.
9. The owner wants honesty: say what is verified and what is not, flag uncertain numbers, invent no sources or quotes.
10. Reports to the owner: lead with the outcome, short sentences, no em-dashes, bullets for parallel items.

## What the owner wants (his words, newest first)

- 21 Nov, night: "another 15 actual locations and the look as per online images"; "grow our blocks by 5 in each
  direction and 2 streets each in between N, E, W, S". Lead's reading: the real-street map grows 5 blocks north, east,
  south and west and 2 streets on the diagonals (lane MAP4); 15 more real places under invented names, each built to
  match open photos of the real place (lane LANDMARKS2; open-licence photos may be viewed and used, anything else is
  look-only, rule 2). Both live on `?map=real` until the real map becomes the main map.
- 21 Nov, later: "check in with me every now and then, let's see some images"; wants to see the play map; wants a
  plain-English conversational transcript (`docs/swarm/transcripts/`); "I want to decide the direction of the models and
  clothing" (ask him, with pictures, before any lane sets a style); original buildings, landmarks and stores under parody
  and invented names, with textures from open street-level images.
- 21 Nov, evening: interface, keys and controller settings mapped "as if it were GTA and Rockstar" (layout and bindings
  by convention only: no assets, fonts, icons or logos from them; lane CONTROLS); mechanics "smooth and like GTA 4"
  (camera, on-foot movement, car entry, aiming and melee, reactions; lane MECHANICS after ANIM2 hands back). He also
  asked for the lanes' conversations retold and each one's thought process written up; that request could not be
  carried out in this session, and the plain-English retelling in `docs/swarm/transcripts/` continues as before.
- 21 Nov, evening: "World should resemble real blocks, facades, stores and buildings; make similar textures from existing
  images online; realism but parodied." How: each real block's buildings follow the real ones (floors, material, colour,
  style, stoops, bays, shopfront positions) from NYC Open Data and open street photos; textures are derived only from
  CC0 / CC BY / CC BY-SA photos with credit, or painted in code to match what was seen; other online images and Street
  View are looked at only (rule 2); names and signs stay parodies (rule 4). Lane REALBLOCKS, after SURFACES4 and STORES2.
- 21 Nov, evening: "Better models and anime [animation, as the lead reads it] for players, smooth as GTA 3 but detailed
  like 5. Better faces. More clothes and varied. AAA ROCKSTAR LEVEL LOOK." Lanes: FACES (heads, faces, hair, hands),
  ANIM2 (skeleton with ankles, neck and wrists; foot planting; blending; idles), then more garment shapes.
- 21 Nov, later still: remake the pizzerias, delis and other small stores, each under a parody name, EXCEPT the hidden
  record shop (WAX DELI keeps its name). The record shop should stock "real records": parody sleeves, artists and titles,
  but real music "if you can handle that somehow". Lead's plan: real commercial tracks only as streams through the
  official SoundCloud player (never bundled, not mixable on the decks); a crate of public-domain and CC-licensed real
  recordings that can be bundled and mixed, each credited; the owner's own files through `src/assets/records/`.
- 21 Nov, decided by the owner: people look GRITTY, LIKE GTA IV (natural proportions, muted worn colours, heavy layered
  clothes, weathered faces); clothing MIXED BY AGE (older people in 2000s clothes, younger people in today's); Google
  Street View may be looked at only (rule 2).
- 21 Nov: update all the docs, set up this memory file, make a logo, fix the README, then all staff back to work: fix the
  bugs, then grow the map, then actual locations with fake names, then much more textures and clothing and better geometry
  all around ("really dig into GTA 4 and 5 for that"), more characters, more vehicles and better handling; "the phone is
  meh so let's fix that"; polish.
- 18 Nov: physics fixed; more body types and clothing; weather; more cars; more accurate map grown by seven blocks each
  way; street and building textures; real-looking locations; lanes in parallel but sparing with usage; periodic
  transcripts and updates.
- 18 Nov: Space starts the game; one action button (punch, throw, shoot); camera returns behind you two seconds after a
  look, slowly then faster; illustrated graphic-novel loading posters (blocked: needs an image generator).
- 12 Nov: characters "closer to GTA 3 or 4, smooth not bubbly or blocky", decent textures, lower engine sounds, motion
  capture for movement, a larger play area, no inked or cartoon look ("more polished as per GTA and Rockstar").
The full list with dates is in `docs/swarm/PRD.md` (Stage 13 onwards).

## How we work

- One lead (Fable Hart) directs lanes of subagents. Names, teams and how we talk: `docs/swarm/ORG.md`. Shared lane rules:
  `docs/swarm/RULES.md` (read it before any lane work). The art bar: `docs/swarm/art/ART-BAR.md`. Sound bar:
  `docs/swarm/sound/SOUND-BAR.md`.
- Only the lead edits `src/main.ts`. Lanes hand back exact lines. Lanes never `git stash`, never commit or push, keep
  `src/` compiling, and post to the transcript with `scripts/swarm-say.sh "Name (LANE)" "<message>"`.
- A lane's report is a claim, not a fact. The lead checks in the running game before anything is deployed.
- The look: `docs/swarm/art/DIRECTION.md` ("Stoop Light": late-afternoon haze and sodium nights, a muted world with
  earned accents, shape before texture, worn not dirty, one hand). Written 21 Nov on the owner's instruction to reimagine
  the look as a small team of the best veterans would. It outranks ART-BAR.md. The "ex-Rockstar" framing is a working
  fiction inside the studio only: never claimed in the game, README, credits or posts.
- Usage: the limit is a budget of roughly ten lane-runs per five-hour window (about 5 million lane tokens), whatever the
  parallelism. On 21 Nov fourteen lanes started in two hours and seven were cut off mid-task with no report. So: pick the
  ten most valuable runs per window, ask each to stay under about 350k tokens and to write its notes file EARLY and keep
  it current (a lane that is cut off leaves only its files). Give tight briefs,
  ask for scoped tests and one in-game capture, and tell lanes to hand back a solid partial result rather than run out.
  Resuming a lane with a very large context is costly; start a fresh one with a good brief instead.
- A stop hook asks for a commit and push after every turn.

## Records (21 Nov)

- OWNER, 21 Nov late: WAX DELI should stock DANCE records only, from 1980 to 2025, under parody sleeves, with a liner note
  giving the real credits. Copyrighted recordings of that era cannot be bundled or re-hosted. Lawful routes: openly
  licensed dance tracks (CC0, CC BY, CC BY-SA; checked per track; mostly 2000s onward, very little from the 1980s exists
  under open licences) as mixable records; real commercial tracks only as streams through the official SoundCloud player,
  from the artist's or label's own account, never on the decks. Lane RECORDS2 replaces the 1909 to 1925 crate.

- WAX DELI sells 28 real public-domain recordings (Internet Archive, US first published 1925 or earlier) under parody sleeves; the liner note
  gives the true credit. Clips are in `public/records/` (11 MB, on demand, hosted build only). Licence finding and tracks: `docs/swarm/tasks/RECORDS.md`.
  1926 recordings become free on 1 Jan 2027: the rule is `PD_LAST_YEAR` in `src/game/archiveRecords.ts`. No SoundCloud listening post, no CC BY crate (see the task file).

## Deploying

- Vercel builds every push to `master` UNLESS the commit message contains "work in progress", starts with "WIP", or
  contains "[skip deploy]" (`ignoreCommand` in `vercel.json`). So: unfinished work is committed as "Lanes' work in
  progress"; a commit the lead has verified gets a plain message and goes live.
- Before a deploying commit: `npx tsc --noEmit`, the scoped test suites, a hosted build, a boot check on desktop and on
  the emulated phone, and a look at frames from the running game.
- The deployment source leaves out playtests, docs, tests, scripts, native and cache (`.vercelignore`).
- Old deployments pile up on Vercel; `scripts/vercel-prune.mjs` deletes them (dry run by default, needs the owner's token).
- A branch push makes a preview deployment; a preview can be promoted to production from the Vercel side.

## Builds and checks

- Hosted build: `VITE_HOSTED=1 npx vite build` (what Vercel runs). Single-file build: `npx vite build` (one HTML file,
  12 MB budget; world normal maps flattened; no real-map code or data; no files from `public/` inlined).
- Native apps: `native/` (Electron), built by GitHub Actions. See `docs/NATIVE.md`.
- Tests: `npx vitest run <dir> --maxWorkers=1` in scoped runs. The whole suite at once starves this 4-core box.
- Headless browser jobs go through `scripts/swarm-render.sh` (queue and slots; `SWARM_SMALL=1` for showcase pages,
  `SWARM_LIGHT=1` for no-WebGL jobs). Full-game pages MUST hide the canvas
  (`__gtaDebug.renderer.domElement.style.visibility='hidden'`) and capture with `stopLoop()`, `step(n)`, `setFreeCam`,
  `renderOnce()`, `renderer.domElement.toDataURL()`; otherwise the page uses many gigabytes and is killed. Block
  non-localhost requests in scripts. All lanes share one memory limit: run a capture alone if the page is killed.
- Rendering here is in software: never report frames per second. Report triangles and draw calls from `renderer.info`.
- The title screen needs SPACE (or Enter, a tap, gamepad A or Start, a click on the prompt) to start; scripts must press it.
- Useful scripts kept in the session scratchpad (not in the repo, may be lost): boot smoke, pedestrian probe, action check,
  phone memory probe, map screenshot. Recreate from their descriptions in `docs/swarm/RULES.md` if missing.

## Where things are

- `src/main.ts`: assembly and the frame loop. `src/core/`: input, camera, events, math. `src/physics/`: flat 2D world.
- `src/world/`: the grid map (default) and `src/world/roadnet/**`, the real-street map (`?map=real`, hosted and native
  only; default-path modules never import roadnet except type-only: `docs/swarm/plans/briefs/_realmap-rules.md`).
- `src/entities/`: player, pedestrians, vehicles, traffic agents; `models/` builds people (closed skin from MakeHuman
  data, garment geometry, separate hair, hats and bags, three detail levels) and cars (lofted bodies).
- `src/entities/anim/`: motion-capture clips, posture correction, hand-keyed action poses.
- `src/textures/`: procedural painters, material library, `texTier.ts` (texture size by tier), people skin painters.
- `src/render/`: pipeline, quality tiers (phone, low, medium, high), culling and streaming, HDR guard, loading screen.
- `src/game/`: missions, traffic, police, wanted level, combat (`combat/`), weather. `src/audio/`: mixer, vehicles,
  voices, weather, radio. `src/ui/`: HUD, menus, map, phone, credits, title backdrops.
- `public/`: fonts (Anton, Barlow Condensed), title pictures (`art/`), voice banks, animation pack, real-map lot tiles,
  the link-in-bio page (`links/`).
- Docs: `docs/CREDITS.md` (every source and licence), `docs/swarm/PRD.md` (asks), `docs/swarm/tasks/*.md` (measured
  results per lane: PERF3, PHYSICS, IPHONE), `docs/swarm/sound/SOUNDCHECK.md`, `docs/launch/` (Instagram kit).

## Hard-won lessons

- A whole-screen flicker in Chrome came from Inf or NaN in the HDR buffer smeared by bloom. Every shader that reads
  scene colour passes it through `hdrSafe` (`src/render/HdrGuard.ts`).
- Characters must be drawn on the walking surface (`src/world/Ground.ts`): sidewalks are 0.15 m above the road.
- The captured standing clip is a soft-kneed hunch; `src/entities/anim/posture.ts` corrects clips on load.
- Left Ctrl must not be a game key: Ctrl+W closes a browser tab. The keyboard action key is G.
- iPhone Safari caps total 2D canvas memory per page (hundreds of MB, device dependent) and kills heavy tabs. On phone
  and low tiers canvases are emptied after upload, textures are half size, no normal or roughness maps load, and building
  detail is streamed per cell.
- Budgets: phone 300k triangles and 150 draw calls, low 500k and 220. The seven wall classes (brick, painted brick,
  brownstone, limestone, stoop, cornice, roof) are layers of ONE material, `brickSheet:0` (`src/textures/facadeSheet.ts`,
  `docs/swarm/tasks/SURFACES2.md`); low home 269 -> 223 draws. New wall classes join as sheet layers, not as materials.
- Free image generators reachable from here refuse without a token; a keyless one stamps a watermark. Not used.

## State on 21 Nov 2026

- Live: commit `6110995` (21 Nov evening): Stoop Light look, GTA-convention keys and pad, weighty movement and camera,
  27 parody shop trades with per-trade windows, 20 landmarks, 28 public-domain records, people and vehicle upgrades.
  Verified by the lead on that exact tree (see its commit message). The car camera is the older 4.6 m / 1.7 m rig: the
  lower 4.1 m / 1.45 m rig hid the road behind the roof. Grid-map era style is off (`GRID_ERA_STYLE`): with it on,
  tests/unit/sim/traffic-5min gridlocks.
- Unreleased and not yet verified in the running game: phone memory cut, physics rework, wardrobe and 21 body types,
  weather system, 37 vehicle types, real map grown to about 9.8 km² with traffic, pedestrians and police.
- Known red: grid-map traffic simulation (gridlock and AI collisions with the new car mix); real-map simulation (cars off
  road, a red-light run, about 3,000 parked cars); real-map draw-call tests.
- Done 21 Nov, not yet used in the game: the logo (a brownstone with a tall stoop: `docs/brand/`, rules in
  `docs/brand/BRAND.md`), new app icons and favicon; the GTA IV and V style study (`docs/reference/gta4-5-study.md`, with
  its sources file: style reference only, many numbers are marked as estimates).
- 21 Nov results the lead looked at: landmarks (20 places under invented names on the real map, `src/world/landmarks/`);
  the shared facade sheet; garment repairs (hems, cuffs, shoulders, trouser seat); player handling model with lean and
  weight (`src/entities/handling.ts`), which made keyboard steering too weak (8 sim tests red: driving-feel, vehicle-qa,
  pursuit) and must be retuned or switched off (`Vehicle.playerHandling = false`) before release.
- Cut off by the usage limit on 21 Nov with work on disk but no report: GREEN2 (bugs), PHONE2 (notes in
  `docs/swarm/tasks/PHONE2.md`), CARS4 (car bodies, notes in CARS4.md), SURFACES3 (streets and shopfronts), HANDLING2,
  STORES (`src/world/shops/`). Restarted as fresh lanes under DIRECTION.md.
- People heads (FACES, 21 Nov): close-level head budget 1,400 to 3,200 triangles in scripts/people-pipeline.mjs, all 23
  base meshes rebuilt; head UV axis follows the neck (jaw patch mostly gone); eyes are still painted, hair edges still
  tear, no new head shapes. What would close the gap: separate player head mesh with a 1024 px texture on medium and
  high, eyeball and lid geometry with a face bone, an ear UV chart, hair shells that fade into the scalp. `docs/swarm/tasks/FACES.md`.
- Record shop (RECORDS, 21 Nov): 28 US public-domain recordings (first published 1925 or earlier) under parody sleeves
  with liner notes, clips in public/records/ loaded on demand, hosted build only. `docs/swarm/tasks/RECORDS.md`.
- Not started: the real map as the main map; medium and high tier performance.
- Waiting on the owner: promoting the link-in-bio page (branch `release-links`); a Hugging Face token or his own
  pictures for the loading posters; a test on a real iPhone (`?debug=mem` shows memory numbers); one story voice clip
  re-bake; deleting old Vercel deployments.
