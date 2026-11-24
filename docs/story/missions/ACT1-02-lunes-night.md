# ACT1-02 Lunes Night (`pico-lunes-night`)

Who: Pedro. Where: Sabor a Lunes (venue `bar-dance`). Hours: offered 12:00 to 20:00; the set is at 21:00 to 23:00.
Requires: `pico-rent-money`. Giver: a call from Rafa (phone), the marker at Sabor a Lunes' door. Act 1.

## The scene

Monday. Sabor a Lunes is a red room with six regulars, a mirror ball with a crack in it and Rafa, who plays congas with
the confidence of a man who has never been told. The previous DJ played the same two hours every Monday for nine years
and moved to Florida. The regulars are older, dancers, couples. They do not want what Pedro thinks they want; they want
what they danced to when they met. Pedro's challenge is the first lesson of the game's DJ arc: read the room, then take
it somewhere. If he plays only "his" records (champeta, new things), the meter drops. If he plays their records first,
then slips one of his in, the meter pays double.

## Objectives (play terms)

1. Answer Rafa's call (phone line plays; objective completes on close).
2. Get your crate to Sabor a Lunes (goTo the door, any presence). Fragile cargo: records (`fragile`, hp 3): hard crashes
   in a car crack a record.
3. Talk to Rafa at the bar (talkTo inside, spot `bar-dance:bar`).
4. Wait until 21:00 (waitUntilHour 21 to 23, inside or at the door).
5. Play a three-minute set (djSet, venue `bar-dance`, minutes 3) with the crowd meter: the room's taste is salsa,
   cumbia, boogaloo, merengue; era 1965 to 1995; tempo band 90 to 110 BPM. Start meter 35. Fail floor: below 15 for
   20 s in a row. Target: finish above 60.
6. Talk to Rafa after the set (talkTo). Cash by meter (see Rewards).

## Fail states

- `cargoBroken`: "Rafa: You broke the records before the party. That is a new one."
- Crowd meter floor (`lowScore`): "The dancers sit down. Doña Carmen takes off her shoes. That is the end."
- `timeUp` at 23:00 if the player has not started the set: "Rafa plays the congas for two hours. Alone. He had a great night."

## Rewards

- $90 fee, plus tips: meter 60 to 79: +$20; 80+: +$50.
- Flag `pico.lunes.resident` if the meter ended at 60+: the Monday gig becomes repeatable (SIDE.md, "Gigs").
- Follow-up text (90 s later) from Stavros (number "from a friend of Rafa's"): the hook for ACT1-03.
- Toast: "First paid gig in New York. Ninety dollars. Pedro photographs the money."

## Dialogue

Step 1, Rafa on the phone:

- Rafa: Martinez? Odette says you are a DJ.
- Pedro: I am a DJ. Who is this?
- Rafa: Rafa. Sabor a Lunes. You know what that means?
- Pedro: Tastes like Monday.
- Rafa: Exactly. Tonight. Nine. Bring records, not a laptop.
- Pedro: How much?
- Rafa: Ninety and a plate.
- Pedro: What is on the plate?
- Rafa: Whatever is left. Come early.

Step 2, banter while driving (if in a vehicle):

- Pedro: Easy. Easy. Those are my uncle's kind of records.
- Pedro: Potholes in this city are a genre.

Step 3, at the bar:

- Rafa: You are younger than your voice.
- Pedro: You are older than yours.
- Rafa: Good. You can insult. Can you play?
- Pedro: I can play.
- Rafa: Listen. Six people come on Mondays. Six.
- Rafa: Doña Carmen and her husband. They met here in 1989.
- Rafa: The two brothers from the laundromat. Wilson. And a man nobody knows.
- Pedro: What does the man nobody knows like?
- Rafa: He likes to be left alone. He dances like a saint.
- Rafa: You play them what they love. Then you can play what you love.
- Pedro: And if they love what I love?
- Rafa: Then I will be very surprised, and I will pay you twenty more.

Step 4, banter while waiting (every 15 s):

- Rafa: The mirror ball has a crack. It is a feature.
- Pedro: In Barranquilla we would hang it from a mango tree.
- Rafa: In the Bronx we hung it from my cousin.
- Dancer: You're the new one? Don't play the fast stuff first. My knee.

Step 5, during the set (triggered by the meter; MISSIONS picks one line per trigger, at most one every 20 s):

- Meter rises past 50: Rafa: Ahí está. There it is.
- Meter rises past 70: Dancer: Okay, okay, okay. Who is this kid?
- Pedro plays a record outside the taste and the meter drops: Rafa: Mijo. What is this.
- Pedro: Trust me. Thirty seconds.
- The meter recovers within 30 s (double pay): Rafa: Coño. He was right. Don't tell him.
- Meter falls under 25: Dancer: My husband is checking his phone. My husband does not have a phone.
- Last 20 s: Pedro: One more. For Doña Carmen.

Step 6, after the set (lines by meter):

- If 80+:
  - Rafa: Twenty more. I said twenty. Here is fifty. Do not get used to it.
  - Pedro: I will get used to it a little.
  - Rafa: Every Monday. You want it?
  - Pedro: I want it.
  - Rafa: Somebody was asking about you. A Greek. He promotes. Be careful, he is nice.
- If 60 to 79:
  - Rafa: Good. Not a miracle. Good.
  - Rafa: Every Monday, if you want it.
  - Pedro: I want it.
  - Rafa: A Greek was asking about you. Careful, he is nice.
- If under 60 (but over the floor):
  - Rafa: You played for yourself tonight.
  - Pedro: I played for my uncle.
  - Rafa: Your uncle was not here. Doña Carmen was. Come back next Monday and try again.

Follow-up text, from Stavros:

- Stavros: Pedro! Stavros Yanos. Friend of Rafa. Beautiful set, I hear. I have a Friday. I need a beautiful man with a bag of flyers. Call me.

## Barks (bystanders on the avenue outside, 20:00 to 23:00)

- Passer-by: Salsa on a Monday? Who does that?
- Passer-by: That's Rafa's place. He'll sell you a drink and a story about 1987.
- Regular: If he plays the one with the trombone, I'm going in.

## Notes for MISSIONS

- The "outside the taste, recover in 30 s, pay double" rule is Pedro's special (BIBLE 4.1) and is taught here.
- Doña Carmen, her husband, the Wilson brothers and "the man nobody knows" are generic adult dancers in the room
  (CAST may reuse existing elders; all adults).
