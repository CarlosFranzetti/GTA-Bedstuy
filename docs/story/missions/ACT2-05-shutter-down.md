# ACT2-05 Shutter Down (`pico-shutter-down`)

Who: Pedro. Where: the Plush van lot, three drop doors, Second Wind Boxing Club (venue `gym`, the shutter). Hours: 22:00
to 04:00. Requires: `pico-pockets`. Giver: Whit's text. Act 2.

## The scene

The rent, the lawyer's letter or the lost Friday (whichever the player earned) puts Pedro back in the grey fleece for
"one more run". Whit sends a bigger route: three drops, one of them a "VIP" in a building with a doorman. The second door
is a stake-out: two plain-clothes officers in a parked car across the street, waiting for whoever Plush sends. Being
SEEN is what costs (owner, 24 Nov): if Pedro reads the street and skips the door, he loses the box's pay and nothing
else; if he hands it over in front of them, it goes wrong. Either way the heat comes on the third door (a patrol car turns
into the block), and Pedro runs to the only place he trusts: the gym. Akira pulls the shutter down and hides him, and
then he sees the grey box on the bench. Akira does not shout. That is worse.

## Objectives (play terms)

1. Read Whit's text; pick up three boxes at the van lot (pickUp).
2. Door 1 (deliver; unseen by design: a quiet street).
3. Door 2: a stakeout objective first (stakeout 20 s across the street, `events` toasts: "A parked car. Engine running.",
   "Two people in it. Not talking. Not on their phones."). Then a fork:
   - "Skip it" (walk away; the box stays in the truck; flag `pico.door2.skipped`; −$60 at pay),
   - "Deliver anyway" (deliver; SEEN: heat +100, a star; the officers get out).
4. Door 3 (deliver; a patrol turns in: if already at a star, it joins the chase; if not, heat +60 when Pedro is within
   25 m: the player can still choose to drive past).
5. Escape: get to Second Wind (goTo the shutter, any presence) with any stars (the existing chase rules).
6. Inside the gym: stay 30 s with the shutter down (stakeout inside `gym:ring`, slack 0) while Akira talks. With 3 stars
   the shutter does not help (SIDE.md 5): lose the stars first, then come back.
7. Talk to Akira (talkTo, the bench).

## Fail states

- BUSTED with boxes: the existing bust flow; boxes and the night's cash taken; "Whit: Company property, bro. You owe us."
  (−$100 next run, flag `pico.plush.busted`). The mission fails and can be retried the next night.
- Wasted: wake at Wexcombe; Adele has a line ("You again. Sit. Don't tell me what you were carrying."). Mission fails.

## Rewards

- Pay for the boxes delivered ($60 each, Whit's lead pays the next morning at the lot).
- Flag `pico.akira.knows`; Akira's trust −1. Yesenia's text: the couch is "not safe for this".
- Toast: "The shutter is down. The gym smells like rain. Akira is not looking at you."

## Dialogue

Step 1, Whit's text:

- Whit: Big night, champ. Three drops, one VIP. Doorman building. Wear the nice fleece.

Step 2, door 1 (a man in a dressing gown and a fitness watch, `Regular`):

- Regular: You're four minutes late. My watch says my stress is up eight percent.
- Pedro: (walking away) His watch. His watch is stressed. Okay. Okay.

Step 3, door 2, across the street:

- Pedro: That car has been there since I turned in.
- Pedro: Engine on. Two guys. Nobody is on their phone. Nobody in New York is not on their phone.
- Skip it: Pedro: No. Not this one. Whit can deliver his own candles.
- Deliver anyway: Pedro: Fast. In and out. Like a sofa.
  - Officer (`Regular`): Hey! You! Plush! Stay right there!
  - Pedro: Mierda.

Step 4, door 3 (the doorman, `Bouncer`):

- Bouncer: Plush? Service entrance. Around the back. With the trash.
- Pedro: With the trash.
- Bouncer: VIPs don't meet the vans, man. They meet the box.

Step 5, the chase (banter; at most three):

- Pedro: Akira's. Akira's. Akira's.
- Pedro: Hands in pockets. Hands on the wheel. Hands somewhere.
- Pedro: If I get out of this I will deliver only furniture. Forever.

Step 6, inside, shutter down (Akira; lines every 8 s):

- Akira: In. Down. Don't talk.
- (the shutter rattles; blue light on the gap under it for a few seconds; then gone)
- Akira: They went past.
- Akira: You're dripping on my ring.
- Pedro: It is raining.
- Akira: It's not raining.

Step 7, the bench (the grey box is on it):

- Akira: That's a Plush box.
- Pedro: It is candles.
- Akira: Some of it is candles.
- Pedro: How do you know that?
- Akira: Everybody on this avenue knows that.
- Akira: I had a guy at this gym. Twenty-six. Fast hands. He drove for an app like that.
- Akira: He does eighteen months now. The app has a new logo.
- Pedro: I needed the rent.
- Akira: I know. I'm not your father. I don't have a speech.
- Akira: I just don't want to visit you anywhere with a glass wall.
- Pedro: ...Pockets.
- Akira: Pockets is for fights. This isn't a fight. This is a job you can quit.
- Akira: Sleep on the mat. The shutter opens at six. Ms. Viola comes at six oh one.

Yesenia's text (the next morning):

- Yesenia: Two men in a car asked the super about "the guy with the truck". Pedro. My couch is not safe for this. I love you. Fix it.

## Barks (night street)

- Passer-by: Grey van, blue lights. Every night now. Like a show.
- Regular: That gym's shutter goes down, that means Akira's mad or Akira's asleep.
- Passer-by: I ordered socks from Plush once. They came at three a.m. with a guy who wouldn't look at me.
