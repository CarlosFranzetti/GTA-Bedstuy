# Story team and assets team (started 24 Nov 2026)

## What the owner said (24 Nov)

"As far as the existing models and textures, convert them or modify to these new assets and use this kind of asset going
forward; also make and modify textures and models, and anything new will go based on these; also find more online.
Finally start making a story about a Colombian named Pedro Martinez who is also a DJ and he's the main character from
... the start. You also eventually play Lana Porskaia and Adele Labos. You interact with Stavros Yanos and Akira Tonaka,
and there are missions: getting DJ gigs, promoting a club night, selling drugs, thrifting and flipping clothes. You date,
you hook up, you get into fights with a homeless dude and another dude at a bar. There are 3 bars, an after hours, a
club, a dispensary and a gym. Find or use textures and modify as needed. Use a swarm of no more than 20 sub agents, 5
per task, and get this all going now."

## The lead's reading (the owner can overrule any line)

- "These new assets" means the LOOK of his reference pack: early-2000s open-world city games. Low-polygon models (cars
  roughly 300 to 3,000 triangles), small photo-based textures (64 to 512 pixels), baked detail, little procedural gloss.
  The pack itself (Google Drive, credit "Hype") does NOT go into the game or the repository: by its file names and sizes
  it is the old games' own texture archives (see MEMORY.md, 24 Nov). It is look-only. Players may load it themselves
  through the mod loader (`docs/MODS.md`, lane MODS).
- What ships comes from open sources only (rule 3), each item's licence read on its own page and recorded in
  `docs/CREDITS.md`, or is made here in that style. Verified candidates: `docs/reference/open-assets-lowpoly.md`.
  Not usable: Quaternius site packs (their site licence now bars redistribution), anything NC, ND, "personal use" or unlicensed.
- Downloaded third-party files live under `src/assets/open/<source>/<item>/` with a `LICENSE.txt` or `SOURCE.md` beside
  them (page URL, author, licence, date fetched, what was changed). They load on the HOSTED build only: the single-file
  build has about 160 kB of room under its 12 MB limit and must not grow.
- The story is fiction. Every character is invented; if a name belongs to a real person the owner knows, they are
  written as he would want a friend written. Real places keep invented names (rule 4). Tone: a street-level comedy-drama
  about nightlife, hustle and friendship, with the series' parody edge. Selling drugs, fights, dating and hook-ups are in
  the story; sex is never shown or described (a fade and a morning after); nobody under 18 is involved in any of it
  (children and teenagers are never hurt and never part of adult storylines); the homeless character is a person with a
  name, a history and his own reasons, not a punching bag, and the fight with him can be talked down.
- Budgets, the canvas rule, never `git stash`, never commit or push (autosave does it), only the lead edits
  `src/main.ts`: as in MEMORY.md and `docs/swarm/RULES.md`. Post to the channel with `scripts/swarm-say.sh`. Notes in
  `docs/swarm/tasks/<SEAT>.md`, started in the first fifteen minutes.

## The cast and the places (names fixed by the owner; everything else is the story team's to write)

- Pedro Martinez: Colombian, a DJ, the player character from the start.
- Lana Porskaia and Adele Labos: playable later.
- Stavros Yanos and Akira Tonaka: people you deal with.
- Places: three bars, an after-hours, a club, a dispensary, a gym. Invented names; on both maps.
- Mission kinds: getting DJ gigs; promoting a club night; selling; thrifting clothes and flipping them; dates and
  hook-ups; a fight with a homeless man; a fight with a man at a bar.

## Seats (first wave; more follow as usage allows: the limit cut lanes off on 21 and 23 Nov)

| Seat | Owns | Job |
|---|---|---|
| WRITER | `docs/story/**` | The story bible, the cast, the arc in acts, every mission as a scene with dialogue |
| MISSIONS | `src/game/story/**`, `src/game/missions/content/**` (new files), tests | The first act playable with the existing mission system: gigs, promotion, thrift and flip |
| VENUES | new `src/world/venues/**`, tests | The seven places on both maps, with doors and simple interiors |
| CAST | new `src/game/story/cast/**`, tests | The five people as characters in the world: looks, outfits, where they are, how the player changes character |
| INTAKE | `src/assets/open/**`, `docs/CREDITS.md`, `scripts/dev/open-assets-*.mjs` | Fetch, check and convert the best open low-poly cars and street textures |
| LOOK | `docs/swarm/art/LOWPOLY.md`, a sheet tool | The written art rules of the new look and a first conversion of one car class and three street surfaces |


STATUS, 24 Nov: the owner paused the first wave before it started, changed rule 4 (real brand names and logos on
third-party assets are allowed; venues and shops keep invented parody names: MEMORY.md), then said "Let's continue
all". The seats and the MODS lane start now.
