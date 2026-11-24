# ACT1-07 Coffee, Not a Date (`pico-not-a-date`)

Who: Pedro. Where: Glenda's Long Room (venue `bar-dive`, spots `bar-dive:bar`, `bar-dive:booth-back`) or Mothhouse's
booth (venue `club`, `club:booth`, during a sound check), then a walk through Thistledown Park, then home. Hours: offered
16:00 to 23:00. Requires: `pico-size-medium`. Giver: a fork at the start (two phone texts; the player picks one by
going to its marker). Act 1. All characters adults (Margo 37, Remy 33, Pedro 31).

## The scene

Pedro has paid the rent, which makes him feel rich, which is dangerous. Two people have been kind to him this week, and
both have texted. Margo, the bartender at Glenda's, lent him a book about a sailor ("you look like you need a long one")
and wants it back. Remy, Mothhouse's sound engineer, saw Pedro's posters, liked the small letters at the bottom, and
asks him to check the room's sound before Friday ("I need ears that are not my boss's"). Neither says "date". Both are.

The date is a short mission built on the reply picker and a mood meter (0 to 100). Where you walk, what you say, and
whether you listen move it. At the end, with the mood at 70 or more, there is a choice: say good night, or go home together
(an INTIMATE BEAT, written in two versions below for the Settings switch). Turning it down is always there and always kind.
There is no wrong person and no punishment for either choice.

## Objectives (play terms)

1. Fork: go to Glenda's (Margo) or to Mothhouse's side door (Remy). Sets `pico.date.margo` or `pico.date.remy`. Ignore
   both until 23:00 and the mission completes as `pico.date.none` with a quiet line (below).
2. Margo branch: sit at the bar (goTo `bar-dive:bar`), talk (reply picker, 3 rounds), wait for her shift to end at 21:00
   (waitUntilHour), walk with her through Thistledown Park (escort tail at walking pace, route through the park; the
   reply picker fires twice on the walk).
   Remy branch: meet Remy at the booth (goTo `club:booth`), help with the sound check (interact 3 presses at the
   speakers: "F  Listen"), reply picker (3 rounds), walk to the bodega for coffee and through the park (escort tail).
3. The end of the walk, at the park gate: if mood 70+, a three-way choice (reply picker): "Good night" / "Come up for
   coffee" (Pedro's) or "Walk you home" (theirs) / "I should go". Under 70: only good night.
4. INTIMATE BEAT (only if chosen and accepted): the scene below; then a morning after (fade, next morning 09:00 at the
   chosen home; one short talk). Sets `pico.morningAfter`.
5. Good night: a short line; Pedro walks home (the mission completes when he reaches his stoop or after 60 s).

## Mood meter (starts at 40)

- Listening replies +10 to +15; bragging −10; talking about Stavros's "maybe soon" −5 (both are tired of promoters);
  asking about THEIR thing (the book, the cables) +15; a joke that lands +10; checking the phone (pressing the phone key
  during a talk) −10.
- Walk route bonus: the path past the bandshell (Thistledown Park) +5; stopping at Troop Deli for coffee +5.
- Fail: none. A low mood just means a kind good night and a "we'll see" text.

## Fail states

- None. Leaving mid-walk (more than 40 m from them for 10 s) ends with `pico.date.none` and a text: "Margo: You walked off
  mid-sentence. Bold. Bring the book back anyway." / "Remy: You left during the best part of the cable story."

## Rewards

- A relationship flag (`pico.date.margo` or `pico.date.remy`) and their number. A good date lets the love interest appear in
  Act 2 scenes. Toast (good night): "A good night. An actual good night." Toast (morning after): "You did not spend
  any money. You feel richer."
- No cash.

## Dialogue: the Margo branch

Arrival, Glenda's (Glenda behind the photo wall, Margo at the taps):

- Glenda: You're the DJ. Margo says you read.
- Pedro: I am reading. Slowly. It is in English.
- Glenda: That's the hard one. Sit.
- Margo: You brought my book back.
- Pedro: I brought it back. I am on page ninety.
- Margo: It has four hundred pages.
- Pedro: Then I will be back four more times.
- Margo: That's either very smooth or very slow.

Reply picker, round 1:

- 1 "What happens to the sailor?" (+15)
  - Margo: He gets lost on purpose. Then by accident. Then he likes it.
- 2 "I am playing Mothhouse soon. Maybe." (−5)
  - Margo: Maybe. Everybody's playing somewhere maybe. The bar is real.
- 3 "How long have you worked here?" (+10)
  - Margo: Eleven years. Glenda says it's a phase.

Round 2:

- 1 "Do you write too?" (+15)
  - Margo: I start things. I've started a novel nine times. Chapter one is excellent.
- 2 "You should open your own bar." (−5)
  - Margo: Everybody says that. Nobody says "you should finish your book".
- 3 "You should finish your book." (+15, only after round 2 option 2 or round 1 option 1)
  - Margo: ...Okay. Okay, DJ.

Round 3:

- 1 "Tell me chapter one." (+15)
  - Margo: No. If I tell it, I won't write it.
- 2 "In Barranquilla, the sea is in every story." (+10)
  - Margo: In Brooklyn the sea is a rumour. You can smell it on Fridays.
- 3 (checks phone) (−10)
  - Margo: Your Greek again?

Shift end:

- Margo: Glenda, I'm out.
- Glenda: Walk her the long way. The short way has a bar.

On the walk (two reply rounds, short):

- Margo: You know what I like about the park at night?
- Pedro, 1 "The quiet?" (+5) — Margo: The quiet is people deciding not to talk. I like that.
- Pedro, 2 "The bandshell?" (+10) — Margo: My mother sang on that bandshell once. Badly. Proudly.
- Margo: What did your uncle play?
- Pedro, 1 "Everything. Loud. On a corner." (+10) — Margo: That's a good uncle.
- Pedro, 2 "Records nobody here knows." (+5) — Margo: Then play them. Somebody has to be the first.

## Dialogue: the Remy branch

Arrival, Mothhouse booth (empty club, house lights up):

- Remy: You came. Brilliant. You're the poster man.
- Pedro: Small letters at the bottom.
- Remy: The small letters were the only honest part.
- Remy: Listen to this room. Tell me what's wrong.

Sound check (a line per press):

- Pedro: The low end is in the corner. Hiding.
- Remy: Yes! Thank you. My boss says it's "vibes".
- Pedro: The vibes are under the coat check.

Reply picker, round 1:

- 1 "Why did you come from London?" (+10)
  - Remy: A job called "audio lead". It's called "audio vibes lead" now. Nobody told me.
- 2 "Can you get me a slot here?" (−10)
  - Remy: I can get you a cable. Slots are Stavros's religion.
- 3 "Show me the amp room." (+15)
  - Remy: Oh. Oh, you're one of those. Come on.

Round 2:

- 1 "Do you play anything?" (+10)
  - Remy: Badly. Drums. My neighbours have filed a petition.
- 2 "This room is too loud for its walls." (+15)
  - Remy: That's what I said! In a memo! They sent back a heart.
- 3 "You are good at this." (+10)
  - Remy: ...Thanks. People only notice sound when it's wrong.

Round 3:

- 1 "Coffee? Real coffee. Mohammed's." (+10, starts the walk via Troop Deli)
  - Remy: The bodega? Yes. Please. I've been drinking the club's oat thing.
- 2 "In Barranquilla, sound is outside. On the street." (+15)
  - Remy: No walls at all? That's the dream. That's the actual dream.
- 3 (checks phone) (−10)
  - Remy: Is that the boss? Don't tell him I said vibes.

On the walk:

- Remy: What's it like? A sound system on a corner?
- Pedro, 1 "Like the whole street is one speaker." (+10) — Remy: I'd quit my job for that.
- Pedro, 2 "Hot. Loud. My uncle shouting." (+5) — Remy: Sounds like my family at Christmas.
- Remy: Why do you play the old records?
- Pedro, 1 "Because they made people move first." (+10) — Remy: Fair. New ones are borrowing.
- Pedro, 2 "Because I cannot afford new ones." (+5) — Remy: Honest. Weirdly attractive.

## The end of the walk (both branches)

At the park gate, mood under 70:

- Margo: This was nice. Bring the book back.
- Remy: This was nice. Bring your ears back.
- Pedro: Good night.

Mood 70 or more, the reply picker:

- 1 "Good night. This was good." (good night; +0)
- 2 "Do you want to come up? My cousin is at work. The couch is... a couch." (Pedro's place)
- 3 "Can I walk you home?" (theirs)
- 4 "I should go. I want to see you again." (good night; they text a smile in 30 s)

Answers:

- Margo, to 2: Your cousin's couch? I'm thirty-seven, Pedro. We go to mine.
- Margo, to 3: Yes. It's four blocks. Talk slowly.
- Remy, to 2: Is the couch the cousin's or yours? ...I don't care. Yes.
- Remy, to 3: It's far. Bed-Stuy far. Yes.

Good night (both): Pedro: Good night. (They go. Pedro walks home. One line on his stoop:) Pedro: Bacano. Bacano.

### INTIMATE BEAT (Settings "Intimate scenes: On")

Suggestive, never explicit, clothed, the camera stays outside.

- At the door: a kiss on the stoop (clothed, a held beat, 2 s). Margo laughs into it / Remy drops his keys.
- Margo: Get in before Mrs. Haynes sees you. She runs a newsletter.
- Remy: Mind the drum kit. It's everywhere. It's a lifestyle.
- They go in. The door closes. The camera stays on the stoop. A light comes on upstairs.
- Comic cut-away (pick per branch): a neighbour's cat sits down on the stoop and stares at the camera; a pigeon lands on
  the window ledge, looks in, and leaves immediately; a radiator clanks twice and somebody inside laughs.
- Sound: muffled laughter, music from a phone, then quiet. Fade.

### INTIMATE BEAT (Settings "Intimate scenes: Off")

- At the door, no kiss shown: Margo: Come on up. / Remy: Come on, then.
- The door closes. Plain fade to black.

### Morning after (both settings)

Margo's kitchen, 09:00:

- Margo: Coffee's bad. The book's on the table. Page ninety-one.
- Pedro: You read ahead?
- Margo: I wrote ahead. One page. Chapter two.
- Pedro: That is ten chapters to go.
- Margo: Don't count. Go home, DJ. I'm working at four.

Remy's flat, 09:00 (a drum kit in the kitchen):

- Remy: I made toast. It's a bit structural.
- Pedro: In Barranquilla, this is a weapon.
- Remy: Friday. If they give you the slot, I'll make it sound like a street.
- Pedro: There is no slot.
- Remy: Then I'll make it sound like a street anyway.

## No date (`pico.date.none`, if both are ignored until 23:00)

- Phone text, from Margo: Book's on the bar when you want it. No rush.
- Phone text, from Remy: Room still sounds wrong. Offer stands.
- Pedro (on the stoop, no subtitle prompt needed): Next week. I will be braver next week.

## Barks

- Regular (Glenda's): Margo's reading again. Don't order anything complicated.
- Regular (Glenda's): Glenda banned a priest in '96. Nobody knows why. She won't say.
- Passer-by (park, night): Nice night for it. For whatever it is.
