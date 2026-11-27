# ACT2-06 Flip Week (`pico-flip-week`)

Who: Lana. Where: Second Act Thrift, the Saturday Throop Stoop Market, Doña Marisol's laundromat, the street outside
Tincture & Ledger (venue `bar-lounge`). Hours: 09:00 to 19:00 (the market is Saturday; if the game has no weekdays, any
day 09:00 to 15:00). Requires: `pico-door-policy`. Giver: Lana's own phone note ("Shop fund: not enough."). Act 2.

## The scene

Lana's shop fund is $640 short of a first month on a tiny storefront Mohammed told her about, above the bodega. She runs a
pop-up stall at the Saturday stoop market and sells "archive" to the people outside the bank bar at the same time, by
running between them in her van. This is the flipping system at full strength, played as Lana: she sees fakes, she can
alter pieces at Doña Marisol's to lift their price, and she can style a buyer on the spot. The twist is a buyer: Whit,
in a fleece, who loves a coat she altered and pays in MOTH tokens. Lana takes the tokens on purpose. On the token's
public ledger, which Whit proudly shows her on his phone, the same wallet pays Plush's courier leads. That is leverage,
and Lana keeps score.

## Objectives (play terms)

1. Buy at three thrift spots in one morning (thrift, Lana's 8 slots: Second Act Thrift, Doña Marisol's lost-and-found box,
   a stoop sale). Budget: her shop fund's float, $120.
2. Alter two pieces at Doña Marisol's (interact, presses 4 each; an altered piece's condition goes up one star).
3. Set up the stall at the Throop Stoop Market (interact). A sell objective: 6 sales in the market zone (buyers every
   20 s; she can "style" a buyer with one F press: +20 % on that sale, once per buyer).
4. Mid-way, drive to the Tincture & Ledger street with the two best pieces (goTo, in her van) and sell to the lounge zone
   (sell, 2 sales). One buyer is Whit (a talkTo with a reply picker).
5. Back to the market before it closes at 15:00 (goTo); sell what is left.
6. Count the money (timer 6 s). Target: $640 total profit.

## Fail states

- The market closes with profit under $640: `lowScore`, but the money made is kept: "Lana: Not enough. Not nothing.
  Next Saturday." (The mission can be replayed next week; the profit carries over.)
- The van is towed (left on a hydrant for more than 60 s): `cargoBroken`-style fail, "Lana: Towed. With the stock.
  Bozhe moi. The city is a thief with a truck."

## Rewards

- Lana's shop fund +profit. Flag `pico.lana.moth` (the ledger; needed for ACT2-08's best path and Act 3's Investor
  Relations). 120 MOTH tokens in Lana's phone (worth $48 on Monday, $5 by Act 3).
- Toast: "Profit: enough. Lana writes it down. In pen."

## Dialogue

Step 1, thrift (Lana's appraisal, at most four lines):

- Lana: Wool. Real. Somebody's uncle's good coat. He would want it to go out.
- Lana: Fake. Look, the label is ironed on. Church, I'm disappointed in you.
- Lana: Boots. Resoled twice. That is love. That is forty dollars of love.
- Lana: The shelter rail? No. Not that rail. That rail is for people.

Step 2, Doña Marisol's:

- Doña Marisol: Again? You are going to make me rich, and I will spend it on you.
- Lana: Take the sleeve up one centimetre.
- Doña Marisol: One centimetre. You and your centimetres. Like a surgeon.
- Lana: Surgeons are tailors with worse lighting.

Step 3, the market (buyers, generic adults; one line per sale, at most six):

- Regular: Is this real leather? — Lana: Smell it. That's a cow's opinion.
- Regular: My mother had this coat. — Lana: Then you know it lasts. Forty.
- Passer-by: Can you do thirty? — Lana: I can do thirty-five and a compliment. Your shoulders are good for this.
- Regular: You're the one who dressed the bouncers at the factory club? — Lana: They looked like poets. You're welcome.
- Passer-by (styled): Wait, you're putting it on me? — Lana: Collar up. Now look in the window. See?
- Passer-by: ...I see. Take my money.

Step 4, the lounge street, Whit:

- Whit: Whoa. Is that archive?
- Lana: It's a coat.
- Whit: Is it archive though?
- Lana: For you, it's archive.
- Whit: How much?
- Lana: Three hundred.
- Whit: Can I pay in MOTH? It's a community currency.
- Reply picker (Lana):
  - 1 "Cash only." → Whit: Ugh, fine. Analog. (pays $300; the ledger beat does not happen; `pico.lana.moth` not set; ACT2-08
    gives another way to it at a cost)
  - 2 "MOTH. Show me the wallet." (sets `pico.lana.moth`) →
    - Whit: Yes! A believer. Look, it's all public. That's the beauty.
    - Lana: (reading his phone) Same wallet pays the... "courier incentive pool".
    - Whit: Transparency, baby.
    - Lana: Very transparent.
- Whit: You should meet my friend Kyle. He owns a bank.
- Lana: He owns a bar in a bank.
- Whit: That's the new bank.

Step 6, counting (Lana alone in the van):

- Lana: Six hundred and forty. Plus a coat-shaped hole in a crypto wallet.
- Lana: (to herself) Pedro is going to hate this. Good.

## Barks (the market; all adults)

- Regular: Everybody on this block sells their closet on Saturday. Then buys it back on Sunday.
- Passer-by: Is it sustainable? — Regular: It's used, man. Used is the most sustainable thing there is.
- Regular: Marisol did the sleeves? Then it's a good coat.
