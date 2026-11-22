# Faces reference: why ours read as caricature, what real faces do, how to build a believable eye

Written 22 Nov 2026 by the faces researcher ("Maren Voss", RESEARCH faces) for the FACES team. Style reference only: nothing in
here is taken from a game; GTA V is described only from published material (section 4). No search or request carried the game's
name or the owner's name.

Owner, 22 Nov, after looking at the live game: "faces are still too caricature but the features are a marked improvement, the eyes
are wonky again. Refer to GTA 5: I want that kind of detail."

How to read the marks. CHECKED = I opened the source this session and the number is as printed there, or I computed it myself from
a public data file I downloaded to the scratchpad (not the repository). ESTIMATE = my arithmetic from the code or an inference.
MEMORY = from memory, not checked: treat as a lead.

## 0. Headlines

1. Our shape draws are too wide in a few places and too narrow in others, and they are all independent. Worst: cheekbone width
   (face breadth about 1.8 times the real spread), nose protrusion (about 2.4 times), ear flare (about 1.5 times), mouth width
   (about half the real spread, too narrow), head height (about half). Head breadth, head length, face length, eye spacing, nose
   breadth, jaw breadth are about right.
2. The draw is not a bell curve. `gv` = clamp(1.5 x (u1+u2-1), -1, 1) is a flat-topped shape: 11 percent of draws sit exactly on the
   clamp, per trait. With about 30 independent traits, a typical person has 3 to 4 traits parked at their limit (30 x 0.111 = 3.3)
   and only 3 percent of people have none. A real face is average on most dimensions and unusual on one or two. That is the
   caricature mechanism: a caricature IS a face whose deviations from the average are scaled up, and we scale up several at once.
3. Real traits are correlated, ours are not. In US adults (ANSUR II, computed here) face breadth and head breadth correlate 0.64,
   face breadth and interpupillary distance 0.45, face breadth and body weight 0.50; face length hardly follows face breadth (0.20).
   Our traits ignore all of this except through sex, age and heft.
4. The eye problem is mostly construction, not proportion: a flat painted iris on a displaced patch has no parallax and no
   bulge, so it looks stuck on at three-quarter view. See section 2.
5. What GTA V is published to do (section 4): blend two whole coherent faces (parents) rather than add independent per-feature
   noise, then layer skin detail (blemish, complexion, ageing) over a clean base at variable opacity. That removes odd
   combinations by construction. Our 23 base heads can be blended the same way if their topology matches (check first).

## 1. Why our faces read as caricature: the trait table

### 1.1 How our numbers are drawn (read from `src/entities/models/pedHead.ts`)

- `g(trait)` = clamp(1.5 x bell, -1, 1), bell = (hash a + hash b - 1), i.e. a triangular draw on [-1, 1]. I simulated it:
  standard deviation of g = 0.578, 11.1 percent of draws at exactly -1 or +1. So for a trait `c * g`: sd = 0.578 c, and the
  extreme (clamp) = c, which is 1.73 sd. Both are in the table below as "ours sd" and "ours limit". (ESTIMATE, simulation of the formula.)
- Displacements are peaks of gaussian fields; a feature that moves on both sides of the face (cheekbone, jaw, gonial angle)
  changes a breadth by TWICE the per-side number. Where a field does not reach 1.0 at the measuring landmark I have shrunk the
  number (cheekbone about 0.9 at the zygion; jaw band about 0.5 at the zygion, about 0.9 at the gonion). These weightings are ESTIMATES: I
  did not run the game or measure morphed meshes. Anyone with the harness can verify in ten minutes: morph 200 heads, measure
  bizygomatic (max |x| of the cheek rows) and nose-tip z, compare the sd with the real column.
- "Real sd" below is the within-sex standard deviation of US adults, ANSUR II (4,082 men, 1,986 women, public CSV from the Penn State
  OPEN Design Lab, computed by me) and the NIOSH respirator-user survey (Zhuang and Bradtmiller 2005: 2,543 men, 1,454 women, table
  VI opened). Their ranges are broad for a US city: ANSUR II is military (young, fit, few very old or very heavy people); NIOSH is
  the civilian workforce, 18 to 66, weighted to the US census.

### 1.2 The table (millimetres unless marked; men / women where they differ)

| Dimension | Our trait (code) | Ours sd / limit | Real mean and sd (source) | Verdict | Use instead (sd, clamp) |
|---|---|---|---|---|---|
| Face breadth, bizygomatic | `cheekBone` 9.5 mm per side, `headW` 5.5 percent, `jawW` at the cheek, `fat`, `pro` | about 11 mm / about 27 mm half-range (ESTIMATE) | M 142.6 sd 6.2; F 133.8 sd 5.6 (ANSUR II, CHECKED, computed). NIOSH M 143.5 sd 6.9, F 135.1 sd 6.5 (CHECKED). 1st to 99th percentile in ANSUR men: 129 to 158 mm | TOO WIDE about 1.8 times. Sd should be about 6, the 1 to 99 span about 29 mm, ours spans about 54 | sd 6 (men), 5.5 (women); clamp 2.2 sd. Cut `cheekBone` to about 4 mm per side (ours then adds about 4 mm sd) and let head breadth carry the shared part (r 0.64) |
| Head breadth | `headW` 1 + 0.055 g (+ sex, heft) | 3.2 percent (4.5 mm) / 5.5 percent | M 154.3 sd 5.5; F 147.8 sd 5.2 (ANSUR II, CHECKED); NIOSH M 153.0 sd 6.0, F 146.8 sd 5.6 (CHECKED) | ABOUT RIGHT (real CV 3.5 to 3.6 percent) | sd 3.6 percent, clamp 2.2 sd |
| Head length | `headL` 1 + 0.06 g | 3.5 percent (6.9 mm) / 6 percent | M 199.5 sd 7.0; F 189.8 sd 7.5 (ANSUR II, CHECKED); NIOSH M 197.3 sd 7.4 (CHECKED) | ABOUT RIGHT | sd 3.7 percent |
| Head height, tragion to vertex | `headH` 1 + 0.04 g | 2.3 percent (3 mm) / 4 percent | M 131.1 sd 6.2; F 126.5 sd 6.5 (ANSUR II, CHECKED), CV 4.7 to 5.2 percent | TOO NARROW by about half (hair hides most of it) | sd 4.8 percent; low priority |
| Face length, menton to sellion | `faceLen` 7.5 percent below the eyes plus `chinDrop` 9 mm | about 7.4 mm (5.3 + 5.2 combined) / about 18 mm (ESTIMATE) | M 122.6 sd 6.7 (ANSUR II); 122.7 sd 7.0 (NIOSH); F 113.1 sd 6.1; 113.4 sd 6.1 (CHECKED) | ABOUT RIGHT to 1.1 times wide | sd 6.5 total, clamp 2.2 sd (about 14 mm); give `chinDrop` less of it (sd 2.5 mm) |
| Bigonial breadth | `jawW` 11 percent, `jawAngle` 6.5 mm per side | about 9 mm (ESTIMATE) | NIOSH M 120.4 sd 10.4; F 110.1 sd 8.9 (CHECKED). Not in the public ANSUR II file. A caliper over soft tissue: includes fat | ABOUT RIGHT. But it must follow weight and neck (see 1.3) | sd 8 to 9, tied to heft |
| Interpupillary distance (eye spacing) | `eyeGap` 1 + 0.085 g | 4.9 percent (3.1 mm at 64) / 8.5 percent | NIOSH M 64.5 sd 3.6; F 61.9 sd 3.5 (CHECKED). ANSUR II M 64.0 sd 3.4; F 61.7 sd 3.6 (CHECKED, computed; the CSV stores tenths of mm) | ABOUT RIGHT, slightly narrow | sd 5.5 percent, clamp 2.2 sd |
| Nose protrusion (tip forward) | `noseFwd` 11.5 mm (+ 4.5 mm if old) | 6.6 mm / 11.5 mm | NIOSH M 21.1 sd 2.7; F 19.8 sd 2.7 (CHECKED; 1st to 99th percentile for men 15 to 28) | TOO WIDE about 2.4 times. THE biggest single cause of a cartoon profile | sd 2.7, clamp 2.2 sd (about 6 mm). `noseFwd` coefficient about 4.7 mm. Check the age term (+4.5 mm): no open source found for how nose protrusion changes with age |
| Nose length (subnasale to sellion) | `noseLen` 6 mm + `noseDrop` 7 mm | about 4.6 mm (ESTIMATE) | NIOSH M 52.0 sd 4.1; F 48.2 sd 3.8 (CHECKED) | ABOUT RIGHT, 1.1 to 1.2 times wide | sd 4, but see correlation with face length |
| Nose breadth (alar) | `noseW` 1 + 0.17 g | about 3.9 mm (ESTIMATE) | NIOSH M 36.6 sd 4.1; F 33.2 sd 3.9 (CHECKED; skew 0.78: a long fat tail to the wide side; caliper presses on soft tissue) | ABOUT RIGHT against NIOSH; my MEMORY of Farkas-type sd is about 2.5, which would make ours 1.5 times wide. Two sources disagree: keep sd 3.5 | sd 3.5, clamp 2.2 sd, allow a longer tail on the wide side |
| Mouth width (lip length, cheilion to cheilion) | `mouthW` 1 + 0.1 g, tapered by `sstep` | about 2 mm (ESTIMATE) | NIOSH M 51.1 sd 4.2; F 48.0 sd 4.0 (CHECKED) | TOO NARROW about 2 times: all mouths are the same width | sd 4, i.e. mouthW 1 + 0.14 g and widen the taper so it reaches the corners |
| Eye fissure length (outer to inner corner) | none (not a trait) | 0 | Hong Kong Chinese young adults M 27.6 sd 1.7; F 26.0 sd 1.8 (CHECKED, one population, n 51 and 52). The same paper says other groups' fissures are longer | MISSING: every eye is the same size | add `eyeLen`, sd 1.6 mm (about 6 percent) |
| Ear length | `ear` 1 + 0.2 g, vertical at half weight | about 2 to 4 mm (ESTIMATE) | M 64.2 sd 4.5; F 59.4 sd 3.9 (ANSUR II, CHECKED) | PROBABLY TOO NARROW in length | sd 4.2, plus the age term from MEMORY (ears keep growing) |
| Ear protrusion | `earFlare` 7.5 mm + `ear` x 12 mm | about 4.5 mm (ESTIMATE) | M 23.2 sd 3.0; F 20.4 sd 2.7 (ANSUR II, CHECKED) | TOO WIDE about 1.5 times | sd 2.8; flare coefficient about 4.5 mm |
| Ear breadth | `ear` | about 1.4 mm | M 36.1 sd 3.0; F 33.2 sd 2.8 (ANSUR II, CHECKED), CV 8.3 percent | TOO NARROW | sd 3 |
| Neck circumference | `neckT` 1 + 0.12 g + 0.085 fat + 0.055 pro + 0.04 old | about 9 to 10 percent diameter (ESTIMATE) | ANSUR M 397.6 sd 25.8, F 329.8 sd 19.2 (CHECKED, CV 5.8 to 6.5 percent). Correlation with weight 0.79 (CHECKED) | TOO WIDE for the part that is not weight (1.4 times) | independent term sd 3 percent; the rest from heft |
| Brow ridge forward | `brow` 7.5 mm | 4.3 mm / 7.5 mm | no open number found | ESTIMATE: likely 1.5 to 2 times wide: the glabella relief in soft tissue is a few mm | sd 2.5 (estimate), clamp 2.2 sd |
| Chin forward, forehead slope, eye socket depth, cheek fullness, lip fullness, jowl | `chinFwd` 8.5, `foreheadSlope` 11, `eyeDepth` 4.2, `cheek` 4.5, `lips` 4.5, `jowl` 4.2 mm | 2.4 to 6.4 mm | no open number found for any of them (soft-tissue profile norms are in Farkas' book, which I could not open) | UNKNOWN. Given the nose result, assume the 9 to 11 mm coefficients are too wide too | halve them until measured against real profile photographs |
| Eye height difference (asymmetry) | `asymEye` 1.2 mm | 0.7 mm per eye; 1.4 mm between the two eyes / 2.4 mm | no open number found | Check by eye: 2.4 mm on a 10 mm eye opening is very visible and reads as WONKY. Real asymmetry exists but is mostly within 1 mm (MEMORY) | clamp the difference at 1 mm |
| Age, heft, sex | `old`, `fat`, `pro` | sex gap in face breadth from `pro` only about 2 mm | real sex gap in bizygomatic 8.8 mm (ANSUR II, CHECKED); in menton-sellion 9.5 mm | The macro targets carry the rest. Check the finished faces: are men 9 mm broader in the face than women, on average? | measure on the 200 heads |

Population groups, with the survey's own categories (ANSUR II "DODRace", self-reported, numeric codes read as 1 White, 2 Black,
3 Hispanic, 4 Asian; the code-to-label key is from MEMORY of the data dictionary, not checked on the page). Means in mm, men then
women; sd is about 5 to 6 in every cell. These are US military personnel, the "Asian" cells are small (117 men, 71 women), and
each category lumps many origins, so read them as a size of effect only (computed by me from the public CSV; CHECKED):

| Dimension | White | Black | Hispanic | Asian |
|---|---|---|---|---|
| Bizygomatic, men / women | 141.9 / 132.3 | 143.6 / 134.9 | 144.0 / 134.2 | 146.7 / 139.2 |
| Head breadth | 154.0 / 147.1 | 154.6 / 148.0 | 154.9 / 148.4 | 158.2 / 151.9 |
| Head length | 199.9 / 188.8 | 201.1 / 193.2 | 197.0 / 187.0 | 192.3 / 183.7 |
| Interpupillary distance | 63.3 / 60.2 | 66.9 / 64.0 | 64.2 / 61.6 | 64.2 / 61.7 |
| Menton-sellion | 122.3 / 112.4 | 124.2 / 114.0 | 122.8 / 114.1 | 121.7 / 111.6 |
| Ear length | 64.4 / 59.6 | 62.1 / 58.7 | 65.4 / 59.8 | 64.6 / 59.1 |

The group means differ by well under one within-group sd on every row except interpupillary distance and head length (about 1
sd). The within-group spread (6 mm on a face breadth of 140) is far larger than the gap between group means (up to 5 mm). Design
consequence, which the code already follows: do NOT tie a trait to a group. Keep one set of spreads for everyone; let the macro
shape give each group its base; never push a group's face toward a type. NIOSH weighted its sample to the US census and gives only
the pooled sex tables in the article I opened, so I have no NIOSH group table.

### 1.3 Correlations real faces have (and ours lack)

Pooled within-sex Pearson correlations from the ANSUR II public files (CHECKED, computed; 6,068 people; sex removed first):

|  | face breadth (bizyg.) | head breadth | head length | face length (men-sell.) | interpupillary | ear length | ear breadth | neck circ. | weight | stature |
|---|---|---|---|---|---|---|---|---|---|---|
| face breadth | 1 | 0.64 | 0.18 | 0.20 | 0.45 | 0.22 | 0.09 | 0.54 | 0.50 | 0.16 |
| head breadth | 0.64 | 1 | 0.19 | 0.17 | 0.30 | 0.10 | 0.05 | 0.36 | 0.31 | 0.10 |
| head length | 0.18 | 0.19 | 1 | 0.31 | 0.29 | 0.15 | 0.11 | 0.31 | 0.37 | 0.36 |
| face length | 0.20 | 0.17 | 0.31 | 1 | 0.18 | 0.16 | 0.13 | 0.23 | 0.29 | 0.30 |
| ear length | 0.22 | 0.10 | 0.15 | 0.16 | 0.14 | 1 | 0.33 | 0.28 | 0.31 | 0.20 |
| ear protrusion | 0.07 | 0.12 | -0.07 | 0.00 | -0.01 | 0.24 | 0.08 | -0.01 | 0.01 | 0.03 |

What this means as rules for the generator:

1. One "frame" factor. Face breadth, head breadth, interpupillary distance, neck and weight move together (0.3 to 0.64). Draw one
   latent "frame" and one "heft" value per person and let those drive breadths, instead of five independent breadth draws.
   Per 1 sd of body weight (14 kg men, 11 kg women), face breadth rises 3.3 mm (men) and 2.3 mm (women), r 0.53 and 0.42
   (CHECKED, computed). A heavier person's face is wider, not only fuller.
2. Face length is nearly its own factor. Face breadth and face length correlate 0.20, so a wide face is NOT a short face, and
   a long face is not narrow: a person who is both wide (above +1 sd) and long-faced (above +1 sd) is fine. The combination that is
   rarer than chance is wide AND short: 1.6 percent of men and 1.3 percent of women against 2.5 percent if independent
   (CHECKED, computed). Because of the 0.20 correlation, face length follows head length (0.31) and stature (0.30) a little.
3. Ratios vary less than the parts would if they were independent. Menton-sellion / bizygomatic: mean 0.861 sd 0.054 (men), 0.847 sd
   0.051 (women) (CHECKED, computed): a 6 percent spread. Ours, independent: the face-length spread (about 6 percent) and the
   breadth spread (about 8 percent) combine to about 10 percent (ESTIMATE). So our ratio, which is what the eye reads as "long
   face" or "wide face", varies about 1.6 times more than a real one. Interpupillary / bizygomatic: 0.449 sd 0.023 (men): a 5 percent spread.
4. Ears: length and breadth correlate 0.33; protrusion is independent of everything else (all within 0.12): keep `earFlare`
   independent of `ear`. Ear length rises with weight and age in this sample (0.31 pooled with weight, which is confounded with age).
5. A long face with a long nose. The public ANSUR II file has no nose dimensions and the NIOSH article gives no correlation
   matrix, so I could not measure it. By construction the nose is 43 percent of menton-sellion (52 / 122, computed from NIOSH means),
   so nose length and face length must correlate positively. ESTIMATE: r about 0.4 to 0.6. Draw nose length with a loading on the face-length factor,
   and remove that part from `faceLen`. Our model draws `faceLen`, `noseLen` and `chinDrop` independently, so a long nose
   in a short face and vice versa happen about as often as the opposite, which they should not.
6. Overall size. Almost every head and face dimension rises with weight and stature (0.1 to 0.5). A person is a bit bigger in
   everything or a bit smaller, rather than random per feature. One small "size" factor (about 0.3 loading on every breadth and
   length) reproduces most of the matrix.

Suggested generator: draw 6 latents with a unit normal (size, frame/heft, face length, nose, mid-face depth, mouth/chin), build
traits as loadings (rows above) plus a small independent residual per trait, clamp each final trait at 2.2 sd, and keep a hard limit
of at most two traits beyond 1.5 sd per face.

## 2. The eye for a low-polygon game head

### 2.1 What the eye is, in millimetres (read at 1 to 3 m)

| Part | Value | Source |
|---|---|---|
| Fissure length, inner corner to outer corner (en-ex) | men 27.6 sd 1.7, women 26.0 sd 1.8 in Hong Kong Chinese young adults; the paper says Italians, North American Caucasians and African-Americans have longer fissures | CHECKED (Jayaratne et al. 2013, PMC3730197, CC BY) |
| Fissure height, upper to lower lid margin (ps-pi) | 11.5 to 11.9 sd 1.0 to 1.7 in the same study (three-dimensional stereophotography, eyes looking at a mirror); a South Indian children's study gives 8.1 to 8.6 (4 to 15 years) | CHECKED |
| Fissure height / length | 42 to 46 percent in the same study | CHECKED |
| Marginal reflex distance, upper lid margin to the corneal light reflex (MRD1) | 4 to 5 mm in adults; lower (MRD2) about 5 mm; so fissure height about 9 to 10 mm | CHECKED as printed in a search excerpt of a teaching page; the original is Putterman 2012, cited by EyeWiki, not opened |
| Visible iris diameter (HVID) | children 10.45 (4 to 5 years) to 10.73 (11 to 15 years), sd 0.4; adults about 11.7 (MEMORY, not checked: expect about 11 to 12) | children CHECKED (Challa et al. 2024, PMC11282901); adults MEMORY |
| Globe | about 24 mm across (MEMORY) | MEMORY |
| Interpupillary distance | 64 men, 62 women (see 1.2) | CHECKED |
| Inner corner gap (en-en) / outer corner gap (ex-ex) | 40.6 / 93.0 men, 38.3 / 88.4 women (Hong Kong); canthal index (en-en over ex-ex) 43 to 44 percent | CHECKED |

Consequences for a model:

- The iris is about 43 percent of the fissure length (11.7 / 27, mixed sources: ESTIMATE). Our painted iris should be close to this
  ratio, not larger. FACES4 already shrank it; keep a ratio check in the test.
- The upper lid covers a strip of the iris top: iris radius about 5.9 mm, MRD1 4 to 5 mm, so 0.9 to 1.9 mm of iris is under the
  lid, about 8 to 16 percent of its height (ESTIMATE from the two numbers). The lower lid sits at about the lower limbus (covers 0 to 1 mm). White
  must show on both sides of the iris in a relaxed forward gaze and NOT above or below it (a ring of white all round reads as startled).
- "One eye width between the eyes" is a rule of thumb that fails in the one measured sample I opened: the gap between inner corners was
  1.4 to 1.5 times the fissure length (38 to 41 mm gap over 26 to 28 mm length), and the authors state that the "eye length equals
  intercanthal distance" canon does not hold for their group. Use it as a loose centre (1.0 to 1.5 eye widths), vary it by person
  with the sd of 1.2 (about 3 mm in the corner gap).
- "Eye line at half the head height": MEMORY (a standard drawing rule). It is cheap to check: put a ruler on our own head frame
  (`headFrame`: eyeY between chinY and crownY) and compare with 0.5. Real heads put the eyes a little above the middle once the
  hair is excluded; the crown with hair makes it look lower.
- Canthal tilt (outer corner above inner corner): the norm range I would quote is about +3 to +8 degrees, MEMORY, not checked:
  I opened no numeric source. Our `eyeTilt` gives at most about 3 degrees (ESTIMATE from the code: 3.4 mm over 30 mm at the clamp),
  so our eyes are all nearly level. Widen it to +/- 6 degrees around +4 (a small tilt is the commonest case).

### 2.2 Why a painted eye on a flat lid looks "wonky"

Ranked by how likely each is, given FACES4's notes (not seen in the running game; I did not run it):

1. No parallax. A flat painted iris stays circular and centred whatever the head angle. A real eye is a sphere under a curved
   transparent cornea; at three-quarter view the iris becomes an ellipse and shifts toward the near corner, and the near white
   widens. A painted flat iris at three-quarter view therefore looks pasted on and seems to follow the viewer. This is the main
   cause of "wonky" in any game that paints the eye into the head texture.
2. Gaze. Both eyes must look at the same point: with converging eyes (a point about 1 to 3 m ahead) the irises sit a little
   toward the nose; parallel gaze (infinity) puts both irises in the middle of the fissure. A pair that diverges (FACES3 fixed one
   sign bug) reads as wall-eyed. Check the sign again after any change to `eyeGap` (it scales x about the face midline).
3. Lid symmetry. Left and right lids need near-equal heights, but not identical. A 1 mm height difference is natural (MEMORY); our
   `asymEye` allows 2.4 mm at the clamp, which on a 10 mm opening is big and reads as drooping.
4. Highlight placement. The catchlight sits on the cornea (in front of the iris plane). Painted into the iris texture it never
   moves, and if its position differs between the two eyes it looks wrong. It must be at the same place in both eyes relative to the
   key light and stay inside the pupil edge or on the upper iris, not on the white.
5. Hard edges. Lid margin with no thickness, no wet line along the lower lid, and no soft shadow under the upper lid (the iris
   top and the white above the iris must both fall into the lid's shadow). FACES4 built thickness for the lid margin: keep it.
6. Leftover geometry. FACES4 listed thin pale flaps under some eyes (old mesh triangles), a line from the eye to the ear, a dark wedge
   on the mid level at the eye corners (about 20 vertices round an eye there). These are wonky in themselves.
7. Gaze direction fixed to the head. Eyes that never move are the second most common source of a "dead" look (people's eyes dart
   and track). Even a fixed small offset toward the player when near would help. See 2.3.

### 2.3 Standard construction (what published character art does) and what fits our limits

General practice, which I know well but did not tie to an opened source (MEMORY): the talks and write-ups on realistic game
faces (for example Jimenez, "Next Generation Character Rendering", GDC 2013, slides on his site, page opened, slide text not read,
and the MetaHuman and Digital Ira write-ups) build the eye as:

1. a separate eyeball sphere (about 12 mm radius), iris and sclera textured on it, sitting in a socket behind the lids; the iris
   plane about 3 mm inside the corneal bulge;
2. a cornea shell in front, transparent, with a specular highlight and a soft environment reflection, thin tear meniscus at the
   lower lid edge;
3. lids as real geometry, with thickness (about 1 mm), a lash line, a crease above, a wet inner rim, and an occlusion shadow where the
   lid meets the ball (the cheapest single thing that makes an eye read as sunk into a socket);
4. a caruncle and plica at the inner corner (pink, small), red tint at the corners, sclera that is not white (off-white, darker at
   the lid edges and corners, a few vessels at the corners), limbal ring on the iris edge (dark), iris with radial fibres and a
   darker pupil edge;
5. eye bones or morph targets so the eyes can look and the lids follow.

What fits THIS game (one opaque skinned material per person, no per-person uniform, phone tier without roughness maps):

- (a) Keep the FACES4 eye patch for lids (it is real lid geometry already: 9 rings of 20) and put a REAL sphere behind it for the
  eyeball: 8 x 6 rings is about 80 triangles per eye (ESTIMATE: 160 for both, against 680 now for the patch). Its UV maps the
  iris disc, a fixed 128 x 64 area of the atlas as today. Parallax and the iris ellipse come free. Put the iris on the sphere's
  front cap with a slight bulge of 1.5 to 2 mm (a cornea bump, no transparency). This is the single biggest step toward GTA V eye
  quality in a one-material game and is within the hi level budget. The sphere is part of the skinned head mesh (head bone), so a
  gaze offset can later be a small rotation of the sphere's vertices on the head bone if a second "eye bone" is added to the rig
  (needs a rig check, not done: the MakeHuman default rig may already have eye bones; the pipeline drops the eye helper meshes,
  not necessarily the bones. UNVERIFIED).
- (b) Highlight. Bake a small fixed catchlight into the cornea bulge (a few texels) at the key-light position; both eyes get the same
  texel offset from the pupil centre. No per-frame update.
- (c) Occlusion shadow. Paint a soft dark band on the eyeball sphere where the lid meets it (top 30 percent, bottom 10 percent of the
  visible sphere), and a thin contact shadow into the lid patch. No runtime cost.
- (d) A per-vertex "wet" attribute on the lid rim and eyeball, read by the skin shader (one `onBeforeCompile` tweak): lower
  roughness and a stronger Fresnel there. Needs no extra texture. The same attribute can drive an eye-white sheen at night. On the
  phone tier leave it off.
- (e) Blink and gaze: not possible with a shared material per person unless a bone is added. Option: two lid bones per eye (4 total)
  weighted on the patch vertices (skinning data only, no draw call). It is the one way to a blink without a new material. Not
  recommended before the static eye is right.
- (f) Mid and far levels: keep the painted eye, but copy the same `pedEyeShape` curve so the eye does not change shape with
  distance, and fix the wedge on the mid level by painting the corner shadows INTO the eye region (they are about the corner rows).

### 2.4 Proportion rules to put in tests (all in mm for a 1.0 scale head; relative to the fissure length L)

| Rule | Value | Source |
|---|---|---|
| Iris diameter / L | 0.40 to 0.47 (centre 0.43) | ESTIMATE from sources above |
| Fissure height / L | 0.34 to 0.46 (centre 0.40 for a looking-ahead adult; the Hong Kong study gives 0.42 to 0.46 and its heights may be taken with lids at full height) | CHECKED, but mixed methods; ESTIMATE |
| Upper lid covers iris height | 8 to 16 percent | ESTIMATE |
| Lower lid covers iris | 0 to 5 percent | ESTIMATE |
| Gap between the eyes (inner corners) over L | 1.0 to 1.5 | CHECKED for one sample, MEMORY for the rule |
| Iris centre offset toward the nose (converged) | 0 to 0.5 mm at 2 m | ESTIMATE from IPD 64 mm and gaze at 2 m: 32 mm half-gap over 2000 mm x 12 mm radius = 0.19 mm; trivial |
| Eye line height as a fraction of head height without hair | about 0.5 | MEMORY |
| Catchlight | inside the upper half of the iris or at the pupil edge; same offset in both eyes | practice |

## 3. Face construction that reads as a real person

All of this section is art-anatomy practice (MEMORY; no single opened source), written as rules our team can test by eye.

**Planes.** The face is a front plane, two side planes angled back at the cheekbone, and a lower jaw box. Hard shape changes
at the brow ridge, the nose bridge, the zygomatic arch, the angle of the jaw and the chin. Our head is a MakeHuman smooth surface
(with a decent brow, socket, nose, lips, jaw): keep the planes legible by stretching tonal contrast (value) across the plane changes at
1 to 3 m, rather than adding relief that the triangle count cannot hold.

**Where the skull shows.** Brow ridge (more in men), zygomatic arch and cheekbone (visible when thin), the jaw angle, the chin
point, temples. Fat fills the cheek hollow and the jaw line first, then the neck; age thins the soft layer around the eyes and
cheek and lengthens the nose and ears, lowers the brow, deepens the nasolabial fold, and makes the upper lip longer and thinner
(our age terms already do this in the right direction; check the sizes against the table above).

**Fat.** Wider face, fuller cheek, jowl, double chin, thicker neck, smaller-looking eyes (lids puff), softer jaw line. Our heft
terms do this (`fat` in `faceTraits`).

**Skin tone and undertone.** Every skin, light or dark, has a warm red zone (cheeks, nose tip and wings, ears, lips), a yellow-
ochre zone (forehead, temples, chin front), and a cool blue-green or violet zone (around and under the eyes, the jaw shadow of a
beard, the upper lip of a man). Lips are the same hue as the skin pushed redder or browner: on dark skin the lip is usually a
darker, more purple or brown tone than the face, and not a lipstick colour; on light skin a pinker version. Our painter
already uses a lip that is a redder version of the skin; add the three zones as a low-frequency paint under the pores.

**Ears.** About the length of the nose (MEMORY: our own data say ear length 64 mm men vs nose length 52 mm; ear length / face
length is 0.53, sd 0.043, CHECKED computed) and attached at the line of the brow to the nose base. Ears are the most varied small
feature and the one a front camera sees least. They need a rim, a darker inner bowl and a pink-red tint on the rim (blood near
the surface), and the lobe.

**Noses by structure.** Differences are mostly in: the bridge height and width, the tip shape (rounded, pointed, down-turned),
the nostril shape and width, the columella and how much the tip protrudes. Our traits do this with `bridge`, `noseFwd`, `noseDrop`,
`noseW`; the numbers need to shrink (table 1.2).

**What makes game faces look uncanny or doll-like.**
- Perfect bilateral symmetry. Add the small asymmetries but keep them within 1 mm: real faces are asymmetric in lid height, mouth
  corners, eyebrow height and nose line.
- One flat colour with a uniform glow. Skin needs low-frequency colour variation (the three zones), pores and fine texture at close
  range, and subsurface warmth at the ears, nose wings and the edges of the face in back light.
- Over-large eyes (doll look): irises over 45 percent of the fissure length or bigger fissures than the table above.
- Lip outlines: a dark line around the lips reads as a drawing. The edge should be a soft colour change (vermilion border) with a
  slightly lighter, thin line at the boundary; teeth and the mouth line should be a dark gap with a lit lower lip.
- Brows painted as flat shapes with a hard edge; real brows are hair with a fade at the top and a tail, the thickest at the
  inner end.
- Hard hairline (FACES4 notes it is still a hard line).
- Too-clean teeth: a slight yellow, uneven edge; the front teeth should not show at all in a neutral mouth, or only a little for some.
- Same face on every person (the base-mesh problem FACES2 identified).

## 4. The GTA V look for faces, from published material only

The repository's `docs/reference/gta4-5-study.md` already records (from Courrèges' public graphics study, read in full): a
subsurface-scattering pass on the skin of the player and pedestrians, using a skin mask in the G-buffer, and "faces matter more
than any other pixels". I add only what I opened.

**The published character creator (CHECKED, public wiki page "Character Creator", opened).**
- The player picks "heritage": two parents (the later versions: 21 named mothers and 21 named fathers, plus a few special
  characters from the maker's earlier games), and a slider for how much the face resembles each parent plus a skin-tone mix. The
  wiki calls the result "a loose composite of both parents". The earlier console version let the player pick four grandparents
  from 28 generic faces (14 of each sex), with resemblance sliders at two levels (family resemblance pattern).
- A "Features" section then adjusts the face including bone structure (the modding documentation lists 20 signed sliders for
  nose, brow, cheek, eye opening, lips, jaw, chin and neck; MEMORY, not opened, so I do not list them).
- "Appearance" adds skin overlays at variable opacity: 25 blemish types, 13 complexion types (rosy cheeks, stubble rash, hot flush,
  sunburn, bruised, patchy, blood vessels, pale, ghostly and others), ageing overlays; 29 facial-hair styles, 34 eyebrow styles,
  9 eye colours.
- Age is an overlay: the wiki says the player can make the character "appear much older than the previous version allowed", with no
  stated age.

**Street faces (MEMORY, not checked; treat as a lead).** Pedestrians in the series are assembled from a pool of head, hair and
outfit components with a limited number of distinct heads; most of the variety people see comes from the combination of
head, hair, facial hair, glasses, hat and clothes, plus skin overlays, not from a unique head each. Face detail is spent by distance:
a modelled head with eyes, teeth and hair at close range, simpler heads further out.

**Principles for our team (my reading; each is a design choice, not a sourced fact about their engine).**
1. Blend whole coherent faces, not independent features. Parents blending gives believable combinations because each parent is
   internally consistent. Our equivalent: two of the 23 base heads (group x sex) with a weight, then a small residual of
   correlated traits. Needs a check that all 23 base heads share one vertex order after `people-pipeline.mjs` (then the blend is a
   per-vertex lerp, almost free); if they do not share order, blend the macro-target weights instead (also free).
2. Layer skin detail at variable opacity on a clean base: blemishes, complexion (rosy, stubble rash, sun, flush, patchy,
   veins), age marks, freckles. We already paint wear, spots and flushes; the lesson is to make them SEPARATE layers per person with
   independent opacity, so the same base can be old, weathered, pale or ruddy.
3. A small fixed number of discrete options (34 brows, 29 beards) plus continuous sliders. Discrete styles give recognisable
   types; sliders give uniqueness.
4. Spend the budget on the face: eyes, mouth, skin shading with subsurface scattering at the ears and nose edges. Our texture and
   triangle budget for the close level is fixed; the cheapest gain is a better eye and a skin shader tweak.
5. Do not copy any face, any named character or any asset. The parent system is a method.

## 5. Open assets a faces team may use (do not download into the repository)

All licence statements below are as shown on the pages I opened; sizes from the same pages.

**MakeHuman community assets (CC0).**
- The system pack ("makehuman_system_assets", page opened): every row of the table says CC0. It lists skins (young / middle-aged / old
  x African / Asian / Caucasian x female / male, plus `toon01` and two special suits, about 20), eyes (blue, bluegreen, brown, brownlight,
  deepblue, green, grey, ice, lightblue, plus meshes high-poly and low-poly), eyebrows (eyebrow001 to 012), eyelashes (eyelashes01 to
  04), teeth (teeth_base, teeth_shape01 to 05), hair (afro01, bob01, bob02, braid01, long01, ponytail01, short01 to 04) and proxy meshes.
  An independent licence note (CharacterCreator repository, page opened) says the pack has 94 assets, all CC0, with the MakeHuman
  statement in each header "explicitly released as CC0 in september 2020". I did not open MakeHuman's own LICENSE.md or the pack's zip
  (a request to GitHub was blocked in this session), so the licence is confirmed from two pages, not from the licence file.
  The repository already records MakeHuman base mesh data as CC0 in `docs/CREDITS.md` (line 256). The AGPL application code must not be used.
- Skins 01, 02, 03 (asset-pack index opened, 20 May 2023): "natural female skins, CC0, 99 MB", "natural male skins, CC0, 72 MB",
  "non-natural skins". Authors named include CutOff3D, OnlyTheGhosts, Mindfront, MargaretToigo, RehmanPolanski, ken1138,
  jartur69, bobby_03 and others; each row says CC0. WARNING: several male skin textures are named "with genitals and beard" and
  one "tattooed" or "viking tattoos": use the head region only and check each texture before use (tattoos on a face are a style
  decision for the owner).
- Eyebrows 01 (10 MB) and Eyelashes 01 (3 MB), 12 and 5 meshes by Mindfront, rows CC0 (pages opened). "High-res".
- MakeHuman's own "face units" and expression packs (visemes, blink) are CC0 as targets per the CharacterCreator licence note;
  not opened on MakeHuman's own page.

**Head scans.**
- Infinite-Realities "Infinite 3D Head Scan" (Lee Perry-Smith), CC BY 3.0 (the Keijiro GitHub page and the Sketchfab page opened
  both state it). One young adult male head, high resolution; useful as a REFERENCE for planes and skin detail, requires credit if any
  derived texture ships. Size not checked.
- I found no CC0 head scans, and nothing under CC0 that is a bank of faces. FaceBase's "3D facial norms" (summary statistics page
  opened) are research data with access conditions; I did not check whether the data can be used.

**Eye (iris) photographs, Wikimedia Commons.** Licences read from the search excerpts of the file pages, sizes not checked: "Human eye
close up, anterior view.jpg" CC BY-SA 4.0; "Human eye, anterior view.jpg" CC BY-SA 4.0; "Eye iris.jpg" CC BY-SA 2.5 (a featured
picture); "Iris of the Human Eye.jpg" licence not seen. The Commons API refused further queries (rate limited), so the exact
pixel size and author lines are not recorded. Rule 2 of the project: textures only from CC0, CC BY or CC BY-SA photos with credit
in `docs/CREDITS.md`; derive and paint, do not ship a raw photo of someone's eye.

**ambientCG (CC0).** I listed all 224 categories (provider read): there is no skin or human category. Useful for skin
micro-detail: "Wrinkles Brush" (4 brushes), "Surface Imperfections" (20), "Fingerprints" (9), "Smear" (8), "Scratches" (5). Their
licence is CC0 per ambientCG's published terms (MEMORY; not opened this session).

**Poly Haven.** Not checked. MEMORY: it has no skin or head scan library.

**Public data used here.** ANSUR II (US Army, 2012), public CSVs at tools.openlab.psu.edu/publicData (page opened; files downloaded to
the scratchpad, not the repository). Public-domain US government data. NIOSH respirator study (Zhuang and Bradtmiller 2005,
CDC stacks PDF, read).

## 6. Plan for the faces team, in priority order

1. Fix the draw (half a day, no art). In `faceTraits`: replace the flat-topped `gv` with a normal draw clamped at 2.2 sd; set
   each trait's sd from the table (column "Use instead"); remove the 11 percent pile-up at the limit. Add the latent factors
   (frame, heft, face length, nose, mouth and chin) per 1.3. Check on 200 heads: measure bizygomatic, nose-tip z, menton-sellion,
   mouth width and ear length in the morphed meshes and print their sd against the real column; make that a test (the earlier tests
   check spread but not the real number). Expect the faces to look more alike and less extreme: that IS the goal, then variety comes
   back through step 4.
2. Replace the painted-iris patch with a real eyeball sphere behind the lids (2.3 a, b, c). Fix the symmetry and gaze (2.2 3, 2): clamp
   `asymEye` at 1 mm; render a front and a three-quarter test sheet of 12 faces and look at the pair of eyes together before and after.
3. Add `eyeLen` (fissure length) and widen the canthal tilt (2.1). Cheap, visible at 1 m.
4. Parent blending (4, principle 1) if the base heads share topology: blend two of the 23 shapes by a weight 0.2 to 0.8 for most faces. Then
   restore variety that the narrower trait draws removed.
5. Separate skin layers with independent opacity (4, principle 2) and the three colour zones (3): low-frequency red, yellow and
   blue-green paint, lips matched to skin, ears with a red rim.
6. Wet attribute and lid shading in the skin shader (2.3 d); leftover fixes from FACES4 (thin flaps under the eyes, line eye to ear,
   mid-level wedge, hard hairline).
7. Only then think about blink (lid bones) and eye gaze.

## 7. What is checked, what is estimated, what I could not find

CHECKED: the ANSUR II means, sds, group means and correlations (my own computation from the public CSV; 4,082 men, 1,986 women); the
NIOSH table VI numbers; the Hong Kong periocular table; the South Indian children's iris and fissure numbers (via a focused page
query); the GTA Online character creator description (public wiki); the MakeHuman asset-pack tables and licences; the CC BY 3.0 licence of the
Infinite scan; the ambientCG category list.

ESTIMATE: every "ours" number (my arithmetic on `faceTraits` and `morphHead`, not measured on the mesh); the iris/fissure ratio; lid coverage; the nose-face
length correlation.

MEMORY (not checked): adult iris diameter, globe size, canthal tilt range, eye-line rule, the heritage system's 20 feature names, street-face
construction in the games, Poly Haven, ambientCG licence page, ear growth with age, Farkas nose and soft-tissue profile sds.

NOT FOUND: soft-tissue profile norms (chin, brow, cheek hollow, lip fullness, socket depth, forehead slope) as open numbers; a
nose-length vs face-length correlation; any CC0 head scan; Rockstar's own published account of how street faces are varied
(none seen; the wiki and press I found describe the creator only); Farkas' book tables (not open).

Data and scripts are in the scratchpad only (`scratchpad/ansur/*.csv`); nothing was added to the repository besides this file.
