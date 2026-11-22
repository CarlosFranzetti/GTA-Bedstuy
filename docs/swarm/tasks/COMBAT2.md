# COMBAT2 task record (hit anyone, reactions, blood, weapons)

Status: in progress (22 Nov 2026). Combat programmer: Mara Oyelaran (COMBAT2). Not committed by this lane.

Owner, 22 Nov: "should be able to hit anyone and I do want blood and weapons in the game, it's a parody but it's still GTA."
Rule 5 now: blood and weapons are in; anyone can be hit; people go down hurt or knocked out; no dismemberment, no gore beyond blood.

## 1. Who could not be hit before, and why (read from the code)

- Police officers on foot: `Combat` only looked at `deps.peds()` (= `traffic.peds`); `police.officers` were not in it. Fix: main.ts line below.
  `Officer.hitBy` only staggered; it now answers like a person (health, down) but a police officer never stays down for long.
- Anyone already `down`: skipped by the fist arc, the lock-on, the shot assist and `Pedestrian.hitBy` ('ignored'). Now a person on the
  ground can be hit again (damage, blood, can be knocked out) and does not get up early.
- Anyone in a group, sitting, waiting, talking, meeting or fleeing: the hit itself worked (`hitBy` accepts every state but down), but
  the reaction was always "stagger then run", so a talker or a sitter looked unhurt. Now every state reacts through the same health model.
- Thrown things: only `target === 'ped'` knocked down, and only `knockdown` ped; a thrown item that grazed a ped inside a group was
  stopped by the first body on the ray. Unchanged (the first person on the line is the one hit).
- Drivers in cars: not people in the world (the car owns them); the player pulls them out as before. Not changed.
- Mission characters: there are none as walking people today (mission targets are cars and map markers). The flag
  `Pedestrian.knockoutImmune` exists for when one is added: they stagger, bleed and go down for a few seconds but never stay out.
- Shopkeepers inside rooms: dressing in the interior scene, no body in the world; combat is blocked inside a room. Not hittable.
- Real map as against the grid: both use `traffic.peds`; no difference found.

## 2. How people react now

Health by age and build (`src/entities/pedVitals.ts`): adult 60, teen 48, old 42, kid 30, times 0.7 (frail, 12 percent of people), 0.88 (slight, 20),
1.0 (average, 36), 1.2 (big, 20), 1.4 (heavy, 12). Blows: jab 12, heavy punch 24, bottle 12, brick 22, bat 30 then 38, pipe 48, fish 9, pistol 45,
revolver 70, shotgun pellet 14 each (eight pellets, full inside 8 m, 40 percent at the end of 22 m). A jab staggers; a second jab inside 6 s, any heavy,
thrown, club or shot blow, or a person below 40 percent health goes down for 6 s; health at zero knocks out: down 24 to 38 s, breathing, then up with 35
percent health and away. A person on the ground can be hit again ('struckDown'). An average adult goes out in about five jabs; a frail one in four, a heavy one in seven.
Health comes back at 0.35 per second.

Temperament by a hash of the person's id (seeded, the same person every run): adult 45 percent flee, 15 cower, 22 film it, 18 fight back; teen 45/12/33/10;
old 40/30/25/5; kid 60/40/0/0. Measured over 6,000 ids in the test: within 3 points of the table.

- flee: runs, as before. cower: freezes bent over with arms over the head for about 7 s (does not run). film: stands, faces it and holds a phone up for about 11 s
  (a bark: "I am getting all of this!"); a gunshot makes a filmer drop it and run. fight (only the person hit, and friends): closes in at 3.4 m/s, winds up for 0.45 s with
  the arm drawn back (the existing hand-keyed punch poses), swings, up to three punches (7, 7, 12), then runs off. A person who is a victim and "fight" starts after
  the first blow (or when they get up). Friends (same walking group, or chat partner) within 14 m join in with a seeded 65 percent unless they cower or are children.
- Bystanders: inside 9 m runners run, cowerers cower, filmers film, fighters stand and watch; out to 18 m filmers film, runners shout, the rest watch (the ring).
  A gun: everyone inside the gun's flee radius runs or cowers; out to the shout radius they shout.
- Fighting back is self-defence: when a punch of theirs lands, `deps.noteAttacked()` (= `police.noteAttacked()`).
- Mission-critical people: none walk today. `Pedestrian.knockoutImmune = true` makes them go down but never stay out (health floors at 1).

## The player's health and knock-out (`src/game/combat/vitals.ts`)

The game had no player health. Now 100. A punch from a fighter staggers (0.35 s, movement cut, pushed back); two inside 1.6 s or a heavy one knock him down for 1.7 s
(the 'hurt' pose, no get-up clip). Health comes back 2.2 per second after 10 s unhit. At zero: he lies 1.4 s, then `onKnockedOut` (main.ts) runs `applyKnockout`:
a $75 bill (never more than his cash), 7 hours pass, stars and heat clear, he stands outside the hospital landmark ("Wexcombe Medical Center", real map) or at home
(grid), health 70, weapons kept. NOT built: a black-out card or fade (a toast says it), a bill for the ambulance. The HUD health bar shows `vitals.fraction`.

## 3. Blood (`blood.ts`, `bloodView.ts`)

Dark oxblood (0x4b1015), unlit, two instanced meshes for everything (droplets, ground marks): at most 2 draw calls, none when nothing is live. A light jab bleeds nothing
until the person is below 60 percent health; heavy, club and thrown blows burst 8 to 12 drops; a shot sprays; a knock-out leaves a pool growing over 14 s. Marks fade over
the last 40 percent of 64 to 96 s (pools 130 s). Caps (drops / marks / pools): phone 12 / 6 / 0 (a knock-out leaves one small mark instead of a pool), low 28 / 20 / 6, medium 56 / 44 / 12, high 96 / 80 / 20.
Setting: Settings, Game, "Blood" On / Off (default On), through `MenuOptions.gameRows` (no Menu.ts change); stored in `gta-bedstuy.blood.v1`; Off spawns nothing.
NOT done: a bloodied nose or lip on the face (FACES4 owns pedHead and the skin painters; a per-person overlay would add draw calls or textures on the low tiers): left out.
The caps are fixed when the game starts (a tier switch in Settings does not change them until a reload).

## 4. Weapons (`arsenal.ts`, `items.ts`, `melee.ts`, `Combat.ts`)

One melee weapon, any thrown items, two guns. All names invented or generic; every shape is primitives, every sound synthesised (sfx.ts); poses are our own keying (`anim/combatPoses.ts`).

| name | kind | damage | reach / range | ammo |
|---|---|---|---|---|
| Fists | punch | 12, 12, 24 | 1.2 m | - |
| Baseball bat | melee, two-hit swing (forehand, backhand), hits up to 2 people | 30, 38 (always down) | 1.9 m, 100 degree arc | - |
| Length of pipe | melee, one slow overhead blow | 48 (always down) | 1.8 m | - |
| Frozen fish | melee slap, the joke one | 9 each (a stagger, a slap sound) | 1.5 m | breaks after 12 blows |
| Bottle, brick | thrown | 12, 22 | the throw | picked up singly |
| Pistol | hitscan | 45 | 60 m | 12 in the gun, 60 spare |
| Six-shooter | hitscan, 0.7 s between shots, deep report | 70 | 70 m | 6 in the gun, 36 spare, reload 2.6 s |
| Pump shotgun | 8 pellets, 11 degree spread, 0.45 s + a 0.6 s pump with its own sound | 14 per pellet (blast: knocks off their feet) | 22 m | 5 shells, 25 spare, reload 2.2 s |

Pickups: bat outside hardware stores, fish outside bodegas (the nearest shop type to a fish counter), a six-shooter at the liquor store, a shotgun at the car repair yard, pipes at the
scaffold fences, ammo boxes by the dollar store and a bodega, and the same spread at shop doors on the real map. Ammo boxes add rounds to every gun carried and are not taken without one.
Three more shared instanced meshes (a stick, a box, a long gun; colour tells them apart) when any are within 75 m. NOT built: the ammo shop (no shop type fits without an interior), the right-mouse aim stance
(the camera has no aim hook that is free of Camera.ts). Cycling: Tab, wheel, pad LB and d-pad left are already bound (`itemNext` / `itemPrev`); nothing new in Bindings.ts.
Guns are loud: every shot is a 'gunshot' crime event (the police hear it at 70 m) and the street scatters by the gun's own radii (pistol 15 / 30 m, revolver 22 / 42, shotgun 24 / 45).
A thrown brick that hits a person now falls at their feet (it used to bounce and could hit twice).

## 5. Bust and saves

`dropWeapons: () => combat.reset()` (POLICE2) calls `Hands.restore(null)`, which now clears the melee weapon, both gun slots and their ammo. Saves keep every carried thing (`GameSave.cleanHands`
now passes through the new fields via `Hands`); an old save loads with fists and at most a pistol.

## Tests

`tests/unit/game/combat/combat2.test.ts` (every state can be hit, officers, health by build, temperament shares, cower, film, fight back, friends, player health and hospital, each weapon,
pellets, crime reports, saves and bust, blood caps, fade and Off), `tests/unit/sim/combat-scenario.test.ts` (grid and real net: punch a bystander until out, a second fights back, a third films, a shot
scatters the street and brings a star). Changed older tests only where the new rules changed the answer (hands save shape, hit on the ground, a shot on a slight person).

## Log

- 22 Nov: read the combat, pedestrian, officer and police code. Built: `src/entities/pedVitals.ts` (health, build, temperament), health and fight
  behaviour in `Pedestrian` (hitBy with force and damage, cower, film, watch, fightBack), `Officer.hitBy` (health, down 4 s), `arsenal.ts` and
  `items.ts` (bat, pipe, fish, revolver, shotgun, ammo, carry rules, saves), `melee.ts`, `crowd.ts`, `vitals.ts` (player health, hospital),
  `blood.ts` + `bloodView.ts`, `Combat.ts` rewritten around them, `anim/combatPoses.ts` (+ two lines in controller.ts), icons, sfx, pickups.
