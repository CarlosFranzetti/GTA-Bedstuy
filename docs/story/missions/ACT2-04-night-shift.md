# ACT2-04 Night Shift (`pico-night-shift`)

Who: ADELE (her first mission as the player; the switch unlocks). Where: Wexcombe Medical Center (the existing landmark),
the bakery on Lewis Avenue, a cab stand, Ironside Station House's front steps, The Milk Run (venue `afterhours`). Hours:
the mission runs 04:00 to 10:00 game time. Requires: `pico-last-mile`. Giver: the switch scene. Act 2.

## The scene

The switch: the camera finds Adele at 04:00 in the emergency department, on the twelfth hour of a twelve-hour shift.
She becomes the player. Her way through the world is people and time: she sees who is hurt and can help them (F to treat),
police hold off on her, she never needs a gun. The shift's last two patients: an older man who fell on ice (comic, sweet),
and a twenty-four-year-old Plush courier in a grey fleece who came off his e-bike with a sealed grey box strapped to it
that he will not let go of. Adele does not open it. She reads the logo. Then she clocks off and does the thing she does
once a month: throws Night Shift, a party at 8 a.m. for people who work nights, at The Milk Run. This month the DJ
cancelled. Rafa gave her a number: Pedro's. The party is the best set Pedro has played so far, because tired people forgive.

## Objectives (play terms)

1. Switch scene (letterbox). Adele is the player, in scrubs, inside Wexcombe.
2. Treat patient 1 (interact at bed 2, prompt "F  Check him", presses 2).
3. Treat patient 2, the courier (interact at bed 4, presses 3; a reply picker of two lines in the middle).
4. Clock off (goTo the staff door; the HUD shows the time, 05:00).
5. Promotion round, morning version (handFlyers with a short list: 8 flyers to be taken by night workers only: the
   bakery's back door, the cab stand, a security guard at a bank, two officers at Ironside's steps; each spot is a talkTo
   with one line and one flyer; the generic handFlyers also counts adult passers-by in uniforms or work clothes).
6. Call Pedro (phone) and book him (a two-line reply picker on the fee: "$120 and breakfast" or "$80 and the good
   breakfast"; both accepted).
7. Get to The Milk Run by 07:30 (goTo, Adele's hatchback).
8. Set up: coffee urn on (interact), chairs out (interact, presses 3).
9. The party (stakeout at `afterhours:floor`, 8:00 to 9:30 compressed to about 3 real minutes): Adele works the room.
   Three guests need something (one is asleep standing up, one is crying because her shift was bad, one is a cab driver
   who wants to request a song from 1983): interact with each. Meanwhile Pedro's set runs in the background with the
   crowd meter (it is not the player's set; the meter rises with every guest Adele looks after).
10. Close: talk to Pedro at the booth (talkTo).

## Fail states

- Late to The Milk Run (07:30): `timeUp`. "Adele: Twelve hours of shift, and I'm late to my own party. Classic."
- Crowd meter under 20 at the end (guests left untended): `lowScore`. "A baker falls asleep on the coffee urn. The party
  ends with a nap. Honestly, also a win."

## Rewards

- Adele playable. Flags `pico.adele.plush` (she knows the name), `pico.nightshift.done`. Pedro's "name" +2. Pedro is paid
  by Adele ($120 or $80, as booked; the player's cash is Adele's for this mission and her own wallet afterwards).
- Toast: "Forty people who work while the city sleeps danced at nine in the morning. The sun was very confused."

## Dialogue

Step 1, the switch:

- Adele: Hour twelve. Coffee number five.
- Adele: My mother did this for thirty years. She said it builds character.
- Adele: My character is now ninety percent vending machine.

Step 2, bed 2 (an older man, speaker `Regular`):

- Regular: I slipped on the ice, nurse. In front of the whole bus stop.
- Adele: Anything broken?
- Regular: My pride. And my thermos.
- Adele: Your wrist is fine. The thermos didn't make it. I'm sorry for your loss.
- Regular: It was a good thermos. Forty years.
- Adele: Longer than most marriages.
- Regular: Longer than both of mine.

Step 3, bed 4 (the courier, speaker `Courier`; an adult, 24):

- Courier: I'm fine. I'm fine. I need to go, I have a delivery.
- Adele: You have a cut on your head and a box on your chest.
- Courier: The box is fine.
- Adele: I didn't ask about the box.
- Reply picker (Adele):
  - 1 "What's in it?" → Courier: Candles. Some of it's candles. — Adele: (reads the logo) Plush. Of course.
  - 2 "Who sends you out on ice at four a.m.?" → Courier: The app. The app doesn't know about ice. — Adele: The app should meet the ice.
- Courier: If I'm late they dock me. If I lose it, I pay for it.
- Adele: If you leave with a concussion, you pay for that too. Ten minutes. Sit.
- Courier: Are you going to call the cops?
- Adele: I'm going to call it a head wound. Ten minutes.
- (after the presses) Adele: Go slow. Walk the bike. And find a different app.
- Courier: There's no different app. They're all this app.

Step 4, the staff door:

- Adele: Clocking off. Day shift, good luck. Bed 9 is a poet. Do not encourage him.

Step 5, the morning flyers (one line at each):

- Bakery back door (Teodor, if CAST has him; else `Regular`): A party at eight? I'm still kneading at eight. ...I'll come at nine.
- Cab stand (Junior, the dollar-van driver; else `Regular`): Adele! Night Shift again? I'll bring the guys. And the van.
- Bank security guard (`Regular`): A party for us? Nobody throws a party for us. I'm there.
- Ironside's steps (Sgt. Kowalski): Is there coffee? Then it's a community event and I'm required to attend.
- Ironside's steps (an officer, `Regular`): Is it loud? — Adele: It's eight in the morning. It's as loud as it wants.

Step 6, calling Pedro (phone):

- Adele: Pedro? It's Adele. From the hospital. (or: You don't know me. Rafa gave me your number.)
- Pedro: Adele. Yes. The hand.
- Adele: I need a DJ for a party.
- Pedro: Tonight?
- Adele: This morning. Eight.
- Pedro: Eight... at night?
- Adele: Eight in the morning. For people who work nights.
- Pedro: ...That is the best idea I heard in New York.
- Reply picker (fee):
  - 1 "$120 and breakfast." → Pedro: Bacano.
  - 2 "$80 and the good breakfast." → Pedro: How good?
    - Adele: Filipino breakfast. My aunt makes it. Garlic rice.
    - Pedro: For garlic rice I play for free.
    - Adele: Eighty. I'm not a promoter.

Step 7, banter while driving (hatchback):

- Adele: Hospital parking permit. Valid at the hospital. Nowhere else in the universe.

Step 9, the party (Adele's guests; one exchange each):

- Guest asleep standing (`Regular`): (snores) — Adele: Chair. Sit. Dance sitting down. It counts.
- Guest crying (`Regular`, a nurse from another hospital): I lost one tonight. — Adele: I know. Me too, last month. Sit with me one song. Then dance one song.
- Cab driver (Junior or `Regular`): Tell him to play something from '83! — Pedro (from the booth): Which month? — Regular: ...He's good.
- Pedro (booth, banter as the meter climbs): Good morning, night people!
- Pedro: This one is for everybody who drove a stranger home.
- Pedro: This one is for the bakers. You smell incredible.

Step 10, at the booth:

- Pedro: That was... I have never played to happier tired people.
- Adele: They're not happy. They're relieved. It looks the same at nine a.m.
- Pedro: You did this every month? Alone?
- Adele: With a playlist. And my aunt's rice.
- Pedro: Next month, me. Not a playlist.
- Adele: Eighty dollars.
- Pedro: Eighty dollars and the rice.
- Adele: Pedro. A young guy came in tonight. Twenty-four. A Plush courier. He fell on the ice.
- Pedro: (quiet) Is he okay?
- Adele: He'll be fine. This time. You know those vans?
- (if `pico.plush.courier`) Pedro: ...I know the vans.
- (otherwise) Pedro: Everybody knows the vans.
- Adele: Then tell everybody to be careful on the ice.

## Barks (night workers, all adults)

- Regular: Party at eight a.m.? Finally, my schedule.
- Regular: I've been awake so long, this is technically last night.
- Passer-by (commuter, outside): Is that a party? At nine? On a Tuesday? Who ARE these people?
