# Documentation index

Status: current (checked 21 Nov 2026)

Every Markdown file in the repository carries a status line under its title, except the few marked in the Status column below:

- **current**: checked against the code or the data on the date given.
- **partly out of date**: the line says what no longer holds.
- **historical record**: kept as it was written, not maintained. Do not rewrite history.

A "current" document is true as of its date; if it disagrees with the code, the code wins and the document needs fixing.
When in doubt about what is true today, read `MEMORY.md`, "State". Paths below are relative to this folder.


## Start here

What a new contributor or session reads first.

| Document | What it is | Status |
|---|---|---|
| [README.md](../README.md) | The project in three minutes: what it is, how to play, controls, how to run it. | current |
| [MEMORY.md](../MEMORY.md) | The standing memory: the owner's rules, how the studio works, where things are, deploy rules, and the current state. The source of truth. | standing instructions, not given a status line |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Set-up, the rules that cannot be bent, tests and builds, how a change is released. | current |
| [CHANGELOG.md](../CHANGELOG.md) | Every release that went live, newest first. | current |
| [CLAUDE.md](../CLAUDE.md) | Instructions every coding session loads; imports MEMORY.md. | standing instructions, not given a status line |
| [docs/swarm/RULES.md](swarm/RULES.md) | Rules every lane follows, including the standard check scripts and the headless-browser recipe. | current |
| [docs/CREDITS.md](CREDITS.md) | Every third-party source and its licence. Nothing may land without a row here. | current |

## Reference: world and map

How the streets, lots and buildings are made and where the data comes from.

| Document | What it is | Status |
|---|---|---|
| [docs/REAL-BLOCKS.md](REAL-BLOCKS.md) | The OpenStreetMap importer for building footprints, and the MapPLUTO update that replaced it. | partly out of date |
| [docs/reference/BLOCKS.md](reference/BLOCKS.md) | What stands on each block face of the grid map and where each fact comes from (9 Nov). | partly out of date |
| [docs/reference/block-faces.md](reference/block-faces.md) | Raw search notes behind the block faces (research pass, 28 Oct). | historical record |
| [docs/reference/EXPANSION.md](reference/EXPANSION.md) | Survey of the area between Throop Ave and Bushwick Ave, with the street table and projection (9 Nov). | historical record |
| [docs/swarm/plans/realmap.md](swarm/plans/realmap.md) | Design of the real-street map (`?map=real`): data, phases, rules (11 Nov). | historical record |
| [docs/swarm/plans/landmarks-candidates.md](swarm/plans/landmarks-candidates.md) | Candidate landmarks inside the grown real map, from open data (18 Nov). | historical record |
| [docs/STREET-PHOTOS.md](STREET-PHOTOS.md) | How wall colours are read from openly licensed street photos, and the licence reasoning. | current |
| [docs/PHOTO-TEXTURES.md](PHOTO-TEXTURES.md) | How to add your own photographed surfaces as textures. | current |
| [docs/world-notes.md](world-notes.md) | A per-face checklist for filling block faces from Street View. Do not use: Street View is forbidden. | historical record |
| [docs/reference/bedstuy-surfaces.md](reference/bedstuy-surfaces.md) | Text-only brief of what real Bed-Stuy surfaces look like, for texture work. | historical record |
| [docs/reference/lighting-targets.md](reference/lighting-targets.md) | Lighting targets by hour and material (research, 28 Oct). | historical record |
| [docs/reference/light-baselines/stage2.md](reference/light-baselines/stage2.md) | Lighting measurements from Stage 2. | historical record |
| [docs/reference/realmap-r1r2.svg](reference/realmap-r1r2.svg) | Debug view of the first two real-map rings: names, classes, one-way arrows, signals (open in a browser). The same folder holds `realmap-r1r2.png`, `realmap-junctions.svg` and `.png`, `expansion-sketch.svg`, `brooklyn-overview-check.png` and `geo2/`: pictures and data made while building the maps, kept as a record. | no status line |
| [docs/reference/r1-sources/README.md](reference/r1-sources/README.md) | Provenance of texture sets downloaded in round 3 (pixels not committed). | historical record |
| [docs/reference/r1-sources/LICENSE-aframe-enviropacks-Readme.md](reference/r1-sources/LICENSE-aframe-enviropacks-Readme.md) | Licence evidence: a copy of the aframe-enviropacks readme. Third-party text, left unmodified, so it has no status line. | no status line (see note) |

## Reference: art

Look, people, cars, interface.

| Document | What it is | Status |
|---|---|---|
| [docs/swarm/art/ART-BAR.md](swarm/art/ART-BAR.md) | The art bar ("Rockstar polish"): hard limits, checklists, banned list, and the scoreboard of lane verdicts. | current |
| [docs/reference/BIBLE.md](reference/BIBLE.md) | Design targets drawn from analysis of GTA V (1 Nov). | partly out of date |
| [docs/reference/gta5-style-notes.md](reference/gta5-style-notes.md) | Style notes on the GTA V look, for procedural materials and post-processing. | historical record |
| [docs/reference/gta4-5-study.md](reference/gta4-5-study.md) | A style and design study of GTA IV and V for the people, vehicle and textures lanes (21 Nov, written by the research lane). | written by another lane today; no status line set |
| [docs/reference/gta4-5-study-sources.md](reference/gta4-5-study-sources.md) | Sources and failures for that study. | written by another lane today; no status line set |
| [docs/swarm/art/brief-CARS14.md](swarm/art/brief-CARS14.md) | Brief for the sports-car lane (11 Nov). | historical record |
| [docs/swarm/art/brief-UI14.md](swarm/art/brief-UI14.md) | Brief for the phone, loading screen and map screen lane (11 Nov). | historical record |
| [docs/swarm/art/loading-prompts.md](swarm/art/loading-prompts.md) | Prompts for six loading posters that have not been made yet. | current |
| [src/assets/models/README.md](../src/assets/models/README.md) | The opt-in glTF car and character loader (not used by the default game). | partly out of date |

## Reference: sound and radio

Radio, records, effects, mix targets.

| Document | What it is | Status |
|---|---|---|
| [docs/RADIO.md](RADIO.md) | The 15-station radio dial, where each station gets its audio, announcers, the Radio library. | partly out of date |
| [docs/RECORDS.md](RECORDS.md) | Records, the WAX DELI shop, the DJ decks and the interiors. | current |
| [docs/swarm/sound/SOUND-BAR.md](swarm/sound/SOUND-BAR.md) | The sound bar: dial rules, mix targets, vehicle identity, voice strategy, checks. | partly out of date |
| [docs/swarm/sound/SOUNDCHECK.md](swarm/sound/SOUNDCHECK.md) | Offline measurements of engine levels, the street mix, stutter and speech rhythm (18 Nov). | historical record |
| [docs/swarm/sound/brief-VOICE14.md](swarm/sound/brief-VOICE14.md) | Brief for the pedestrian and character voices lane. | historical record |
| [src/assets/records/README.md](../src/assets/records/README.md) | The drop folder for your own licensed records. | current |

## Reference: voices

Text-to-speech, the cast and the shows.

| Document | What it is | Status |
|---|---|---|
| [docs/reference/VOICES.md](reference/VOICES.md) | Decision and design of the neural voices, the cast, the baked voice pack, speech rhythm. | partly out of date |
| [docs/reference/talk-show.md](reference/talk-show.md) | The older 22-minute WBSY Talk script, generated from `src/audio/talk/script.json`. | partly out of date |

## Reference: story

| Document | What it is | Status |
|---|---|---|
| [docs/reference/STORY.md](reference/STORY.md) | "Air Rights": the story, characters, missions, branches and playtest checklist. | current |

## Reference: platforms and testing

Builds, desktop apps, how to check on real hardware, playtests.

| Document | What it is | Status |
|---|---|---|
| [docs/NATIVE.md](NATIVE.md) | The Mac and Windows apps: how to get them, what they do, what they download, CI. | current |
| [docs/PLATFORM-CHECK.md](PLATFORM-CHECK.md) | A five-minute check to run on real hardware, and what to send back. | current |
| [docs/PLAYTEST.md](PLAYTEST.md) | The blind playtest protocol for a tester agent. | current |
| [tests/fixtures/README.md](../tests/fixtures/README.md) | Test fixtures and their licences. | current |

## Process: rules and organisation

How the studio works.

| Document | What it is | Status |
|---|---|---|
| [docs/swarm/RULES.md](swarm/RULES.md) | Rules every lane follows. | current |
| [docs/swarm/ORG.md](swarm/ORG.md) | Who works here, how we talk, and what each lane has proven, including the lanes of 18 to 21 Nov. | partly out of date |

## Process: plans and asks

What the owner asked for, and how it was planned.

| Document | What it is | Status |
|---|---|---|
| [docs/swarm/PRD.md](swarm/PRD.md) | Requirements for Stages 1 to 9, then the owner's asks stage by stage up to Stage 19 (21 Nov). | partly out of date |
| [docs/swarm/stages.md](swarm/stages.md) | The stages, with a table of Stages 4 to 19. | current |
| [docs/swarm/board.md](swarm/board.md) | The old lane board (stopped after Stage 14). | historical record |
| [docs/swarm/plans/stage9.md](swarm/plans/stage9.md) | Plan for GTA IV fidelity and the map toward Bushwick (9 Nov). | historical record |
| [docs/swarm/plans/stage14.md](swarm/plans/stage14.md) | Plan, teams, order and gates for Stage 14 (11 Nov). | historical record |
| [docs/swarm/plans/briefs/_realmap-rules.md](swarm/plans/briefs/_realmap-rules.md) | Rules shared by the real-map wave-two briefs. | historical record |
| [docs/swarm/plans/briefs/WP2.md](swarm/plans/briefs/WP2.md) | Brief: lane graph and signal phases for the real map. | historical record |
| [docs/swarm/plans/briefs/WP3.md](swarm/plans/briefs/WP3.md) | Brief: sidewalk graph and crosswalks. | historical record |
| [docs/swarm/plans/briefs/WP4.md](swarm/plans/briefs/WP4.md) | Brief: road and sidewalk meshing, chunk culling. | historical record |
| [docs/swarm/plans/briefs/WP5.md](swarm/plans/briefs/WP5.md) | Brief: block faces and lots on real frontages. | historical record |
| [docs/swarm/plans/briefs/WP10.md](swarm/plans/briefs/WP10.md) | Brief: the elevated line on Broadway and Myrtle Ave. | historical record |

## Process: task results

Measured results and research notes, one file per lane task.

| Document | What it is | Status |
|---|---|---|
| [docs/swarm/tasks/D1.md](swarm/tasks/D1.md) | Data schema for lots and faces (Stage 2). | historical record |
| [docs/swarm/tasks/R1.md](swarm/tasks/R1.md) | CC0 texture hunt, round 3. | historical record |
| [docs/swarm/tasks/R2.md](swarm/tasks/R2.md) | Block-face research, pass 1. | historical record |
| [docs/swarm/tasks/R2b.md](swarm/tasks/R2b.md) | Block-face research, pass 2. | historical record |
| [docs/swarm/tasks/R3.md](swarm/tasks/R3.md) | Lighting research. | historical record |
| [docs/swarm/tasks/MDL.md](swarm/tasks/MDL.md) | Search for CC0 glTF cars and characters. | historical record |
| [docs/swarm/tasks/MDL2.md](swarm/tasks/MDL2.md) | Second search for higher-fidelity cars and people. | historical record |
| [docs/swarm/tasks/MUSIC.md](swarm/tasks/MUSIC.md) | Search for legal sources of recorded music (research only). | historical record |
| [docs/swarm/tasks/PERF2.md](swarm/tasks/PERF2.md) | Brief to bring the phone and low tiers back to budget. | historical record |
| [docs/swarm/tasks/PERF3.md](swarm/tasks/PERF3.md) | Triangle and draw-call numbers by category, phone and low (18 Nov). | historical record |
| [docs/swarm/tasks/PHYSICS.md](swarm/tasks/PHYSICS.md) | Physics defects measured and fixed (18 to 19 Nov). | historical record |
| [docs/swarm/tasks/IPHONE.md](swarm/tasks/IPHONE.md) | Phone-tier memory cuts and measurements in an emulated iPhone (19 Nov). | historical record |
| `docs/swarm/tasks/GREEN2.md` | Release-engineering pass: traffic simulations and test triage (21 Nov, being written by its lane). | not written yet |
| `docs/swarm/tasks/PHONE2.md` | Phone pass: audit, overlaps, controls, memory (21 Nov, being written by its lane). | not written yet |

## History: stage notes

Check-ins written when a stage closed.

| Document | What it is | Status |
|---|---|---|
| [docs/swarm/checkins/stage1.md](swarm/checkins/stage1.md) | Stage 1, the feel and fidelity pass (28 Oct). | historical record |
| [docs/swarm/checkins/stage2.md](swarm/checkins/stage2.md) | Stage 2, block-face accuracy, missions, hosted build (29 Oct). | historical record |
| [docs/swarm/checkins/stage3.md](swarm/checkins/stage3.md) | Stage 3, the playtest loop (3 Nov). | historical record |
| [docs/swarm/checkins/stage4.md](swarm/checkins/stage4.md) | Stage 4, the GTA III bar (3 Nov). | historical record |
| [docs/swarm/checkins/stage5.md](swarm/checkins/stage5.md) | Stage 5, the feel lanes (7 Nov). | historical record |
| [docs/swarm/checkins/stage6.md](swarm/checkins/stage6.md) | Stage 6, getting around (7 Nov). | historical record |
| [docs/swarm/checkins/stage7.md](swarm/checkins/stage7.md) | Stage 7, toward GTA IV (9 Nov). | historical record |
| [docs/swarm/checkins/stage8.md](swarm/checkins/stage8.md) | Stage 8, skins, SoundCloud stations, real blocks (9 Nov). | historical record |

## History: transcripts, playtests and early design

The log of what the agents said, and what the testers found.

| Document | What it is | Status |
|---|---|---|
| [docs/swarm/transcript.md](swarm/transcript.md) | The append-only studio log, written only through `scripts/swarm-say.sh`. The primary record of every lane. Has no status line because it is not edited by hand. | no status line (see note) |
| [docs/swarm/transcript-readable.md](swarm/transcript-readable.md) | A plain-language retelling of the early log. | historical record |
| [docs/swarm/transcripts/2026-11-11-studio.md](swarm/transcripts/2026-11-11-studio.md) | The word-for-word studio conversation from 11 Nov. | historical record |
| [docs/swarm/transcripts/2026-11-11-studio-plain.md](swarm/transcripts/2026-11-11-studio-plain.md) | The same, retold in plain language. | historical record |
| [docs/swarm/transcripts/2026-11-12-studio-plain.md](swarm/transcripts/2026-11-12-studio-plain.md) | Plain-language retelling of 11 and 12 Nov. | historical record |
| [playtests/p12/REPORT.md](../playtests/p12/REPORT.md) | Automated playtest report p12 (11 Nov). | historical record |
| [playtests/p17/REPORT.md](../playtests/p17/REPORT.md) | Playtest report p17 (18 Nov): ten defects found. | historical record |
| [playtests/h6/transcript.md](../playtests/h6/transcript.md) | Blind playtest session h6. | historical record |
| [playtests/h7/transcript.md](../playtests/h7/transcript.md) | Blind playtest session h7. | historical record |
| [playtests/h8/transcript.md](../playtests/h8/transcript.md) | Blind playtest session h8. | historical record |
| [playtests/h8b/transcript.md](../playtests/h8b/transcript.md) | Blind playtest session h8b. | historical record |
| [playtests/h8c/transcript.md](../playtests/h8c/transcript.md) | Blind playtest session h8c. | historical record |
| [playtests/h8d/transcript.md](../playtests/h8d/transcript.md) | Blind playtest session h8d. | historical record |
| [docs/superpowers/specs/2026-10-24-gta-bedstuy-design.md](superpowers/specs/2026-10-24-gta-bedstuy-design.md) | The original design spec for v1 (24 Oct). | historical record |
| [docs/superpowers/plans/2026-10-24-gta-bedstuy-v1.md](superpowers/plans/2026-10-24-gta-bedstuy-v1.md) | The original v1 implementation plan (24 Oct). | historical record |

## Launch kit

Instagram stories, a feed post and the link-in-bio page.

| Document | What it is | Status |
|---|---|---|
| [docs/launch/POSTING.md](launch/POSTING.md) | How to post the story, the feed post and the bio link. The images are in `docs/launch/export/`, their HTML sources in `docs/launch/`, and the bio page in `public/links/`. | current |

## Brand

Logo, icons and the README header image.

| Document | What it is | Status |
|---|---|---|
| [docs/brand/BRAND.md](brand/BRAND.md) | The brand one-pager (written by the brand lane). The logo files are SVG and PNG in `docs/brand/` and the app icons in `public/icons/`. | written by another lane today; no status line set |
