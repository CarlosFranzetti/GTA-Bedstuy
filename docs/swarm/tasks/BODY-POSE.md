# BODY-POSE: arms that hang, a spine, standing like a person (POSE seat, Ines Varga)

Status: 22 Nov 2026, evening. Landed and measured headless on the built people; sheets looked at; NOT yet seen in the running game.
Files: `src/entities/anim/posture.ts` (clips corrected at the source), `src/entities/anim/bodyLayers.ts` (new, pure functions),
tests `tests/unit/entities/body-pose-layers.test.ts`, `body-pose-mesh.test.ts`, `body-pose-before-after.test.ts`
(+ `fixtures/posture-before.ts`, the module as it was), sheet page `scripts/pose-sheet.html` + `scripts/pose-sheet.mjs`.

## What the owner said and what was wrong
"The bodies just look kind of silly right now." Measured before touching anything:
- the standing clip holds each elbow bent 34 degrees (walks 20 to 29, a different mean per arm) on top of a mesh forearm that already points
  10 degrees forward, so the angle between upper arm and forearm stood at 46 to 55 degrees: the hands float forward, "held out";
- the game rewrote `arm.rotation.z` to a constant (`splay`, 1.7 degrees for most people) after the controller every frame
  (`Pedestrian.reactionPose`), so no arm roll of any clip ever showed;
- the standing clips sweep the head from -67 to +59 degrees of yaw every 4 s and twist the chest 30, and the walk clip carries the head
  tilted 9 degrees to one side for the whole walk (head roll mean -9), the chest leans 3 to 6 degrees left in every walk and jog;
- an elder's stoop is baked into the mesh AND the chest pitches forward, which swings the hanging arm 7 to 13 degrees BEHIND the body;
- some walk styles fling the arms (walkLimp rolls them 20 to 40 degrees out), some (walkAngry) fold one arm into the torso.
Found on the way, not mine: with the foot lock on, a standing person's knees are 10 to 15 degrees more bent than the clip (-1/-7 deg in the
clip, -8/-18 with the lock): GAIT's file; reported on the channel.

## What changed

### 1. posture.ts: fix at the source, so every clip inherits it
New `Target` fields (degrees): `elbow` (mean flexion), `elbowKeep`, `elbowMin`, `abd` (the mean lift of each upper arm off the body, the
same both sides), `abdKeep`, `armX`, `level` (+ `rollKeep`), `headYaw`, `torsoYaw` ([mean, keep]).
- idle, idle2 (STAND): elbows 5 deg (keep 70 percent of the captured bending, never under 2), arms 4 deg off the body, chest roll mean -0.5,
  head roll mean 0 and 35 percent of its swing, head yaw mean 0 and 30 percent of its sweep (was +-60, now +-20), chest yaw 50 percent,
  knee target -3 (was -6).
- walk, walkBrisk, walkFast, walkStroll, walkJaunty, walkLimp, walkHobble: elbows 12 (keep 85 percent, never under 3), arms 5 deg off the body
  with half of the captured roll kept, chest and head roll levelled.
- jog, run: arms 6 deg off the body, both upper arms 8 / 12 degrees further forward on average (they swung only behind the vertical), levelled.
- Left alone: talk, eat, phone, walkAngry, walkSad, one-shots (start, stop, turn, jump, stumble, sit, stand), the hand-keyed poses.

### 2. bodyLayers.ts: `applyBodyLayers(p, s, st)` and `makeBodyLayerState(seed?)` (signature agreed with GAIT, who wired it into `controller.write`)
Adds to hips, torso, head, arms, elbows and the rig's sway only. Never legs, knees, ankles, rig y or z (tested). Fades out at once on `off`
(action, vault, jump, a sit/stand/stumble/flinch one-shot) and back in over a sixth of a second; `armsBusy` (crossed, lean, phone, talk, eat, a carried
bag) takes the arms alone away. `cheap` (the far level, 40 m and more) runs layer 1 only.
1. **Arms**: upper arm lifted to `max(splay + 0.05, 0.07)` rad (splay = BODY's clearance for a wide chest or a thick coat, 0.03 to 0.2) and never
   inward (floor 75 percent of that: whatever a walk style does); the chest's forward pitch, and an elder's baked stoop (`stoop` input), given back
   to the upper arms (85 percent) so they hang from the shoulder; the elbow floor 0.1 rad standing, 0.12 walking (soft), 0.2 rad of extra
   flexion per radian of forward swing (the elbow bends on the way forward).
2. **Trunk**: in a walk the ribcage tips 1.7 deg over the weight-bearing leg (the one whose knee is straighter; works for every clip, no phase needed).
   The counter-rotation of shoulders against hips is NOT added: measured in the clips (walk: chest yaw and hip yaw correlate -0.7 and the chest
   follows the stride at +0.95; jog and run the pelvis yaw is not opposite and is left as it is).
3. **Standing** (`idleW` > 0): a stepped weight shift (the loaded side changes every 5 to 12 s for an adult, 2 to 5 kids, 4 to 9 teens, 7 to 16
   elders, eased over about a second): pelvis over the loaded foot (2.4 cm), the unloaded hip drops 4 degrees (teens 5), the ribcage tips back
   over the loaded leg 2 degrees, the head follows a third of that; small head turns (adult +-9 deg, now and then +-22, kids more, total head yaw
   soft-limited at 45); teens slouch (chest 4 deg, head 3 deg forward, shoulders rolled in); a hand into a pocket about one standing adult in four
   (one hand, or both for a quarter of those), held 6 to 20 s, eased in and out in about a second, only when `pockets` > 0. Everything is
   drawn from a per-person seed, so five people stand five ways (tested).
4. **Hands**: the skeleton has no wrist and no finger bones (BONES is 13: hips, chest, head, two arms, two elbows, two legs, two knees, two
   ankles; MOVE2 and ANIM2 notes mention wrists and a neck that were never added). The hand is skinned to the elbow bone, so a relaxed curl
   cannot be posed: it is the hand mesh's rest shape (BODY). What I can do and did check: the forearm turn (elbow y) at rest already leaves
   the palm facing the thigh on the sheets, so `ARM.pronate` stays 0.

### Per-person variety and the wide-body helper
Each person draws, once, from the seed: how far the arms stand off the body (x0.85 to 1.45 of the clearance, teens a bit more), how bent the elbows rest
(-0.05 to +0.07 rad), and a left/right difference in the forward hang (about +-3 degrees), plus the standing traits above. `armClearRad(torsoHalfAtElbow,
shoulderX, upperLen, armRadiusAndCloth)` is exported for the controller to turn BODY's `torsoHalfWidthAt` into the lift a wider torso needs (asked GAIT to
pass the larger of it and `userData.splay` as `splay`; not wired yet).

### Cost
Whole controller on this loaded box (100 people, 600 frames): 12 to 17 microseconds per person-frame, layers on or off indistinguishable (noise under 1). Microbenchmark (node, this box, 20,000 calls alternating a standing and a walking person): 0.11 microseconds a call; the standing layer adds one
`exp` per timer tick and two per frame. No allocation (the state object is created once per person). Far level: arm layer only (a dozen multiplies).

## Measured: arm angle before and after (built people, same seed, mean over 40 s of idle; walk = five styles, 150 frames each)
Forearm bend = angle between the upper arm and the forearm (the mesh itself is 10 to 19 degrees at rest). Upper arm out = angle from the vertical
in the frontal plane. Swing = forward (+) and back (-) angle of the upper arm in the side view. Before = the posture module at the start of the
session, layers off, and the game's old rewrite of the arm roll to `splay`. Run `POSE_OUT=<file> npx vitest run tests/unit/entities/body-pose-before-after.test.ts`.

| build | standing: upper arm out / forearm bend / swing | walking: out / forearm bend / swing |
|---|---|---|
| slim adult | before 5.6 / 47 / -4, after 4.5 / 23 / -2 | before 0..11 / 15..70 / -25..9, after 0..12 / 18..59 / -20..14 |
| stocky, jacket | 6.2 / 51 / -4 -> 5.0 / 26 / -3 | 0..12 / 17..74 / -27..10 -> 0..13 / 21..62 / -22..14 |
| average, puffer | 7.4 / 46 / -3 -> 8.3 / 21 / -1 | 0..16 / 12..73 / -25..11 -> 3..17 / 16..58 / -20..14 |
| average, long jacket | 9.1 / 48 / -4 -> 10.9 / 24 / -3 | 0..19 / 15..71 / -25..10 -> 5..19 / 19..60 / -20..14 |
| average, dress | 6.7 / 46 / -3 -> 7.1 / 21 / -1 | 0..14 / 13..73 / -25..11 -> 2..15 / 16..58 / -20..14 |
| stocky elder | 6.0 / 55 / -12 -> 5.0 / 30 / -10 | 0..12 / 21..75 / -28..-2 -> 0..13 / 25..63 / -23..2 |
| child | 6.4 / 51 / -5 -> 4.3 / 25 / -1 | 0..9 / 30..95 / -29..5 -> 0..11 / 20..86 / -22..9 |
The elder's swing stays -10 until the controller passes `stoop`. The walking minimum of the "out" column is 0 for most because a swing through the
vertical has no side lift; the never-inward floor is on the roll channel, not on the projected angle.

Other measured: elbow clearance from the torso (BODY's `torsoHalfWidthAt`, an estimate): standing 0 to 10 cm outside the clothed torso, walking in every
style no worse than -3.3 cm (test tolerance 4 cm; the estimate itself is a centimetre or two); head roll standing under 9 degrees, walking
under 6; head yaw standing under 50.

## Agreed on the channel
- GAIT (Rowan, then the new GAIT): signature `applyBodyLayers(p, s, st)`, `makeBodyLayerState()`; I add to hips, torso, head, arms, elbows and rig x only; they
  wired it in `controller.write` (after the lean, before `alive`), deleted their own weight shift and the arm-roll rewrite in `Pedestrian.reactionPose`, pass
  off / armsBusy / seed / splay / cheap. Asked for: `stoop` (= `stoopBaked`) and `pockets`. Told them `own = stoopBaked > 0.02` can never be true (the value
  is negative). Jog and sprint arms above 2.6 m/s become theirs (`runStyle.ts`, after my call).
- BODY: `torsoHalfWidthAt(p, h)` and `armSegments` are used in the tests; `group.userData.splay` stays the clearance contract.
- CLOTHES: garment thickness at the armpit (jacket 14 mm, hoodie 17, puffer 30, cardigan 13, tee 5) is already inside `splay`; asked for `group.userData.pockets`.

## Test status (22:00 tree)
My three test files and anim-posture: green (19 + 7 + 1 + 5 tests). `tests/unit/entities` as a whole: red only in other seats' areas: pedround4/5 and clothes-defects (CLOTHES),
anim-plant 'a corner while walking and a speed change are as smooth' (walkJogSprint kneeL jump 29.2 deg against 25) and anim-bodies one-shots (ba-puffer-braids spine
0.656 against 0.65) (GAIT; identical with the layers off), and an anim-bodies idle case that timed out at load 14. `npx tsc --noEmit`: clean in my files.

## Not verified / not done
- Nothing seen in the running game (only REVIEW runs the full game). Sheets are the showcase harness with the real controller.
- Elbow floors and the abduction clamp are tuned on seven builds and five walk styles; walkAngry, walkSad, walkDrunk and walkHeavy are not corrected.
- No pocket data from CLOTHES yet: the hand goes to a fixed point at the hip (a centimetre from the thigh line), so on a long coat or a puffer it sits inside the cloth.
  Needs `pockets` and probably the opening's position per garment.
- Hands: no finger or wrist bones, so no curl; no thumbs-forward pose. Neck: no neck bone, so no head carriage beyond the head's own pitch (an elder's forward
  head is in the mesh and is not doubled).
- Standing knees (soft knee on the unloaded leg) need the legs: not mine. The weight shift moves the pelvis, hip, chest and head only.
- Hand on a bag strap, a held phone: not built (the phone and carried-bag poses exist as clips and as `armsBusy`).
