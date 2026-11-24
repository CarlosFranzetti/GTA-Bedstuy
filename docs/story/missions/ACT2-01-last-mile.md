# ACT2-01 Last-Mile Wellness (`pico-last-mile`)

Who: Pedro. Where: a café table outside Mellowdrama (venue `dispensary`), Plush's van lot (a fenced lot by the rail on
the industrial edge, near Mothhouse), three doors across the map. Hours: the meeting 10:00 to 16:00; the run 22:00 to
04:00. Requires: `pico-warm-up-slot`. Giver: Whit's text, Whit at the café table. Act 2.

## The scene

The money is the point. Stavros paid $50 of $150. Yesenia's landlord wants next month early. Pedro meets Whit for
coffee "just to listen", next to Mellowdrama, the licensed dispensary, which is the joke: the legal shop is a wall of
candles and ID checks; Whit's business, two doors down in a grey van, is "self-care boxes" by day and something that is
not legal after eleven. Whit never names it and neither does anyone. He talks in a pitch deck: "We're not dealers, we're
a last-mile wellness layer." Pedro says yes for one night. He drives three sealed boxes to three doors. When nobody sees,
it pays, easily, and that is the uncomfortable part. On the way out, Corinne, Mellowdrama's manager (a former public
defender), has seen the van and texts Pedro, whom she met at the counter dropping off flyers: a plain warning, no how-to.

## Objectives (play terms)

1. Read Whit's text (phone). Go to the café table by Mellowdrama (goTo).
2. Talk to Whit (talkTo). Reply picker, one round (none of the answers refuses the job outright; refusing is available
   as walk-away: the mission is then shelved and comes back after 2 game days with a worse money text from Yesenia).
3. Wait until 22:00 (waitUntilHour).
4. Go to the van lot; pick up three Plush boxes (pickUp, prompt "F  Take the boxes", items `plushBox` x3).
5. Deliver to three doors (deliver, any order; each door is a residential stoop with an adult customer who opens the
   door; the hand-over is one F). Seen/unseen rules from SIDE.md section 6: unseen pays, seen raises heat.
   The third door has a patrol car parked at the corner (a fixed police unit) so the player has to choose the approach.
6. Back to the van lot with the cash (goTo). Whit's courier lead hands over the pay.

## Fail states

- BUSTED with boxes: the existing bust flow; the boxes and the cash so far are taken. The mission fails
  ("Whit: That was company property, man.") and can be retried the next night with $100 owed to Plush.
- Opening a box (pressing the interact key on the boxes in the vehicle): not possible; the prompt says
  "Pedro: No. I do not want to know." (no fail; it is a character beat).
- Time (04:00): `clockUp`. "Whit: Wellness is time-sensitive, bro."

## Rewards

- $180 for three boxes, +$40 if on time, minus nothing if unseen. Toast: "Three doors. Nobody saw. $220. It was easy.
  That is the problem."
- Flag `pico.plush.courier`. Plush runs unlock (SIDE.md 6). Corinne's text.
- If any delivery was seen: flag `pico.plush.seen` (Akira and Adele scenes refer to it later).

## Dialogue

Step 1, Whit's text:

- Whit: Coffee? 11am, the tables by the dispensary. Not THAT dispensary business lol. Different vertical.

Step 2, the café table:

- Whit: Pedro! Thanks for coming. Love the shoes.
- Pedro: You said coffee.
- Whit: Coffee's coming. It's oat. Everything's oat.
- Whit: So. Plush. You've seen the vans.
- Pedro: Grey. Everywhere. Like pigeons.
- Whit: Love that. Pigeons of care. Can I use that?
- Whit: By day we deliver self-care boxes. Candles. Socks. Gratitude journals.
- Pedro: And by night?
- Whit: By night we deliver... a different kind of self-care.
- Pedro: Say it.
- Whit: I'm not going to say it, man. Legally, I'm a platform.
- Whit: We're not dealers. We're a last-mile wellness layer.
- Whit: You drive. You don't open anything. Cash, same night.

Reply picker:

- 1 "How much?" → Whit: Sixty a box. Three boxes a night. Bonus if you're quick.
- 2 "Is this safe?" → Whit: Nothing's safe, man. Brunch isn't safe. You just don't get seen.
- 3 "After your joke, you want me to do THIS?" (only with `pico.whit.joke`) → Whit: Okay. That's fair. That's really fair.
  Whit: I'm hiring you because you have a truck. Not because of the bit.
  Pedro: Because I have a truck.
  Whit: And great shoes.

Then, any reply:

- Whit: Tonight. Ten. The lot by the rail. Just one night. Try it.
- Pedro: One night.
- Whit: One night. That's how everything great starts. And Plush.

Step 3, banter while waiting (one line):

- Pedro: One night. Just one. For the rent. For the R-E-N-T.

Step 4, the van lot (a courier lead; speaker `Courier`, an adult in a grey Plush fleece):

- Courier: You're the new guy? Three boxes. Three addresses. Don't open them.
- Pedro: Everybody tells me not to open them.
- Courier: Because everybody opens them. Then they're not couriers anymore.
- Courier: If a cop looks at you, you're delivering candles.
- Pedro: Am I delivering candles?
- Courier: Some of the box is candles.

Step 5, the doors (one exchange each; customers are generic adults; speaker `Passer-by` or `Regular`):

- Door 1 (a tired man in a suit): Finally. My app said four minutes. It's been six.
  Pedro: Traffic.
  Regular: It's always traffic. Thank you. Namaste or whatever.
- Door 2 (a woman with a ring light in the hall): Oh my God, the box. Can I film the unboxing? Not the inside. The outside.
  Pedro: Please no.
  Passer-by: Fine. Five stars anyway.
- Door 3 (by the patrol car; the customer is nervous): Is that cop looking at you?
  Pedro: The cop is looking at his phone.
  Regular: Everybody's looking at their phone. Give it here. Go.
- If seen at any door: Pedro: (getting back in the truck) Mierda. Mierda. Okay. Drive like candles.

Step 6, pay (the courier lead):

- Courier: Two twenty. Clean night. You're a natural.
- Pedro: I do not want to be a natural.
- Courier: Nobody does. Same time tomorrow?
- Pedro: One night. I said one night.
- Courier: Everybody says one night.

Corinne's text (60 s after the reward; she met Pedro at Mellowdrama's counter in a flyering round):

- Corinne: This is Corinne from Mellowdrama. I saw you at the van this morning. I was a public defender for twelve years. The couriers are the ones who get charged. Not the app. Come by if you want to talk. No speech. Coffee's real here.

## Barks (near the van lot and the doors, night; all adults)

- Passer-by: Those grey vans are everywhere. They delivered my neighbour a "journey".
- Passer-by: Last-mile what? Man, I just want my socks.
- Regular: Plush pays cash. That's all I'm going to say about Plush.

## Notes for MISSIONS

- The three doors are residential stoops away from schools, the playgrounds (Bramwell Playground) and the park's
  play areas; no child or teen pedestrian spawns within 30 m of a door during the run (the hard line).
- Nothing in the boxes is ever shown; the box is a grey cube with a soft-touch logo, the HUD says "Plush box".
