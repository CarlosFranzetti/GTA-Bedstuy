# GTA III and GTA IV: conventions our lanes can build to

Author: Marco Heath (REF34). Written 27 Nov 2026 at the owner's request ("do more research on gta3 and 4 and follow those
guidelines and models and physics and controls and momentum and design").
Companion to `docs/reference/gta4-5-study.md`, which covers GTA IV and V rendering, clothing and handling numbers. Its
numbers are not repeated here, except where this guide says so.

## How to read this

Style and mechanics only. Nothing here is taken from a game's files, data, code, assets or numbers. Vehicle and place names
from the games are not used. Owner rule 1 and rule 9 apply throughout.

Tags on each claim:
- OPENED = I read the page and the quote or fact is on it (URL given).
- SUMMARY = I saw only a search result summary, or the page was blocked (403, 410, truncated). Treat as a lead, not a fact.
- FOUND-IN-FORUM = a player forum post, not a review or a developer statement.
- NOT FOUND = I searched and could not find a public source I could open. Our own choice is needed.
- EST = my estimate, to tune by eye in the running game.

Two corrections to the question as asked:
- GTA III (2001) has no motorcycles. Bikes arrived in Vice City (SUMMARY, https://gta.fandom.com/wiki/Motorcycles). So "falling off
  bikes" is not a GTA III mechanic. Section 5 covers what GTA III does have.
- Developer interviews on GTA III's car entry, car camera tuning and collisions are scarce. Most of what follows comes from
  one long 2018 review, the Grand Theft Wiki and gta.wiki control and mechanic pages, one 2026-era writer's piece on GTA IV
  handling, and player forums. Developer statements are marked as such.

Blocked or unusable pages (so they are not cited for facts): the PC Gamer GTA III piece (403), the GameSpot Vice City animation
Q&A (403), the AnandTech GTA IV review (redirected to a forum index, then 410), TopGear and TweakTown GTA III reviews (403),
the GamesRadar GTA III appreciation piece (truncated), and an Engadget Euphoria demo article (no mechanics in the text).

---

## 1. Getting in and out of cars

### What the games do
- GTA III: "The car door opens, and then the character drops themselves into the visible interior and takes the wheel." And:
  "You can't bail out of vehicles, so you have to come to a full and complete stop." (OPENED, Shamus Young, 13 Jul 2018,
  https://www.shamusyoung.com/twentysidedtale/?p=43189). Timing is not given in that review, and no GTA III duration was found.
- GTA III controls: one key enters and exits (Enter or F on PC, Triangle on PS2). (OPENED, Grand Theft Wiki,
  https://www.grandtheftwiki.com/Controls_for_GTA_III)
- GTA IV, occupied car, driver's side: the driver must be pulled out before you can drive away. Passenger's side: the character
  forces the driver out from inside; if a passenger is also present, that person is pulled out first. Interrupting after the
  first pull leaves the character outside the car. (OPENED, Grand Theft Wiki, https://www.grandtheftwiki.com/Car_Theft)
- GTA IV, blocked doors: locked road cars need a smashed window and a hotwire before the engine starts; larger vehicles and boats
  have no locked doors. Alarms attract police and can be stopped by striking the car. (OPENED, same page.)
- GTA IV, moving car: a thief who tries to enter a car at speed can fail, and the character or NPC may cling to the door handle
  and be dragged along the road. (OPENED, same page.)
- GTA IV, wanted level: police who see the carjacking usually give one star. (OPENED, same page.)
- Durations of each entry step in either game: NOT FOUND. The GTA IV wiki gives none.
- Camera during entry or exit: NOT FOUND in any source I opened.
- Entering from the passenger side in GTA III: NOT FOUND.

### What this means for us
- Use one key for enter and exit on foot, as GTA III does. Keep the GTA III rule that you cannot leave a moving car, and decide
  deliberately whether ours follows it (the owner asked for entry to feel "instant"; the sources do not say what that means in frames).
- Driver's side: pull the driver out first. Passenger's side: pull the driver out from inside, and pull out any passenger first (GTA IV).
- A key press during entry cancels it and leaves the player beside the car, as in GTA IV.
- Measure our own entry in frames from key press to control handover (EST target: under 1 second, to tune). No source gives a figure.
- The camera must not cut through the car interior during entry. This is a design choice; no source covers it.

---

## 2. The third-person camera

### What the games do
- GTA III's car camera history (SUMMARY, Obbe Vermeij, a former Rockstar technical director, via https://www.gamesradar.com/games/grand-theft-auto/gta-3-dev-thought-riding-the-train-was-boring-which-led-to-the-creation-of-the-series-cinematic-camera-the-team-found-it-surprisingly-entertaining):
  the cinematic camera came from a train ride the developer found dull. A colleague suggested the same for cars, and wheel and
  chase views were added. A standard camera "from behind the car" was used first.
- GTA III view cycle: four camera angles plus a top-down view, including two tail cams, a bumper cam and a cinematic cam. Vice City
  adds a third tail cam set farther back. (OPENED, gta.wiki Driving page, https://gta.wiki/w/Driving)
- GTA III: "You can't swing the camera around while driving." (OPENED, Shamus Young, 2018, same URL as section 1.) In-car look
  left, right and behind are separate controls. (OPENED, Grand Theft Wiki controls page.)
- GTA IV: a rear view camera was introduced, and the cinematic camera can run in slow motion (OPENED, gta.wiki Driving page).
- GTA IV driving camera complaints (FOUND-IN-FORUM, not reviews):
  - the camera returned to the rear position slowly on turns and spins, so the player could not see the way ahead
    (GTA Forums thread, https://gtaforums.com/topic/341831-camera-is-way-to-slow-in-tracking-vehicle/);
  - one player said the camera stayed right behind the car in GTA III and Vice City but was "extremely lazy" in San Andreas and IV
    (AnandTech forum, https://forums.anandtech.com/threads/official-grand-theft-auto-4-gta4-thread.151341/post-25614096);
  - a reply recommended tapping the right stick to look behind and releasing it, so the camera re-centres.
- Follow distance, height, damping and wall handling for either game: NOT FOUND. The numbers in `gta4-5-study.md` section 4 are
  our guesses, not sourced values.

### What this means for us
- Offer four views plus a top-down view, in the GTA III order: tail, farther tail, bumper, cinematic, with a first-person look on
  foot. This is a convention, not a copy of any file.
- Make the look-behind snap back to the rear view on release, as the IV players described.
- Speed up the re-centre on turns: the complaint is lag exactly where the driver needs to see ahead (forum opinion, M confidence).
- Walls: no source. Pick a rule (pull the camera in along its own line, as the Classic camera already does) and test it in the game.
- The camera should cut cleanly between views and never blend through the car body (owner's item; no source).

---

## 3. Driving feel

### What the games do
- GTA IV, as a critic describes it (OPENED, Traxion, 30 Dec 2024, https://traxion.gg/how-grand-theft-auto-iv-broke-the-open-world-mould-for-vehicle-physics/):
  "Cars have way too much body roll"; "loading up the suspension before a corner achieves better results than simply barrelling in
  at top speed"; "Braking in a straight line is more effective"; "the way most road vehicles tend towards understeer is at least
  believably realistic"; "Cars also noticeably slow down when damaged". These are the author's opinions, not Rockstar statements.
  The same piece says "GTA IV rewards those who can read the road and plan their next move early."
- GTA IV steering and braking (fan wiki, OPENED, gta.wiki Driving page): a hand-over-hand steer, and a light tap of accelerator and
  brake together lights the brake lamps without a burnout. In the air, lifting off the throttle and holding the handbrake helps control
  the car.
- GTA III steering: the protagonist turns the wheel only slightly (OPENED, gta.wiki Driving page).
- GTA III handling, mixed: "rock-solid car physics" (OPENED, Shamus Young, 2018). Comments on the same post called the cars
  "handled like bricks" and "abysmal" (player comments, weak evidence). A retrospective calls the handling "arcade-y" and a
  GamesRadar piece calls it "realistic enough" with "an arcade edge" (both SUMMARY, not opened).
- GTA III developer statement on vehicle drag (OPENED via 80.lv, https://80.lv/articles/gta-3-developer-explained-why-he-had-to-slow-players-down/,
  quoting Obbe Vermeij): "In other problem areas, we increased the drag (air resistance) on the vehicles 5% or so." The same
  interview says the team slowed the player to help the streaming. So drag was tuned for the engine, not for feel.
- GTA IV criticism of driving (SUMMARY, user reviews): "oversensitive" controls, and driving was "unnecessarily frustrating" next to
  games with refined handling.
- Car class differences: the GTA IV writer says saloons show "boat-like levels of body roll" and that motorcycles were harder to
  control than cars (opinion). Per-class handling numbers, including the IV parameter names, are already in
  `gta4-5-study.md` section 4. Not repeated.
- Grip loss, slip curves and traction numbers for GTA III or IV: NOT FOUND in an opened source. The handling-parameter notes in
  the study are for the IV and V file format, from a wiki and a modding guide (OPENED, Grand Theft Wiki and a modding tutorial).

### What this means for us
- Reviewers praised planning and braking (weight) and criticised sluggish or over-sensitive steering. Aim for weight in the turn, not in
  the press: a small tap gives a small steer, a full hold reaches full lock within about 0.5 to 1.0 s (EST, to tune; no source).
- Keep body roll visible on heavy cars and small on sports cars, since critics call IV's roll too much (opinion).
- Use a light lift and a handbrake to rotate the car in the air, as IV allowed (fan wiki). Test the result in the game.
- Top speed and drag are allowed as tuning knobs; GTA III's developer changed drag by about 5 per cent in trouble spots.
- Tune on the GTA III and IV critique, not on V's grip: V is what the study already covers and the critics split on it.

---

## 4. On-foot movement and momentum

### What the games do
- GTA III controls: sprint on a separate key, jump on another, enter vehicle on the action key (OPENED, Grand Theft Wiki controls page).
- GTA IV walking and running (SUMMARY, a review quoted in search, AnandTech page not opened): the default stride is "a window-shopping
  amble, just slow enough to be useless"; holding a button walks and running needs a second press or a hard press.
- GTA IV stopping and turning (SUMMARY, MobyGames and AnandTech reviews): getting Niko to stop on a dime "can be tough"; the controls
  were called "sluggish, even moreso than in San Andreas". Reviewers said the controls improve over time.
- GTA IV responsiveness (SUMMARY, Giant Bomb user review): inputs are delayed by sluggish animation, with "no precision" in cover and on
  ladders.
- GTA IV stumbles and ragdoll (OPENED, Traxion): "criminals limply rag-doll when pushed down stairs" (opinion). A community wiki
  (SUMMARY, gta.wiki Euphoria page) says Euphoria drives live characters that stumble and grab objects when knocked off balance, and
  that later reactions were stiffer and shorter.
- Jump height, climb speed, turn rate on foot, and acceleration times: NOT FOUND in any source I opened.
- Weight: the critics who liked IV's heaviness mostly liked the planning, not the lag. Both camps named the same things: slow stops,
  slow turns, and a convoluted run input.

### What this means for us
- Separate the acceleration from the turn rate. The IV complaint is the stop, not the start. A short stop on release should be quick.
- One action button for walk, sprint and release-to-walk is easier to learn than IV's hold-and-press run.
- A stumble after a hit should end fast. The IV wiki says reactions became stiffer and shorter in later updates (SUMMARY); the
  owner wants weight, so keep the stumble short and let the body recover into walking.
- Measure our own stop distance and turn time from a standing run, in frames, and compare with the owner's "smooth" test. No source gives numbers.

---

## 5. Collisions and getting stuck

### What the games do
- GTA III street furniture (OPENED, Shamus Young, 2018): "steel light poles break away like balsa wood while tiny saplings can bring
  your 100MPH chase to a dead stop." Damage shows as "body panels crumple up." Trees stop a car; poles break.
- GTA III pedestrians (OPENED, same review): reviewers complained that pedestrians "deliberately" dive in front of cars, and that
  "It looks like peds don't understand sidewalks and roads." This is a design complaint, not only a bug.
- GTA IV crashes (OPENED, Traxion): crashes "natural-looking" through the RAGE engine; a taxi driven into a wall; a bystander hit by
  a falling object; bumpers that "remain attached no matter what". Damaged cars slow down. The author suggests Rockstar simplified the
  damage model, which is speculation.
- Motorcycle falls: GTA III had no bikes. In Vice City, skill reduces falls (SUMMARY, gta.fandom wiki).
- Getting stuck, push-out, getting up after a fall, and a player unstuck from a wall: NOT FOUND in any source I opened. The
  only related text is the IV stumble note (section 4).
- Streaming and collisions: GTA III's developer says the team slowed the player and changed a road layout in Portland because the
  streaming there was the worst (OPENED, 80.lv, quoting Vermeij: "The artists changed the road layout to slow the player down").

### What this means for us
- Street furniture: poles break and let the car through with a speed loss; trees stop it. This is a readable, cheap rule (GTA III).
- Damage: panels crumple and the car slows. Decide whether bumpers stay on. The IV critic called the stay-on bumper unrealistic (opinion).
- Pedestrians must not step into a car's path as a scripted event. Reviewers named this as a flaw in GTA III.
- Getting stuck: no source. Our own rule, to test: push the player or the car to the nearest free point on walkable ground or
  road, and resolve car-to-car contact along the contact normal. This is a proposal, not a sourced convention.
- Keep the streaming limits in mind: GTA III hid streaming by slowing the player and by reshaping roads. Our streaming can
  use the same trade, and the owner should see it as a choice.

---

## 6. Models and textures of the era

### What the sources say
- Hardware limit: GTA III ran on a PlayStation 2 with about 32 MB of RAM (SUMMARY, Notebookcheck, citing a modder,
  https://www.notebookcheck.net/Modder-details-how-Rockstar-Games-fit-GTA-III-s-open-world-in-the-PS2-s-measly-32MB-memory.1298873.0.html).
- The developer says the whole map could not be held in memory and was streamed in sectors (OPENED, 80.lv quoting Vermeij).
- Vice City (SUMMARY, Rockstar Q&A on GameSpot, https://www.gamespot.com/articles/grand-theft-auto-vice-city-graphics-qanda/1100-2881042/):
  pedestrians and vehicles had higher polygon counts than in GTA III, every car from GTA III was redesigned, and characters had
  about twice the textures. No figures were given in the summary.
- Polygon counts, triangle budgets and texture sizes for GTA III or GTA IV cars and people: NOT FOUND in any source I opened. A
  forum list of per-character counts names no game, so I did not use it. A GitHub gist claims artists "reduced the texture sizes" and
  reused textures; it is unverified, so I did not use it.
- Level of detail and compression for GTA III (SUMMARY, Pulse summary) mention LOD models, texture compression and asynchronous DVD
  reads. No numbers.
- GTA V vehicle LOD ranges (about 60k to 120k triangles at the top level) are in `gta4-5-study.md` section 3, from a modder's guide.
  They are not GTA III or IV figures.
- Car-to-person proportions in the games: NOT FOUND. Use real-world specs and the survey medians the owner set (memory rule for bodies).

### What this means for us
- The era's real constraint was memory and streaming, not triangles. Our phone and low budgets (300k and 500k triangles) are already
  set; track memory and streaming against them, not only triangle counts.
- Characters can take more texture detail than props, since Vice City gave characters about double the textures of GTA III (SUMMARY).
- Hide streaming with fog, low-detail distance blocks and a slower camera at speed, as the era did. Our existing fog and LOD cover this.
- Size cars and people from real dimensions (the vehicle specs and survey medians). Do not use game numbers.

---

## 7. Design guidelines that carry over

### What the sources say
- GTA III's developers tested ideas by playing them. A 1-star wanted level for running a red light was added and then removed because it
  was not popular (SUMMARY, the developer's account, https://www.gamesradar.com/games/grand-theft-auto/gta-3-originally-gave-players-a-wanted-level-for-running-a-red-light-but-this-was-not-popular-with-the-team-so-a-developer-quickly-removed-it).
- A boring ride produced the cinematic camera (SUMMARY, see section 2): the bored moment became a feature.
- The art director calls GTA III the template for how Rockstar North makes games (SUMMARY, GamesRadar, 20-year retrospective,
  https://gamesradar.com/20-years-later-rockstar-reflects-on-how-gta-3-showed-us-the-first-glimpse-of-what-was-possible).
- A 2018 review praises the car physics and criticises the controls (OPENED, Shamus Young).
- GTA IV critics said the game "rewards those who can read the road and plan" (OPENED, Traxion). Players also said the city should feel
  alive without NPCs walking into traffic (section 5).
- Radar and HUD: a critical review (SUMMARY, source not confirmed) said the mission marker sat at the edge of the mini-map when far away and
  that the map did not show relative positions. Not used for a rule until a source is confirmed.
- Mission design rationale, story versus missions, and HUD choices in GTA III or IV: no developer source opened.

### What this means for us
- Test every stock feel with a bored player: a dull action (a ride, a wait) can suggest a feature, as the cinematic camera did.
- Set the wanted level by serious acts only. A star for a trivial act was removed in GTA III after play-testing.
- Give the mini-map the relative position of the objective, not only an edge pointer (critic, unconfirmed; our own test in play).
- Keep silhouettes readable by class (the study's rule 10). Critics name car classes by how they handle.
- Pedestrians and traffic react to the player without walking into cars. Reviewers flagged this in GTA III.

---

## 8. Checklist for our lanes (twenty yes or no checks)

Each check says where it comes from. "Our rule" means no source; the owner or the lead decides.

1. One key enters and exits a car on foot. [GTA III controls, OPENED]
2. A car entered from the passenger side pulls the driver out from inside first. [GTA IV Car_Theft, OPENED]
3. A passenger seat occupant is pulled out before the driver when the player enters from the passenger side. [GTA IV Car_Theft, OPENED]
4. A key press during entry cancels it and leaves the player beside the car. [GTA IV Carjack page, OPENED]
5. The camera never cuts through the car body or interior during entry. [Our rule]
6. Entry time from key press to control is measured in frames and reported, not assumed "instant". [Owner ask; no source for a figure]
7. The player cannot leave a car moving at speed. [GTA III review, OPENED; decision pending]
8. The camera has four views plus a top-down view. [GTA III view cycle, OPENED, gta.wiki]
9. The look-behind returns to the rear view when released. [IV player forum, FOUND-IN-FORUM]
10. The rear camera re-centres faster on turns than on straights. [IV player complaints, FOUND-IN-FORUM; EST]
11. A short tap on the steer gives a small turn; a full hold reaches full lock in about 0.5 to 1.0 s. [EST, no source]
12. Braking in a straight line stops the car better than braking in a corner. [IV critic, OPENED, opinion]
13. Body roll is visible on heavy cars and small on sports cars. [IV critics, OPENED, opinion]
14. Top speed and drag may be tuned to help streaming, within a few per cent. [GTA III developer, OPENED via 80.lv]
15. A light lift and handbrake can rotate a car in the air. [GTA IV fan wiki, OPENED]
16. Light poles break and slow the car; trees stop it. [GTA III review, OPENED]
17. Pedestrians never step into a car's path as a scripted event. [GTA III review, OPENED]
18. Damaged cars lose speed. [GTA IV critic, OPENED, opinion]
19. A stuck car or player moves to the nearest free point on walkable ground or road. [Our rule, untested]
20. Sprint is one held button and release returns to walking; the stop after a sprint is quick. [IV criticism, SUMMARY; EST]

---

## Sources (opened or cited)

- Shamus Young, GTA III retrospective with comment excerpts, 13 Jul 2018: https://www.shamusyoung.com/twentysidedtale/?p=43189 (OPENED)
- Grand Theft Wiki, Controls for GTA III: https://www.grandtheftwiki.com/Controls_for_GTA_III (OPENED)
- Grand Theft Wiki, Driving controls (GTA IV section): https://www.grandtheftwiki.com/Driving/Controls (OPENED)
- Grand Theft Wiki, Car Theft (GTA IV): https://www.grandtheftwiki.com/Car_Theft (OPENED)
- gta.wiki, Driving: https://gta.wiki/w/Driving (OPENED)
- Traxion, How GTA IV broke the open-world mould for vehicle physics, 30 Dec 2024: https://traxion.gg/how-grand-theft-auto-iv-broke-the-open-world-mould-for-vehicle-physics/ (OPENED; opinion pieces)
- 80.lv, GTA 3 developer explained why he had to slow players down, quoting Obbe Vermeij: https://80.lv/articles/gta-3-developer-explained-why-he-had-to-slow-players-down/ (OPENED)
- GamesRadar, GTA III cinematic camera origin (SUMMARY): https://www.gamesradar.com/games/grand-theft-auto/gta-3-dev-thought-riding-the-train-was-boring-which-led-to-the-creation-of-the-series-cinematic-camera-the-team-found-it-surprisingly-entertaining
- GamesRadar, GTA III red-light wanted level (SUMMARY): https://www.gamesradar.com/games/grand-theft-auto/gta-3-originally-gave-players-a-wanted-level-for-running-a-red-light-but-this-was-not-popular-with-the-team-so-a-developer-quickly-removed-it
- GamesRadar, 20 years later, GTA III (SUMMARY): https://gamesradar.com/20-years-later-rockstar-reflects-on-how-gta-3-showed-us-the-first-glimpse-of-what-was-possible
- Notebookcheck, PS2 memory and GTA III (SUMMARY): https://www.notebookcheck.net/Modder-details-how-Rockstar-Games-fit-GTA-III-s-open-world-in-the-PS2-s-measly-32MB-memory.1298873.0.html
- GameSpot, Vice City graphics Q&A (SUMMARY; the page was not opened): https://www.gamespot.com/articles/grand-theft-auto-vice-city-graphics-qanda/1100-2881042/
- GTA Forums, camera too slow in tracking vehicle (FOUND-IN-FORUM): https://gtaforums.com/topic/341831-camera-is-way-to-slow-in-tracking-vehicle/
- AnandTech forum, GTA IV thread (FOUND-IN-FORUM): https://forums.anandtech.com/threads/official-grand-theft-auto-4-gta4-thread.151341/post-25614096
- gta.fandom wiki, Motorcycles (SUMMARY; bikes first in Vice City): https://gta.fandom.com/wiki/Motorcycles
- Existing study (for the IV and V handling and LOD figures, not repeated): `docs/reference/gta4-5-study.md`, `docs/reference/gta4-5-study-sources.md`

## What I could not find

- Car entry and exit durations for GTA III or IV, and any camera behaviour during entry.
- Follow distance, height, damping and wall handling for either game's car or on-foot camera.
- GTA III and IV polygon counts, texture sizes, and car-to-person proportions from a developer or a published analysis.
- Developer statements on GTA IV's vehicle physics, grip curves, collisions or stuck-player handling (no GDC, Gamasutra or
  NaturalMotion interview with those details was reachable).
- The ways GTA III or IV stop a player or car from getting stuck, and how they get a player up after a fall.
- Jump height, climb speed and turn rate for either game's on-foot character.
- A developer's account of GTA III's mission design or HUD rationale.
