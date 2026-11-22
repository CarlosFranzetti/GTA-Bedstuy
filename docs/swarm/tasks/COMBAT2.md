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

(sections below are filled as the work lands)
