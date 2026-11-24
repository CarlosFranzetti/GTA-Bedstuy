# PICÓ: the arc

Status: first draft, 24 Nov 2026, WRITER seat. Reads with `BIBLE.md` (cast, places, flags) and `SIDE.md` (the
repeatable activities and their numbers). Mission pages: `missions/ACT1-*.md` (full), `missions/ACT2-*.md` (full where
written, see the list at the end), Act 3 outline only (this page).

Mission ids are `pico-<slug>`. "Who" is who you play. "Where" uses venue ids from BIBLE.md section 5 and existing places.
"Requires" is the `requires` list. Every Act 1 mission is built from objective kinds that exist in
`src/game/missions/types.ts` plus the five small systems below.

## The small new systems Act 1 needs (for MISSIONS; numbers in SIDE.md)

1. **Flyers to passers-by** (`handFlyers`): carry N flyers; press F within 2.5 m of a walking adult pedestrian to offer one;
   each takes it or not (chance by hour, venue taste and Pedro's look); a count on the HUD; flyers on lamp posts use the
   existing `spots` kind. A pedestrian who takes one may turn up in the venue's line that night (a promotion score).
2. **Thrift rack** (`thrift`): at a thrift spot, a rack of 6 to 10 garments from the existing wardrobe ids, each with a buy
   price; you buy what you can carry (4 slots). Each neighbourhood zone has a taste table, so the same jacket resells for
   different money at different stoops and shops. Sell with the existing `sell` flow at a resale spot.
3. **Guest list** (`guestList`): before a set you get a fixed number of names to give (phone screen: a list of contacts and
   a few strangers met that day); who you put on sets flags and changes who is in the room and the crowd meter's start.
4. **Crowd meter in a DJ set** (`djSet` + `crowd`): the existing DjGame score plus a 0 to 100 crowd meter per venue, fed by
   the venue's taste (tempo band, era, genre tags on the records) and by risk: playing outside the room's taste drops the
   meter, then pays double if the meter recovers within 30 s. The set fails below a floor, not on a score alone.
5. **Reply picker** (`reply`): two to four short replies on screen, keys 1 to 4 (pad: face buttons), a 10 s soft timer
   (no answer = silence, which is itself an answer). Each reply sets a flag and moves a mood meter (dates) or a calm meter
   (talk-downs). Talk-downs (Clem, Kyle) end in "calmed", "walked" or "fight", and the fight starts the existing combat.

Small extras the pages use and name plainly: **date mood** (0 to 100, from replies and from where you take them), a
**morning after** scene (fade, cut to the next morning at a home, one short talk), and a **sleeve credit** read in WAX DELI
(press F on a record sleeve in the bins to read its back: one flag).

## Act 1: Open Decks (Pedro only). Can be played with what the game has plus the five systems.

| # | id | Title | Who | Where | What you do in play | What changes | Requires |
|---|---|---|---|---|---|---|---|
| 1 | `pico-rent-money` | Rent Money | Pedro | Yesenia's stoop, WAX DELI | Text from Yesenia; walk to WAX DELI; buy two records with the rent; read a sleeve's credits (optional); Ms. Odette gives you Rafa's number | Cash -$120 stake spent; flag `pico.sleeveCredit` if read; Rafa on the phone | (after the tutorial) |
| 2 | `pico-lunes-night` | Lunes Night | Pedro | Sabor a Lunes (`bar-dance`) | Drive the records over; meet Rafa; wait for 21:00; play a 3-minute set to Monday regulars (crowd meter, salsa and cumbia taste) | First paid gig ($90 + tips by meter); Stavros hears about you | 1 |
| 3 | `pico-paper-the-walls` | Paper the Walls | Pedro | Mothhouse (`club`) and 3 avenues | Stavros hires you to promote his Friday: hand 20 flyers to passers-by, paste 6 posters (spots); last poster is at Mothhouse's side wall | $60; flag for the line size on Friday; Clem's sign is covered (the twist) | 2 |
| 4 | `pico-clems-corner` | Clem's Corner | Pedro | Mothhouse side wall | Clem tears down your posters and takes your bag; reply picker talk-down (calm meter) or fight or walk away; optional: fix the sign | `pico.clem.talked` / `.fought` / `.walked`; Adele patches a fight's hand at the hospital, or meets you at the corner if calmed | 3 |
| 5 | `pico-size-medium` | Size Medium, Vintage | Pedro (Lana with you) | Second Act Thrift, two resale stoops, Tincture & Ledger's street | Lana needs a truck; you need rent. Thrift rack: buy 4 pieces under $40; resell at the right stoops (taste tables) for $120+ total | Rent paid to Yesenia (flag `pico.flip.ok`); Lana's number; Lana side flips unlock | 4 |
| 6 | `pico-second-wind` | Second Wind | Pedro | Second Wind Boxing Club (`gym`) | Carry Stavros's rented speakers for Akira's open house (pickUp/deliver); spar 2 rounds with Akira (melee basics); Akira's rule "Pockets" | Gym unlocks (SIDE.md); stamina +; if `pico.clem.fought`, Akira has seen the video and says so | 4 |
| 7 | `pico-not-a-date` | Coffee, Not a Date | Pedro | Glenda's Long Room (`bar-dive`) or Mothhouse booth | Choose Margo (bar) or Remy (sound check); a walk to the park, reply picker, date mood; optional hook-up (fade, morning after) or a good-night | `pico.date.margo` / `.remy` / `.none`; `pico.morningAfter` | 5 |
| 8 | `pico-warm-up-slot` | Warm-Up Slot | Pedro | Mothhouse (`club`) | Guest list (5 names); a 4-minute warm-up set on a crowd meter that must NOT peak (warm-up rules: keep it between 40 and 70); Stavros introduces Kyle; Whit makes the narco joke; Stavros: "the Friday is yours, next month"; Whit's offer text | $150 (Stavros "forgets" $100 of it); `pico.plush.offered`; Act 2 opens | 6, 7 |

Act 1 also sets up, without a mission: Pedro's Monday residency at Sabor a Lunes (repeatable gig after 2), flyering
rounds for Stavros (repeatable after 3), Lana's flips (after 5), the gym (after 6).

## Act 2: Last-Mile Wellness (Pedro, then Lana and Adele unlock)

| # | id | Title | Who | Where | What you do in play | What changes | Requires |
|---|---|---|---|---|---|---|---|
| 1 | `pico-last-mile` | Last-Mile Wellness | Pedro | Plush's van lot, three addresses | Whit's pitch; deliver three sealed Plush boxes to three doors at night (deliver, no peeking); unseen handovers just pay, a seen one raises heat (SIDE.md 6); the third door has a patrol nearby | $300; flag `pico.plush.courier`; Corinne at Mellowdrama sees the van and warns you (text) | A1-8 |
| 2 | `pico-door-policy` | Door Policy | LANA (switch unlocks) | Mothhouse door, Second Act Thrift | Lana styles Bash's door team for Friday (thrift rack for four people, taste: "the room"); then works the guest list at the door, picking who gets in (reply picker per guest); spots Plush couriers in the toilet queue | Lana playable; `pico.lana.door`; Lana knows about Plush before Pedro tells her | A2-1 |
| 3 | `pico-pockets` | Pockets | Pedro (Akira with you) | Tincture & Ledger (`bar-lounge`) | Stavros's dinner with investors; Kyle humiliates the bartender and Pedro; reply picker talk-down, walk, or fight (the bar fight); if fought, escape heat | Mothhouse Friday lost on every path except "made him the joke" (then delayed); `pico.kyle.*` | A2-1 |
| 4 | `pico-night-shift` | Night Shift | ADELE (switch unlocks) | Wexcombe Medical Center, The Milk Run (`afterhours`) | End of a night shift: treat two hurt people in the ER (interact), one of them a Plush courier who fell off his bike; then promote and throw Night Shift at 8 a.m. at The Milk Run: flyers at the bakery, the cab stand, the station house; hire Pedro (guest list, crowd meter "tired people") | Adele playable; Adele learns Plush's name; Pedro's best set so far (tired crowds forgive) | A2-1 |
| 5 | `pico-shutter-down` | Shutter Down | Pedro | Three Plush drops, Second Wind | A drop goes wrong: the door is a stake-out; get out with two stars; Akira pulls the gym shutter and hides you; he finds out what you carry | Heat; Akira's trust drops (`pico.akira.knows`); Yesenia's couch is "not safe for this" | A2-3 |
| 6 | `pico-flip-week` | Flip Week | Lana | Throop Stoop Market, Tincture & Ledger's street, Doña Marisol's | A pop-up stall: buy low across three thrift spots, alter two pieces at Doña Marisol's (interact), sell at the market and to Kyle's investors at triple; one buyer is Whit, who pays with MOTH | Lana's shop fund; `pico.lana.moth` (proof the token pays Plush's couriers) | A2-2 |
| 7 | `pico-personal-guarantee` | Personal Guarantee | Pedro | Stavros's sound yard, Mothhouse | Help Stavros load out at 5 a.m.; tail Kyle's car to a meeting with Whit (tail); Stavros admits the guarantee and his house | `pico.stavros.truth`; the player now knows Kyle funds Plush and owns Stavros | A2-5, A2-6 |
| 8 | `pico-exit-interview` | Exit Interview | Pedro, then Adele | Plush's van lot, the ER | Quit Plush: Whit sends his "retention team" (three men with job titles and pistols) to the van lot; a gunfight among the vans (the story's first, gritty and funny: they argue about their KPIs between shots); a chase; fork: give the box to Sgt. Kowalski (with Lana's MOTH proof), dump it in the river, or sell it one last time (the bad path, costs Adele's trust); Adele then treats the courier who got Pedro's last route | Plush's fate flags; Pedro out of selling for good on two of three paths; Act 3 opens: "build our own night" | A2-4, A2-7 |

## Act 3: El Huracán (all three; outline only in this draft)

| # | id | Title | Who | Where | What you do in play | What changes | Requires |
|---|---|---|---|---|---|---|---|
| 1 | `pico-parts` | Parts for a Hurricane | Pedro | Bluebird Movers, Tito's roof, curbs all over | Collect 8 speaker cabinets and a horn from curbs, a church basement and Stavros's yard (collect, fragile cargo in the truck) | The picó's frame exists | A2-8 |
| 2 | `pico-paint-job` | Paint Job | Lana | Second Act Thrift, Doña Marisol's | Thrift fabric and sign paint; Lana designs the hurricane in sunglasses; flips to pay for the amp | The Huracán has a look | 1 |
| 3 | `pico-brooklyn-lights` | Brooklyn Lights | Pedro | Clem's Corner, WAX DELI, park | Earn Clem's yes: find the sleeve, find Hollis, find Clem's old bass at a pawn shop (pay); if `pico.clem.fought`, an apology mission first | Clem plays the opening night | 1 |
| 4 | `pico-permit` | Permit to Dance | Adele | Ironside Station House, Auntie G's stoop | A street-party permit by the book: signatures from 12 neighbours (spots), Sgt. Kowalski's form, a generator from the hospital's old stock | The block says yes | 1 |
| 5 | `pico-fight-night` | Fight Night | Pedro | Second Wind (`gym:ring`) | Akira's fundraiser against FORMWORK's lease: one sanctioned three-round bout (the only fight the story ASKS for, gloves, a referee) and Pedro DJs the walk-outs | The gym is safe for a year | 1 |
| 6 | `pico-investor-relations` | Investor Relations | Lana | Tincture & Ledger, Kyle's open house | Lana's leverage: MOTH ledger + Stavros's papers; a reply picker with Kyle; his one human moment | Kyle releases Stavros or is exposed (by path) | 2, A2-8 |
| 7 | `pico-stavros-chooses` | Stavros Chooses | Pedro | Mothhouse, Stavros's yard | Stavros: lend the Huracán his last speakers or sell them to Kyle; what he chooses depends on Act 2 flags | Sound for the finale | 6 |
| 8 | `pico-huracan` | El Huracán | Pedro, Lana, Adele (switch at will) | The street beside The Milk Run, the whole block | The finale: Adele runs the street (hurt people, police), Lana the line and the look, Pedro a 6-minute set with Clem on bass; the crowd meter is the whole block | The ending (three variations by flags); free roam after with all three | 3, 4, 5, 7 |

Endings (by flags): **The Block's Night** (Plush handed to the police, Clem talked, Stavros lends: the Huracán plays
monthly, Pedro gets the Aftersloth Sunday from DJ Sloth); **Rented Room** (Stavros sells: Pedro plays Mothhouse Fridays for
Kyle, rich and unhappy, the picó in a storage unit; a last text from Clem); **Small Hours** (Pedro sold the last box:
the party happens, Adele does not come, Pedro plays it anyway; he goes home to Barranquilla for a month, the final shot is a
Sunday on Rebolo's corner, by phone video).

## Love lines (outline)

- Margo: Act 1-7 date; Act 2 a book swap (she finishes the novel she started) and a fight with Kyle at her bar; Act 3 she
  runs the bar at the finale.
- Remy: Act 1-7 date; Act 2 he quits Mothhouse after Kyle's "audio vibes" memo; Act 3 he tunes the Huracán.
- Lana (from Act 2, honesty twice): no once; Act 3 "ask me after the Friday".
- Adele (Act 3 only): breakfast after Night Shift.
- Lana's: Teodor (a 4 a.m. bakery date in Act 2). Adele's: Junior (dollar-van rides home; Act 3 he drives the generator).

## What is written in full and what is outline

- Full scene, objectives, fails, rewards and dialogue: all eight Act 1 missions (`missions/ACT1-01` to `ACT1-08`).
- Act 2: see `missions/` for the ones written in full; the rest are the rows above.
- Act 3: outline only (this table).
