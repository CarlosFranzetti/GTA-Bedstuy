# ACT2-08 Exit Interview (`pico-exit-interview`)

Who: Pedro, then Adele. Where: the Plush van lot by the rail, a chase through the industrial streets, the river edge (the
map's waterfront or a canal edge, whichever the map has; otherwise a scrapyard compactor), Ironside Station House,
Wexcombe Medical Center. Hours: 23:00 to 03:00, then Adele at 04:00. Requires: `pico-night-shift`,
`pico-personal-guarantee`. Giver: Pedro's own choice (phone: "Quit Plush"). Act 2 finale.

## The scene

Pedro quits by text. Whit answers with a calendar invite: "Exit interview, the lot, 11 p.m." Pedro brings back the last
box, because he is honest at the worst times. Whit is not there. His "retention team" is: three men in grey fleeces with
lanyards and pistols, who call themselves Head of Retention, Retention Associate and Retention Intern, and who are
supposed to "recover company property and the courier's goodwill". It turns into the story's first gunfight, among the
grey vans: gritty, loud, and funny between the shots (they argue about their key performance indicators; the intern asks
if this counts toward his hours). Pedro gets out with the box. Then the choice of what to do with it, which decides who
Pedro is for Act 3:

- **Hand it in** to Sgt. Kowalski at Ironside Station House, with Lana's MOTH ledger if she has it (`pico.lana.moth`).
  Plush is raided in Act 3; Whit is charged; Kyle is "assisting with enquiries". Pedro gets a desk-appearance ticket and
  Kowalski's grudging respect. (`pico.exit.police`)
- **Dump it** in the river or the scrapyard compactor. Plush survives, Whit is furious, nobody is charged; Pedro is out.
  (`pico.exit.dumped`)
- **Sell it** one last time, to the doorman's VIP, for a lot of money (unseen: it just pays). Pedro is "out" with $800,
  and Plush keeps him on a list. Adele finds out at 4 a.m. (`pico.exit.sold`; Adele's trust drops to 0 until Act 3.)

Then the camera switches to Adele at 04:00 in the emergency department: the courier who got Pedro's old route tonight
came in. He is hurt, not badly. On the hand-in path he says the vans have stopped; on the other two he says "the new guy
quit, so they gave me two routes".

## Objectives (play terms)

1. Text Whit "I quit" (phone). Whit's invite arrives.
2. Drive to the van lot by 23:00 with the last box (goTo; the box is in the truck from ACT2-05 or ACT2-01's leftover).
3. Talk to the Head of Retention (talkTo; three lines; then the fight starts whatever Pedro says).
4. Gunfight: survive and down or drive off the three retention men (the existing combat and arsenal; they have pistols;
   Pedro has whatever he carries, and a pipe is on the ground by the gate if he has nothing). Cover: the grey vans.
   The intern surrenders when shot at twice (he puts his hands up and his lanyard down: he is not killed by the
   mission's script; the player may still hit him, which the story notes as "the intern" in one text later).
5. Escape the lot with the box (escapeRadius 250 m), with 2 stars (the gunfire was heard). Lose them (loseWanted) OR
   keep them and go straight to Ironside for option 1 (going to the station house with stars counts as surrender for
   this mission: no bust, the wanted level clears there).
6. The fork (fork objective; three rings): Ironside Station House's front desk / the river edge / the doorman building's
   service entrance. Option 1 shows only while you carry the box; with `pico.lana.moth`, Lana texts the ledger first.
7. Switch to Adele, 04:00, Wexcombe: treat the courier (interact, presses 3) and talk (talkTo).

## Fail states

- Wasted in the gunfight: wake at Wexcombe; Adele: "A gunshot. Pedro. A gunshot." The mission fails; retry from the lot.
- Lose the box (it drops if Pedro is knocked down; pick it back up within 20 s): `cargoBroken`. "Whit (text): Thanks for
  returning company property, bro. Exit interview complete. Rating: two stars."
- BUSTED before the fork: the box is taken, the cash too; Pedro is charged; the path is set to `pico.exit.police` but
  without Kowalski's respect and with a court date in Act 3 (the story continues; it does not end).

## Rewards

- police: $0, flags, Kowalski's number. Toast: "You handed a box to the police. In this game. Who are you?"
- dumped: $0, flags. Toast: "The river has seen worse. Not much worse."
- sold: +$800 (unseen; it just pays), flags, Adele's trust 0. Toast: "Eight hundred dollars. It feels like four hundred."
- All paths: Plush runs end for Pedro (SIDE.md 6), except on the sold path, where Whit still texts offers.
- Act 3 opens. Phone pointer: `pico-parts`.

## Dialogue

Step 1, texts:

- Pedro (text): I quit. No more boxes.
- Whit (text): Totally hear you, man. Let's do an exit interview. Growth mindset! 11pm at the lot. Bring the last box!


Step 3, the lot (three men in grey fleeces with lanyards; speakers `Courier` voices or CAST extras `Head of Retention`,
`Retention Associate`, `Retention Intern`):

- Head of Retention: Pedro! Hey. I'm Head of Retention.
- Pedro: Where is Whit?
- Head of Retention: Whit's at a breathwork thing. He sends love. And us.
- Retention Associate: We just need the box. And your goodwill.
- Pedro: You can have the box. My goodwill is not for sale.
- Head of Retention: Everything's for sale, man. That's literally the deck.
- Retention Intern: Do I take the box or the goodwill? Nobody told me which.
- Head of Retention: (draws) Okay. We're doing this the offline way.

Step 4, during the gunfight (at most one line every 6 s; these are the jokes between shots):

- Retention Associate: This is not in my job description!
- Head of Retention: It's in the appendix! Read the appendix!
- Retention Intern: Does this count toward my hours?
- Head of Retention: Everything counts toward your hours!
- Retention Associate: My KPI is zero incidents! This is an incident!
- Head of Retention: Reframe it! It's an engagement!
- Pedro: Pockets, Akira. Pockets. Not tonight.
- Pedro: I carry sofas! I carry sofas for a living!
- Retention Intern (surrendering): I'm out! I'm out! I'm going back to grad school!
- Head of Retention (down or fleeing): Tell Whit... tell Whit I want equity.

Step 5, driving away (Pedro):

- Pedro: Okay. Okay. Breathe. Breathe like Whit. No. Breathe like a normal person.

Lana's text (only with `pico.lana.moth`, as the fork appears):

- Lana: I have Whit's wallet ledger. Same wallet pays the couriers and Kyle's "community fund". If you are going to do something stupid, do the smart stupid thing.

Step 6, at Ironside Station House (police path; Sgt. Kowalski at the desk):

- Sgt. Kowalski: You're the DJ from the posters. The ones on my lamp post.
- Pedro: Those were legal boards.
- Sgt. Kowalski: That was my lamp post. What's in the box?
- Pedro: I do not know. I never opened it. That was the rule.
- Sgt. Kowalski: The one rule they follow. (She looks at it, does not open it on screen.) Okay. Okay.
- (with `pico.lana.moth`) Pedro: And this. A wallet. It pays the drivers. It pays a man called Kyle.
- Sgt. Kowalski: You understand you're also in this.
- Pedro: Yes.
- Sgt. Kowalski: Desk appearance. Don't leave the borough. Don't paper my lamp post.
- Sgt. Kowalski: And, DJ. ...That was the right box to bring me.

At the river (dumped path):

- Pedro: Sorry, river.
- Pedro: (the box goes in; a pause; a pigeon looks at him) Do not tell anybody.

At the service entrance (sold path; the doorman, `Bouncer`):

- Bouncer: Plush? You're late. VIP paid triple for "the last one".
- Pedro: It is the last one.
- Bouncer: They always say that. Here.
- Pedro: (counting) Eight hundred.
- Pedro: (quiet) Eight hundred. Qué vaina.

Step 7, Adele, 04:00 (the courier, `Courier`, an adult, 23):

- Adele: Another grey fleece. What happened?
- Courier: Van door. I was carrying two routes. The new guy quit.
- (police path) Courier: Then the vans stopped. Like, all of them. At three. Everybody got a text: "pause".
  - Adele: Pause. Good. Sit. You're going to be fine.
- (dumped path) Courier: They said he lost company property. So now I pay for it.
  - Adele: You pay for nothing tonight. Sit.
- (sold path) Courier: The new guy did a last drop. A big one. They were happy. Then they gave me his routes.
  - Adele: (quiet) The new guy.
  - Adele: (to herself, after) Pedro.
- Adele (any path, last line of the act): Twelve hours. Coffee six. Somebody has to throw a better party than this.

## Barks (near the lot and after; all adults)

- Passer-by: Fireworks? It's not the Fourth. That's not fireworks.
- Regular: The grey vans are all parked. All of them. Weird. Quiet.
- Passer-by (next day, police path): Plush is "pausing operations". My socks!

## Notes for MISSIONS

- The retention team are adult men; nobody else is in the lot; no pedestrian spawns inside the fence during the fight;
  no child or teen within 100 m (the hard line).
- Blood is the existing blood system; no gore beyond it.
- The fork's three rings sit far apart on the map so the choice is a drive, not a menu.
