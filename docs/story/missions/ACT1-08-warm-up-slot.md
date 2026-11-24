# ACT1-08 Warm-Up Slot (`pico-warm-up-slot`)

Who: Pedro. Where: Mothhouse (venue `club`: `club:door`, `club:booth`, `club:floor`, the Cocoon stairs), Clem's Corner
outside. Hours: offered Friday from 18:00 (or any evening if the game has no weekdays: 18:00 to 22:00); the set is at
22:00. Requires: `pico-second-wind`, `pico-not-a-date`. Giver: Stavros (a call), then Bash at the door. Act 1 finale.

## The scene

Stavros calls in a panic: his warm-up DJ has "a family thing" (a better gig). Pedro gets the slot: 22:00 to 23:00 at
Mothhouse, nine hundred capacity, a hundred and fifty people at that hour if the flyers worked. Stavros gives him five
names for the guest list. Who he puts on says who he is: Lana, Margo or Remy (whoever he dated), Akira, Clem, Yesenia,
Rafa, or the strangers he met handing out flyers.

The warm-up is a DJ lesson: the warm-up must not peak. Keep the room warm (crowd meter between 40 and 70), never hot,
because the headliner is coming and Stavros wants the room hungry. Pedro hates this rule. Pedro is good at it anyway.

Then the night turns. Stavros brings up Kyle Strand, "my partner, my angel", who tells Pedro his set was "great for a
Tuesday". With Kyle is Whit Calloway, founder of Plush, who makes a joke about Colombians and "product" that nobody
laughs at but Kyle. Pedro does not laugh. (The game remembers: flag `pico.whit.joke`.) Stavros promises Pedro the Friday
"next month, beautiful", and pays him $150 minus "$100 for the sound, you understand". Outside, at 02:00, Pedro has $50,
a guest who came, and a text from Whit: an offer.

## Objectives (play terms)

1. Answer Stavros's call (phone).
2. Guest list (guestList, 5 names, from the phone's contacts and met strangers). Effects (flags `pico.guest.<id>`):
   - Lana: the line moves faster; Lana tells Bash two people in the queue are "industry" (start meter +5).
   - Margo or Remy (the one dated): a short scene on the floor after the set. Remy instead "is working", so putting him
     on the list just makes him laugh: +5 mood.
   - Akira: he stands by the booth; later he says "Pockets" when Whit makes the joke (lowers the chance of a fight here).
   - Clem: Bash says "Clem's on a list? Clem." Clem comes in for ten minutes, listens to one record, leaves: "Not bad,
     Records." (If `pico.clem.fought`, Clem's name is on the list but he does not come.)
   - Yesenia: she dances the whole hour and films it for Pedro's mother (start meter +5).
   - Rafa: he heckles kindly; meter +5 when a salsa record plays.
   - A stranger from the flyer round: they bring three friends (start meter +5).
3. Get to Mothhouse by 21:45 (goTo the door, with the crate; fragile records hp 3).
4. Talk to Bash at the door (talkTo `club:door`).
5. Walk to the booth (goTo `club:booth`).
6. Warm-up set (djSet, venue `club`, 4 minutes, warm-up rule: the crowd meter must stay between 40 and 70; above 70 for
   more than 15 s in total = "you peaked" warning; above 70 for 30 s = fail; below 25 for 20 s = fail). The start meter
   is 30 plus the promotion score from ACT1-03 (up to +15) plus guest list bonuses.
7. Talk to Stavros at the Cocoon stairs (talkTo). Kyle and Whit join (a beat with letterbox 4 s).
8. Reply picker on Whit's joke (3 options; none starts a fight here; this is Act 2's fight being planted).
9. Leave by the side door (goTo `club:sidedoor`). At 02:00 (or 60 s after the stairs scene), Whit's text arrives.
   If `pico.clem.talked`, Clem is at his corner and has one last line.

## Fail states

- `cargoBroken`: "Bash: You can't DJ with a bag of broken plates, man."
- Late (after 22:00 at the door): `timeUp`. "Stavros: I put on a playlist. It was beautiful. You are fired. Come next week."
- Peaked (above 70 for 30 s): "Stavros: You played the headliner's set! Before the headliner! Get out of my booth!"
- Emptied (below 25 for 20 s): "Bash: They're leaving. To go to a different line. For a different club."

## Rewards

- $150 announced, $50 paid (Stavros keeps $100 "for the sound"). Toast: "You played Mothhouse. You got paid half of
  what you were paid. Welcome to the industry."
- Flags: `pico.warmup.done`, `pico.plush.offered`, `pico.whit.joke` (if Pedro did not laugh; option 3 also sets
  `pico.whit.called`).
- Act 2 opens. The phone's pointer moves to `pico-last-mile`.

## Dialogue

Step 1, Stavros on the phone:

- Stavros: Pedro. Pedro. My warm-up has a family thing.
- Pedro: A family thing?
- Stavros: A better gig. In Bushwick. A family of liars.
- Stavros: Ten to eleven. Tonight. You want it?
- Pedro: How much?
- Stavros: One fifty.
- Pedro: Yes.
- Stavros: Five names on the list. Bring nice shoes. The rule is: do not peak.
- Pedro: What does that mean?
- Stavros: Warm the room. Do not burn it. The headliner burns it.
- Pedro: And if I am better than the headliner?
- Stavros: Then you are an idiot with a future. Do not peak.

Step 4, Bash at the door:

- Bash: Name.
- Pedro: Pedro. The warm-up.
- Bash: Martinez. The flyer guy. Your flyers were okay.
- Pedro: Only okay?
- Bash: The small letters were better than the big ones.
- (If Clem is on the list:) Bash: Clem's on a list? ...Clem. Okay. Respect.
- (If Lana is on the list and there:) Lana: Basheer. Two in the line are a magazine. The tall ones.
- Bash: Lana. You always know.
- Lana: I always look.
- Bash: Go in. Don't peak. Stavros has been saying it to the mirror.

Step 6, during the set (crowd meter triggers; at most one line every 20 s):

- Meter 40 to 70, steady: Remy (if dated, from the sound desk, via an earpiece line): Lovely. Leave the low end where it is.
- Meter rises toward 70: Stavros (on the floor, waving): Down! Down! Beautiful, but down!
- Pedro: I am warming. I am a heater.
- Meter over 70: Stavros: You are peaking! Who peaks at ten-thirty?
- Meter dips under 35: Bash (at the door, to nobody): They're on their phones. Fix it, flyer guy.
- Yesenia (if on the list): ¡Eso, primo! Mamá is watching!
- Rafa (if on the list): Play the trombone one! No? Coward!
- Clem (if on the list, after his record): Not bad, Records. Watch the kick.
- Last 15 s: Pedro: And now, ladies and gentlemen, someone more famous.

Step 7, at the Cocoon stairs:

- Stavros: BEAUTIFUL. You did not peak! I cried a little. Kyle! Come.
- Kyle: This is the warm-up? Great energy. Great for a Tuesday.
- Pedro: It is Friday.
- Kyle: Exactly. Imagine what you'll do on a Friday.
- Stavros: Kyle is my partner. My angel. The speakers are his.
- Kyle: Our speakers. We're a family here. Like, an equity family.
- Kyle: This is Whit. Whit built Plush. You've seen the vans.
- Whit: Hey, man. Colombian, right? You must know a lot about product. (He laughs. Kyle laughs.)

Step 8, the reply picker (no line from Stavros until the player chooses; Akira, if present, says "Pockets." quietly first):

- 1 (says nothing; looks at him until he stops) → Whit: ...Tough room. I'm kidding. It's a bit.
  - Pedro: I know. It is an old bit. Very old.
- 2 "I know a lot about records. Ask me about records." → Whit: Ha! Okay. Okay. Records. Respect.
  - Kyle: See? Brand discipline.
- 3 "In Colombia we have a word for that joke. The word is 'gringo'." → Whit: (blinks) ...Fair. Fair. I'll take that.
  - Kyle: He's got teeth, Stavros. I like teeth. (sets `pico.whit.called`)
- All three, then:
  - Stavros: Okay! Okay. Pedro. The Friday. Next month, I think.
  - Pedro: Next month is a date?
  - Stavros: Next month is a direction. Here. One fifty.
  - Pedro: This is fifty.
  - Stavros: One fifty minus one hundred for the sound. You understand.
  - Pedro: I understand.
  - Stavros: I knew you would. Beautiful. Go home, sleep.

Step 9, outside (Clem, only with `pico.clem.talked`):

- Clem: Heard you through the wall. You didn't peak.
- Pedro: Everybody keeps telling me what I didn't do.
- Clem: That's how it starts. Then one night they tell you what you did.
- Clem: Watch your car? Zero dollars.
- Pedro: I don't have a car. I have my cousin's employer's truck.
- Clem: Then I'll watch that.

The text from Whit (phone, at 02:00 or 60 s after the stairs):

- Whit: Hey man, no hard feelings about the bit. Real talk: Plush needs night couriers. Cash, same night. You have a truck and good shoes. Coffee tomorrow? Last-mile wellness. Think about it.

Pedro's line on the sidewalk, last of the act (letterbox 3 s, on the mission's close):

- Pedro: Fifty dollars. And a man who thinks I know about product.
- Pedro: Qué vaina.

## Barks (the line and the floor, all adults)

- Bouncer: ID out, phones away, smiles optional.
- Dancer: Who's the warm-up? He's warm. He's very warm.
- Passer-by (the line): I heard the sound guy here is from London. That's why it sounds like rain.
- Dancer (to a friend): Don't peak, babe, it's ten-thirty.

## Notes for MISSIONS

- The warm-up rule is a variant of the crowd meter with a ceiling (SIDE.md, "Gigs").
- The guest list screen lists up to 12 names: the met cast plus up to 4 named strangers from the flyer round (their
  names generated from the existing pedestrian name pools).
- Whit's joke is the one ethnic joke in the story, it is made by the parody target, nobody but Kyle laughs, and it is
  answered. Keep it exactly as small as written; do not add a second one.
