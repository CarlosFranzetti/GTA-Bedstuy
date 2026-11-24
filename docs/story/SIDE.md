# PICÓ: side activities (rule sheets)

Status: first draft, 24 Nov 2026, WRITER seat. Numbers are starting points for MISSIONS to tune by playing, not
measurements. Money in game dollars. Hours are game hours. Venue ids from BIBLE.md section 5.

Shared rules for every activity:
- Adults only: no flyer, sale, date or fight ever targets a child or teen (`Pedestrian.isMinor`), and no activity is
  offered while one is the nearest pedestrian in the circle.
- One activity at a time; a story mission takes priority and pauses a running activity (no loss).
- Every activity has a cooldown so the player does not grind one thing; the cooldowns below are per venue or per spot.

## 1. Gigs (DJ sets)

Where: Sabor a Lunes (after ACT1-02), Glenda's (after ACT1-07, jukebox nights: 1 per week), Tincture & Ledger (after
ACT2-03 on the talked path, or Act 3), The Milk Run (after ACT2-04), Mothhouse (warm-ups only until Act 3).

Booking: the venue texts an offer; accept on the phone; be at the booth by the start hour.

| Venue | Night | Start | Minutes | Taste (genres) | Era | BPM band | Start meter | Fee | Tips at 60 / 80 |
|---|---|---|---|---|---|---|---|---|---|
| `bar-dance` Sabor a Lunes | Mon, Thu | 21:00 | 3 | salsa, cumbia, boogaloo, merengue | 1965-1995 | 90-110 | 35 | $90 | +$20 / +$50 |
| `bar-dive` Glenda's | Sat | 20:00 | 2 | soul, disco, funk, boom-bap | 1970-1999 | 90-120 | 45 | $50 | +$15 / +$30 |
| `bar-lounge` Tincture & Ledger | Wed, Fri | 19:00 | 3 | house, nu-disco, "lounge" | 2005-2025 | 110-122 | 20 | $200 | +$80 / +$150 |
| `afterhours` The Milk Run | Sat, Sun | 05:00 | 5 | house, techno, dub, disco | any | 118-130 | 40 | $120 | +$30 / +$60 |
| `club` Mothhouse (warm-up) | Fri | 22:00 | 4 | house, disco | any | 112-124 | 30 | $150 ($50 paid in Act 1) | none |

Crowd meter (0 to 100), each second of the set:
- In-taste record playing and audible: +0.6/s. Out-of-taste: −0.8/s.
- DjGame beatmatch accuracy above 0.8 while both decks audible: +0.3/s; a train-wreck (accuracy under 0.4 for 3 s): −8
  once.
- A clean crossfade on a bar line: +4. Same record twice in a set: −10.
- Risk (Pedro only, BIBLE 4.1): if an out-of-taste record brings the meter down at least 8 points and it then climbs back
  to where it was within 30 s, the climb counts double and the set's tips double.
- Venue mood drift: Tincture & Ledger −0.2/s at all times ("they are filming"); The Milk Run +0.1/s after minute 3
  ("tired people forgive").
- Fail floor: below 15 for 20 s in a row ends the set (`lowScore`). Warm-up ceiling (Mothhouse): above 70 for 30 s in total.
Cooldown: one gig per venue per game day. Reputation: each set at 80+ adds 1 "name" point; Act 2 offers and Act 3's
finale meter start read it (start meter +1 per point, max +10).

## 2. Promotion rounds (flyers)

Giver: Stavros after ACT1-03 (for Mothhouse Fridays), Rafa (Sabor a Lunes), Adele (Night Shift, Act 2). A round = a bag
of 20 flyers and up to 6 posters, 90 game minutes to use them.

- Offer a flyer: F within 2.5 m of a walking adult pedestrian. One offer per pedestrian per round.
- Chance they take it: day (08 to 17) 0.30; evening (17 to 22) 0.55; late (22 to 03) 0.65; +0.10 if the player's outfit
  matches the venue taste (Lana's styling, see 3); −0.20 if the player is running or has a weapon out; −1 (never) if
  wanted level is 1 or more.
- A taken flyer adds 1 to the venue's line for that night with chance 0.25 (day) / 0.40 (evening and late).
- Posters on boards (spots): +2 each to the line; a poster on a non-board wall is +3 but has a 0.3 chance of a witness
  (heat +20, MEMORY.md police heat units).
- Pay: $3 per flyer taken + $5 per poster, capped at $80 a round. Stavros pays 2/3 in cash and 1/3 "next time"
  (owed money is tracked; Act 3 lets you collect).
- Line at the venue that night = 20 + flyers that turned + posters; each 10 over 40 adds +3 to the set's start meter.
Cooldown: one round per giver per game day.

## 3. Flipping (thrift and resale)

Unlocks after ACT1-05. Lana plays it as her own job in Act 2 with better numbers.

Thrift spots (buy): Second Act Thrift (St. Osric's basement, 10:00 to 17:00, restocks daily), a Saturday stoop sale (the
existing "Stoop Sale"), a laundromat lost-and-found box at Doña Marisol's (3 items, $2 each, once a week; she asks you
to leave a note).

- A rack: 8 garments drawn from wardrobe ids (`pedOutfits.ts`, `pedWardrobe.ts`) by kind: workwear, sportswear, denim,
  outerwear 1990s, "statement" coat, formal, boots, sneakers.
- Buy price by kind: $4 to $18, rolled per item; condition 1 to 3 stars shown after Lana's appraisal (or a press of F
  as Pedro: he sees stars only, Lana also sees the "true" kind, which can be a fake: 1 in 5 "vintage" items is a modern
  copy worth a third).
- Carry: 4 slots as Pedro, 8 as Lana with her van.

Resale zones (sell): each zone has a taste multiplier per kind (× buy price × condition factor 0.8 / 1.0 / 1.4):

| Kind | `stoop` (Throop stoops) | `park` (vintage van by Thistledown) | `lounge` (Tincture & Ledger street) | `market` (Throop Stoop Market, Sat) |
|---|---|---|---|---|
| workwear | 3.0 | 2.0 | 4.0 | 3.0 |
| sportswear | 3.5 | 1.5 | 2.0 | 3.0 |
| denim | 2.0 | 5.0 | 3.0 | 3.0 |
| outerwear 1990s | 2.0 | 4.5 | 4.0 | 3.0 |
| statement coat | 1.0 | 2.0 | 7.0 | 2.0 |
| formal | 1.5 | 1.0 | 3.0 | 2.0 |
| boots | 2.0 | 3.0 | 5.0 | 2.5 |
| sneakers | 4.0 | 2.0 | 2.5 | 3.5 |
| a fake "vintage" | 1.0 | 0.5 (the van spots it) | 3.0 (nobody spots it) | 1.0 |

- Selling: a buyer per zone every 30 s while the player stands at the spot; each buyer wants one kind (weighted by the
  zone's top two multipliers). A zone gets "full" after 4 sales of one kind (×0.5 on that kind until tomorrow).
- Styling (Lana, Act 2): she can style the player's own outfit for a zone (a 30 s interact at Doña Marisol's): flyers
  +0.10 (see 2), door checks pass (Tincture & Ledger, Mothhouse), resale ×1.1 in that zone.
- Lana's ethics line, shown once: no flipping things people donated for the shelter rack (a marked rail; F there shows
  "Lana: Not that rail. That rail is for people, not profit.").

## 4. Dates

Unlocks after ACT1-07 with whoever Pedro dated; others unlock by story (BIBLE 4.8). Ask on the phone; the date happens
that evening.

- Places (each with a mood bonus by person): Thistledown Park bandshell (+5 Margo), Troop Deli coffee (+5 everyone),
  a gig of yours (+10 Remy, +0 Margo "I see you at work"), Sabor a Lunes dance (+10 Margo, +5 Remy), WAX DELI browse
  (+10 Remy), a rooftop at Tito's (+15 anyone, needs Tito's okay), Glenda's back booth (+5; Margo will not date at
  her own bar after the first time: −10).
- A date: walk there together (escort tail), 3 rounds of the reply picker, one shared activity (a 2-minute dance at
  Sabor a Lunes is a crowd-meter mini set with one partner; a browse is a buy objective; coffee is a pay objective).
- Mood starts at 40 + 5 per previous good date (max 70); same reply scoring as ACT1-07.
- End: mood 70+ offers the INTIMATE BEAT choice (BIBLE section 2: shown suggestively with the Settings switch On, a plain
  fade Off) and a morning after. Under 70: good night. Turning down or being turned down is always one line and kind.
- Relationship level 0 to 5 (one per good date, −1 if you stand them up after accepting). Level 3: they appear in story
  scenes; level 5: their Act 3 role (Margo runs the finale bar, Remy tunes the Huracán).
- Cooldown: one date per person per two game days.
- Seeing two people: allowed; the story notices once per pair with a joke, never a punishment (Lana: "You have two
  coffees in your hands. Both are for someone. Interesting.").

## 5. The gym (Second Wind)

Unlocks after ACT1-06. Hours 06:00 to 22:00. Free.

- Bag work: hold the attack key in time with a beat (the speed-bag rhythm: an existing-style timing bar) for 45 s.
  Score 0 to 100. Each session at 60+: stamina +5 (cap +40 over the game), melee damage +2 % (cap +20 %).
- Skipping rope: 30 s of jump-key timing. Sprint duration +3 % per session at 60+ (cap +15 %).
- Sparring with Akira or a regular (stamina-only rule from ACT1-06): 2 rounds; a win pays $0 and +1 "name" at the gym
  (Act 3's Fight Night start bonus).
- Cooldown: 1 session per game day counts for the stat (more are allowed, for fun).
- Hiding: with 1 or 2 stars, entering the gym and staying 30 s inside with Akira present halves the heat cooldown
  (Akira pulls the shutter). Not with 3 stars ("Akira: Not with helicopters, man.").

## 6. Plush runs (selling: Act 2 only, optional after ACT2-01, ends with ACT2-08)

Written with consequences when CAUGHT (owner, 24 Nov). No goods are named; the HUD says "Plush box". No real-world method.

- A run: 3 sealed boxes, 3 doors on the map, 30 game minutes, at night (22:00 to 04:00). Pay $60 per box on delivery,
  +$40 if all three are done in time.
- Unseen: a delivery nobody witnesses just pays (the story lets that sit: no lecture).
- Seen: a delivery is "seen" when a police unit or a witness pedestrian is within 25 m with line of sight at the handover
  (the existing witness rules). Seen = heat +60 (police heat units: warning at 40, a star at 100), and the next box
  in the run is a stake-out with 0.3 chance.
- Busted (the existing BUSTED flow) while carrying boxes: the boxes AND the run's cash so far are taken; Whit texts "That
  was company property" and docks $100 from the next run.
- Story costs on top (by flags): a friend sees (Akira, Adele, Lana in Act 2) on a chance of 0.15 per seen delivery: that
  friend's trust drops one level and they say so once.
- After ACT2-08 the runs are gone on two of three paths; on the "sold the last box" path they remain, with Adele's trust at 0.

## 7. Moving jobs (Bluebird Movers)

The day job. The existing "Moving Day" mission is the template: a sofa, a fridge, a cat. Pay $40 to $70 per job by
distance and cargo damage. Repeatable 08:00 to 17:00, two per game day. Pedro's line on every fifth job: "Speakers are
just sofas that sing."
