# MEMORY: what every session on this project needs to know

Read this first. It is the project's standing memory: the owner's rules, how we work, where things are, and what is open.
Update it when a rule changes or a decision is made. Keep it short; history lives in `docs/swarm/transcript.md` and the PRD.
Last full update: 23 Nov 2026 (rounds 2 and 3 of the body team are live since about 04:00 UTC, commit `ffdf96a`).

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
   CHANGED by the owner on 24 Nov: "real brand names and logos would need painting: ignore that rule going forward;
   mostly parody names are for the venues and shop names." So a third-party asset that carries a real brand name or
   logo (a car model, a skin) no longer has to have it removed; venues and shops keep invented parody names. The lead
   told him the risk is his: a trademark owner can still object to their mark in a published game. This does not change
   rule 1 (no game's own assets) or rule 3 (licences).
   Talk radio may joke ABOUT public figures and topics the owner named on 22 Nov (AI, Trump, Mamdani, stocks and crypto,
   the subway, parodied landmarks, weather, dating, the techno, house and wider underground scenes): satire only, hosts are
   invented characters, no imitation of a real person's voice, no invented quote or factual claim presented as real.
5. Tone (CHANGED by the owner on 22 Nov: "i do want blood and weapons in the game, its a parody but its still GTA"; "should
   be able to hit anyone"). Blood and weapons are in; anyone on the street can be hit. The lead's reading until he says
   more: blood yes (hits, marks that fade), people go down hurt or knocked out; no dismemberment and no gore beyond blood.
6. Privacy: the owner's email is private and never goes to an outside service. Prompts to outside services never carry
   the project's or the owner's name.
7. Never put AI model identifiers in commits, code or docs. Commits end with the two attribution lines the session gives.
8. ElevenLabs is OFF (owner decision); spend no credits there. SoundCloud only through its official widget.
9. The owner wants honesty: say what is verified and what is not, flag uncertain numbers, invent no sources or quotes.
10. Reports to the owner: lead with the outcome, short sentences, no em-dashes, bullets for parallel items.

## What the owner wants (his words, newest first)

- 24 Nov, later still: "Don't forget about checking in with me; ask me if anything is unclear; and groups of 5 working
  in each thing: models, faces, story and missions and side missions, textures, physics, load screens with that graffiti
  look, a better theme song, something like the original, maybe use [Suno] or something like that; fix the camera and
  make it just like Vice City." Lead's reading: eight topics, each a group of up to five seats, run in waves the usage
  limit allows (six seats were already running); check in with pictures and questions at every wave. The theme is NEW
  music in that spirit, never a copy of any game's theme (rule 1). Camera: the behaviour of that era's third-person
  camera by convention, no code or assets taken.

- 24 Nov, later: convert the game's models and textures to the look of his reference pack and build new ones in that
  look; find more online; and START A STORY: Pedro Martinez, a Colombian DJ, is the main character; Lana Porskaia and
  Adele Labos become playable; Stavros Yanos and Akira Tonaka are people you deal with; missions about DJ gigs, promoting
  a club night, selling, thrifting and flipping clothes, dating and hook-ups, a fight with a homeless man and one at a
  bar; three bars, an after-hours, a club, a dispensary and a gym. "Use a swarm of no more than 20 sub agents, 5 per
  task." His words in full, the lead's reading and the seats: `docs/swarm/teams/STORY-ASSETS-TEAMS.md`.

- 24 Nov: he has a folder of third-party models and textures made for GTA 3, Vice City and San Andreas ("These are not
  ... rockstar models. These are third-party models and are free to use, the same thing with the textures"). He wants:
  the relevant ones used in the game; "a new model and texture system that is compatible with theirs such that people
  can upload later on models and textures as mod"; that folder as the guideline ("I want models like these. I want
  textures like these"); then web research for more like them. LEAD'S READING, until he says otherwise: rule 1 still
  bars Rockstar's own assets and anything edited from them; a third-party file goes into the game or the repository only
  when its own licence text allows redistribution (rule 3: CC0, CC BY, CC BY-SA, or the author's written permission),
  checked file by file and credited in `docs/CREDITS.md`; "free to download" is not a licence. The mod system loads the
  player's OWN files in their browser (the old games' model and texture file formats, plus glTF and PNG) and never
  uploads or hosts them, so anyone can use any pack they have without us distributing it. 24 Nov, later: he put
  the pack in Google Drive (folder CLAUDE/GTAREF, credit to "Hype"). The lead listed it and downloaded NOTHING: the
  file names are the old games' own archive names (car, pedestrian, story-character, district and font archives) and
  nine pedestrian archives are the same 22,064 bytes, which fits stock files, not new artwork. Not proof, but enough
  that none of it goes in the game or the repository unless Hype can show which pieces he drew himself. Told the owner.
  Look-only use and the player-side mod loader are unaffected. The lead could NOT reach his
  laptop from this session on 24 Nov (no folder offered); lanes MODS (loader) and a research lane started without it.

- 23 Nov, small hours, on the sheet of round 2's first limb pass, which he marked by hand: "what's with the strange fold
  between arm and torso; also the thighs aren't accurate yet. This causes the clothing to look strange. Let's get closer
  to the reference images. Proportions and variation: there are many human body types, ectomorph, endomorph, etc., obese
  and skinny, tall and short. Mix it up but do it more accurately; it needs to more closely resemble the human form. I'm
  not saying go read Gray's Anatomy, but follow the images I sent." Round 3 of the body team (bodies from the source
  figure's own shapes, a cast of body types; `docs/swarm/teams/BODY-TEAM.md`, "Round 3").

- 22 Nov, late night, with ten reference pictures (other games' screenshots; never in the repository; lost in the restart at 23:54
  UTC that night; he has been asked to send them again): real anatomy ("fix shoulder blades and curve in the upper back",
  "Neck thickness variations", "Whats with the misshapen arms, thighs and crotch", "be economical with polygons");
  "Elders, teenagers and children get special shaping"; "more like 60 outfits, and tops bottoms hats shoes sneakers can
  be mixed as well"; "add a motorbike and maybe a skateboard". On the pictures: "a bit extreme ... in terms of muscular
  detail but as far as proportions go this is what needs to happen, same goes for the vehicles shapes and textures
  overall, likewise for the streets and roads and clothing"; "next round we need to tackle textures"; "strive for this
  kind of detail on faces and clothing but conserve polygons". Round 2 of the body team.

- 22 Nov, late evening, on the body team's first line-up: "whats with the elongated bodies i said gta V is bible and also
  style guide". Rule for people since: solid, ordinary builds (survey medians for width and depth, statures inside the
  5th to 95th percentile, thick enough necks and limbs, more stocky and heavy people than slim ones).

- 22 Nov, evening (after the fifth deploy): "continue with the swarm and refinements. Start with movement and then the
  eyes. Faces are still too caricature but the features are a marked improvement, the eyes are wonky again. Refer to
  GTA 5: I want that kind of detail. The bodies just look kind of silly right now." "GTA 5 is your new bible" (a STYLE
  reference: rule 1 stands). HOW HE WANTS US TO WORK NOW: one topic at a time, each with a team of five agents in
  parallel who talk to each other (`docs/swarm/teams/`), plus no more than three research agents (clothing that is more
  stylish and realistic, faces that make sense, body types that are more human, textures); updates, demos and questions
  to him along the way; when a topic has made progress one careful agent updates the docs, then push and deploy, then that
  topic pauses and the next team of five starts. Topic 1: movement and body geometry (`docs/swarm/teams/BODY-TEAM.md`).
  Topic 2: faces, eyes and details. Then vehicles, the camera and the engine sound that still stutters. He wants the
  teams' conversations as human-readable transcripts (`docs/swarm/transcripts/`).

- 22 Nov, afternoon (after the third and fourth deploys), one long message. The list:
  - cars: SUVs and trucks "feel strangely larger and longer than they should be compared to the sedans and sports cars",
    "get the dimensions so they make sense", "model them on real world vehicles"; car shadows "wonky ... looks like the car
    hovers over the street without wheels" (lane CARS5);
  - traffic: "a bit too much", "cut overall at 25%" (lead's reading: a quarter less), random, congested only sometimes in
    the early morning and afternoon, "9-5 kinda deal" (lane TRAFFIC2);
  - "revamp the entire menu system", buggy with the mouse and needing Esc to click; make sure the engine on/off option is
    in Settings (lane MENU2); "a mini tutorial" (lane TUTORIAL);
  - "more realistic character movement"; "jump over car hoods such that if you're pinned between two you can get away"
    (lane MOVE2); hit anyone, blood, weapons (rule 5 changed; lane COMBAT2);
  - police: "dont actually grab you", "wheres the jail?", "a few more actions before they start chasing and eventually
    arrest you" (lane POLICE2);
  - radio: each SoundCloud station "more than one DJ mix ... 7 DJs per radio station for now" (The Lot Radio guests, RA);
    the other streaming stations "more random"; "i heard zero hip hop. please add hip hop station"; a new humorous talk
    station (topics in rule 4) (lanes RADIO3, SCMIXES, TALK2);
  - "really aim for AAA in the faces, physics and textures (more textures)" (lanes FACES4, TEXTURES2, PHYSICS2);
  - "run multiple haiku and sonnet agents in parallel", ordered so usage holds; "a full transcript of their interactions
    in conversational English" (`docs/swarm/transcripts/`).

- 22 Nov, after playing the live game: "radio station issues (sometimes it wont play)"; "the car engine sound gets stuck,
  starts to loop and stutters"; "engine should be 45% lower by default and also an option in settings to turn engine off
  altogether"; "sometimes the camera screws up getting in and out of car or changing views"; "have the faces be
  different and varied and more like GTA 4. I WANT SOME AAA POLISH"; then push and deploy everything and send him a
  transcript. Lanes AUDIOFIX, CAMFIX, FACES2.
- 22 Nov: "I want real-street map made the main map" (lane MAINMAP: `src/world/mapChoice.ts`, `?map=grid` keeps the old
  grid; the single-file build stays on the grid); "a public GitHub release for the Mac and PC native executables" (a
  tag push from this box is refused, HTTP 403: the `native` workflow now takes a release tag when run by hand); "make the
  trees bushier especially in the park" (lane TREES); "do not have anti-aliasing on by default" (done in
  `src/ui/GraphicsSettings.ts`: SMAA stays a choice in Settings).

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
  but real music "if you can handle that somehow". Built as: real commercial tracks only as streams through the
  official SoundCloud player (never bundled, not mixable on the decks); a crate of CC BY / CC BY-SA dance tracks and ten public-domain 78s that can be bundled and mixed, each credited; the owner's own files through `src/assets/records/` (only files he may redistribute).
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
- Since 22 Nov one topic runs at a time as a team of seats with a charter in `docs/swarm/teams/` (body team:
  `BODY-TEAM.md`), each seat's notes in `docs/swarm/tasks/BODY-<SEAT>.md`, the plain-English retelling in
  `docs/swarm/transcripts/`.
- A seat that runs out of budget is split into narrower seats, not resumed: on 23 Nov FIT stopped after two fixes and
  became FIT-TOPS (necklines, collars, sleeves, open layers) and FIT-LEGS (trouser fork, seat, taper, shoes).
- Two seats may share one file when the lead names the regions: in `src/entities/models/pedMesh.ts` BASE owns the body
  above `if (dress)` in `dressLodBody` (shape parsing, the grid, the rig) and FIT owns the garment code from there down.
  Small Edits only, re-read before each edit, never rewrite the file.
- AUTOSAVE: while lanes run, a background loop commits and pushes "Lanes' work in progress: autosave" every four minutes
  (start it at the top of every session; it dies with the container). Tools worth keeping live in `scripts/dev/`.
- A stop hook asks for a commit and push after every turn.

## Records (21 Nov, reworked by RECORDS2)

- The owner's ask: WAX DELI's real records are dance records only, 1980 to 2025, under parody sleeves with liner notes giving the real credits; and he kept ten of the public-domain 78s.
  Now: 18 openly licensed dance tracks (CC BY / CC BY-SA, 2005 to 2018; NONE from the 1980s or 1990s could be cleared), ten pre-war dance 78s ("Pre-war dance floor", US public domain, first published 1925 or earlier),
  8 synthesised dance loops (jazz, dub, trap withdrawn), and a listening post of 4 Kompakt tracks streamed through SoundCloud's own player (never on the decks; rule 8). Evidence, tiers and what was left out: `docs/swarm/tasks/RECORDS2.md`.
- A licence field on an Internet Archive item is a lead, not proof: the Monofonicos netlabel's items say BY-SA while its own site says BY-NC-SA, so it was left out. Check the label's own statement.
- A file in `src/assets/records/` is BUNDLED into a deployed build, i.e. redistributed to everyone: only files you may redistribute, or a local build that is never deployed.
- Withdrawn records are listed in `src/game/recordsWithdrawn.ts`; old saves get the price paid refunded. `PD_LAST_YEAR` (1925) stays; 1926 recordings become free on 1 Jan 2027.

## Deploying

- Vercel Web Analytics (owner's ask, 21 Nov): `src/core/Analytics.ts` calls `inject()` from `@vercel/analytics` on the
  hosted build over https on a real host only (never the single file, desktop apps, localhost or tests). The owner must
  switch Web Analytics on for the project in the Vercel dashboard (Analytics tab) for data to appear. The link-in-bio
  page is plain HTML and is not counted yet.

- Vercel builds every push to `master` UNLESS the commit message contains "work in progress", starts with "WIP", or
  contains "[skip deploy]" (`ignoreCommand` in `vercel.json`). So: unfinished work is committed as "Lanes' work in
  progress"; a commit the lead has verified gets a plain message and goes live.
- The ignore rule reads the WHOLE commit message, body included: a deploying commit must not contain the words "work in
  progress" anywhere (on 21 Nov commit `9f2e59f` was skipped for that phrase in its body; `41357ca` carries the same files).
  Check with `git log -1 --pretty=%B | grep -ciE 'work in progress|\[skip deploy\]|^wip'` (must print 0) before pushing.
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
- Boot check (the lead's pre-deploy check, in the repository since 23 Nov): build with
  `VITE_HOSTED=1 npx vite build --outDir <dist> --emptyOutDir`, then
  `scripts/swarm-render.sh node scripts/dev/boot-check.mjs <outDir> --dist <dist> [--mode desktop|phone] [--map grid|real] [--q low]`.
  It boots headless with the canvas hidden, presses Space, steps the game by hand, reports page errors, non-finite
  matrices, people and cars, triangles and draw calls (exit 1 when not clean) and photographs the player and the nearest
  pedestrians front and back. Body sheets: `scripts/dev/base-shoot.sh`; dressed sheets: `scripts/dev/fit-shoot.sh`.
  The older scratch scripts (pedestrian probe, action check, phone memory probe, map screenshot) were lost in the
  restart; recreate them from `docs/swarm/RULES.md` into `scripts/dev/` when needed.

## Where things are

- `src/main.ts`: assembly and the frame loop. `src/core/`: input, camera, events, math. `src/physics/`: flat 2D world.
- `src/world/`: the grid map (`?map=grid`; the only map of the single-file build and the default on phones) and `src/world/roadnet/**`, the real-street map (the
  main map on hosted and native builds since 22 Nov, `src/world/mapChoice.ts`; each map has its own save slots, `GameSave.savePrefix`; default-path modules never import roadnet except type-only: `docs/swarm/plans/briefs/_realmap-rules.md`).
- `src/entities/`: player, pedestrians, vehicles, traffic agents; `models/` builds people (closed skin from MakeHuman
  data with its muscle by weight grid, `pedGrid.ts`; body types and the cast in `pedBodyTypes.ts`; garment geometry,
  separate hair, hats and bags, three detail levels) and cars (lofted bodies). Outfits and mix rules:
  `src/textures/painters/pedOutfits.ts`, `pedWardrobe.ts`, `pedMix.ts`.
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

- On this box, reading a frame back (`toDataURL`) from the emulated phone's GRID page kills the page for memory, on the
  22 Nov live build as much as on a new one (same JS heap, about 320 MB, and browser memory within 3 percent). It is the
  container's limit, not a regression: run that one boot with `--noframes`, and before blaming a change, run the same
  script on the live commit's build (`git worktree add <dir> <commit>`, link `node_modules`, build, boot).

- THE CONTAINER CAN RESTART AT ANY TIME AND WIPES EVERYTHING NOT PUSHED, including the scratch folder (22 Nov, 23:54 UTC:
  a wardrobe of 65 outfits, the owner's reference pictures and every capture script were lost). So: a background loop
  commits and pushes work in progress every four minutes while lanes run (start it at the top of every session; it dies
  with the container); tools worth keeping live in `scripts/dev/`, not the scratch folder; after a restart run `npm ci`.
  The owner's reference pictures may not go in the repository (rule 1), so ask him to re-send them after a restart.
- Bodies: a girth table is not a silhouette. Round 2's limb pass matched the survey numbers and looked worse. Build comes
  from the source's own muscle and weight shapes (`scripts/people-pipeline.mjs`), not from deformers stacked at run time.
  Always look at front, back and side sheets before believing a number.
- Turn run-time shape passes off one at a time and look before blaming the bake: the shoulder fold the owner marked was
  made at run time (shoulders widened 1.21 times, the arm pushed out, a corner cut), not by the pipeline's arm hang.
- Check field values against the data: the pipeline tested `sex === 'f'` while shapes carry `'female'`, so every female
  shape got the male weight and muscle shapes until BASE caught it on 23 Nov.
- A foot-slide number is only as good as its stance detector. "The ankle bone within 3 cm of the lowest ankle height of
  the run" also counts the heel roll and the end of the swing and reported 31.6 cm; the planted ball moved 0.1 to 0.6 cm.
  Measure the ball.
- A seat that hits its budget leaves little behind (FIT: two fixes of six). Brief narrow seats, and split a seat that
  stops rather than resume it.

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

## State on 23 Nov 2026

- DEPLOY: first deploy of 23 Nov, about 04:00 UTC (rounds 2 and 3 of the body team; the commit after `ca514d9` with the
  plain message "Bodies from the source figure's shapes ..."). Verified by the lead on that exact tree: `npx tsc --noEmit`
  clean; every test folder green in the lead's own runs (core 140, ui 445, audio 585, render 346, physics 118, game 561,
  transit 30, world 885, textures 427, entities 1,156, sim 231); hosted build and single-file build (11,833,751 bytes of
  12,000,000); clean boots with `scripts/dev/boot-check.mjs`: desktop real map (408k triangles, 225 draw calls), desktop
  grid (412k, 232), emulated phone real map (247k, 72) and emulated phone grid (185k, 95; boot only, see the lesson on
  frames below); the lead looked at street frames of people on both maps and on the phone's real map. NOT checked: a real
  phone, medium and high tiers, anything heard, play beyond the first 150 simulation steps.
- Before it, the live site served the fifth deploy of 22 Nov (`259e6dc`). Seat results below are the seats' reports
  unless it says the lead saw them. The story:
  `docs/swarm/transcripts/2026-11-23-body-team.md`; charter and outcome: `docs/swarm/teams/BODY-TEAM.md`; notes:
  `docs/swarm/tasks/BODY-BASE.md`, `BODY-SOMATO.md`, `BODY-WARDROBE.md`, `BODY-FIT.md` (FIT, FIT-TOPS, FIT-LEGS), `BODY-GAIT3.md`.
- Bodies from the source's own shapes (BASE), in five lines:
  1. `scripts/people-pipeline.mjs` hangs the arms with MakeHuman's 163-bone skeleton and weights (dual quaternion).
  2. It bakes, per shape, the 8 other points of the source's muscle by weight grid (min, average, max) from that shape's
     sex and age band, as int8 morphs on the close level; mid and far take each vertex's delta from the close level.
  3. At run time `bodyBuildOf(spec)` (`pedBodyTypes.ts`) gives a BMI, a muscle tendency and a stature from the person's
     seed; `gridPointOf` (`src/entities/models/pedGrid.ts`) places it on a measured BMI table; `pedMesh.applyBuild` blends.
  4. The ten hand-written shape deformers are off; `VITE_BODY_OLD=1` brings them back for comparison sheets.
  5. Joints move with build for the arms only (moving leg joints made feet slide 6 to 20 cm); eyes, nose, mouth and the
     cranium keep their shape. Muscle caps by age (`pedMesh.STREET_CAP`): adults 0.8, elders 0.6, teens 0.5, children 0.3.
- The source's axes are not BMI: a man at average muscle measures BMI 19.2 / 21.1 / 23.2 at weight -1 / 0 / +1; the obese
  figure is minimum muscle with maximum weight (39.6). The +1 muscle shape is not clean (neck swallowed, knee ledges).
- Children: new shapes `kid_a` (boy, 1.34 m) and `kid_b` (girl, 1.32 m) from the child targets, child grid only, about
  6.2 heads tall at run time (reads as 7 to 9 years). Teen boys blend child and young 50/50, teen girls 60/40.
- The pipeline had given every female shape the male build shapes (`sex === 'f'` against `'female'`): fixed.
- The cast (SOMATO): 30 body types (9 new: ecto, wiry, skinny-fat, soft, obese, fit-teen, heavy-teen, slight-kid,
  chubby-kid), a seeded spread per person, statures inside the survey's 5th to 95th percentile by sex; adult mix 34 / 34
  / 32 percent under BMI 25, 25 to 30, over 30 in a 4,000-person test (`tests/unit/entities/somato-cast.test.ts`).
- Wardrobe (rebuilt after the restart): 61 whole outfits with 2 or 3 colourways (the 17 old ids kept); 26 tops, 28
  layers, 31 bottoms, 18 shoes, 6 one-pieces; mix rules for the random mix in `src/textures/painters/pedMix.ts`
  (formality rank, pair scores, decade by age, hat guards, one accent colour, lightness gaps). 39 tests in
  `tests/unit/textures/wardrobe-mix.test.ts`. Garments needing new geometry are listed in `pedMix.NEEDS_SHAPE`: none built.
- Clothes on the new bodies: the neckline is placed from each person's shoulder joint and head size (it was 1.498 m for
  everyone); one function (`pedPaintBody.necklineY`) draws it in paint and geometry and a rib, roll, shirt or turtle
  collar is swept along it (`pedCuts.necklineLoop`); the hood-down flap is a shoulder cowl; the dark pouch at the trouser
  fork was the base mesh's own crotch triangles, now cut, and trouser tubes carry seat rows from the built hip
  (`pedLegs.ts`); shoes 0.163 to 0.166 of stature.
- Feet (GAIT3): each person's own sole depth, heel, ball and toe are read from the skin (`src/entities/anim/footShape.ts`);
  children no longer float 1.8 to 2.7 cm; a held foot dragged over 6 cm is lifted and steps. The seat reports ball slide
  at most 0.3 cm planted, 1.4 cm in any low run, on six built people in walks, starts and stops up to 4.0 m/s. The
  pedestrian set-off ramp is visual only (`Pedestrian.ts` is back to `const k = speed;`); the seat reports the whole
  simulation folder green (231 passed, 2 todo).
- Numbers:
  - Single-file build: 11,833,751 bytes against the 12,000,000-byte budget on the deployed tree, 166 kB left. The people files
    inline as base64 (BASE's +591 kB raw cost about +790 kB there). The next people or texture growth can break it.
  - People files: 25 glb, 2,408,828 bytes (1,817,868 before round 3).
  - Bare body triangles unchanged (BASE): close about 5,300 to 5,350, mid 1,100 to 1,170, far about 400. Close-level total
    of the nine-person dressed sheet: 56,503 before FIT; 58,892 after the collars and 58,827 at FIT-LEGS's count (the tree
    moved between counts). No new draw calls or textures per person, by the seats' reports.
  - The lead booted the hosted build on the real map at about 02:50 UTC from a mid-work snapshot: clean, 303k triangles,
    200 draw calls, people visible with the new bodies (`docs/swarm/teams/sheets/ingame-street-1.jpg`, `-2.jpg`). The
    tier is not recorded here (the tool defaults to low on desktop). No phone boot yet.
- Open (from the seats' "not done" lists):
  - Clothes: open-front layers (opening width, jacket seams) not done; hood wings ragged at the shoulder tips; no cuff or
    henley placket geometry; sleeves still read as pipes; `bottom.fit` ignored; the waistband does not drop under a
    belly; a small dark remnant at the fork on the heavy man and the pear woman, dark back-pocket flaps, a dark notch on
    shorts and skirts; a pale seam across the elder's knee in a sprint; the skirt is built from the base shape's hip rings
    and pokes 1 mm out of a coat front on fuller thighs; WARDROBE's pale chest bib on open layers over a pale tee.
  - Bodies: knees still step (the full-resolution source itself steps 4.9 mm per cm); `neckCm`, `shoulderK`, `legK` are
    drawn but not applied; slimmer builds keep a 13 to 28 mm thigh gap 2 cm below the fork; a small tear where the obese
    woman's hand meets her jacket hem was reported to FIT and not reported fixed.
  - Gait: the elder's stoop is not passed to the body layers (arms hang 13.8 deg behind, limit 12); obese hands against
    the thighs in a walk not measured; kerbs, turning on the spot and run reversals still not done (round 1).
  - The five tests red at the seats' last runs are green on the deployed tree, by the lead's fixes: the coat skirt is
    lofted round the built hips and thighs (`skinExtras` in `pedMesh.ts`); the tote handles clear the rounder shoulder
    (`pedGear.ts`); the sleeve test's stations scale with the person; the close-level triangle ceiling per person went
    from 7,000 to 7,300 (collar band and trouser seat rows; the lead's decision; mid and far unchanged); the `broad` type
    has nobody in the fixed roster, so its piece test gives it to an adult. `gait3-slide` and `body-pose-before-after`
    passed in the full run.
  - KNOWN, capped in a test so it cannot grow: on the muscular `broad` build the front locks of long locs cut about 2 cm
    into the high trapezius (`tests/unit/entities/pedpieces.test.ts`, limit 2.5 cm for that one piece and build).
  - Seen by the lead in street frames and not fixed: an elder's cane looks too long and is held far out from the hand.
  - Low-tier draw calls at the start views are 225 (real map) and 232 (grid) against the 220 budget: as before this
    round, not caused by it.
  - Dead fields in `pedBodyTypes.ts` (listed in `BODY-BASE.md`): BASE's edit there was refused by the permission system;
    nobody worked around it.
  - Found on 23 Nov while confirming the deploy, older than this round and not fixed: the hosted entry script carries
    Vercel's build variables (`VITE_VERCEL_*`: deployment and project ids, commit sha, the first lines of the commit
    message, the repository owner's name), because one function reads `import.meta.env` as a whole object (the street
    animation pack's path, `anim/street.bin`). No email, no session link and no model name were in it (the lead searched
    the live file). Reading `import.meta.env.VITE_HOSTED` directly there would stop it; it needs a build and boot check.
- Waiting on the owner: the ten reference pictures again (lost in the restart; they never go in the repository); whether
  the dead fields in `pedBodyTypes.ts` may be cleaned up; the Hasidic neighbour's outfit (held back until he is asked);
  `hintsWithSave` (above); the list at the end of this file.

## State on 22 Nov 2026

- FIFTH deploy of 22 Nov (the owner's long list of that afternoon; lanes MENU2, CARS5, CARS6, TRAFFIC2, POLICE2, MOVE2,
  RADIO3, SCMIXES, TALK2, COMBAT2, TUTORIAL, FACES4, TEXTURES2; notes for each in `docs/swarm/tasks/`). What it carries:
  - Menus: every panel goes through `src/ui/PanelManager.ts` and the `Input.blocked` gate; a new panel registers `isOpen`
    and `back`, calls `panels.sync()` and adds NO Esc handler of its own. Audio has "Engine sound: On / Off".
  - Cars: specs re-set from real-world figures (`src/entities/Vehicle.ts`; the old ones were the biggest model of each
    class); a contact shadow beside every car on every tier (`BlobShadows.ts`); seven classes reshaped (sedan, taxi, police
    car, pickup, SUV, big SUV, hatch) with new loft fields in `carBodies.ts`. Not reshaped: coupes, muscle, wagon, minivan,
    crossover, vans, trucks. Sedan 4.78 m and SUV 4.85 m fail seeded tests; 4.82 and 4.95 pass.
  - Traffic: `src/game/trafficHours.ts`: about a quarter fewer moving cars by day, nights lighter still, a rush about 8:45 and
    17:30 that is heavy on about 4 days in 10. Until `setHour` is called the factor is exactly 1 (the sims rely on that).
  - Police (`src/game/police/`): heat from minor acts (warning at 40, a star at 100 or for a serious act), witnesses
    needed, a 1.5 s hold then BUSTED and release at "Ironside Station House" (real map) or "Cardinal Row Precinct" (grid);
    a new star does not cool until a unit reaches the scene or 75 s pass. Three stars max; no roadblocks, no cell.
  - Movement: Jump vaults over a hood or trunk (`src/entities/vault.ts`), auto-vault at a sprint, a pinned player can always
    climb out; lean into turns. The gait work (starts, stops, kerbs) is NOT done.
  - Combat (`src/game/combat/`): everyone has health; temperaments flee, cower, film, fight back; the player has health and
    wakes at "Wexcombe Medical Center" (real map) or at home; bat, pipe, frozen fish, pistol, six-shooter, pump shotgun;
    blood (`blood.ts`, capped per tier, Settings switch). LEAD'S LINE: children and teenagers are never hurt
    (`Pedestrian.isMinor`: the blow is ignored and they run). Tests force adults where they need a victim.
  - Tutorial (`src/ui/tutorial/`): 18 steps on a new game, skippable, Replay in Settings; one-time hints. Hints are not shown
    when a save is loaded (`hintsWithSave` flips that: asked the owner).
  - Radio: `src/audio/sc/mixes.json` holds the checked pools (81 mixes, all 45 minutes or more), shuffled, started
    mid-mix; `hiphop` replaces `stoop`; live stations rotate streams; "The Group Chat 99.9" speaks with the browser's
    SpeechSynthesis. SoundCloud IS reachable from this box with curl through the proxy (account pages list ten tracks).
  - Faces: a real eye on the close level (`pedEyes.ts`, shared curve `pedEyeShape.ts`; the atlas strip x 256..512,
    y 320..384 is taken), repainted lips, a painted hairline band. Still: a thin line from the eye toward the ear on some
    heads, pale flaps under some eyes, no blink, the mid level untouched.
  - Far buildings on the real map have facades drawn in the shader from lot data (`farFacade.ts`), six flat-roof surfaces,
    and chunks in front of the camera stream first.
  - Open after this deploy: one grid boot in five logged a "computed min/max have NaN" geometry warning that could not be
    reproduced (782 eye patches and 180 car builds are finite); the real map's low-tier start view is about 260 to 300 draws
    against 220; the Group Chat's voice; a bust mid-mission does not fail the mission; fighters walk through walls toward
    the player; phone tile loading can take up to 10 s under load.
- Third deploy of 22 Nov (the owner's play report and asks of that morning). What it carries:
  - The real-street map is the MAIN map on desktop browsers and the desktop apps (`src/world/mapChoice.ts`); `?map=grid` or
    Settings, "Map" opens the old grid. PHONES STAY ON THE GRID by default (`quality === 'phone'`): on the emulated iPhone the
    real map fits its budgets (282k triangles, 61 draws at the spawn) but holds about twice the grid's heap, and no real
    iPhone has tried it. Reverse by dropping the third argument of `chooseMap` in `src/main.ts` after a real-iPhone test.
    Each map has its own save slots (`gta-bedstuy.save.v2.` grid, `...v2.real.` real); a grid-only player starts fresh at home
    on the real map with cash, records, look and station carried over. The grid's meshes are no longer built when the real
    map is chosen (`buildGridModelOnly`). The single-file build is always the grid. Numbers: `docs/swarm/tasks/MAINMAP.md`.
  - Pedestrians on the real map stand round the player: on the real map only, `TrafficSystem.pickRingNode` searches the
    62 to 115 m ring itself (before, nobody was within 150 m) and the opening crowd is placed within 240 m of the start.
    The grid's picks are untouched (its seeded traffic run jams on seed 7 if they change). Measured in the running game.
  - Sound (AUDIOFIX): parked and waiting cars get no engine voice; pause no longer leaves the audio suspended; one engine
    bus at 0.55; a silent station retries at 20 s and tunes on at 40 s. NOT HEARD by anyone here.
  - Camera (CAMFIX): clean cuts for first person, hood and cinematic; a 0.6 s blend in and out of cars; 143 harness tests.
  - Faces (FACES2, FACES3; notes in `docs/swarm/tasks/`): about 30 seeded shape traits per person (`pedHead.ts`), age in
    shape and skin; the pale patch by the ear was the head UNWRAP (fixed in `unwrapUVs`, axis at the ear plane). Still
    short: thin dark lips, a hard hairline, no eyeball or lid geometry, a dark cheek wedge on the mid level, neck banding.
  - Trees (TREES, `docs/swarm/tasks/TREES.md`): crowns of 4 or 5 overlapping leaf clouds (`src/world/props/treeCloud.ts`),
    flared trunks, park groves, hedges and shrubs; about the same triangles per tree on phone and low.
  - Anti-aliasing is off by default on every tier (owner); SMAA is a choice in Settings.
  - The `native` workflow takes a release tag when run by hand and publishes a public GitHub Release (a tag push from this
    box is refused, HTTP 403). The Linux boot smoke test was failing for our own reasons and is repaired.
  - Known and not fixed: on the low tier, buildings beyond the detail range of the real map are plain coloured blocks
    (visible across a junction); the old grid's start view is over the low budget (about 554k triangles, 230 draws, as it
    was before: 542k, 230); far buildings cast no sun shadow on the phone tier's real map.
- Before that, live since early 22 Nov (`5bc431a`): the real-street map grown to 15.15 km2 (R4), 17 more landmarks under invented names (LANDMARKS2 and 3),
  lit outer-ring lamps, real-map memory back at the old map's level, and (second deploy of the day) real-map traffic that
  steers by a look-ahead point (`TrafficAgent.pursuitPoint`, gated on `lanes.signalLookAheadM`, real map only), slower
  junction exits at crosswalks, a cop-spawn fallback and merged outer-ring furniture. Verified by the lead on that tree
  (every test folder green except the 2 mm shoe-hem check; real-map sims on the whole net, `REAL_NET=core` for the inner
  rings; both builds; clean boots on desktop and emulated iPhone). Still open on the real map then: the far south over the
  low draw budget (232 against 220), the phone tier at about 367k triangles at the spawn (budget 300k), 20 bare sliver
  blocks. The first deploy of the day (ff12a75) went out before the last test groups and its one regression was fixed in the second.
- Before that: commit `41357ca` (21 Nov night): everything in `6110995` plus the dance-only WAX DELI (18 openly licensed dance
  records 2005 to 2018, ten pre-war dance sides, a SoundCloud listening post of four Kompakt tracks) and Vercel Web
  Analytics code. Verified by the lead on that exact tree. The map-growth (MAP4) and LANDMARKS2 work was left out of it.
- Before that: commit `6110995` (21 Nov evening): Stoop Light look, GTA-convention keys and pad, weighty movement and camera,
  27 parody shop trades with per-trade windows, 20 landmarks, 28 public-domain records, people and vehicle upgrades.
  Verified by the lead on that exact tree (see its commit message). The car camera is the older 4.6 m / 1.7 m rig: the
  lower 4.1 m / 1.45 m rig hid the road behind the roof. Grid-map era style is off (`GRID_ERA_STYLE`): with it on,
  tests/unit/sim/traffic-5min gridlocks.
- Listed on 21 Nov as unreleased and unverified (much of it went out on 22 Nov): phone memory cut, physics rework,
  weather, 37 vehicle types. Red on 21 Nov: grid and real-map traffic sims, real-map draw-call tests.
- Done 21 Nov, not yet used in the game: the logo (a brownstone with a tall stoop: `docs/brand/`, rules in
  `docs/brand/BRAND.md`), new app icons and favicon; the GTA IV and V style study (`docs/reference/gta4-5-study.md`, with
  its sources file: style reference only, many numbers are marked as estimates).
- 21 Nov results the lead looked at: landmarks (20 places under invented names on the real map, `src/world/landmarks/`);
  the shared facade sheet; garment repairs (hems, cuffs, shoulders, trouser seat); player handling model with lean and
  weight (`src/entities/handling.ts`), which made keyboard steering too weak (8 sim tests red: driving-feel, vehicle-qa,
  pursuit) and must be retuned or switched off (`Vehicle.playerHandling = false`) before release.
- Cut off by the usage limit on 21 Nov with no report: GREEN2, PHONE2, CARS4, SURFACES3, HANDLING2, STORES (notes in
  `docs/swarm/tasks/`); restarted as fresh lanes under DIRECTION.md.
- People heads (FACES, 21 Nov): close-level head budget 1,400 to 3,200 triangles. What would close the gap, for the faces
  team: a player head mesh with a 1024 px texture on medium and high, eyeball and lid geometry with a face bone, an ear UV
  chart, hair shells that fade into the scalp (`docs/swarm/tasks/FACES.md`).
- Record shop: the 21 Nov RECORDS crate was reworked by RECORDS2 (see "Records" above; `docs/swarm/tasks/RECORDS.md`).
- Real map R4 (MAP4, 21 Nov night; live since early 22 Nov): 15.15 km2, 1,406 nodes, 2,360 edges, 32,601 lots in 83
  tiles, data in `roadnet-r4.json`, `roadnet-controls-r4.json`, `places-real-r4.json` (`docs/swarm/tasks/MAP4.md`). The 581
  R3 block numbers are kept (landmark sites use them): never rebuild the network without
  `src/world/data/raw/r3-block-keys.json`. Outer-ring furniture streams per tile (`propsStream.ts`); roads are built at boot.
- LANDMARKS2 and LANDMARKS3 (21 Nov night; live since early 22 Nov): 17 more real places under invented names
  (`src/world/landmarks/landmarks2.ts`, `landmarks3.ts`), 7 from open-licence Commons photos (looked at, nothing
  sampled; credited). Seven invented names still need a one-by-one web check (`docs/swarm/tasks/LANDMARKS3.md`).
- Not started: medium and high tier performance.
- Waiting on the owner: promoting the link-in-bio page (branch `release-links`); a Hugging Face token or his own
  pictures for the loading posters; a test on a real iPhone (`?debug=mem` shows memory numbers); one story voice clip
  re-bake; deleting old Vercel deployments.
