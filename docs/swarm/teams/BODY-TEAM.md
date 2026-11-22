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
