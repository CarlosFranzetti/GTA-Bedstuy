# ACT1-05 Size Medium, Vintage (`pico-size-medium`)

Who: Pedro (Lana rides with him). Where: Second Act Thrift (St. Osric's basement), two resale stoops in different
neighbourhood zones, the street outside Tincture & Ledger (venue `bar-lounge`). Hours: 10:00 to 19:00 (the thrift closes
at 17:00; resale until 19:00). Requires: `pico-clems-corner`. Giver: Yesenia's text, then Lana at the thrift's door. Act 1.

## The scene

Friday is two days away and the rent is $110 short (ACT1-01). Yesenia texts a lead: a woman at the church thrift needs
"a man with a truck". The woman is Lana Porskaia, a stylist with a good eye and no vehicle, waiting on the steps with
four garment bags and a face that has already decided Pedro's jacket is a mistake. She needs a ride; he needs money.
Lana teaches the thrift-and-flip system: the same jacket is worth $8 in one zone and $60 in another, because "taste is
a postcode". She is right about everything and annoying about all of it, and she saves his rent.

If Pedro fought Clem (`pico.clem.fought`), the mission opens at Wexcombe Medical Center with three lines between Pedro and
Adele (first meeting) before Yesenia's text.

## Objectives (play terms)

0. (Only with `pico.clem.fought`) A short scene at Wexcombe Medical Center: talkTo Adele (3 lines), then walk out.
1. Read Yesenia's text (phone).
2. Drive the moving truck (Bluebird Movers' working one, or any car) to Second Act Thrift (goTo, in vehicle).
3. Talk to Lana on the steps (talkTo).
4. Thrift rack: buy up to 4 pieces from a rack of 8 (thrift). Pedro has his $10 change plus $40 Lana lends him ("a loan,
   not a gift: write it down"). Lana's hint line appears on each garment when looked at (her appraisal).
5. Sell the pieces at resale spots. Three are marked: the Throop stoop sellers (zone `stoop`: likes workwear, sportswear),
   a vintage reseller's van by Thistledown Park (zone `park`: likes 1990s outerwear, denim), and the sidewalk outside
   Tincture & Ledger (zone `lounge`: likes "statement" coats, anything Lana calls "archive"). Sell (existing sell flow,
   press F at the buyer) for the zone's price. Target: $160 total from sales (to repay Lana $40 and have $110 rent + $10).
6. Pay Lana back $40 (pay at Lana).
7. Drive home and pay Yesenia $110 (pay at the stoop).

## Fail states

- Thrift closes (17:00) before step 4: `clockUp`. "Lana: The church closes at five. God keeps office hours."
- Sales under $160 when all four pieces are sold: `lowScore`. "Lana: You sold a 1994 jacket to the 2019 people. Again."
  (Retry: the rack restocks the next day.)
- Ruin the cargo (more than 4 hard impacts with the garment bags in the truck): `cargoBroken`. "Lana: That was silk. It
  is now a theory."

## Rewards

- Rent paid (`pico.flip.ok`). Lana's number. Lana's flips unlock as a side activity (SIDE.md, "Flipping").
- Whatever is left over after rent and the loan (often $10 to $60).
- Toast: "Rent paid. Lana says your jacket is still a mistake."
- Follow-up text from Lana (60 s): "You have a good eye for people and a bad eye for collars. Call me when you have the truck again."

## Dialogue

Step 0, only after a fight (Wexcombe Medical Center, Adele in scrubs):

- Adele: You hit a sixty-one-year-old man.
- Pedro: He hit me first.
- Adele: He says the same thing. He's in bed four. He's fine.
- Adele: He asked for your record collection, as compensation.
- Pedro: Which records?
- Adele: All of them. Hold still. This will sting, and you deserve it.

Step 1, Yesenia's text:

- Yesenia: A woman at the church thrift needs a man with a truck. I said you are a man and you have a truck. Half true.

Step 3, Lana on the steps:

- Lana: You are the truck?
- Pedro: I am Pedro. The truck is outside.
- Lana: Good. Pedro, you are wearing a fake vintage jacket.
- Pedro: It is real. I bought it in a vintage store.
- Lana: The zip is from 2017. The store is a liar.
- Pedro: Who are you?
- Lana: Lana. I dress people for photo shoots, and nobody says thank you.
- Lana: I need the truck. You need money. Your cousin told me.
- Pedro: My cousin tells everyone everything.
- Lana: She said rent. She said "records" in a very sad voice.
- Lana: I will show you how to make rent from a church basement. You drive.

Step 4, the rack (Lana's appraisal lines, one per garment as Pedro looks; the rack is seeded from the wardrobe ids):

- Lana (on a work jacket): Real. Duck canvas. Stoop people will pay for that.
- Lana (on a branded fleece): No. Every dentist in Connecticut owns that fleece.
- Lana (on a denim jacket): Ninety-something. Look at the rivets. The park van will cry.
- Lana (on a long wool coat): For the bank bar people. Call it "archive". Do not laugh when you say it.
- Lana (on a sequin top): Not here. Not this week. Maybe in a different life.
- Lana (on a tracksuit top): Stoop. With the right man. You are not the right man. Sell it anyway.
- Lana (on a band shirt with a print): No. Things with words on them are a trap.
- Lana (on hiking boots): Lounge people pretend to hike. Price high.

When Pedro buys, a line each, at most two:

- Lana: Good. You listened.
- Lana: Bad. But I respect a man who commits.
- Pedro: In Barranquilla, all of this is just "clothes".
- Lana: In Brooklyn, all of this is a personality.

Step 5, at the resale spots (one line at each zone on arrival, one on a sale):

- Stoop (arrival): Lana: Workwear and sport. Speak plain. No stories.
- Stoop seller (sale): Regular: That's a real one. I'll give you thirty. Don't make that face, thirty-five.
- Park van (arrival): Lana: Denim and nineties. Let him find the rivets himself.
- Park van reseller (sale): Passer-by: Oh. Oh, this is the good wash. Sixty. Don't tell my girlfriend.
- Lounge street (arrival): Lana: Here, everything is "archive". Look bored. Rich people trust bored.
- Lounge street buyer (sale): Passer-by: Is it, like, archive archive? Okay. Okay. Ninety. Can I tap?
- Pedro, after a lounge sale: That coat was eight dollars.
- Lana: That coat was eight dollars an hour ago. Now it is a story.
- If Pedro sells a piece in the wrong zone (low price): Lana: That was the wrong postcode. Taste is a postcode.

Step 6, paying Lana:

- Pedro: Forty. Your loan.
- Lana: You paid me back the same day. Nobody does that.
- Pedro: My cousin would kill me.
- Lana: Your cousin should run a bank.

Step 7, Yesenia on the stoop:

- Pedro: R-E-N-T.
- Yesenia: ...Is this real money?
- Pedro: Clothes money. Church clothes.
- Yesenia: I do not want to know. I love you. Take your shoes off the couch.

## Barks

- Passer-by (thrift steps): The basement's got winter coats today. Don't tell anybody.
- Regular (stoop): Everything I owned in 1996 is now worth more than me.
- Passer-by (lounge street): Do you have it in, like, a more sustainable size?

## Notes for MISSIONS

- Thrift numbers (buy prices, taste tables per zone, resale formula) are in SIDE.md, "Flipping". The eight garments are
  wardrobe ids picked by CAST or MISSIONS; the appraisal lines are written per garment KIND so they fit any id.
- Words on clothes: rule 4 still says no lettering on clothes in the wardrobe; Lana's "band shirt" line can be cut if the
  rack has no such item.
