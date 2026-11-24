# ACT1-06 Second Wind (`pico-second-wind`)

Who: Pedro. Where: Stavros's sound yard, Second Wind Boxing Club (venue `gym`, spots `gym:ring`, `gym:bags`). Hours:
08:00 to 20:00. Requires: `pico-clems-corner`. Giver: Stavros (phone), then Akira at the gym's shutter. Act 1.

## The scene

Stavros has rented two speakers and a mixer to a boxing gym for its open house, and he needs "a strong man with a
truck and no shame". The gym is Second Wind, Akira Tonaka's: an old body shop with one ring and a wall of rules. Akira
is short, dry, and fond of bad country music. He needs the speakers to work, because FORMWORK, the fitness chain that
wants his space, is sending "a wellness scout" to the open house, and Akira wants the place to sound alive. After the
gear is in, Akira offers Pedro two rounds of sparring as payment, "because cash is for people with cash". The sparring
is the game's melee teacher. The lesson Akira actually teaches is the line that runs through the whole story: "Pockets."
The best fight is the one you leave with your hands in your pockets.

If Pedro fought Clem, Akira has seen the video, and says so before the gloves go on.

## Objectives (play terms)

1. Answer Stavros's call (phone).
2. Pick up two speakers and a mixer at Stavros's yard (pickUp, in vehicle, items `speaker`, `speaker`, `mixer`;
   fragile `PA gear`, hp 4).
3. Deliver them to Second Wind (deliver, presence any).
4. Set up the sound: three presses at the booth table (interact, prompt "F  Plug in", presses 3).
5. Talk to Akira (talkTo `gym:ring`).
6. Spar round 1 (a melee bout with Akira inside the ring; Akira teaches block and jab: the existing combat with a
   "sparring" rule: damage is stamina only, nobody bleeds, the round ends at 45 s or on three clean hits either way).
7. Spar round 2 (Akira teaches the step-back: the round ends when Pedro steps out of a combination three times).
8. Talk to Akira by the bags (talkTo `gym:bags`). The rule.
9. Optional: the FORMWORK scout arrives; reply picker (two lines) for Akira's sake. Not required.

## Fail states

- `cargoBroken` (the PA gear): "Akira: That speaker had one job. Now it has none."
- Lose round 1 or round 2 (Akira lands three clean hits): not a fail; Akira lets you go again ("Again. You were thinking.").
- Hit Akira with a weapon: `copsCalled`-style fail with the line "Akira: Out. Come back when you're a boxer."

## Rewards

- $0 cash ("cash is for people with cash"); the gym unlocks (SIDE.md, "Gym"): free training, stamina +5 per session.
- A stamina boost now (+10) and the "step-back" move named in the controls hint.
- Akira's number.
- Toast: "Two rounds with a pro. You lost both. You learned one thing."

## Dialogue

Step 1, Stavros on the phone:

- Stavros: Pedro, my friend! You have the truck?
- Pedro: I have a truck.
- Stavros: Beautiful. Two speakers and a mixer to a boxing gym.
- Pedro: How much?
- Stavros: The man will pay you in experience.
- Pedro: I have a lot of experience. I do not have a lot of money.
- Stavros: Then today you will have more experience. Go.

Step 2, at the yard (banter while loading):

- Pedro: Speakers are heavier when they are not yours.
- Pedro: My uncle used to say a speaker is a fridge that sings.

Step 3, banter while driving:

- Pedro: Gently. Gently. Like a sofa with feelings.

Step 4, setting up (a line per press):

- Pedro: Power.
- Pedro: Mixer.
- Pedro: And... nothing. Ah. The other power.

Step 5, Akira:

- Akira: You're the truck.
- Pedro: Everybody calls me the truck this week.
- Akira: Akira. This is my gym. Don't film anything.
- Pedro: Pedro. I don't film. I play records.
- Akira: Same thing, for the people who film.
- (Only with `pico.clem.fought`:)
  - Akira: I saw your video. With the old man.
  - Pedro: It was not what it looks like.
  - Akira: It looked like a young man hitting an old man.
  - Pedro: ...It was what it looks like.
  - Akira: Okay. Then we have something to work on.
- Akira: Stavros said I'd pay you.
- Pedro: In experience.
- Akira: I don't have cash. I have two rounds. Gloves on.

Step 6, round 1 (Akira coaches; one line every 8 to 10 s, and one when a hit lands):

- Akira: Hands up. Your face is not a rumour.
- Akira: Jab. Short. You're knocking, not moving in.
- Akira: Block. Elbows in. Like you're carrying records.
- Akira (when Pedro lands one): There. You felt that? Do it again but meaner.
- Akira (when he lands one): That's the lesson. That's all it is.
- Pedro: You are very fast for an old man.
- Akira: I'm forty-four. You're slow for a young one.

Step 7, round 2:

- Akira: Now I'm going to throw three. You don't block. You leave.
- Pedro: Leave?
- Akira: Step back. Out of range. Go on.
- Akira (after the first step-back): Good. Again.
- Akira (after the second): See? You can't lose a fight you're not in.
- Akira (after the third): That's it. That's the whole sport. Everything else is shopping.

Step 8, by the bags:

- Akira: You know what my coach told me?
- Pedro: Hands up?
- Akira: Pockets.
- Pedro: Pockets?
- Akira: The best fight is the one you leave with your hands in your pockets.
- Akira: Walk out with your hands in your pockets, and they don't know if you're scared or dangerous.
- Pedro: Which one are you?
- Akira: Hungry. Usually. You want a burrito? It's from the gas station. It's fuel.
- Pedro: In Barranquilla we would call that a crime.
- Akira: In Sacramento we call it Tuesday.

Step 9, optional, the FORMWORK scout (a generic adult in athleisure; speaker `Passer-by` or a CAST extra named
`FORMWORK Scout`):

- FORMWORK Scout: Love the energy here. Very raw. Very pre-optimised.
- Reply picker, Pedro:
  - 1 "It is a gym. People hit bags." (Akira: That's the mission statement.)
  - 2 "You should see the waitlist. Three years." (Scout: Oh! Oh. Okay. I'll note that. Akira, later: There's no waitlist. Thanks.)
- FORMWORK Scout: Your body is a portfolio, you know?
- Akira: My body is a rental. The landlord's a bad one. Thanks for coming.

## Barks (gym regulars; all adults)

- Regular: Akira, the speed bag is making that noise again.
- Regular: Put the weights back, Frank! It's on the wall! It's literally on the wall!
- Ms. Viola (Regular, 70): I've been coming here nine years. I could take that DJ.

## Notes for MISSIONS

- Sparring needs a "stamina-only" damage rule for one opponent (no blood, no knockdown beyond a stagger). If the combat
  system cannot do this cleanly, make the rounds talkTo plus timed `interact` presses at the bag (block, jab, step back)
  and keep the lines.
- Ms. Viola is an extra; she can reuse an elder from the existing roster.
