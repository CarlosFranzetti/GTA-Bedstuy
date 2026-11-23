# Body team: movement and body geometry (topic 1, started 22 Nov 2026, evening)

Status: current. Written by the lead (Fable Hart). Every member reads this file, `CLAUDE.md`, `MEMORY.md`,
`docs/swarm/RULES.md` and `docs/swarm/art/DIRECTION.md` before touching anything.

## What the owner said (22 Nov, evening)

"Let's start with movement and then the eyes. Faces are still too caricature but the features are a marked
improvement. The bodies just look kind of silly right now. Let's step it up. GTA 5 is your new bible. One team
handles faces and details while another 5 agent team handles movement and body geometry. We tackle one topic, all the
while sending me updates and demos and asking questions."

GTA V is the STYLE reference: how its street people are proportioned, dressed, stand and move, and how much detail they
carry. Nothing is taken from it or from any game: no model, texture, animation, sound, name or measurement lifted from
game files (MEMORY.md rules 1 to 4 stand).

## The owner's correction (22 Nov, late evening, on seeing the first line-up)

"What's with the elongated bodies? I said GTA V is the bible and also the style guide."

Our people are tall, narrow and thin-limbed: stretched. From now on: solid, ordinary builds first. Widths and depths
at shoulder, chest, waist, hip and thigh up to the civilian survey medians; thicker necks and limbs; statures inside the
5th to 95th percentile; more stocky and heavy people than slim ones; clothes with regular and relaxed ease. If a
change makes a person look taller or thinner it is the wrong direction unless the survey number demands it AND the
line-up still reads as solid. REVIEW says in every re-shoot whether the line-up still reads as stretched.

## The goal of this topic

A person on our street, at 3 m and at 20 m, standing, walking, jogging, sprinting, turning and stopping, reads as a
real adult (or child, or elder) in real clothes: natural proportions, arms that hang, weight in the step, clothes that
fit and fall like cloth. No toy proportions, no stiff arms, no boxy torsos, no torn patches, no skating feet.

## The five seats and what each owns (nobody edits another seat's files; ask on the channel)

| Seat | Owns | Job |
|---|---|---|
| GAIT | `src/entities/anim/locomotion.ts`, `gait.ts`, `footlock.ts`, `clipPack.ts`, `library.ts`, `controller.ts`; the movement parts of `src/entities/Player.ts` and `Pedestrian.ts` (speed ramps, turning, stopping) | Walk, jog, sprint, start, stop, turn in place, reversal, kerbs: stride matches ground speed, weight, no foot slide through speed changes |
| POSE | `src/entities/anim/posture.ts` and a new `src/entities/anim/bodyLayers.ts` (pure functions GAIT calls from `controller.ts`) | Standing and upper body: arms that hang by the sides, shoulder and hip counter-rotation, spine, head carriage, weight shift, breathing, idles by age and mood |
| BODY | `src/entities/models/pedBody.ts`, `pedBodyHi.ts`, `pedBodyTypes.ts`, `humanModel.ts`, `pedMesh.ts`, the body part of `scripts/people-pipeline.mjs` | Human proportions and build variety: head count, shoulders, ribcage, waist, hips, limbs, hands, feet, necks; children, teenagers, elders; no silly shapes |
| CLOTHES | `src/entities/models/pedGarments.ts`, `pedCuts.ts`, `pedPieces.ts`, `pedPiecesKit.ts`, `pedLegs.ts`, `pedShoes.ts`, `pedGear.ts`, `pedHeadwear.ts`; the cloth painters in `src/textures/painters/` (not the face and skin painters) | Garments that fit the new bodies and read as real, stylish clothes: cut, drape, thickness, hems, collars, layering, shoes; fabric that reads as fabric |
| REVIEW | `scripts/` harnesses and capture scripts, `tests/unit/entities/**` measuring tests, `docs/swarm/tasks/BODY-REVIEW.md` | The team's eyes: the audit of what looks wrong today, the same sheets after every change, measurements (proportions, foot slide, arm angle, budgets), the in-game check, the demo sheets for the owner. Edits no game source |

Off limits for this topic: faces, eyes, hair and skin painters (`pedHead.ts`, `pedEyes.ts`, `pedHairPieces.ts`,
`pedPaintFace.ts`, `pedEyeShape.ts`, `pedHairline.ts`): the faces team is next. Also `src/main.ts` (exact lines to the
lead), `src/core/**`, `src/game/**`, `src/ui/**`, `src/audio/**`, cars, world. The vault (`src/entities/vault.ts`), the
combat poses (`anim/combatPoses.ts`), the police hold poses and the camera stay working: their tests stay green.

## How the team talks (this is the conversation the owner will read)

- The channel is the transcript: `scripts/swarm-say.sh "Name (SEAT)" "message"`. Read the last 60 lines of
  `docs/swarm/transcript.md` when you start, before you change anything another seat depends on, and at least every
  fifteen minutes of work. Write the way colleagues talk: short, plain, specific.
- Post when you start (your name, your plan in two lines), when you find something another seat must know, when you
  change an interface (a function signature, a bone, a measurement, a field in a body or garment spec), when you need
  something ("@BODY: I need the wrist bone to sit 2 cm lower, can you?"), when you answer, and when you finish.
- Answer anything addressed to your seat before you carry on. If two seats disagree, REVIEW's measurement decides; if it
  cannot, post "@Fable:" and the lead decides.
- The research cell (three people, no code) posts findings to the same channel and writes
  `docs/reference/gta5-characters.md`, `clothing-brooklyn.md` and `faces-reference.md`. Use their numbers; ask them
  questions with "@RESEARCH:".
- Your own notes go in `docs/swarm/tasks/BODY-<SEAT>.md`, written in your first ten minutes and kept current.

## Rules of the road

- One tree, five people: re-read a file immediately before editing it; small exact edits; never reformat; never
  `git stash`; do not commit or push. Keep `src/` compiling (`npx tsc --noEmit`) at every pause: another seat is
  running tests on your half-done work.
- Budgets hold: no new draw calls per person; no new textures per person on phone and low; phone texture memory does
  not rise; triangles per person at each detail level within about 10 percent of today (say the numbers); the three
  detail levels agree in silhouette; pedestrians cost no more per frame (say what a step costs).
- Children and teenagers are never hurt in combat (`Pedestrian.isMinor`): keep it.
- The known red test is the 2 mm shoe-hem check in `tests/unit/entities/pedround5.test.ts`. CLOTHES should fix it
  properly while in there. Everything else in `tests/unit/entities`, `tests/unit/textures`, `tests/unit/core` stays
  green; say exactly why if an assertion must change.
- Browser jobs go through `scripts/swarm-render.sh` (`SWARM_SMALL=1` for showcase pages). Only REVIEW runs the full
  game; other seats use the showcase and harness pages and ask REVIEW for an in-game look.
- Stay under about 300k tokens each. A finished small thing beats a large unfinished one. Hand back a solid partial
  result rather than run out.


# Round 2: anatomy and wardrobe (started 23 Nov 2026, just after midnight UTC)

## What the owner said (22 Nov, late night, with ten reference pictures)

"Fix shoulder blades and curve in the upper back. Elders, teenagers and children get special shaping. Neck thickness
variations. What's with the misshapen arms, thighs and crotch? Can you do some research on human anatomy and have the
bodies resemble actual human forms; that said, be economical with polygons. In terms of clothing I want more like 60
outfits, and tops, bottoms, hats, shoes, sneakers can be mixed as well for more variety."
On his reference pictures: "these images are a bit extreme for our purposes in terms of muscular detail, but as far as
proportions go this is what needs to happen; same goes for the vehicles' shapes and textures overall; likewise for the
streets and roads and clothing. Next round we need to tackle textures. Absolutely strive for this kind of detail on
faces and clothing but conserve polygons."

His pictures are in the session scratch folder, NOT in the repository and never to be copied into it (they are other
games' screenshots: look, learn the proportions, take nothing):
`/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/refs/` (`ours-lineup-crop.jpg`
is OUR line-up with the faults he means; the `ref-*.jpg` files are the look he wants). Open them with the Read tool
before you start. What they show: broad shoulders over a narrower waist; a thick neck running into sloped trapezius;
a rounded deltoid cap; upper arms and forearms with real muscle shape and a visible elbow; a back with shoulder
blades and a spine channel; a seat and thighs with mass, thighs that touch at the top; calves; hands that are big
enough; people standing with weight. Our line-up shows: tube arms with no elbow, a coat-hanger shoulder, stick
thighs with a gap and a black wedge between them, no back.

## What round 1 achieved (read `docs/swarm/tasks/BODY-*.md` for the detail)

Arms hang and reach mid-thigh, hands and heads are the right size, bodies have real width and depth (survey girths by
build, `src/entities/models/pedMass.ts`), statures are in the normal range, the standing squat is gone, the run has
arm drive, shoes follow the foot, seventeen whole outfits exist, the black wedges under hems are fixed in code (a
texture bake fault). REVIEW's last numbers: chest depth and waist depth read 14 to 17 percent THICK and shoulders 8
percent wide WHEN DRESSED (coats look padded and square); shoes still 0.188 of stature (real 0.154).

## The five seats of round 2 (nobody edits another seat's files; ask on the channel)

| Seat | Owns | Job |
|---|---|---|
| TORSO | `src/entities/models/pedMass.ts`, a new `pedTorso.ts`, `pedMesh.ts` (makes the three hooks below in its first fifteen minutes) | The trunk as anatomy: ribcage, shoulder blades and the spine channel, the curve of the upper back, chest, belly, the pelvis and the crotch, the seat; the neck and its thickness variation; the trapezius and the shoulder top |
| LIMBS | a new `src/entities/models/pedLimbs.ts`, `pedProportions.ts` | Arms and legs as anatomy: deltoid cap, upper arm, elbow, forearm, wrist, hand; thigh, knee, calf, ankle, foot; the join of the thighs at the crotch (with TORSO) |
| AGES | a new `src/entities/models/pedAges.ts`, `pedBodyTypes.ts`, `humanModel.ts` | Elders, teenagers and children as their own shapes; children refitted (round 1 left them out); the mix of builds and ages on the street |
| FIT | `pedGarments.ts`, `pedCuts.ts`, `pedPieces.ts`, `pedPiecesKit.ts`, `pedLegs.ts`, `pedShoes.ts`, `pedFit.ts` | Garment geometry on the new bodies: coats that are not padded boxes, sleeves and trouser legs that taper, a trouser seat and crotch that look like trousers, collars and hems, shoes the size of feet |
| WARDROBE | `src/textures/painters/pedOutfits.ts`, `pedWardrobe.ts`, the cloth painters, `pedGear.ts`, `pedHeadwear.ts` | About sixty outfits, and a mix system so tops, bottoms, hats and shoes also combine freely into believable people |

The hooks: in `dressLodBody` in `pedMesh.ts`, after `massApply`, TORSO adds three calls in this order and posts when
they are in: `applyTorso(...)`, `applyLimbs(...)`, `applyAges(...)`, each a function of the seat's own file with the
same arguments `massApply` takes (stub files that return the input unchanged are created by TORSO so everyone
compiles). Each pass must be replayed on the mid and far levels so the three levels agree, as `pedMass.ts` does.

There is no REVIEW seat this round: the lead runs Wren's tools (`scratchpad/bodyteam/review/shoot.sh <tag>`, the
measuring test `tests/unit/entities/body-review-measure.test.ts`) and posts the sheets and numbers. Seats use the
showcase pages (`scripts/body-lineup.mjs`, `scripts/clothes-showcase.mjs`, `scripts/body-review.mjs`) themselves.
Three researchers post numbers to the channel (ask with "@RESEARCH:"): the trunk, back and neck
(`docs/reference/anatomy-trunk.md`), limbs and ages (`docs/reference/anatomy-limbs-ages.md`), and the wardrobe of sixty
outfits with mix rules (`docs/reference/wardrobe-60.md`). The lead added the three hooks and the stub files himself
before the seats started. A small fix lane, GAIT3, owns `src/entities/anim/**` this round (foot slide measurement,
the set-off ramp made visual only so the seeded simulations stay as they were): `docs/swarm/tasks/BODY-GAIT3.md`.

Everything else in this file still holds: the channel, the rules of the road, the budgets (triangles per person per
level within about 10 percent of today: 6,391 / 1,626 / 360 on average; no new draw calls or textures per person on
phone and low), minors never hurt, off-limits files (faces, eyes, hair, `src/main.ts`, animation: `src/entities/anim/**`
belongs to nobody this round: if a body change needs an animation change, post "@Fable:").

# Round 3: bodies from the source, not from deformers (started 23 Nov 2026, 00:15 UTC)

## What happened

- Round 2's first limb pass hit the survey girths and looked WORSE from the front and back: jodhpur thighs, a ledge at
  the knee, a cuff at the wrist. The lead rejected it. The owner saw the same sheet and marked the same faults, plus the
  one nobody had fixed: "what's with the strange fold between arm and torso; also the thighs aren't accurate yet. This
  causes the clothing to look strange. Let's get closer to the reference images. Proportions and variation: there are
  many human body types, ectomorph, endomorph, etc., obese and skinny, tall and short. Mix it up but do it more
  accurately; it needs to more closely resemble the human form. I'm not saying go read Gray's Anatomy, but follow the
  images I sent."
- At 23:54 UTC the container restarted. Everything not pushed was lost: the first limb pass (no loss), the wardrobe
  seat's 65 outfits and mix system (a real loss), the half-done trunk, ages and gait work, and the whole scratch folder:
  the owner's ten reference pictures and the lead's capture scripts. Work is now saved and pushed automatically every
  four minutes. Tools worth keeping go in `scripts/dev/` in the repository, never only in the scratch folder.

## The root cause (the lead read the pipeline)

1. EVERY body is the SAME average build. `scripts/people-pipeline.mjs` bakes 23 base meshes that differ by population
   group, sex and age only. Build comes from two linear morphs (MakeHuman's max-weight and max-muscle shapes, young
   adult only; "thin" is the heavy shape run backwards) and then a stack of hand-written deformers in
   `dressLodBody` (`pedMesh.ts`), `pedMass.ts`, `pedProportions.ts`: shoulders widened, torso flattened, girths fitted
   to a survey table. Those deformers are what make padded boxes, jodhpurs and ledges. A girth table is not a body.
2. THE FOLD AT THE SHOULDER is baked in. The source mesh stands in an A pose. The pipeline hangs the arms by rotating
   "every arm weighted vertex about the shoulder" with the game's coarse 12-bone weights, so the shoulder collapses
   into a box corner with a crease, before decimation, on every shape.
3. The source has what the owner is asking for. MakeHuman's CC0 data holds artist-made shapes for the whole grid of
   muscle (min, average, max) by weight (min, average, max) for men and women at each age (child, young, old), and a
   163-bone skeleton with shoulder, clavicle and twist bones and their weights. Checked on 23 Nov: the target files
   answer at the pipeline's RAW address (for example `universal-male-young-minmuscle-maxweight`, `...-maxmuscle-maxweight`,
   `universal-male-old-averagemuscle-maxweight`, `universal-female-child-averagemuscle-maxweight`).

## The plan

Bodies come from the source's own shapes, blended, and the hand-written mass and limb deformers are retired.

| Seat | Owns | Job |
|---|---|---|
| BASE | `scripts/people-pipeline.mjs`, `src/assets/models/people/**`, `src/entities/models/pedMesh.ts` (body part only), `pedMass.ts`, `pedTorso.ts`, `pedLimbs.ts`, `pedAges.ts`, `pedProportions.ts` | The pipeline ships the full muscle by weight grid as morphs per shape and level, for young, old and child; hangs the arms with the source's own skeleton so the shoulder is a shoulder; spends triangles so limbs keep their outline. The runtime blends the grid the way the source does and stops reshaping the result |
| SOMATO | `src/entities/models/pedBodyTypes.ts`, `humanModel.ts`, their tests | The cast: body types as points in muscle by weight space with stature and frame (ectomorph, mesomorph, endomorph and the mixes; obese, skinny, tall, short, stocky; elders, teenagers, children), a seeded spread round each point so no two people match, and the street mix |
| WARDROBE | as in round 2 | Rebuild the lost mix system and about sixty outfits from `docs/reference/wardrobe-60.md` |
| FIT | as in round 2 | Starts when BASE's bodies are in: garments over the new bodies |

Interface between BASE and SOMATO: a body type keeps its `weight` and `muscle` fields (now true coordinates: -1 is the
source's minimum shape, 0 average, +1 maximum; BASE says how far beyond 1 is safe) and `h`; the other hand-tuned
factors (`shoulders`, `chest`, `belly`, `waist`, `hips`, `arms`, `legs`) are retired or cut to small, smooth frame
differences that SOMATO must justify with a picture. BASE posts the exact fields it reads.

The rule from round 2 stands: LOOK. Every seat shoots front, back and side sheets and compares them with the owner's
marked sheet (`scratchpad/refs/owner-marked-faults.png`) and the written description of his references in "Round 2".
The reference pictures themselves were lost in the restart; the owner has been asked to send them again.

# Round 3: how it ended (23 Nov 2026, about 03:00 UTC)

Written by the documentation editor from the seats' notes and the channel. Seat results are the seats' reports; the lead
booted one mid-work snapshot (real map, hosted build, about 02:50 UTC: clean, 303k triangles, 200
draw calls, new bodies in the street). Nothing from rounds 2 and 3 is deployed. Story: `docs/swarm/transcripts/2026-11-23-body-team.md`.

| Seat | Who | Outcome | Notes |
|---|---|---|---|
| BASE | Mira Castellan | Done in two shifts (the usage limit stopped her after 00:37 UTC; she resumed after the reset). Arms hung with the source skeleton; the full muscle by weight grid shipped on every shape; all ten deformers off (`VITE_BODY_OLD=1` restores); child figures `kid_a`, `kid_b`; muscle capped by age; women's build shapes fixed; build-aware decimation. Corrected the lead's diagnosis: the shoulder fold was made at run time, not by the pipeline's arm hang. Her edit to `pedBodyTypes.ts` was refused by the permission system; the dead fields are listed in her notes | `docs/swarm/tasks/BODY-BASE.md` |
| SOMATO | Mateo | Done. 30 body types (9 new), `bodyBuildOf(spec)`, statures inside the survey's 5th to 95th percentile, adult BMI mix 34 / 34 / 32 percent | `BODY-SOMATO.md` |
| WARDROBE | Jonah Reyes (after Dara Okonkwo's build was lost in the restart) | Done. 61 outfits, 26 tops, 28 layers, 31 bottoms, 18 shoes, 6 one-pieces, mix rules in `pedMix.ts`, 39 tests | `BODY-WARDROBE.md` |
| FIT | Nora Vance | Stopped on budget after two fixes: neckline height per person, the hood cowl. Split into the two seats below | `BODY-FIT.md` |
| FIT-TOPS | Tomas Reyes | Necklines and collars as geometry (one function for paint and geometry). Sleeves only softened; open layers not done | `BODY-FIT.md`, "FIT-TOPS" |
| FIT-LEGS | Cleo Brandt | The trouser fork pouch fixed (the base mesh's own crotch triangles, cut away); seat rows from the built hip; shoes 0.163 to 0.166 of stature | `BODY-FIT.md`, "FIT-LEGS" |
| GAIT3 | Ines Marlowe | Each person's own foot from the skin; a dragged foot lifts and steps; ball slide at most 1.4 cm in walks, starts and stops; the reviewer's 31.6 cm was a stance-detection error; the set-off ramp visual only; simulation folder green by her run | `BODY-GAIT3.md` |

## What the next team inherits

- The FIT leftovers: open-front layers (opening width, seams); hood wings at the shoulder tips; cuffs and plackets; sleeves
  that read as pipes; `bottom.fit` (slim, wide, taper) ignored; the waistband that does not drop under a belly; a dark remnant
  at the fork on heavy builds, dark back-pocket flaps, a notch on shorts and skirts; the skirt built from the base shape's hip
  rings (`pedround5` skirts, a real fault); every garment in `pedMix.NEEDS_SHAPE`; the pale chest bib under open layers.
- The open body items: knees step (the source itself steps 4.9 mm per cm); `neckCm`, `shoulderK`, `legK` drawn and not
  applied; a small thigh gap on slimmer builds; the elder's stoop not passed to the body layers; obese hands against the
  thighs not measured; kerbs, turning on the spot and run reversals (from round 1); the "broad" type has no street civilian.
- Red at the seats' last runs: `pedround5` (skirts, triangle counts within 5 percent, sleeves on `ea-kid`), `pedpieces`
  (athletic, broad), `body-pose-before-after` (ba-work arm), `gait3-slide` (wh-office stop at 4.0 m/s, red in BASE's
  02:50 run). No one has run every folder on the final tree.
- The single-file build is at 11,823,623 of 12,000,000 bytes (BASE, 02:32 UTC).

## Next topics (the owner's order)

1. Faces and eyes (the faces researcher's trait table and eyeball note are ready: `docs/reference/faces-reference.md`).
2. Vehicles: the shapes to the owner's references, the classes not yet reshaped, a motorbike, maybe a skateboard; then the
   camera and the engine sound that still stutters.
3. Textures: clothing, faces, streets and roads.
