# Records, the shop, the decks and the interiors (CLUB lane)

Status: current (checked 21 Nov 2026)

No copyrighted music is bundled. A record is one of four kinds:

| kind | where it comes from | price | tempo |
|---|---|---|---|
| `procedural` | 8 original dance loops synthesised in `src/game/records.ts` (hip-hop instrumental, house, disco, techno, breaks, electro; parody titles, e.g. "Stoop Season", "Sloth Anthem"). Jazz, dub and trap were withdrawn on 21 Nov | $12 to $25 | exact |
| `library` | "pressed" for free from a file in the player's Radio library (WAX DELI, tab "Press my music") | free | genre default, then measured by an onset estimate when the file is first decoded |
| `drop` | a file in `src/assets/records/` (see below: it is BUNDLED into a deployed build) | free | genre default, then measured |
| `archive` | 28 REAL recordings under invented sleeves, hosted build only: 18 openly licensed dance tracks (CC BY / CC BY-SA, 2005 to 2018) and ten public-domain 78s ("Pre-war dance floor", US, first published 1925 or earlier) | $11 to $38 by rarity | measured offline; tracks without a stable pulse are marked "not beat-matched" |
| listening post | 4 real Kompakt tracks, STREAMED through SoundCloud's own player only (`src/game/listeningPost.ts`); never on the decks | stream only | none |

## The crates (RECORDS 21 Nov 2026, reworked by RECORDS2)
Real music, parody sleeves. The owner's rule: dance records only, 1980 to 2025 for the openly licensed ones (none from the 1980s or 1990s could be cleared: the crate is 2005 to 2018), plus ten pre-war public-domain dance 78s he asked to keep.
`src/game/archiveRecords.ts` holds the catalogue type, the ten pre-war rows and the crate list; `src/game/danceRecords.ts` holds the 18 dance rows. Each row: an invented artist, title, label, catalogue number, sleeve style and price, plus a liner note (true performer,
title, label, year, source, licence, the licence statement as the source shows it, the attribution the licence requires, what was changed, and how the licence was checked). Clips are `public/records/<id>.mp3` (dance: 60 s stereo 56 kbit/s, about 410 kB; pre-war: 80 s mono 40 kbit/s),
made by `scripts/records/crate.py` and loaded only on preview or when put on a deck; `RecordSource` keeps the last three decoded (`ARCHIVE_KEEP`). The single-file build has no `public/records/`, so `archiveStock()` is empty there and the 8 synthesised records remain.
Sleeves are painted in code (`src/ui/sleeve.ts`, Anton and Barlow Condensed only): `twelve` (1980s 12-inch), `promo` (1990s white label), `picture` (2000s), `minimal` (2010s), `paper` and `blocks` (78s), `sticker` (the brownstone jacket). The shop has crate chips (key C), a Liner button (key L) and
the decks show the true credit under the title. Licence evidence for every track and what was left out and why: `docs/swarm/tasks/RECORDS2.md`; every record is in `docs/CREDITS.md`.
To add a record: add the clip to `DANCE` (or `CLIPS`) in `crate.py` and run it, add a row in `danceRecords.ts`; `tests/unit/game/archive-records.test.ts` checks licences, years, attribution, tempo ranges and the files. A CC BY-SA row's clip is shared under the same licence.
**Withdrawn records** (18 pre-war 78s and four synthesised loops) are listed in `src/game/recordsWithdrawn.ts`; an old save holding one gets the price paid back in cash.

## The listening post
A shop crate chip. Each row is a parody sleeve around SoundCloud's official embedded player (`https://w.soundcloud.com/player/`); nothing is downloaded, cached or re-hosted, and these never go on the decks. A track is listed only when its SoundCloud account is the artist's or label's own (verified badge and linked from their own site), the track page allows embedding, and the release is 1980 to 2025 (the checks are written at the top of `listeningPost.ts`). While a stream plays the shop tells the host (`post.onListen`) so the radio is paused, and again when it stops or the shop closes.
The owner can add his own choices to `LISTENING_POST`; with an empty list the shop says it is empty.

## Your own files
- **Radio library files** stay on your device (blob URLs, session only). A pressed record remembers its title and tempo; the audio
  is playable again once the file is re-added in the Radio library (the decks say so if it is missing).
- **Drop folder** `src/assets/records/`: put your own files there before `npm run build`; they are globbed at build
  time like the texture packs and become free records. **A file there is BUNDLED into the build, which means it is REDISTRIBUTED to everyone who gets that build.**
  The licence of a track you bought normally does not allow that. So: put only files you have the right to redistribute (your own music, or CC0, CC BY or CC BY-SA files with the credit
  added to docs/CREDITS.md), or keep them in a local build that is never deployed or shared. The single-file artifact embeds them; a hosted deploy serves them.

## Tempo and the beat grid
Procedural records have exact BPM and start on a downbeat. Files get a default per genre (`GENRE_BPM`) and are measured once with
`estimateBpm` (10 ms energy-difference envelope, autocorrelation over 70 to 180 BPM, folded into 80 to 160). Use the nudge buttons
if a file's first beat is not at 0:00.

## Interiors (`src/world/interiors/`)
Rooms are built procedurally 3 km off the map (`INTERIORS[id].origin`) with 2D wall colliders, so normal movement works. Walls face
inward so the follow camera never shows a hole. Enter by standing at a door and pressing F; a 0.28 s fade covers the teleport.
- **WAX DELI** (Throop Ave, east side): bins, owner NPC, listening station. F near the bins opens the shop.
- **AFTERSLOTH** (unmarked steel door on Kosciuszko St): opens 23:00 to 04:00 only, and only after the flag `aftersloth.unlocked`
  is set (the password mission). The booth needs the flag `aftersloth.slot`. Dark room, 12 to 20 dancers, beat-reactive floor
  tiles, strobe and lasers, bar ($6 drinks).
- **HOME** (Throop Ave, west side): couch, street window, record shelf, two turntables and a mixer.

## DJ game
Two decks, pitch +-8 %, crossfader (equal power), cue, play, nudge. Score 0 to 100:
home = 50 % beatmatch + 30 % crossfade timing + 20 % variety; club = 35 / 20 / 20 and 25 % crowd.
Beatmatch = tempo gap (within 5 BPM) times beat-phase gap (within 0.2 beat) while both decks are audible. Timing = how close to a
bar line the incoming deck is when the fader crosses the middle. Variety = distinct records heard for 6 s or more (and genres).
Dead air multiplies the score down. Emits `dj:setFinished { venue, score, minutes }`.

## Events (EventBus)
`interior:entered {id}`, `interior:exited {id}`, `shop:bought {recordId, price}`, `shop:sold {recordId, price}`,
`record:pressed {recordId}`, `dj:setFinished {venue, score, minutes}`.

## Money and flags
`Inventory` (`src/game/Inventory.ts`, localStorage `gta-bedstuy.inventory.v1`) owns cash. Missions pay with `inventory.add(n)` and
read `inventory.cash`; flags via `inventory.setFlag(name)` / `hasFlag(name)`.
