# BODY-GAIT3: do the feet slide, and the set-off ramp as visual only (seat GAIT3, round 2, 22 Nov 2026)

Status: started. Notes kept current; if this lane is cut off, this file is what survives.

## Problem 1: reviewer says 31.6 cm slide for ba-hoodie-fade at 1.4 m/s (ankle bone, "within 3 cm of the lowest ankle"), GAIT says 2.6 cm (ball of foot, generic rig)
- Found so far: the GAIT harness (anim-measure.ts `makeRig`) uses a fake rig with the reference proportions, never a real built person; the reviewer measures real bodies but at the ankle bone.
- Plan: third measurement on real bodies, ball and heel in world space every frame (tests/unit/entities/gait3-slide.test.ts).

## Problem 2: set-off ramp visual only
- Plan: Pedestrian.ts goes back to the instant speed change; AnimController eases the legs, lean and stride phase.
