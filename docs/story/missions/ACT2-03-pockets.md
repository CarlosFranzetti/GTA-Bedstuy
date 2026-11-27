# ACT2-03 Pockets (`pico-pockets`)

Who: Pedro (Akira with him). Where: Tincture & Ledger (venue `bar-lounge`: `bar-lounge:bar`, `bar-lounge:booth`, the
vault door), the street outside. Hours: 19:00 to 01:00. Requires: `pico-last-mile`. Giver: Stavros (phone). Act 2.

## The scene

The fight with the man at the bar (owner's list). Stavros wants Pedro at an "investor dinner" at Tincture & Ledger, the
cocktail bar in the old bank, to "show them the talent". Pedro brings Akira because Akira asked for a free drink and
because Pedro is nervous. Kyle Strand holds court at the marble bar. He sends back a smoke cocktail three times, calls
the bartender "sweetheart" (Margo if `pico.date.margo`, working a guest shift; otherwise Inés), then turns to Pedro and
tells the room his warm-up was "great for a Tuesday" and that "people like you" should be grateful for exposure. When
Pedro does not laugh, Kyle puts a hand on his chest and shoves.

Three real outcomes, all playable (reply picker with a calm meter, as in ACT1-04, but here the meter is the ROOM's,
not Kyle's: Pedro wins by making Kyle the joke in front of his own investors):
- **talked**: Pedro turns the room. Kyle laughs it off and leaves early. Nobody touches anybody. The Mothhouse Friday is
  delayed, not lost, and Kyle is now careful (flag `pico.kyle.talked`).
- **walked**: Akira says "Pockets." Pedro puts his hands in his pockets and walks out. Kyle wins the room. The Friday is
  lost (flag `pico.kyle.walked`). Akira buys the gas-station burritos.
- **fight**: a bar fight (existing combat; Kyle's two friends join after 5 s; glasses break; blood allowed, no gore). Then
  escape with heat 2 (a witness calls; the bank bar has cameras). The Friday is lost, a lawyer's letter arrives, and the
  video goes round with a caption Kyle wrote (flag `pico.kyle.fought`).

## Objectives (play terms)

1. Answer Stavros's call (phone).
2. Meet Akira outside Tincture & Ledger (goTo, `bar-lounge:door`). The door checks the outfit: if Lana has styled Pedro
   (SIDE.md 3) it passes; otherwise Akira talks them in ("He's with me. I'm the muscle.").
3. Sit at the bar (goTo `bar-lounge:bar`). A timer beat (20 s) of Kyle's table talk (banter lines).
4. Kyle's confrontation (talkTo is replaced by the reply picker; 4 rounds; the room meter starts at 40; 100 = talked,
   0 or any blow = fight; the walk-away key = walked; after round 2, Akira offers "Pockets." as a fifth reply that walks).
5a. talked: stay for one more drink (timer 15 s), leave (goTo the street). Margo / Inés says thanks.
5b. walked: leave with Akira (goTo, 40 m). A last exchange on the sidewalk.
5c. fight: fight until Kyle and his friends are down or fled (or Pedro is down: then the player wakes at Wexcombe and
   Adele has a line), then lose the heat (loseWanted).
6. Read Stavros's text (phone).

## Fail states

- None: every outcome completes. If Pedro draws a gun in the bar, the bar empties, heat goes to 3 and the mission fails
  with "Akira: No. Not that. Not here. Not ever." (retry from the bar door). Shooting is for later missions with armed men;
  a bar argument is not one.
- Wasted in the fight: the mission completes as fight; the wake-up scene plays.

## Rewards

- talked: $0, flag, and Inés/Margo puts "the DJ from the vault night" on her own guest list (+5 start meter at any gig she
  attends). Toast: "You won a room without playing a record."
- walked: $0, Akira's trust +1. Toast: "Pockets. It cost you a Friday. It did not cost you anything else."
- fight: −$300 (the lawyer's letter: "damages to a smoke cocktail"), heat. Toast: "Kyle's caption: 'Grateful for every
  hater.' It has a filter."

## Dialogue

Step 1, Stavros:

- Stavros: Pedro! Dinner. Tincture. Investors. Wear a shirt with buttons.
- Pedro: Will there be money?
- Stavros: There will be people with money. Which is the first step to money.

Step 2, the door:

- Bouncer: Reservation?
- (styled) Bouncer: ...Go ahead. Nice coat.
- (not styled) Akira: He's with me. I'm the muscle.
- Bouncer: You're five foot six.
- Akira: The muscle's very concentrated.

Step 3, the bar (banter while sitting; Kyle at the far end, louder than the music):

- Kyle: The vault stays. The vault is the story. Money used to sleep here.
- Kyle: We're tokenising the bar tab. You don't drink. You hold.
- Inés (or Margo): That's his third smoke cocktail. He sends back the smoke.
- Akira: What's wrong with the smoke?
- Inés (or Margo): He says it's "not his smoke".
- Akira: Whose smoke is it?
- Inés (or Margo): Mine. I set fire to rosemary for a living. I have a degree.

Step 4, the confrontation:

- Kyle: Sweetheart, this is wrong again. Smoke it like you mean it.
- Kyle: Oh! The warm-up. Everybody, this is Stavros's warm-up guy.
- Kyle: Great for a Tuesday. Honestly.
- Kyle: People like you should be thanking the room. That's exposure.
- (He puts his hand flat on Pedro's chest.)

Reply picker, round 1:

- 1 "Take your hand off me." (−5) → Kyle: Whoa. Easy. It's a vibe check.
- 2 "People like me?" (+10) → Kyle: Creatives. Obviously. What did you think I meant?
  - (the room goes quiet; one investor laughs nervously)
- 3 "Her name is Inés. Not sweetheart." / "Her name is Margo." (+15) → Kyle: Okay, champion. Okay. Inés. Margo. Whatever.
  - Investor (Passer-by): Kyle, just drink it.

Round 2:

- 1 "How much is a MOTH token today?" (+20) → Kyle: It's a long-term hold. Price isn't the point.
  - Investor (Passer-by): It was eleven dollars on Monday.
  - Pedro: And today?
  - Investor (Passer-by): ...Forty cents.
- 2 "You want a fight? In a bank? With these lights?" (+10) → Kyle: Nobody's fighting. I'm mentoring.
- 3 "Say it again. Tuesday." (−15) → Kyle: Tuesday. Tuesday, Tuesday. Great for a Tuesday.
- 5 Akira: "Pockets." (walks)

Round 3:

- 1 "You sent back the smoke three times. You are scared of smoke." (+20) → (the room laughs) Kyle: I'm not scared of smoke.
  - Inés (or Margo): He's a little scared of the smoke.
- 2 "Stavros, tell him." (−10) → Stavros: Gentlemen. Gentlemen! Beautiful evening. Beautiful vault.
- 3 "Push me again. Please. Everybody has a phone out." (+5) → Kyle: (lowers his hand) ...Nobody's filming.
  - Passer-by: I'm filming.
- 5 Akira: "Pockets." (walks)

Round 4 (the meter decides: 60+ talked, under 60 Kyle shoves again and the fight starts unless the player walks now):

- 1 "You bought a bank to sleep where money slept. That is the saddest thing I ever heard." (+25)
- 2 "Enjoy your Tuesday, Kyle." (+15)
- 3 (throws the first punch) → fight

talked, the close:

- Kyle: (laughs too long) Okay. Okay! He's got teeth. I love teeth. I'm going to go.
- Kyle: Stavros, we'll talk about Fridays. Later. Much later.
- Investor (Passer-by): Forty cents. I put my kid's college in that.
- Pedro: Your kid can still go to college. Just a smaller one.

walked, on the sidewalk:

- Akira: Pockets.
- Pedro: I lost the Friday.
- Akira: You kept your hands. You need your hands for the Friday after.
- Pedro: There is no Friday after.
- Akira: There's always a Friday after. That's what Friday is.
- Akira: Burrito?
- Pedro: ...Two.

fight, lines during combat (one each, at most):

- Kyle: Do you know who I am?
- Kyle's friend (Passer-by): Not the face, he has a shoot tomorrow!
- Akira: (if he joins) I said pockets! Fine! Fine!
- Inés (or Margo): Not the vault door! It's original!
- Pedro (after): Qué hice. Otra vez. (What did I do. Again.)

Step 6, Stavros's text (by outcome):

- talked: Stavros: You humiliated my angel. In front of his angels. ...It was beautiful. The Friday is "delayed". Do not call me.
- walked: Stavros: Kyle says no Fridays for "the Tuesday guy". I am sorry, my friend. I am a coward with a mortgage.
- fight: Stavros: A lawyer called me. A LAWYER. About SMOKE. Do not come near the club.

## Barks (inside and outside the bar; all adults)

- Passer-by: The cocktails here come with a paragraph. I just wanted a beer.
- Passer-by: Is the vault real? Like real real?
- Regular (outside): That used to be my bank. I had seventy dollars in there. Now it's a cocktail.

## Notes for MISSIONS

- The room meter and Akira's "Pockets." reply are the reply picker with one extra always-available option after round 2.
- If `pico.date.margo`, Margo is working a paid guest shift ("Glenda lends me out when she wants to spy").
