# ACT2-02 Door Policy (`pico-door-policy`)

Who: LANA (her first mission as the player: the character switch unlocks). Where: Second Act Thrift, Doña Marisol's
laundromat, Mothhouse's door (venue `club`, `club:door`) and the toilet queue inside. Hours: thrift 10:00 to 17:00, the door
from 22:00. Requires: `pico-last-mile`. Giver: Bash's text to Lana. Act 2.

## The scene

The switch: the camera finds Lana on her fire escape hemming a stranger's trousers for $15, and she becomes the
player. Bash, Mothhouse's head of door, has a problem: Kyle wants the door team "on brand" for Friday, and the door team
is four men who dress like they are moving a fridge. Bash asks Lana to dress them, for $200, and then to stand at the
door with him for an hour, because Kyle has also invented a guest list app that does not work. Lana's way through the
world is her eye: she wins by knowing what things are worth and who people are. At the door, she decides who gets in,
in a reply picker per guest, and the room changes with her choices. In the toilet queue she sees two grey-fleece Plush
couriers working the line, and one of them is Pedro's truck's keys on a lanyard she would recognise anywhere: Pedro.

## Objectives (play terms)

1. The switch scene (a short letterbox beat; the character becomes Lana).
2. Read Bash's text (phone).
3. Thrift rack for four people (thrift, Lana's version: 8 slots, she sees true kinds and fakes). Budget $200 from Bash.
   Target: four outfits whose kinds match the "door" taste (dark, workwear or formal, boots; no sportswear) within $120.
   Lana keeps the change (her shop fund).
4. Alterations at Doña Marisol's (interact, prompt "F  Take in the seams", presses 4).
5. Deliver the garment bags to Mothhouse's door before 22:00 (deliver, in vehicle: Lana's borrowed van).
6. Work the door for an hour (stakeout at `club:door`, 60 game minutes compressed to about 3 real minutes) with a guest
   reply picker: 6 guests arrive; for each, choose "In", "Not tonight" or (Lana only) "In, but fix the collar".
   Each choice moves the room's "mix" meter (BIBLE: a room full of only one kind of person peaks and dies).
7. Walk to the toilet queue inside (goTo) on Bash's request ("check the queue, it's moving too fast").
8. See the couriers (timer 6 s with a letterbox beat; Pedro is one of them only if `pico.plush.courier`; otherwise it
   is two strangers and Lana recognises the Plush fleece from the vans).
9. Leave and text Pedro (interact with the phone).

## Fail states

- Thrift budget over $200: refused at the till (no fail).
- Door taste wrong (three or more sportswear pieces): `lowScore`, "Bash: My guys look like a gym ad. Again, please."
- Mix meter under 20 at the end of the hour: `lowScore`, "Bash: The room is all one guy. Forty copies of one guy."

## Rewards

- $200 from Bash minus what she spent; Lana's shop fund starts (a counter on her phone; Act 3 spends it).
- Lana becomes playable (switch from the phone's contacts: Pedro, Lana; Adele follows in ACT2-04).
- Flag `pico.lana.door`; flag `pico.lana.sawPedro` if Pedro was in the queue.

## Dialogue

Step 1, the fire escape (switch beat):

- Lana: Fifteen dollars to take in a waist. Nobody takes in waists anymore.
- Lana: They buy new trousers. Like animals.

Step 2, Bash's text:

- Bash: Lana. Kyle wants the door "on brand". My guys look like a removal company. $200. Please. I am begging in a calm voice.

Step 3, the thrift (Lana's appraisal, more confident than Pedro's; a line per garment looked at, at most four):

- Lana: Black workwear. Bash will look like a poet who lifts.
- Lana: Fake. The tag is in the wrong place. Nice try, church.
- Lana: A good overcoat. Every bouncer deserves one good overcoat.
- Lana: Boots. Real leather. Somebody's grandfather walked to work in these.
- Lana (on a sportswear piece): No. The door is not a gym.

Step 4, Doña Marisol's:

- Doña Marisol: Lana! Who are these for? They are enormous.
- Lana: Doormen.
- Doña Marisol: Ah. Enormous and sad. Give me the sleeves.
- Lana: I can do it.
- Doña Marisol: You can do it. I can do it faster. Sit.

Step 5, at the door:

- Bash: You're a miracle.
- Lana: I'm a professional. It looks similar from the outside.
- Bash: Kyle made an app for the list. It doesn't open.
- Lana: Then we use the oldest app. A face.

Step 6, the guests (one line from each guest, then Lana's choice; at most one comment from Bash per choice):

- Guest 1, a regular dancer from Sabor a Lunes in his best shirt (Dancer): Rafa says this place is nice. Is it nice?
  - In: Bash: Welcome, sir. (+mix)
  - Not tonight: Dancer: Okay. Okay. I'll go back to Rafa's. (−mix)
- Guest 2, a man filming himself (Passer-by): Hey guys, live from the line, rate the door one to ten—
  - In: (−mix, +line) Bash: He's going to film the toilets.
  - Not tonight: (+mix) Lana: Not tonight. Your phone can go in alone.
- Guest 3, two nurses straight from a shift, in scrubs under coats (Regular): Are scrubs allowed? We've been up nineteen hours.
  - In: (+mix) Bash: Scrubs are formalwear here.
  - In, but fix the collar: (+mix, +5) Lana: Coat open. Badge off. You look like a film.
- Guest 4, one of Kyle's investors (Passer-by): I'm with Kyle. Like, with with.
  - In: (+0) Lana: Of course you are.
  - Not tonight: (+mix, flag `pico.lana.kyleSnub`) Bash: Lana. Lana. He's with with. — Lana: He'll be with with outside.
- Guest 5, an older couple who say they danced in this building when it was a factory party in 1984 (Regular):
  - In: (+mix) Regular: We used to stack boxes over there. Then dance on them.
- Guest 6, a man in a perfect vintage coat who is a dealer of vintage coats (Passer-by): Is that a 1970s Loden?
  - In: (+mix) Lana: It is. Is yours a 1990s copy?
  - Passer-by: ...Yes.
  - Lana: Good copy. Come in. We'll talk.

Step 7 and 8, the toilet queue:

- Bash: Check the queue for me? It's moving too fast. Queues never move fast.
- (Lana walks; two men in grey fleeces move along the queue.)
- If `pico.plush.courier`:
  - Lana: Grey fleece. The vans.
  - Lana: ...And those are Pedro's keys. Of course they are.
  - Lana: Bozhe moi. You idiot.
- Otherwise:
  - Lana: Grey fleece. The vans. Inside the club.
  - Lana: Bash. Your queue is a shop.

Step 9, the text:

- If Pedro was there: Lana (text): I saw you at Mothhouse. In the fleece. It does not suit you. Call me tomorrow.
- Otherwise: Lana (text to Bash): Your toilets have a delivery service. You know who. I didn't see anything. I saw everything.

## Barks (the line; all adults)

- Passer-by: Who's the woman at the door? She looked at my shoes and I apologised.
- Dancer: The bouncers look good tonight. Like, editorial.
- Passer-by: There's an app for the list? Does it work? It doesn't work.
