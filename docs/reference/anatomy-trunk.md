# Anatomy of the trunk for a low-polygon body (back, neck, front, pelvis and crotch)

Status: current (RESEARCH torso seat, "Marguerite", 22 Nov 2026 late night). For the TORSO seat (and LIMBS, AGES, FIT).
Style reference only; nothing comes from any game. Builds on `gta5-characters.md` (its ANSUR tables are not repeated:
read its sections 1b to 1d and 3a first). Round 2 brief: `docs/swarm/teams/BODY-TEAM.md`.

## 0. How to read this file

- CHECKED-ANSUR: computed here from the raw US Army ANSUR II files (4,082 men, 1,986 women, soldiers, ages 17 to 51 mostly,
  median BMI 27.5 men / 25.3 women). Per-person ratios, then percentiles. BMI bands are per person (weight kg / stature m squared).
  Soldiers have no elders and fewer very heavy people: elders and the heaviest builds are ESTIMATES unless marked.
- SOURCE: read in this session (search result or page). Named. Where a page was machine-summarised I say so.
- ESTIMATE: textbook or anatomical memory, not opened. Do not build to an estimate without a look at the line-up.
- Reference people: man 1.76 m, woman 1.63 m. "h" means a height from the floor as a SHARE of stature.
  cm values below are for those two people; scale by stature / 1.76 (or / 1.63).
- Raw scripts: scratchpad `anat/a1.py` to `a4.py` (not in the repo).
- Web limits met: the research search service ran out of credits mid-session, and `pmc.ncbi.nlm.nih.gov` could not be fetched
  directly (only through search summaries). Anything labelled "search summary" was not read in full by me.

## 1. THE BACK

### 1.1 Landmarks, as heights (CHECKED-ANSUR medians; man cm / woman cm)

| Landmark | man h (cm) | woman h (cm) |
|---|---|---|
| C7 spinous (cervicale, base of neck at the back) | .864 (152) | .857 (140) |
| Shoulder tip (acromion) | .821 (144) | .820 (134) |
| Armpit (axilla) | .757 (133) | .761 (124) |
| Nipple / bust line | .735 (129) | .719 (117) |
| Lowest rib margin at the back (10th rib) | .637 (112) | .648 (106) |
| Navel | .602 (106) | .602 (98) |
| Iliac crest (hip bone top, about L4) | .604 (106) | .611 (100) |
| Greatest buttock protrusion | .505 (89) | .511 (83) |
| Hip joint / trochanter | .512 (90) | .519 (85) |
| Crotch | .481 (85) | .480 (78) |

Distance C7 down to the waist along the back (waistbacklength): .271 (48 cm) men, .260 (42 cm) women, over the curve.

### 1.2 Shoulder blades (scapulae)

- Size. SOURCE (Bagci et al. 2024, PMC12478672, 50 dry bones, opened by search summary; and its literature list): length
  (superior to inferior angle) 14.1 to 16.0 cm in men, 14.0 cm in women; width about 9.0 cm (women) and 9.7 to 10.9 cm (men).
  A general textbook figure is about 15 x 13 cm (ScienceDirect topics, search summary; its 13 cm width is higher than the
  bone studies: they disagree, I use the bone studies). Build to: man 15 x 10 cm, woman 14 x 9 cm. Shares of stature:
  length .085 / .086, width .057 / .055.
- Levels. SOURCE (Physiopedia, "Scapula", machine-summarised): superior angle at T2, spine of the scapula root at T3, inferior
  angle at T7, ribs 2 to 7 under the blade. Heights as shares are ESTIMATE (I know the vertebral levels, not the heights):
  superior angle about .835, spine root about .815, inferior angle about .745 (man; woman +.002). The blade spans .745 to .835,
  centre .79. Check: the inferior angle lands just above the nipple line (.735) and about at the armpit-to-nipple band,
  which is what people see on a back.
- Position across. SOURCES DISAGREE: Physiopedia (summarised) says the medial border lies about 8 to 10 cm from the spinous
  processes (smaller people toward 8, children about 6); anatomy teaching usually says about 5 to 6 cm in a relaxed adult
  (ESTIMATE, memory). ANSUR gives the back width at the scye (interscye I): men 43.0 cm (.237 of stature at BMI 22-27; .223
  slim; .265 BMI 32+), women 37.3 cm (.227; .216; .254). For the mesh use: medial border at x = +-5.5 cm from the midline
  for both sexes at the inferior angle, tilting out to +-6.5 cm at the superior angle; lateral border runs up to the armpit
  fold. The blade is the widest "pad" of the upper back, centred at about x = +-10 cm (man), +-9 cm (woman).
- Rest posture. SOURCE (Physiopedia): scapular plane about 30 degrees forward of the frontal plane (blade faces
  forward-outward), about 5 degrees upward rotation, about 10 degrees anterior tilt (top tips forward). In the mesh: the
  blade pad's outward normal points back and about 30 degrees to the side, not straight back.
- Relief (how far it stands proud of the ribcage). ESTIMATE: skin over the blade stands 1.0 to 1.5 cm proud of the
  spine-channel floor in a lean or athletic adult, 0.5 to 1.0 in average, 0 to 0.3 in a heavy adult (fat fills it; only the
  inferior angle and the spine of the scapula (a ridge sloping up and out at about 15 to 20 degrees, ESTIMATE) can still
  show). Elders and frail people: 1.5 to 2.5 cm, winged lower edge (muscle loss). Children: 0.5 cm, mostly the lower tip.
- How it shows. Bare skin: two soft triangular pads with a visible ridge (the scapular spine) at the top and a
  tip at the inferior angle, a shallow valley between them (spine channel). Under a T-shirt: only the inferior angle and the
  medial border show as a soft vertical ridge when the arms are forward or the person leans; at rest the shirt hangs from the
  blade tops and spans the channel. This is shape (geometry) on lean builds and a shading cue on heavy ones (section 5).

### 1.3 Spine channel (the furrow between the erector muscles)

ESTIMATE (anatomy): two erector columns each about 4 to 5 cm wide at the lower back, edge to edge 9 to 10 cm, with the furrow
between them 1.0 to 2.0 cm deep in a lean or athletic person, 0.5 to 1.0 average, nearly flat in heavy (a skin dimple line
only). Deepest at the lumbar level (about .55 to .62), shallower in the upper back, where the trapezius covers it; between the
blades it is a shallow valley 1 cm wide of bone ridge. It ends at the sacrum / seat cleft, at about h .52 (a V into the gluteal cleft
at .50). In a trunk ring: a 2 to 3 vertex notch at the back centre, 0.5 to 1.5 cm deep, widest at the lower back.

### 1.4 Curves seen from the side

Angles. SOURCES (opened through search summaries; none of them is "the" answer, methods differ):
- Zappala et al. 2021 systematic review (PMC8268398, text extraction read by me): Cobb angle, healthy adults, pooled:

  | Segment | age < 40 | 40 to 60 | > 60 |
  |---|---|---|---|
  | T1 to T12 | 39.8 | 38.5 | 43.6 |
  | T2 to T12 | 44.5 | 47.7 | 48.8 |
  | T5 to T12 | 26.3 | 30.3 | 32.6 |

  By sex, T2 to T12: women 44.3 / 45.9 / 49.5, men 44.8 / 54.1 / 49.2 (small numbers of studies: the men's 40 to 60 figure is noise).
- Abrisham et al. 2020 (Maedica, PMC7221279, EOS radiographs, 400 people aged 18 to 60 with low back pain): kyphosis 43.6 +- 6.4,
  lumbar lordosis 32.4 +- 6.3; lordosis men 31 to 33.5, women 33.8 to 36.3; no age link in that group.
- Fon et al. 1980 (quoted in Nature Sci Rep 2023, s41598-023-27976-8): median kyphosis 27 degrees at 20 to 29 in both sexes;
  at 50 to 95: women 40, men 35. Katzman 2010 review (search summary): 20 to 29 degrees in childhood and 20s; women rise from
  about 43 after 40 to 52 at 76 to 80; older men (MrOS, mean age 74) 37.5 degrees. Hyperkyphosis is usually called at 50 or more.
- Nature 2023 (surface measurement, healthy adults): women's kyphosis about 5 degrees more than men's, lordosis about 17 degrees
  more in surface terms (a different, skin method: do not mix with Cobb), both rising with BMI.
- Textbook ranges (Porto 2018 review): kyphosis 10 to 40 (often 20 to 40), lordosis 30 to 80 degrees. Wide on purpose.

Rules for the build (Cobb, upper thoracic T2 to T12 unless stated; the values for each group come from the sources above
where marked, otherwise ESTIMATE):

| Group | kyphosis | lordosis |
|---|---|---|
| Child 5 to 10 | 20 to 30 (flat back, belly forward) ESTIMATE | 35 to 45 (pot belly look) ESTIMATE |
| Teen | 30 to 40 ESTIMATE (some at 45: slouch) | 35 ESTIMATE |
| Young man 20 to 40 | 40 to 45 (source) | 32 (source) |
| Young woman 20 to 40 | 40 to 45 (source) | 35 (source) |
| Adult 40 to 60 | 45 to 48 (source) | 33 to 37 |
| Elder man >60 | 48 (source), up to 55 | 30 to 35 (flatter in stooped elders) ESTIMATE |
| Elder woman >60 | 49 (source), 52 at 76 to 80 (Katzman summary), up to 60 for the stooped | 32 to 38 |
| Heavy build | +3 to +5 kyphosis and lordosis (Nature 2023: both rise with BMI) | +5 ESTIMATE |
| Athletic | -5 kyphosis (upright, scapulae retracted) ESTIMATE | +0 |

Convert angle to a mesh offset (geometry, derived, not from a source): the back line is an arc; for an arc of angle theta
(radians) and arc length L the sagitta is s = L * theta / 8. Thoracic arc C7 to T12: L about 30 cm (man), 27 cm (woman)
ESTIMATE. Examples (man): 30 degrees: s 2.0 cm; 40: 2.6; 45: 2.9; 50: 3.3; 60: 3.9 cm. Lumbar arc T12 to sacrum L about 20 cm:
32 degrees: s 1.1 cm; 40: 1.4. These are the hollows of the bone axis; the skin sagitta is similar.
Apex heights (ESTIMATE from vertebral levels): kyphosis apex T7 to T8, h about .76 to .74 (at the inferior scapular angle);
lordosis apex L3 to L4, h about .61 to .60 (about the navel and the iliac crest, which is L4). The upper thoracic start (T1) is the
base of the neck, h .864; the thoracolumbar inflection at T12 to L1, h about .66 (just above the 10th rib margin: .637).
What the eye sees: a person in profile has the back-most point of the upper back at the blades (about .78), the lumbar hollow at about
.58 to .62, and the seat as the back-most point below (.505). The shoulder blade zone and the seat are the two back points; the hollow is between them.

### 1.5 Head and neck carriage

- Craniovertebral angle (CVA, the angle between horizontal through C7 and the line from C7 to the tragus of the ear). SOURCE
  (2024 Applied Sciences study, 122 healthy adults, Kinovea photos; search summary, not read in full): mean 48.8 degrees,
  women about 50, men about 47.5, falling 1.6 degrees per decade of age. A "normal" threshold is quoted at above 48 to 53
  by different authors; under 48 to 50 is called forward head posture.
- Derived with ANSUR: the ear (tragion) is 10.8 cm above C7 in a 1.76 m man (tragion h .925, C7 .864) and 10.5 cm in the woman.
  The ear lies in front of C7 by rise / tan(CVA):

  | CVA | 55 | 50 | 45 | 40 | 35 |
  |---|---|---|---|---|---|
  | man, cm in front of C7 | 7.6 | 9.1 | 10.8 | 12.9 | 15.4 |
  | woman | 7.4 | 8.8 | 10.5 | 12.5 | 15.0 |

  By age (ESTIMATE, from the -1.6 per decade line, plus stoop in the elders): 25 years 51 degrees (8.8 cm), 45 years 48 (9.7),
  65 years 44 to 45 (10.8 to 11.2), 80 years 40 (12.9). Teen 50 on average but a high spread (phone slouch), 40 to 45 in a
  slouched teen. Child 55 to 60 ESTIMATE (relatively big head, upright neck).
- Ear against the shoulder: posture screening uses an ear to shoulder-line horizontal offset under 2.5 cm as in range (search
  result, posturascreen.com, not read in full). In the mesh the plumb line through the ear passes about 0 to 2.5 cm
  behind to in front of the acromion in an upright adult, 4 to 6 cm in front in a stooped elder (ESTIMATE).
- Neck axis (C7 to skull base) leans forward about 20 degrees from vertical in the neutral standing adult, 30 to 40 in the
  forward-headed elder (ESTIMATE; from the cervical lordosis of 20 to 35 degrees in the Nature 2023 summary, which says C2 to C7 lordosis
  grows with age from 55).

### 1.6 Trapezius line (neck to shoulder point)

CHECKED-ANSUR, computed per person: drop = cervicale height minus acromion height; run = half the biacromial breadth minus half the
neck diameter (neck girth / pi); slope = arctan(drop / run).

| | man | woman |
|---|---|---|
| drop P50 | 7.7 cm (.044) | 6.0 cm (.037) |
| run P50 | 14.4 cm | 13.0 cm |
| slope P5 / P50 / P95 | 21 / 27.9 / 34 degrees | 17 / 24.9 / 32 degrees |
| by BMI band (<22, 22 to 27, 27 to 32, 32+) | 28.3 / 28.5 / 27.9 / 26.5 | 26.0 / 24.9 / 24.1 / 24.4 |

Heavier people slope a little LESS because the shoulder is wider and the fat fills the neck-shoulder angle. ESTIMATE for shape: the
skin line is not a straight chamfer: it leaves the neck at about 35 to 40 degrees, flattens to about 15 degrees by the shoulder tip, a
gentle concave-up curve; "gym" trapezius lifts the middle of that line 1 to 2 cm and cuts the neck-shoulder angle to about 22 degrees;
elders and frail people droop: +3 to +5 degrees and a hollow above the collar bone (the supraclavicular fossa) 1 to 2 cm deep.
Children: about 20 degrees, a short line (shoulder length .085 of stature in adults, kids similar).

### 1.7 Latissimus and the taper ("V")

CHECKED-ANSUR medians by BMI band, men (<22 / 22 to 27 / 27 to 32 / 32+): bideltoid breadth over waist breadth 1.68 / 1.61 / 1.53 / 1.48;
chest breadth over waist breadth .97 / .92 / .87 / .82; biacromial over bicristal (pelvis) 1.54 / 1.53 / 1.50 / 1.48. Women: bideltoid over
waist 1.58 / 1.52 / 1.46 / 1.39; chest over waist .96 / .91 / .87 / .81; biacromial over bicristal 1.40 / 1.36 / 1.29 / 1.22. (Waist is at the
navel, so a belly counts.) Pure shape rule: front or back width at the armpit (.757) = bideltoid minus 2 x 4 cm for the arm
(.24 of stature for a man: the back width at the scye is .237 interscye I); width falls roughly linearly to the waist
(.602); the lats flare 1 to 2 cm beyond that line at .70 in an athletic man (ESTIMATE). The "V" reads when armpit width over
waist width is at least 1.2 (slim and athletic, from the table), 1.0 to 1.1 in heavy. The female taper is the same line as the
man's but starts from a narrower shoulder (.276 against .290 of stature) and ends in a wider hip.

## 2. THE NECK

### 2.1 Girth (CHECKED-ANSUR). Neck circumference at the Adam's apple level, cm

| | P5 / P50 / P95 | share of stature P5/P50/P95 | neck base girth P50 |
|---|---|---|---|
| man | 36.0 / 39.5 / 44.3 | .203 / .226 / .254 | 43.3 cm (.247) |
| woman | 30.2 / 32.8 / 36.3 | .185 / .201 / .225 | 37.0 cm (.227) |

By BMI band, median girth (cm) and share of stature:

| | <20 / <18.5 | 20 to 25 | 25 to 30 | 30 to 35 | 35+ |
|---|---|---|---|---|---|
| man | 35.3 (.201) | 37.4 (.213) | 39.5 (.225) | 41.9 (.239) | 44.1 (.251) |
| woman | 30.5 (.186) | 32.0 (.196) | 33.6 (.205) | 35.5 (.217) | 36.3 (.223) |

Regression (ANSUR, per person): man neck_cm = 25.7 + 0.508 x BMI + 0.073 x (stature_cm - 175.6), residual SD 1.5 cm, r = 0.80 with BMI.
Woman neck_cm = 22.9 + 0.395 x BMI + 0.077 x (stature_cm - 162.8), SD 1.2 cm, r = 0.73. Age (soldiers only): median man 38.6 cm at 17 to 25,
40.8 at 45 to 60; woman 32.4 to 34.1 (the rise is partly weight). Elders (ESTIMATE): no data here; muscular thinning in the frail takes
about 1 to 2 cm off the girth at the same BMI and shows the cords, while fatter old men keep thick necks with skin folds.
Muscular/athletic (ESTIMATE): +2 to +3 cm over the BMI line (trapezius and neck muscle mass: the neck is wide at the base).
Cross-section is an oval: width about 1.1 times the depth (ESTIMATE): a median man's neck is about 12.6 cm wide by 11.5 cm deep at the middle.

### 2.2 Neck against head (the "thin neck under a normal head" fault)

Head breadth (ANSUR): man 14.6 / 15.4 / 16.3 cm (P5/50/95), woman 14.0 / 14.7 / 15.6.
Neck diameter (girth / pi) divided by head breadth, CHECKED-ANSUR:

| | P5 | P50 | P95 |
|---|---|---|---|
| man | .745 | .818 | .907 |
| woman | .650 | .708 | .782 |

By BMI (median, man): <20 .75, 20 to 25 .78, 25 to 30 .82, 30 to 35 .85, 35+ .89; woman .67, .69, .72, .76, .77.
Girth as a share of head circumference (computed): man .689 (P5 .632, P95 .763), woman .585 (.539, .644).
RULE: the neck's width at its middle is about four fifths of the head's width for a man and seven tenths for a woman; below .70 on a man or
.60 on a woman reads as a thin neck, above .90 as a bull neck. Our faults list says the current neck is thin: raise it to these ratios.

### 2.3 Length, angle, shape

- Neck base to head. Front (chin to the suprasternal notch): about 9 cm in men, 8 cm in women (ESTIMATE: notch h .819 against chin about .87,
  using a head height of 22.9 cm men / 21.3 cm women from memory of ANSUR 1988 (not in the public file); not checked). Back (C7 up to the
  hairline / skull base): about 7 to 9 cm. In neutral posture the chin sits nearly level with C7 (.87 against .864, ESTIMATE), so the neck reads as a short tube from the side and a longer one from the front.
  CHECKED: ear (tragion) h .925, cervicale .864 (man), 10.8 cm apart.
- Forward angle: section 1.5 (20 degrees from vertical, larger for elders).
- Shape in plan. At the base the neck widens into the trapezius slope (girth at the base 43.3 cm man, 37.0 cm woman: 10 percent more than
  the neck girth; ANSUR "neckcircumferencebase"); the neck in front view is narrowest about two thirds up (just below the jaw angle) and its sides run
  from the ear lobe down to the shoulder line along the sternocleidomastoid (SCM) muscle.
- Sternocleidomastoid lines (ESTIMATE, anatomy): two cords from behind the ear (mastoid) down and forward to the notch at the collarbones, a "V"
  that closes at the pit; clearly visible when the head turns, soft when it is still; in a slim or athletic person 1.5 to 2 cm proud, in a heavy
  person gone under the soft tissue. Mesh: 2 faint ridges in the normal map or vertex shade; a geometry fold only for athletic men.
- Pit of the neck (suprasternal notch): a hollow about 1.5 to 2.5 cm deep and 3 cm wide between the SCM and the collarbone heads, at h .819
  (man) / .816 (woman) (CHECKED-ANSUR). Visible under a V-neck; hidden by a collar.
- Adam's apple (thyroid cartilage): ESTIMATE, a prominence of 0.5 to 1.0 cm in many men at the front of the neck, about 4 cm above the notch (h
  about .84 to .845); small to absent in women. Paint or a 3-vertex bump on the high LOD only.

### 2.4 Variety a street crowd should have

Draw the neck from BMI and sex using the regression in 2.1 with the SD above, then clamp the neck-to-head diameter ratio to .70 to .92 (men) and
.60 to .80 (women). So: thin-necked slim types (man 35 cm, woman 30 cm), a broad middle (man 37 to 42, woman 31 to 35), a thick tail (man 44 to 48,
woman 37 to 41). Add 5 to 10 percent of men (and about 1 percent of women) as "thick-necked muscular" at +2 to +3 cm. Keep necks of heavy people
short-looking: heavier builds also drop the chin to the chest (double chin) and shorten the visible neck by about 1 cm.
Children: head breadth is about .095 to .10 of stature at age 5 and neck girth about .19 to .20 (ESTIMATE, from the doc on ages by Imre); a child's neck
reads long and thin only because the head is big; keep the diameter ratio at about .65.

## 3. THE FRONT

### 3.1 Ribcage

- Breadth and depth (CHECKED-ANSUR medians, at the nipple level): chest breadth .165 (29 cm man, 27 cm woman), chest depth .145 (25 cm) man, .151 (24.5 cm)
  woman (women's depth is measured over the bust). Depth over breadth: man .876 (P5 .754, P95 1.004), woman .916 (.798, 1.045). By BMI band (man): .88 (<20),
  .90, .92, .97, 1.02 (BMI 35+): the section goes from an oval to a circle as weight rises. Woman .83, .84, .87, .91, .98.
- Where it is widest. ESTIMATE: the bony ribcage is a barrel: narrow at the top (first rib), widest at ribs 8 to 10, h about .64 to .70, and 1.0 to
  1.5 cm wider than the nipple line breadth in a lean person; in the dressed silhouette the pecs and arms hide it. The lower rim (costal arch)
  makes an angle of about 70 to 90 degrees at the front (the infrasternal angle, ESTIMATE; narrower in lean women), the ribs flare at the
  10th rib margin (.637 man, .648 woman; CHECKED-ANSUR).
- Shoulder girdle against ribcage: biacromial breadth .237 man / .224 woman against chest breadth .165: 1.44 and 1.36 (computed from the
  tabulated medians). So shoulders are 44 percent wider than the bony chest in men, 36 percent in women. Bideltoid .290 / .276.
- Collar bones (clavicles). ESTIMATE: S-shaped; from the notch (h .819) out to the shoulder tip (.821), a rise of only 0 to 1 cm in an adult at
  rest, the medial end sits very slightly lower and the lateral end higher by about 5 to 10 degrees; length about 15 cm each (shoulder length,
  neck base to acromion, is 15.0 man / 13.5 woman cm CHECKED-ANSUR, which agrees). A visible bar only in lean people and under a tank top; in
  heavy people hidden except for the notch. Mesh: shade line along the shoulder top from the notch outward.

### 3.2 Pectorals (men) and bust (women)

- Men. Pectoral muscle adds forward volume on a flat ribcage: ESTIMATE 1.5 to 2.0 cm in an untrained adult, 3 to 4 in an athletic man, and
  fat replaces it in a heavy man (soft, low, with a fold at the lower edge (the inframammary-like fold) at nipple minus 6 cm). The nipple sits
  at h .735, 14.8 cm below the notch (computed: .819 - .735, CHECKED-ANSUR; its chest height is measured at the nipple in men). Pec edge: from the
  armpit fold (.757) a rounded lower border sweeps to the sternum at about .70 (ESTIMATE).
- Women. ANSUR chest height (bust level) .719 = 16 cm below the notch (computed). Clinical measurements of the notch to nipple distance are larger
  (SOURCE: search summary; 19.8 cm, SD 2.5, in 53 healthy young women aged 22; 21 to 21.5 cm as an aesthetic ideal in a 2011 study of 109 women; 23.1 cm
  control mean in a 2023 study): the two kinds of source DISAGREE by 4 to 7 cm (landmarks differ; ANSUR's "bust" level is not the nipple on a
  dropped breast). For a young woman use the nipple 20 cm below the notch (h about .69); the breast mound centre about 4 cm higher than that
  nipple when standing and supported by the clothes. Projection beyond the ribcage (ESTIMATE): 2 to 3 cm (small), 4 to 6 (medium),
  7 to 9 (full). Lateral spread to the arms: a mound about 12 to 14 cm wide, centres about 9 to 10 cm either side of the midline.
  By age (ESTIMATE): low and soft in older women; the mound centre lowers by 3 to 6 cm and projection falls 1 to 2 cm with age 50+; a
  heavy older woman has the mass at the ribcage base. Teen girls: a little, from 12 to 13.
- Mesh rule: the bust is geometry (a low bump of about 12 vertices on the front rings) for women, a pec-shaped front plate for men; elder
  bodies lower it by moving the bump down one ring.

### 3.3 Stomach by build

CHECKED-ANSUR, waist depth over chest depth (median): man .88 (BMI <20), .90, .92, .97, 1.02; woman .83, .84, .87, .91, .98. Waist depth minus buttock depth
(man): -18 mm, -15, -11, 0, +10; woman -29, -26, -18, -10, +1: in heavy people the belly is as deep as the seat. Seated abdominal extension depth (ANSUR; not a standing
measure): man 18.9 / 21.8 / 25.0 / 28.9 / 32.4 cm by those bands, woman 18.4 / 21.0 / 24.2 / 27.7 / 30.8.
Absolute waist depth as a share of stature (man): .102, .116, .133, .154, .174; woman .104, .118, .138, .160, .180.
Where the belly sits (ESTIMATE, anatomy): in most men the greatest forward point is at or just below the navel (h .60 to .58), with the soft mass
overhanging the belt line from .62 down to .55; in most women fat carries on the lower abdomen and hips and thighs, apex lower at about .57 to .55
(below the navel, over the pubis), with a softer upper abdomen. Elders (both sexes): the belly apex drops about 0.02 of stature and the chest
flattens. Slim: flat or a slight curve (waist depth .10 to .12 of stature is the whole body depth); frail: a concave stomach with rib arch.

### 3.4 Hips seen from the front

The widest point of the hips (trochanter level, h .512 / .519) .196 man, .217 woman, and rising to .221 / .257 at BMI 35+ (ANSUR). The pelvis proper (bicristal)
is .157 man, .167 woman at the iliac crest height (.604 / .611): the bone is narrower than the hip flesh by .04 to .05 of stature on each. The "hip dip" (trochanteric
depression, ESTIMATE): a 1 to 2 cm shallow below the iliac crest, visible in lean people (more in women), at h .54 to .56, shade only.

## 4. PELVIS, SEAT AND CROTCH (the place where our model has a black wedge)

### 4.1 Numbers (CHECKED-ANSUR; man cm / woman cm)

| | man P5 / P50 / P95 | woman |
|---|---|---|
| Crotch h | .459 / .481 / .506 (84.7 cm) | .456 / .480 / .505 (78.2 cm) |
| Trochanter h minus crotch h | .013 / .031 / .050 (5.5 cm) | .023 / .039 / .056 (6.4 cm) |
| Iliac crest above crotch | 21.6 cm | 21.3 cm |
| Navel above crotch | 21.1 cm | 19.8 cm |
| Bicristal (pelvis) | 24.7 / 27.5 / 30.5 cm (.157) | 23.7 / 27.3 / 31.0 cm (.167) |
| Hip breadth (widest) | 30.8 / 34.4 / 38.7 cm (.196) | 31.1 / 35.3 / 40.0 cm (.217) |
| Buttock depth | 20.4 / 24.6 / 29.1 cm (.140) | 19.6 / 23.1 / 27.7 cm (.142) |
| Buttock depth over hip breadth | .63 / .71 / .79 | .59 / .65 / .74 |
| Crotch length (navel front to back over the fork) | 62.0 cm (.354) | 61.9 cm (.387 BMI 25 to 30) |
| Greatest buttock protrusion h | .505 (.480 to .533) | .511 (.488 to .538) |
| Thigh girth at the top (gluteal furrow) | 62.4 cm (.356; .302 to .410) | 61.3 cm (.377; .326 to .433) |

By BMI band, hip breadth as a share of stature: man .176, .185, .197, .207, .221; woman .194, .208, .223, .238, .257. Buttock depth: man .112, .124, .140, .154, .168;
woman .120, .134, .149, .166, .181. Thigh girth: man .284, .322, .356, .385, .419; woman .317, .357, .393, .426, .472.

Women's seat is wider, not deeper (depth .142 against .140 of stature, but hip breadth .217 against .196): the female rear view is wider and rounder, the male
deeper relative to width (.71 against .65).

### 4.2 Thighs touch: how much gap is real?

Computed: each thigh as a circle of the circumference, so the diameter is girth / pi; two diameters over the hip breadth (CHECKED-ANSUR; the circle
assumption is mine, a thigh is an oval deeper than wide):

| | <20 | 20 to 25 | 25 to 30 | 30 to 35 | 35+ |
|---|---|---|---|---|---|
| man | 1.03 | 1.10 | 1.15 | 1.18 | 1.21 |
| woman | 1.04 | 1.09 | 1.12 | 1.15 | 1.17 |

If the thighs were round, even a slim person's two thighs would fill the full hip breadth with no space, and the fatter builds would overlap and press together.
Allowing for the oval (width about 0.85 of depth; ESTIMATE) the sums fall to 0.88 to 1.03 (slim) and 0.94 to 1.03 (average and up): so at the top of the thigh the legs touch
along the inner side for everyone above BMI 22, and nearly so for the slimmest. Rule for the mesh (derived plus estimate):
- Thigh gap. At the crotch (h .481) the gap is 0 for every build. Below it the gap opens slowly: 0 for 5 to 8 cm below the crotch (to h .44 to .45) in
  average and heavy builds; in slim and athletic builds the inner surfaces separate by 1 to 2 cm at mid thigh (h .40) and 2 to 4 cm at the knee (h .28)
  (ESTIMATE). With the heaviest builds the thighs stay in contact to the knee, rubbing, with a soft fold at the inner thigh. Women's thighs are
  closer than men's at the same BMI (girth .377 against .356; hip .217 against .196: thigh girth over hip breadth is a bit larger). A visible "thigh
  gap" down to the crotch is rare: a slim, high-hipped, wide-pelvis person, and even then the thighs touch at the fork.
- Fork. Where the two thighs meet the trunk is a single point at the crotch (.481) with a rounded, not pointed, arch of 2 to 3 cm at the front above it
  (the groin, where the inguinal creases meet the pubis) and the gluteal furrow behind. In a trouser there is no hole: the fork seam sits at .481 minus
  1 to 2 cm (the cloth's crotch is lower than the body, in comfort-fit trousers by 2 to 4 cm: a dropped crotch is a style, not an error).
- The black wedge is the gap between two separate thigh tubes under a trunk that stops at the crotch: fix by making the two thigh tubes overlap
  3 to 5 cm in width at the top (their centres at +-0.23 x hip breadth, i.e. +-8 cm for a man with hip breadth 34 cm, each about
  18 cm wide at the top (ESTIMATE: thigh breadth about .5 of the width at the crotch, which is about .95 of hip breadth) and merge the rings into
  a single trunk ring at h .50 to .485.

### 4.3 Inguinal lines and the "V"

ESTIMATE (anatomy; none of it opened): the groin crease runs from the front hip bone (ASIS, h about .585 man: about 3 cm below the crest at .604) down and inward
to the pubic mound at about h .495, 2 to 3 cm either side of the midline, about 35 to 45 degrees below horizontal on each side, so the two lines form a "V" opening upward. The lines are
the lower edge of the abdomen over the thighs: a soft crease, deeper when the hip is flexed (sitting, walking). The V rim shows in tight or low-cut
trousers and swimwear; under ordinary trousers the pubic mound is a 1 to 2 cm forward swell at h .50 to .49 over the zip, 8 to 10 cm wide (woman 10 to 12),
and a man's fly region is a soft, rounded form: keep it as ONE smooth bump, not a wedge, not an anatomical detail.

### 4.4 The seat

- Greatest protrusion at h .505 (man) and .511 (woman), about the level of the hip joint (.512 / .519): so the seat is widest and deepest at the same height as the
  trochanter, a little above the crotch plus 3.5 cm.
- The gluteal fold (below the buttock, behind the thigh): ESTIMATE h about .465 to .475, 1.5 to 2.5 cm below the crotch level for an adult standing; deeper in
  women (the rear contour of a woman's gluteal mass overhangs it), softer in heavy people (a fold of skin); a visible line on lean builds only.
- The cleft: starts at the sacrum, h about .52, and widens and deepens to the crotch: only the top 8 to 10 cm is a visible vertical line; trousers hide it,
  but their seat follows two half-spheres: each cheek centre at x = +-0.45 x bicristal (about 6 cm), h .50, radius about (buttock depth / 2.6) (9.5 cm man). ESTIMATE.
- Men: flatter, squarer; women: fuller, higher, heart-shaped; elders: the mass drops 2 to 3 cm and flattens (sagging, "no seat"); heavy: wide, lowered 1 to 2 cm.

### 4.5 What trousers show

A trouser leg is a pair of tubes that meet at the fork; the visible things are: (a) the seat bump behind, rounded and half-spherical, (b) the crotch seam
(front rise about .27 of stature measured from the waist, back rise longer by 5 cm), (c) the pocket line at the hip joint (h .51), and (d) the front fly
bump at h .50 to .49. Do not show the iliac crest or the V. Slim trousers hug the thigh top (ease 2 cm); relaxed trousers leave 4 to 8 cm of slack at the fork.

## 5. FOR A LOW-POLYGON MESH

### 5.1 Geometry (silhouette) versus shading or paint

- GEOMETRY (it shows in the outline at 15 to 20 m): shoulder width and the trapezius slope, the neck's girth and forward lean, the upper-back arc (the
  hump, 2 to 4 cm), the lumbar hollow plus the seat, belly forward apex, the chest and the bust, the thighs merging at the crotch (no hole), the shoulder
  blade pad for lean builds (1 cm, visible in profile as a bump) and the elder's stoop.
- NORMAL MAP / VERTEX SHADE: the spine channel (under 1.5 cm), the scapular spine ridge, the SCM cords, the clavicle line, the pit of the neck, the hip dip, the inguinal
  creases and gluteal fold, the Adam's apple, the costal arch.
- PAINT (texture): navel, the fold under the breast and the belly, the pit shadow, skin tone variation at the neck.
- Silhouette priority at distance: (1) the shoulder-to-waist V, (2) the head-neck-trapezius triangle, (3) the back and belly in profile, (4) the seat, (5) the thigh
  merge. Everything else is shading.

### 5.2 Ring layout for the trunk (man; woman in brackets where different). 12 to 16 vertices per ring

Plan: 12 rings from the crotch to the neck base, heights as shares of stature, bottom to top, plus the neck rings. Vertex layout on each ring (14
vertices): front centre, two front-sides, two sides, two back-sides, back centre, then the remaining four spread on the back quarters (the back needs the most
vertices: the blade pads and the channel) and the front shoulders. For rings at the chest, put 2 vertices more at the front for the pecs or bust.

| # | h | what that ring holds | radial note |
|---|---|---|---|
| R0 | .481 | the crotch / fork: joins the two thigh tubes | width .95 hip breadth |
| R1 | .50 | lower seat, pubic swell, front zip bump; cleft start | seat depth .12 of stature, back cheeks begin |
| R2 | .512 (.519) | hip joint: widest hips, seat protrusion .505 | hip breadth .196 (.217); depth .140 |
| R3 | .545 | hip dip / lower belly: lower abdomen apex (women) | lowering of the narrowing from the hip |
| R4 | .575 | belly apex in a heavy man, lower waist | waist depth .116 to .174 by build |
| R5 | .603 | navel, iliac crest, narrowest waist (lean) | waist breadth .166 to .223 by build |
| R6 | .637 | lower rib margin, lumbar hollow top | rib flare |
| R7 | .69 | ribcage, widest barrel (lean), lats | |
| R8 | .735 | nipple / bust, pecs, back blades (centre .79) | chest breadth .165, depth .145 |
| R9 | .757 | armpit; start of the arms | |
| R10 | .80 | upper back (blade tops at .835), clavicle line | trapezius slope begins |
| R11 | .835 | shoulder girdle top; superior scapular angle | biacromial .237 |
| R12 | .864 | neck base (C7): the ring that carries the trapezius into the neck | neck base girth .247 |
| N1 | .885 | neck mid, narrowest | neck girth .226 (2.1) |
| N2 | .905 | under the skull; the head connection | leans forward (1.5): ring centre moves forward 2 to 4 cm |

Count: 13 body rings plus 2 neck rings, about 15 x 14 = 210 vertices (about 400 triangles) for the trunk, before the arm and leg joins. Positions of R4 to R9 move
with build exactly as the tables in 3.3 and 4.1; the kyphosis offset moves rings R8 to R12 backward by up to s (section 1.4); the lordosis moves R4 to R6 forward.
Elders: shift the upper rings forward (the head carriage) and the whole upper back arc up to 4 cm; shorten the stature by 1 cm per decade above 40 (ESTIMATE).

### 5.3 Fade at the middle and far levels

- Middle level (about 1,600 triangles per person): keep 8 rings (R0, R2, R5, R7 or R8, R9, R11, R12, N1) with 10 vertices each. Keep the shoulder width, the trapezius slope, the neck girth, the
  belly and bust bumps, the upper back arc and the crotch merge. Drop the blade pads and the lumbar hollow as geometry (leave as vertex shade), keep the seat bump.
- Far (about 360 triangles): 4 rings (crotch, waist, chest, neck base) at 8 vertices; the head and shoulders trapezoid must survive: width at the shoulder, waist at .603 and
  hip at .512 are the only three widths that matter, plus the neck's diameter ratio (.82) and the thigh merge; the belly and back arc become a single depth number per ring.
- The three levels must agree in silhouette at the widest breadths: shoulder (bideltoid .29), waist (.186) and hip (.196).

## 6. QUESTIONS ANSWERED

(none yet)

## 7. WHAT I COULD NOT FIND

- Elder trunk measurements (no survey of old people opened); neck girth by age past 60; the girth of frail elders.
- A source for the scapula's height level as a share of stature, and for its distance from the spine that agrees with the other (8 to 10 against 5 to 6 cm).
- The CVA by age beyond the 1.6 degrees per decade figure, and any data for children and teens (the research search ran out of credits).
- Gluteal fold height and groin crease angle from a measured source; both are anatomical estimates.
- Chin to notch (head height menton to vertex) for the ANSUR people, not in the public file.
