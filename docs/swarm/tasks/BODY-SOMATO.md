# BODY-SOMATO: the cast as body types (Mateo, SOMATO seat, round 3, 23 Nov 2026)

Status: in progress. Files I own: `src/entities/models/pedBodyTypes.ts`, `humanModel.ts` (nothing to change there: it is the old procedural model and reads no body type), `tests/unit/entities/somato-cast.test.ts`.

## The plan
1. The cast is a table of named points: weight and muscle coordinates (-1 = the source's minimum shape, 0 = average, +1 = maximum; BASE says how far past 1 is safe), a stature offset, small frame draws. Designed in BMI (the survey's unit) and converted to the weight coordinate by one calibration table (`BMI_ANCHORS`), so BASE's real numbers change one constant.
2. Every person draws offsets round their type's point from a stream seeded by `spec.id` (a content hash of the whole look, stable per person). `bodyBuildOf(spec)` returns `{ weight, muscle, statureM, neckCm, shoulderK, legK, bmi }`.
3. Statures: a truncated normal between the survey's 5th and 95th percentile by sex (men 1.65 to 1.87, women 1.53 to 1.74), shifted by the type (tall and short versions of every build), elders about 2.5 percent lower.
4. The pools (street mix) are tuned so adult BMI reads about a third normal or under, a third overweight, a third obese.
5. All old BodyTypeIds stay valid. Legacy frame factors (`shoulders`, `chest`, `waist`, `hips`, `arms`, `legs`) are kept ONLY for the old ids, marked deprecated, until BASE removes the deformers that read them; new ids are neutral.

## Numbers I am unsure of (flagged)
- BMI to weight coordinate: placeholder anchors until BASE measures the shapes.
- The latent adult age (muscle falls and BMI rises with age) is an estimate; the spec has only the age class.
- The thirds: US adults are 27 / 31 / 42 percent (normal or under, overweight, obese: CDC 2017-2020, from memory); the owner's target is thirds.

## Log
- 00:20 UTC started, read the docs and code.
