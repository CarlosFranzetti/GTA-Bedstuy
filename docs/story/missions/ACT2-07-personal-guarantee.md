# ACT2-07 Personal Guarantee (`pico-personal-guarantee`)

Who: Pedro. Where: Mothhouse's loading dock (venue `club`), Stavros's sound yard, a tail across the map to a members'
club roof terrace by the rail (Kyle's "office"). Hours: 04:30 to 08:00. Requires: `pico-shutter-down`, `pico-flip-week`.
Giver: Stavros (phone, 04:20, after a Friday Pedro did not play). Act 2.

## The scene

Stavros calls at 4:20 a.m.: his load-out crew quit, he has a truck and a bad back. Pedro goes, because Pedro always goes.
On the dock, Stavros is quieter than he has ever been. Kyle's car pulls out of the alley; Stavros asks Pedro, almost as a
joke, to follow it. Pedro does (a tail). It goes to a roof terrace by the rail, where Kyle meets Whit and the courier lead,
and Pedro watches through a fence as Kyle hands Whit an envelope and Whit hands Kyle a phone with a chart on it. Back at
the yard, Stavros tells the truth: the personal guarantee on Mothhouse's sound, his house in Bayside behind it, his wife
who does not know, Kyle who "owns him in a very friendly way". Stavros is not a villain. He is a man who loved a room and
mortgaged himself to it. And he cannot help Pedro now: Kyle has told him the Friday is Plush's party.

## Objectives (play terms)

1. Answer Stavros's call (phone).
2. Drive to Mothhouse's dock (goTo, in vehicle, by 05:00).
3. Load out: carry six speaker cases to Stavros's truck (collect at six points inside the club, item `case`; on foot).
4. Tail Kyle's car (tail, route across the map, speed 9 m/s, maxDistance 80, minDistance 15, the stealth rule: too close
   for 2.5 s and you are spotted).
5. Watch the roof (stakeout at the fence, 40 s, events: "Kyle hands Whit an envelope.", "Whit shows Kyle a phone. A chart.",
   "The courier lead laughs at something. Kyle doesn't.").
6. Drive back to the yard (goTo).
7. Talk to Stavros (talkTo).

## Fail states

- Spotted on the tail: `spotted`. "Kyle (text, to Stavros, which Stavros forwards): 'Your warm-up guy drives like a fan.'"
- Lost the tail: `lostTarget`. "Pedro: He drives like he owns the lights. He does own the lights."
- A case dropped hard more than 3 times (fragile `PA gear`): `cargoBroken`. "Stavros: That case was worth more than my car. My car is worth very little."

## Rewards

- $100 (Stavros pays the full amount for once, and the $100 he kept in Act 1: "I always meant to. Meaning is not paying.").
- Flag `pico.stavros.truth`. The phone pointer moves to ACT2-08.
- Toast: "Stavros paid you back. That is how you know it is bad."

## Dialogue

Step 1, Stavros:

- Stavros: Pedro. It's me. My crew left. My back is a disaster. Do you have the truck?
- Pedro: It is four in the morning.
- Stavros: Four is a beautiful hour. Nobody lies at four. They're too tired.

Step 3, the load-out (banter, at most four):

- Stavros: Lift with the legs. Not like me. I lift with regret.
- Stavros: This one is Kyle's. This one is Kyle's. That one is mine. It's the small one.
- Pedro: Who played tonight?
- Stavros: A man from Berlin with a laptop. He was very sad. He was paid very well.

Step 4, the tail (Stavros, on the phone, speaker on):

- Stavros: That's Kyle. Leaving. Follow him. As a joke.
- Pedro: As a joke.
- Stavros: A very quiet joke. Don't get close. He has cameras in his bumpers.
- Pedro (during the tail): Who has cameras in his bumpers?
- Stavros: People who are afraid of bumpers.

Step 5, the roof (Pedro, to himself):

- Pedro: That is Whit. That is the courier man. That is Kyle.
- Pedro: An envelope. A phone. A chart going down.
- Pedro: Kyle is not laughing. That is new.

Step 7, the yard (Stavros sits on a speaker):

- Stavros: You saw them.
- Pedro: You knew.
- Stavros: I knew a little. Then I knew a lot. Then I bought a nicer coat so I didn't have to know.
- Stavros: The sound in Mothhouse. Two hundred thousand. Kyle paid. I signed.
- Pedro: Signed what?
- Stavros: A personal guarantee. If the Fridays fail, I pay. With my house. In Bayside.
- Stavros: My wife thinks it's a regular mortgage. She's very smart. She's also very trusting. Bad combination.
- Pedro: Why tell me now?
- Stavros: Because Kyle says the Friday is Plush's party now. "Brand alignment."
- Stavros: There is no Friday for you, Pedro. I promised it. I can't give it.
- Pedro: You always say next month.
- Stavros: Next month is a direction. I was always pointing the wrong way.
- Stavros: Here. A hundred. And the hundred from the warm-up. I always meant to.
- Pedro: Meaning is not paying.
- Stavros: I know. That's why I'm paying.
- Pedro: Stavros. What if there was a night Kyle did not own?
- Stavros: There's no such room in Brooklyn.
- Pedro: Who said a room?

## Barks (dawn, near the dock; all adults)

- Regular (a street sweeper driver): Every morning, a truck full of speakers. Every morning, a guy with a bad back.
- Passer-by (jogger): Is the club closed? I need to use the bathroom. Is the club ever really closed?
