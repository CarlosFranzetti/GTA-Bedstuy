# ACT1-03 Paper the Walls (`pico-paper-the-walls`)

Who: Pedro. Where: Stavros's sound yard (a garage near Mothhouse), three avenues, Mothhouse's side wall (venue `club`,
spot `club:sidedoor`). Hours: offered 14:00 to 22:00. Requires: `pico-lunes-night`. Giver: Stavros at his garage. Act 1.

## The scene

Stavros Yanos in a garage full of speakers he rents to the club he books, talking on two phones. He needs Friday's
night at Mothhouse full, and he believes in paper: "A feed forgets. A wall remembers." He hands Pedro a bag of flyers
and a roll of posters, promises him "a slot, maybe, soon, beautiful", and sends him out. Flyering is the game's
promotion system: you hand flyers to people who might come (adults walking, evening is best), and paste posters on the
legal boards. The last board Stavros marks is the side wall of Mothhouse. There is a hand-lettered cardboard sign there,
by a folding chair. The mission ends with Pedro pasting a poster over it, because the map told him to and nobody is
in the chair. That is the twist, and the next mission's fight.

## Objectives (play terms)

1. Talk to Stavros at his garage (talkTo). He hands over 20 flyers and 6 posters (grant `flyers:20`, `posters:6`).
2. Hand out flyers to passers-by (handFlyers, target 12 taken of 20 offered; adults only, the system never offers to a
   child or teen; F within 2.5 m). The HUD counts "Taken 0/12".
3. Paste five posters on the marked boards along the avenues (spots, any order, prompt "F  Paste poster", item `poster`).
4. Paste the last poster at Mothhouse's side wall (spots, one point at `club:sidedoor`; the board is the cardboard sign).
   The HUD only says "Last board: Mothhouse".
5. Text Stavros a photo (interact with the phone: one press). Objective completes on the reply.

## Fail states

- Out of flyers before 12 were taken: "Twenty flyers, eight people. Stavros calls it 'a soft launch'." (`lowScore`; retry
  with a new bag).
- Wanted level 2 (pasting is legal on the boards; the system only fails this if the player is chased): `copsCalled`,
  "Stavros: Why are there police? Flyers are paper, my friend."

## Rewards

- $60 (Stavros pays $40 in cash and "$20 next time": the toast says so).
- A promotion score for Friday (flyers taken + posters) stored for ACT1-08 (bigger line, better crowd meter start).
- Flag `pico.signCovered`. The next mission (ACT1-04) is offered at once when the player is within 40 m of the wall.
- Toast: "Paper on the walls. Your name is not on it. It is very small at the bottom. It is there."

## Dialogue

Step 1, the garage:

- Stavros: Pedro! Come in. Mind the woofer, it bites.
- Pedro: Mr. Yanos.
- Stavros: Stavros. Mr. Yanos was my father. He upholstered sofas.
- Pedro: I carry sofas.
- Stavros: Then it is destiny. Beautiful. Here.
- Stavros: Friday at Mothhouse. Nine hundred capacity. I need nine hundred.
- Pedro: You want me to play?
- Stavros: I want you to paper the walls.
- Stavros: Then, maybe, soon, you play. A warm-up.
- Pedro: Maybe soon is not a date.
- Stavros: Maybe soon is a direction. Every great DJ started with flyers.
- Pedro: Every great DJ, or every great promoter?
- Stavros: You are smart. I hate it. Go.
- Stavros: Hand them to people who look like they go out.
- Pedro: What does that look like?
- Stavros: Tired, but in nice shoes.

Step 2, banter while flyering (one every 15 s; at most one per refusal and one per take):

- Passer-by, taking one: Mothhouse? The one in the box factory? Okay.
- Passer-by, taking one: Is there a cover? There's always a cover.
- Passer-by, refusing: I'm good, man.
- Passer-by, refusing: I'm forty-five, I go to bed.
- Passer-by, refusing: Is this a crypto thing?
- Pedro, to himself: Tired. Nice shoes. Tired. Nice shoes.
- Pedro, after a refusal: Your loss, señora. Your beautiful loss.

Step 3, posters (one line per poster, in order pasted):

- Pedro: One.
- Pedro: Two. Straight. Like a professional.
- Pedro: Three. My name is under the Greek's name. In very small letters.
- Pedro: Four. Small letters are still letters.
- Pedro: Five.

Step 4, the side wall (nobody in the chair; a radio on the crate plays jazz quietly):

- Pedro: Last board. Is this a board?
- Pedro: It is cardboard. It is a board.
- Pedro: Sorry, cardboard. It is business.
- (He pastes. The camera holds a second on the chair and the radio. No line.)

Step 5, the text exchange (phone):

- Pedro: Done. Twenty flyers. Six posters. Send money.
- Stavros: BEAUTIFUL. Forty in the mailbox. Twenty next time. You are family now.
- Pedro: Family pays family.
- Stavros: Family understands family. Go home, sleep, you look tired. Nice shoes though.

## Barks (bystanders on the flyering avenues, evening)

- Passer-by: Another club? There's already a club. It's called my living room.
- Passer-by: They opened that place where the box factory was. My uncle worked there forty years. Now it's a club.
- Regular: Don't put a poster on Glenda's. She'll take it down and you with it.

## Notes for MISSIONS

- handFlyers: chance a passer-by takes one, from SIDE.md "Promotion rounds": evening 0.55, day 0.30, late night 0.65;
  +0.1 if Pedro's look matches the venue taste. A child or teen pedestrian is never a target (`Pedestrian.isMinor`).
- The sign covered at step 4 is a prop swap (VENUES: Clem's Corner props; the poster decal goes on top of the sign).
