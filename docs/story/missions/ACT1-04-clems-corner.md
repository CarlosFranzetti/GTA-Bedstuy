# ACT1-04 Clem's Corner (`pico-clems-corner`)

Who: Pedro. Where: Mothhouse's side wall (venue `club`, spot `club:sidedoor`), Clem's Corner props. Hours: 18:00 to 02:00
(offered as soon as ACT1-03 ends near the wall; otherwise from the phone the next evening). Requires:
`pico-paper-the-walls`. Giver: none; the mission starts when Pedro walks back past the wall. Act 1.

## The scene

The fight with the homeless man (owner's list). Pedro comes back past the wall with the last of his flyers. Clem is in
his chair. The poster Pedro pasted is in Clem's hands, torn, and under it the cardboard sign is ruined: "CLEM'S CORNER.
WATCH YOUR CAR $0. TELL ME A JOKE $0." in letters his late wife Dolores painted. A Mothhouse security guard has just
moved his chair "for the line". Clem grabs Pedro's flyer bag as he walks up: "Is this yours?"

Clem is angry, sharp and very funny, and he is right. It is not about the flyers. It is about the only thing on the
corner that was his, and the second time this year somebody covered him with an advert. The player can talk him down,
walk away, or fight. All three are real and playable. Talking him down is the best ending: it makes Clem an ally for the
whole story and opens a friendship. Fighting is not a joke: Clem goes down hurt, the line films it, and the story
remembers (BIBLE 4.6).

This mission is where the reply picker and the calm meter are taught.

## Objectives (play terms)

1. Walk up to the wall (goTo `club:sidedoor`, radius 6, on foot). Clem stands and grabs the flyer bag. Letterbox 3 s.
2. The talk-down (reply picker; calm meter starts at 30 out of 100; 0 = he swings first, 100 = calmed). Up to six rounds
   of replies (below). Each reply moves the meter. The player can also press the walk-away key (step back 6 m) at any
   time: that ends the scene as "walked".
   - Calm reaches 100: outcome **calmed** (flag `pico.clem.talked`). Go to 3a.
   - Calm reaches 0, OR the player attacks: outcome **fight** (flag `pico.clem.fought`). Go to 3b.
   - Walk away: outcome **walked** (flag `pico.clem.walked`). Go to 3c.
3a. Calmed: fix the sign. Fork: "Buy him a new sign" (pay $15 at Troop Deli for cardboard and markers: pickUp, return,
   interact 3 presses "F  Letter the sign") or "Put his corner on your flyers" (interact with the phone: Stavros gets a
   text; Clem's Corner is now printed on the bottom of every Mothhouse flyer). Either completes.
3b. Fight: the existing combat (Clem fights back with his fists only; he has the health of an elder). The fight ends
   when either goes down, or when the player stops for 4 s. Then the flyer bag is torn (lose the remaining flyers).
   Escape the line's phones: escapeRadius 60 m from the wall within 45 s (heat 1 star if a witness calls; MISSIONS may
   use the existing witness rules). Adele appears in ACT1-05's intro (she patched your hand at Wexcombe; see note).
3c. Walked: Pedro walks off; Clem keeps the bag. A text from Stavros: "Where are my flyers?" ($20 deducted from Act 1
   pay; Clem returns the bag in Act 2 if the player comes back with coffee).

## Fail states

- None in the usual sense: every outcome completes the mission and sets a flag. The mission can only fail if the player
  pulls a weapon on Clem: Clem is not a combat target for guns in this mission; the system cancels it
  ("Pedro: No. What am I doing.") and treats it as the fight outcome with an extra heat star. MISSIONS: if this is too
  much special-casing, fail with a retry instead: "That is not who you are. Try again."
- Leave the area (80 m) during the talk-down: counts as walked.

## Rewards

- calmed: Clem's number (he has a phone; it is "for emergencies and jokes"), a free "watched car" bonus (cars parked at
  Clem's Corner are never broken into), and the Act 3 bass player. +$0. Toast: "You made a friend. He is funnier than you."
- fight: nothing but the consequence. Toast: "There is a video. It has a song on it that is not yours."
- walked: the corner stays cold. Toast: "Sometimes leaving is the right thing. This was not one of those times. Or it was."

## Dialogue

Step 1, Clem stands up with the bag:

- Clem: Is this yours?
- Pedro: That is my bag.
- Clem: Then this is yours too. (He holds up the torn poster.)
- Clem: You pasted a nightclub on my wife's handwriting.

Step 2, the reply picker. Each round shows the replies in the order given; numbers in brackets are calm meter changes.
Clem's answer follows each reply. Rounds advance whatever is picked; round 2 onwards depends on round 1 only where noted.

Round 1.

- 1 "I did not see anyone here." (-5)
  - Clem: You saw a chair. A chair is somebody sitting down.
- 2 "Give me my bag, man." (-15)
  - Clem: Come take it. I am sixty-one. I am very slow. Try me.
- 3 "That was your sign? I am sorry." (+20)
  - Clem: It was my sign. It still is. It's just wearing your hat.
- 4 (only with `pico.sleeveCredit`) "You are Clement Ashby. You played on Brooklyn Lights." (+100: calmed at once)
  - Clem: ...They spelled it Ashy.
  - Pedro: I know. Ms. Odette told me.
  - Clem: Odette. Lord. Is she still pricing the frames?
  - Pedro: She charged me for one.
  - Clem: (laughs) Sit down. No. Not on my chair. On the crate.
  - (Go to 3a.)

Round 2.

- 1 "The security moved your chair, not me." (-5)
  - Clem: And you pasted. Everybody did a little bit. That's how a whole thing happens.
- 2 "How much for the sign? I will pay." (-10)
  - Clem: You going to pay for her handwriting? What's that cost, in flyers?
- 3 "Who painted it?" (+20)
  - Clem: Dolores. My wife. She had better letters than any sign shop on Fulton.
- 4 "Look, I have a gig to promote." (-20)
  - Clem: And I have a corner to keep. Mine was here first. Yours is paper.

Round 3.

- 1 "What does the sign mean? Watch your car for zero?" (+15)
  - Clem: I watch the cars. Nobody pays. Nobody's car gets broken into. You figure it out.
- 2 "Why do you sit here, of all places?" (+5)
  - Clem: My building was three doors down. They renovated it around me. This is as far as I got.
- 3 "Give me the bag and I will go." (-10)
  - Clem: You'll go. You'll come back Friday with nine hundred people and step over me.
- 4 "You are making a scene." (-20)
  - Clem: This IS a scene. Ask your Greek. He sells tickets to them.

Round 4.

- 1 "Tell me a joke, then. It says zero dollars." (+20)
  - Clem: A bass player and a DJ walk into a bar.
  - Pedro: And?
  - Clem: The bass player says "I played on that record." The DJ says "Which one?" The bass player says "All of them."
  - Pedro: That is not a joke. That is a brag.
  - Clem: In my business that's the same thing.
- 2 "I play records too. Salsa, cumbia, disco." (+10)
  - Clem: Disco. Hm. What's the bass line on anything you love?
  - Pedro: (hums. Nothing on screen; the voice hums one note and stops.)
  - Clem: That's the kick drum, son.
- 3 "I can call somebody. A shelter, an outreach team." (+0)
  - Clem: I know every number in this borough. I'm not lost. I'm sitting.
- 4 "Last time. Give me the bag." (-25)
  - Clem: Last time. Come get it.

Round 5 (if not yet calmed or at 0).

- 1 "My uncle had a sound system on a corner. People sat by it all night." (+20)
  - Clem: On a corner. Outside? For free?
  - Pedro: For free. You brought your own chair.
  - Clem: (quiet) That's the only kind of club I ever liked.
- 2 "I am sorry about your wife." (+15)
  - Clem: Me too. Every morning. Then I get some coffee.
- 3 "Okay, keep the flyers. I don't care." (-10)
  - Clem: You care. You just don't want me to see it.

Round 6 (last chance; if the meter is between 1 and 99 after this round, the outcome is decided by the meter:
60 or more = calmed, under 60 = Clem throws the bag at Pedro's feet, sits down and turns the radio up = walked).

- 1 "What can I do to make it right?" (+25)
  - Clem: Make it right? Put me on your flyer, or fix my sign. One.
- 2 "Can I sit with you a minute?" (+20)
  - Clem: The crate's free. The jokes are free. The coffee you buy.
- 3 "You're crazy, man." (-40)
  - Clem: No. I'm tired. You're the one pasting walls at midnight.

When calmed (from any round; this short exchange plays, then 3a):

- Clem: Okay. Okay. You're an idiot, but you're a sorry idiot.
- Pedro: That is my best kind.
- Clem: Clem. Clement Ashby. Bass.
- Pedro: Pedro. Pedro Martinez. Records.
- Clem: Fix my sign, Records.

When the meter reaches 0 (the fight), Clem moves first:

- Clem: Alright! Alright. You want it, come on.
- Pedro: Clem. Don't.
- (Combat. While fighting, at most these lines, one each:)
- Clem: I boxed in the Navy, son!
- Clem: Forty years of standing up!
- Bystander (the line): Yo, yo, yo, film it, film it.
- Bystander (the line): That's Clem! Leave Clem alone!
- When either goes down: no line from the one down. Pedro: ...Qué hice. (What did I do.)

After the fight (as Pedro escapes; phone text from Stavros 20 s later):

- Stavros: Beautiful. Now there is a video. Do not come to the club this week. Ice your hand.

When walked:

- Pedro: Keep it. Keep everything.
- Clem: I will. I always do.

Step 3a, fixing the sign (banter during the three presses):

- Clem: Not like that. Her C had a little tail. Like it was going somewhere.
- Pedro: Like this?
- Clem: Like a C that has a job. Good.
- Clem: Now the joke part. Bigger. People need to see the joke part.

Step 3a, the flyer option (phone):

- Pedro (text to Stavros): Put "Clem's Corner. Watch your car $0" on the bottom of every flyer.
- Stavros: Who is Clem
- Pedro: He is the reason your cars still have windows.
- Stavros: Beautiful. Done. Who is Clem

Closing line, calmed:

- Clem: Friday, when your nine hundred come, tell them the corner's taken.
- Pedro: I will tell them it is the VIP.
- Clem: Ha. The Cocoon can keep its stairs. I've got a crate.

## Barks (bystanders: the Mothhouse line and passers-by)

- Regular: Clem watched my car for two years. Never paid him a dime. Never got a ticket either.
- Bouncer: Line moves when it moves. No, I don't know who's playing. Somebody with a laptop.
- Passer-by (after a fight): Man, that was cold. That's an old man.
- Passer-by (after calmed): Clem's got a new sign! Look at the C on that.

## Notes for MISSIONS and CAST

- Clem's model: an elder from the existing cast system, layered winter clothes, a knit cap, clean; never dirty for a
  joke. Chair, crate, radio and sign are VENUES props.
- Adele after a fight: ACT1-05 opens with a 3-line scene at Wexcombe Medical Center if `pico.clem.fought` (Adele wraps
  Pedro's hand: "You hit a sixty-one-year-old man." "He hit me first." "He says the same. He's in bed four. He's fine.
  He asked for your record collection."). If calmed, Adele meets Pedro at Clem's Corner in ACT1-07's background (she
  brings Clem coffee on her way to a night shift): written in ACT1-05.
- The calm meter numbers are a starting point; tune so a careful player calms him in four rounds and a hostile one ends
  in a fight by round three.
