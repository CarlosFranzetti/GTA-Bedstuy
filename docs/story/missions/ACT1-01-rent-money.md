# ACT1-01 Rent Money (`pico-rent-money`)

Who: Pedro. Where: Yesenia's stoop (the player's home spawn), then WAX DELI. Hours: any, 9:00 to 20:00 (the shop's hours).
Requires: the tutorial done (or skipped). Giver: Yesenia, at the home stoop. Act 1.

## The scene

Morning. Pedro on his cousin's stoop with a coffee from Troop Deli and $120 in an envelope marked RENT in Yesenia's
handwriting. Yesenia leaves for work and reminds him, twice, what the envelope is for. Then WAX DELI texts the whole
neighbourhood: a dead collector's Latin crates came in. Pedro walks there "just to look". He does not just look.
Ms. Odette watches him spend the rent and, instead of a lecture, gives him a phone number: Rafa, at Sabor a Lunes, needs
somebody for Monday. The joke is that the player is complicit: the game hands you the envelope as the stake.

## Objectives (play terms)

1. Talk to Yesenia on the stoop (talkTo, `npc: Yesenia`). She hands over the envelope (stake $120, item `envelope`).
2. Read the text from WAX DELI (phone; the objective completes when the message is opened or after 8 s).
3. Walk to WAX DELI (goTo, on foot; the HUD says "Just to look").
4. Walk inside (enterInterior, the deli).
5. Browse the Latin bin and buy two records: "Cumbia del Malecón" and "Salsa Para Lavar Platos" (buy; new parody
   records, see Notes). Together they cost $110: Pedro has exactly enough rent.
6. Optional, not required to finish: press F on the sleeve of "Brooklyn Lights" in the disco bin to read the back
   (sets `pico.sleeveCredit`). The HUD shows: "Bass: Clement Ashy" (sic). Ms. Odette: "Ashby. They spelled him wrong."
7. Talk to Ms. Odette at the counter (talkTo). She gives Rafa's number (a contact appears on the phone).
8. Walk out (exitInterior). Yesenia's text arrives on the sidewalk.

## Fail states

- Leave the shop before buying, then walk more than 150 m away: "You walked off with the rent intact. Who are you?"
  (fail joke; retry from the door). Rare; the mission is a walk.
- Shop closes (20:00) before step 5: `clockUp`. Retry hint: "WAX DELI opens at nine."

## Rewards

- Two records in the crate (they count for the crowd meter's "cumbia" and "salsa" tags in ACT1-02).
- Rafa's number. $10 change left in the envelope. The rent is now a problem Act 1 has to solve (ACT1-05 pays it).
- Toast: "Two records, ten dollars, zero regrets. Yet."

## Dialogue

Step 1, on the stoop:

- Yesenia: Pedro. Look at me.
- Pedro: I am looking.
- Yesenia: This is the envelope.
- Pedro: I know what an envelope is, prima.
- Yesenia: What does it say on it?
- Pedro: R-E-N-T.
- Yesenia: And what does it not say?
- Pedro: Records.
- Yesenia: Records. Good. The landlord comes at six.
- Pedro: At six. Bacano. I will be here.
- Yesenia: You said that in March.
- Pedro: In March I was here. I was asleep, but I was here.
- Yesenia: I love you. Do not make me sell your couch.
- Pedro: It is your couch.
- Yesenia: That is why I can sell it.

Step 2, the text (phone, from WAX DELI):

- WAX DELI: Collector's estate in today. Latin, disco, two crates of things I cannot pronounce. Come early. O.

Step 3, banter while walking (one line every 12 s):

- Pedro: Just to look.
- Pedro: Looking is free. Looking is a human right.
- Pedro: I will keep my hands in my pockets. Like Akira says. Who is Akira? I do not know yet. Somebody says it.

(The third line is a fourth-wall wink; MISSIONS may cut it if it reads wrong before Akira is met. Replace with:
"Pedro: Hands in pockets. Like a gentleman.")

Step 4, entering:

- Ms. Odette: Good morning. You have the face.
- Pedro: Which face?
- Ms. Odette: The face of a man holding an envelope.

Step 5, at the bin (banter as he browses):

- Pedro: ¡Ajá! Look at this. My uncle played this one every Sunday.
- Pedro: Ninety dollars? For this? For this, ninety is a gift.
- Ms. Odette: That one is fifty. You are reading the price of the frame behind it.
- Pedro: Fifty. Even better. I am saving money.
- Pedro: And this one. Salsa for washing dishes. A classic.
- Ms. Odette: That is the title. It is not a review.

Step 6, the sleeve (only if the player presses F on it):

- Pedro: "Bass: Clement Ashy." Who is Clement Ashy?
- Ms. Odette: Ashby. They spelled him wrong. He played on half the disco in that bin.
- Pedro: Is he still playing?
- Ms. Odette: He is still alive. That is not always the same thing.

Step 7, at the counter:

- Ms. Odette: One hundred and ten. Exactly what is in your envelope, minus ten.
- Pedro: How do you know what is in my envelope?
- Ms. Odette: The envelope is open, my dear.
- Pedro: Qué vaina. Okay. Here.
- Ms. Odette: I will not lecture you.
- Pedro: Thank you.
- Ms. Odette: Your cousin will. I will give you a number instead.
- Ms. Odette: Rafa, at Sabor a Lunes. He needs somebody for Monday.
- Pedro: Monday? Nobody goes out on a Monday.
- Ms. Odette: That is why he needs somebody. Go be somebody.

Step 8, outside, the text (phone, from Yesenia):

- Yesenia: The landlord moved it to Friday. You have until Friday. Do not tell me anything. I can feel it from here.

## Barks (bystanders near WAX DELI)

- Passer-by: They got sandwiches in there or not?
- Passer-by: Every time I walk past, somebody comes out poorer and happier.
- Regular: Odette, put the jazz back on, I'm trying to think.

## Notes for MISSIONS and the record shop

- Three new parody records: "Cumbia del Malecón" (tags: cumbia, 1970s, 96 BPM band), "Salsa Para Lavar Platos" (salsa,
  1980s, 100 BPM), "Brooklyn Lights" (disco, 1981, 118 BPM; sleeve credit "Bass: Clement Ashy"). Artists invented:
  Los Hermanos Arenal, Orquesta La Plancha, The Fulton Street Ensemble (names not checked). These are the IN-GAME sleeves
  only: if the record shop needs playable audio, use the existing openly licensed or synthesised tracks under these
  parody sleeves (rule 4, records note in MEMORY.md); nothing here asks for a real recording.
- The stake: hand the $120 at step 1 (`stake`), price the two records at $110 total.
