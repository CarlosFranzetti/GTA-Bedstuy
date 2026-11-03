# Records, the shop, the decks and the interiors (CLUB lane)

No copyrighted music is bundled. A record is one of three kinds:

| kind | where it comes from | price | tempo |
|---|---|---|---|
| `procedural` | 12 original loops synthesised in `src/game/records.ts` (parody titles, e.g. "Stoop Season", "Sloth Anthem") | $12 to $25 | exact |
| `library` | "pressed" for free from a file in the player's Radio library (WAX DELI, tab "Press my music") | free | genre default, then measured by an onset estimate when the file is first decoded |
| `drop` | a file in `src/assets/records/` (see below) | free | genre default, then measured |

## Your own files
- **Radio library files** stay on your device (blob URLs, session only). A pressed record remembers its title and tempo; the audio
  is playable again once the file is re-added in the Radio library (the decks say so if it is missing).
- **Drop folder** `src/assets/records/`: put your own licensed files there before `npm run build`; they are globbed at build
  time like the texture packs and become free records. Licensing is on you: the single-file artifact embeds them.

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
