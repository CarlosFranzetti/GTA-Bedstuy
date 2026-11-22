# Arms, legs and ages: numbers for low-polygon bodies

Status: current (RESEARCH limbs seat, 22 to 23 Nov 2026). For the LIMBS and AGES seats. Style reference only; nothing
comes from game files. Tags: COMPUTED = from raw survey files in this session; OPENED = from a page or paper read in this
session (named); ESTIMATE = remembered or inferred, build to it only with a second look. Builds on
`docs/reference/gta5-characters.md` sections 1 to 3 (not repeated: stature shares, segment lengths, BMI-band girths there).

## 0. Method and traps

- ANSUR II (US Army 2012; 4,082 men median 175.5 cm, BMI 27.5; 1,986 women median 162.6 cm, BMI 25.3), raw files in the session scratch folder. "Share" = each person's measure over that person's stature, median. Girths in cm below are the share times 175.5 (man) or 162.6 (woman).
- NHANES 2017-18 body measures (BMX_J, DEMO_J, downloaded from wwwn.cdc.gov): RELAXED mid-upper-arm girth (acromion to olecranon midpoint), arm length, upper-leg length, by age and sex.
- ANSUR landmarks (from the measurer's handbook, OPENED: `tools.openlab.psu.edu/publicData/ANSURII-TR11-017.pdf` via search excerpt): "ankle" = minimum horizontal circumference of the ankle; "lower thigh" = around the thigh just above the kneecap; "thigh" = at the gluteal furrow (top of the thigh); biceps and forearm are FLEXED maxima.
- RELAXED against FLEXED: at the same BMI band NHANES relaxed mid-arm is 0.95 to 0.98 of ANSUR flexed biceps (men 22-25: .178 vs .187; 25-27.5: .194 vs .200; 30-35: .214 vs .219; women 22-25: .175 vs .179; computed). Use relaxed = 0.96 x ANSUR flexed biceps. Forearm relaxed about 0.95 of flexed (ESTIMATE).
- ANSUR has no elbow, knee, mid-thigh or mid-forearm girth and no width/depth of limbs; those rows are ESTIMATE and say so.
- Firecrawl credits ran out mid-session and en.wikipedia.org did not resolve from the box, so some pages were read only as search excerpts (marked). The 1977 child anthropometry report (Snyder et al., UM-HSRI-77-17, scan at math.nist.gov/~SRessler/anthrokids/child77lnk.pdf) downloaded but its OCR is unreadable; no child shoulder or hip breadth was recovered.

## 1. THE ARM (side by side with the leg in section 2)

Hanging arm. "Upper arm length" U = acromion to elbow = .207 stature (36.3 cm man, 33.4 cm woman). Forearm F = elbow to wrist .152 / .148 (26.7 / 24.0 cm). Position t = 0 at the acromion (shoulder tip), 1 at the elbow, for the upper arm; f = 0 at the elbow, 1 at the wrist, for the forearm.

### 1a. Landmarks along the arm (COMPUTED unless marked)

- Armpit (axilla) is 0.0634 stature below the acromion in men (11.1 cm), 0.0586 in women (9.6 cm). That is t = 0.31 and 0.29 of the upper arm. Above that line the arm is joined to the torso: the deltoid cap and the armhole live there.
- Shoulder cap: bideltoid breadth minus biacromial, halved, is .0269 stature in men (4.7 cm) and .0254 in women (4.2 cm). So each deltoid stands 4.2 to 4.7 cm outside the bone point of the shoulder. Acromion drops .0436 (7.7 cm) below the base of the neck in men, .0372 (6.0 cm) in women.
- Deltoid insertion (OPENED, Wikipedia "Deltoid muscle", via query): deltoid tuberosity "on the middle of the lateral aspect of the shaft of the humerus". Rule: the deltoid's lower tip is at about t = 0.45 (ESTIMATE; the humerus runs a little shorter than acromion-to-elbow). Its shape is a rounded cap whose front and rear edges converge to a point on the outer side: widest at t = 0.10 to 0.20, tapering to nothing by 0.45.
- Biceps belly (front) peaks at about t = 0.55; triceps (rear) is bigger by volume and bulks high on the outer rear, peaking about t = 0.40 to 0.50 and ending in a flat tendon above the elbow by t = 0.85 (ESTIMATE, standard anatomy teaching, not measured here). Side view: the upper arm is deeper at t = 0.5 than at t = 0.9.
- Elbow: bony points are the olecranon (rear tip, sticks out behind when bent; flat when straight) and the two epicondyles (inner one the bigger, side bumps at the elbow). Front crease (cubital fossa) a soft hollow. 
- Carrying angle: OPENED (search excerpt, PMC12831827, "Carrying Angle Variation in Relation to Gender Among Children"): normal 5 to 10 degrees in males, 10 to 15 in females; above 15 is cubitus valgus. Rule: with the arm straight and palm forward the forearm points 7 degrees (men) / 12 degrees (women) outward of the upper arm's line. With arms hanging palm-in it is mostly hidden.
- Forearm widest point: f = 0.25 to 0.30 below the elbow crease (ESTIMATE; the flexor and extensor mass starts at the epicondyles and ends in tendons by f = 0.6). It is the biggest girth below the elbow; from there the forearm tapers to the wrist, which is the narrowest part, with a small bump at the wrist bones (ulnar styloid) at f = 1.0.

### 1b. Girth profile, relaxed, average build (ANSUR BMI 25-27.5 / NHANES, cm for a 175.5 cm man and a 162.6 cm woman)

| Ring | Position | Man cm | Woman cm | Share of stature M / F | Source |
|---|---|---|---|---|---|
| Shoulder cap (round the arm at the armpit line) | t = 0.31 | 37.5 | 34.7 | .214 / .213 | ESTIMATE = 1.10 x mid-arm |
| Mid upper arm | t = 0.50 | 34.0 | 31.2 | .194 / .192 | COMPUTED NHANES relaxed |
| Above elbow | t = 0.88 | 31.5 | 28.5 | .180 / .175 | ESTIMATE = 0.93 x mid-arm |
| Elbow (over the olecranon, arm straight) | t = 1.00 / f = 0 | 30.0 | 27.0 | .171 / .166 | ESTIMATE = 0.88 x mid-arm |
| Forearm widest | f = 0.28 | 29.0 | 25.4 | .165 / .156 | COMPUTED flexed .174 / .164 x 0.95 |
| Mid forearm | f = 0.55 | 24.5 | 21.8 | .140 / .134 | ESTIMATE (midway of forearm max and wrist, convex) |
| Wrist | f = 1.00 | 17.4 | 15.4 | .099 / .095 | COMPUTED ANSUR |

Forearm max over wrist is 1.76 (men) and 1.70 (women) as medians of the person's own ratio (computed). Flexed biceps over flexed forearm is 1.15 (computed, both sexes), so the upper arm is about 15 percent thicker than the forearm max.

### 1c. Cross-section: limbs are not round (ALL ESTIMATE; the survey has no widths)

Rule to code: from a girth C, mean diameter is C/pi, so width + depth = 2C/pi. With width/depth ratio r: width = (2C/pi) x r/(1+r), depth = (2C/pi) x 1/(1+r). Axes are in the limb's own frame with the palm facing FORWARD (anatomical). In the game's rest pose the palms face the thighs (forearm rolled in about 90 degrees), so the forearm's width axis then points front to back at the wrist: carry the twist down the forearm, 0 at the elbow to 90 degrees at the wrist.

| Ring | Width : depth (side to side : front to back) |
|---|---|
| Shoulder cap | 0.85 (deep: the deltoid wraps the front and back) |
| Mid upper arm | 0.92 (a little deeper than wide: biceps and triceps) |
| Above elbow | 1.10 (the humerus flares side to side) |
| Elbow | 1.15 (epicondyles) |
| Forearm widest | 1.10 near the elbow (palm forward) |
| Mid forearm | 1.20 |
| Wrist | 1.35 (flat: wide in the palm's plane, thin front to back) |

Check on the wrist: a man's wrist girth 17.4 cm gives width + depth 11.1 cm: about 6.3 wide, 4.8 deep (ESTIMATE; a caliper study would say).

### 1d. Variation of the arm by sex and build (COMPUTED medians by BMI band, shares of stature; relaxed mid-arm = 0.96 x biceps)

Flexed biceps (M / F), forearm max flexed (M / F), wrist (M / F):
- under 18.5 (frail, slim): .157/.154, .149/.141, .093/.088
- 18.5-22 (slim): .173/.165, .158/.150, .095/.092
- 22-25: .187/.179, .167/.158, .098/.094
- 25-27.5 (average street): .200/.190, .174/.164, .099/.095
- 27.5-30 (stocky): .209/.201, .179/.169, .101/.097
- 30-35 (heavy): .219/.220, .186/.178, .103/.100
- 35 and over: .238/.233, .196/.185, .107/.102

Rules: slim to heavy, the upper arm grows 51 percent in girth (men .157 to .238) while the wrist grows 15 percent. So fat and muscle live on the upper arm and forearm, the wrist barely changes: heavy people have a very conical arm and a small-looking hand end. Women have the same wrist ratio ~ 0.95 of men's, and a shoulder cap 0.9 of men's (bideltoid .276 vs .290; computed, section 1b of the earlier doc).
Athletic: at the same BMI (25-30), the lower-waist quarter of men has biceps .204 against .205 for the high-waist quarter and the same forearm; the difference is the trunk (waist .492 vs .573), not the arm (computed). So "athletic" = the average arm of that BMI, with shoulder cap and trapezius bigger and a visible muscle line, not thicker limbs. Frail (BMI under 18.5, and elders): arm .157 men.

### 1e. The hand (COMPUTED ANSUR, share of stature; cm for the 175.5 / 162.6 cm person)

- Length wrist crease to middle fingertip .110 (19.3 cm) / .111 (18.0 cm). Palm length .0662 (11.6) / .0667 (10.8), so the middle finger is 0.40 of hand length (palm 0.60).
- Breadth across the knuckles .0502 (8.8 cm) / .048 (7.8). Hand girth around the knuckles .121 (21.2 cm) / .115 (18.7).
- Thickness at the knuckles: about 0.25 of hand length (ESTIMATE; 3 to 3.5 cm in a hand 19 cm long). Hand breadth : length = 0.46 (computed: .0502 / .110).
- Finger lengths (ESTIMATE, standard: index about 0.85 of the middle finger, ring 0.92, little finger 0.70, thumb about 0.75 and set low and forward).
- Resting hand: fingers curl in so each joint is more bent than the one before: about 15, 30, 20 degrees at knuckle, middle and tip joints for the index, more for the little finger; thumb lies alongside the index with the tip near the middle joint of the index. Thickness is greatest at the thumb base and at the knuckles. With palm-in, the back of the hand faces outward and slopes; the fingertips end at .37 of stature from the floor.

## 2. THE LEG

Hip joint (trochanter) height .512 / .519 of stature; crotch .481 / .480; mid-kneecap .278 / .275; lateral ankle bone .0415 / .0386; tibial (top of shin) .266 / .269 (earlier doc and recomputed). Crotch to knee .2037 / .2046; knee to ankle bone .2362 / .2367; so thigh (crotch to kneecap) and shin (knee to ankle bone) are the same length within 2 percent: 35.7 / 33.3 cm thigh, 41.5 / 38.5 cm shin (man / woman). Let T = 0 at the crotch, 1 at the kneecap middle; s = 0 at the knee, 1 at the ankle bone.

### 2a. Girth profile, standing, average build (ANSUR BMI 25-27.5; cm for 175.5 / 162.6 cm)

| Ring | Position | Man cm | Woman cm | Share of stature M / F | Source |
|---|---|---|---|---|---|
| Top of thigh (gluteal furrow) | T = 0 | 61.3 | 62.9 | .349 / .387 | COMPUTED |
| Mid thigh | T = 0.50 | 52.7 | 54.1 | .300 / .333 | ESTIMATE = 0.86 x top |
| Above knee (just above kneecap) | T = 0.85 | 40.2 | 40.7 | .229 / .250 | COMPUTED |
| Knee (over the patella) | T = 1.00 | 39.0 | 39.5 | .222 / .243 | ESTIMATE = 0.97 x above-knee |
| Calf widest | s = 0.33 | 38.6 | 37.7 | .220 / .232 | COMPUTED |
| Narrowest above ankle | s = 0.85 | 22.6 | 21.6 | .129 / .133 | COMPUTED (minimum ankle) |
| Ankle bones | s = 0.95 | about 24 | about 23 | .137 / .141 | ESTIMATE, 1.06 x minimum |

Median ratios of the same person's rings (computed): above-knee over top-thigh .656 men / .651 women; calf over above-knee .958 / .933; narrowest ankle over calf .585 / .579; calf over top-thigh .629 / .607. So the thigh falls to about two thirds of its top girth by the knee, the calf is the same as the lower thigh, then the leg drops to 0.58 of the calf at the ankle: thigh and calf are close in girth at the knee, and the ankle is where the big drop happens.
Women's thigh top is 8 percent bigger than men's as a share of stature (.387 vs .349), calf 5 percent, ankle 3 percent.

Calf widest point: ESTIMATE s = 0.30 to 0.35 of the shin below the knee. OPENED (MDPI "A Detailed Anatomical Description of the Gastrocnemius Muscle", mdpi.com/2813-0545/3/4/21, excerpt): maximum width of the muscle belly is at about 50 percent of the muscle head length below the knee joint line; the whole belly is 23.5 +- 3.4 cm; medial head max width 5.5 +- 1.6 cm, lateral head 4.2 +- 1.1 cm. So the inner (medial) head is wider and fuller by about 30 percent; it also reaches lower (standard teaching, ESTIMATE). The soleus lies under it and shows at the sides below the belly. The muscle gives way to the Achilles tendon at about s = 0.60 (ESTIMATE); below there the back of the leg is a straight, narrow cord down to the heel.

### 2b. Cross-section (ESTIMATE, same rule as 1c: width + depth = 2C/pi)

| Ring | Width : depth |
|---|---|
| Top of thigh | 0.90 (about 19.5 wide x 21.5 deep for a man) |
| Mid thigh | 0.97 |
| Above knee | 1.05 (the quads flatten, the knee widens) |
| Knee | 1.00 (about 11 wide, 12 deep with the kneecap; a flat front, a hollow behind) |
| Calf widest | 0.95 |
| Narrowest above ankle | 1.0 |
| Ankle bones | 1.10 (bone to bone breadth is .0426 stature = 7.5 cm man, 6.7 cm woman, computed bimalleolar) |

### 2c. Shape rules

- Front view: the outer line from hip to knee is nearly straight; it slants a few degrees inward (the thigh bone leans from the hip joint toward the midline; see "Inward slant" below). The inner line curves: widest at the crotch, tucking in toward the knee. Thighs touch or nearly touch at the top for average and heavier builds (thigh clearance when seated is .102 stature = 18 cm, computed: a thigh is 18 cm deep; the hip breadth .196 / .217 is wider than two thighs of 19 cm are comfortable, so in standing the inner thighs are in contact from the crotch down to about T = 0.3 in an average build, and a gap shows only below T = 0.5 in slim builds and bow-legged people).
- Inward slant: the femur runs about 9 degrees from vertical overall (hip joint to knee centre) in adults (ESTIMATE; standard anatomy figure "bicondylar angle about 9 degrees" from memory), which brings the knee centres about 5 cm (thigh length x sin 9 degrees = 5.6 cm) closer together than the hip joints at their top. Women have slightly more (wider pelvis).
- Side view: the quadriceps bulge in front, greatest at T = 0.4 to 0.6 and sweeping in to the kneecap at 1.0; the hamstrings and the seat behind; the thigh is deepest at the top (seat) and the front-to-back line stays nearly straight behind. The kneecap stands about 2 to 3 cm in front of the thigh and shin lines; behind the knee is a hollow (popliteal fossa) that shows as a slight inward notch.
- Knee as a block: wider and squarer than the thigh just above and the shin just below; two soft bulges at the sides of the kneecap; the front of the shin below it is a sharp, nearly straight edge down the front to the ankle (the tibia).
- Calf: in back view, the inner head is lower and fuller; in side view, the calf peaks at s = 0.33 and the line runs straight and slightly forward to the ankle behind the shin line.
- Ankle: inner ankle bone is higher than the outer: the outer bone sits at .0415 stature from the floor (computed), the inner at about .054 (ESTIMATE: 2 cm higher). The Achilles runs behind as a vertical band.
- Heavy build: the extra girth is in the thigh and the knee region, much less at the ankle: from BMI 18.5-22 to 30-35, thigh top grows 28 percent in men (.300 to .385), above-knee 21 percent, calf 20 percent, ankle only 11 percent (.122 to .135). So a heavy leg is a big cone narrowing to a normal ankle. Women: thigh top .337 to .426 (26 percent).
- Athletic: same limb girth as the average of that BMI (computed above); the look is a defined quad sweep and a bigger calf peak (the difference of the two waist groups at BMI 25-30 is only .348 vs .363 in men's thigh top: i.e. NOT bigger legs).

### 2d. The foot (COMPUTED ANSUR)

Length .154 stature (27.1 cm) men, .151 (24.6 cm) women. Breadth across the ball .0579 (10.2 cm) / .0569 (9.3). Heel breadth .0411 (7.2) / .041 (6.7). Ball-of-foot length (heel to ball) .1144 (20.1) / .1117 (18.2), so the toes take the last 0.26 of the foot. Ball girth .1434 / .1401. Breadth over length: 0.375. Instep/arch: the medial arch raises the inside of the sole 1.5 to 2 cm in a standing foot (ESTIMATE); the heel is the lowest and rear-most point, the ankle sits at 0.20 of foot length from the back (ESTIMATE). A shoe adds about 1 cm outside on each side and 1.5 to 2 cm at the toe, a 2.5 to 3 cm heel; foot length with shoe about 0.17 to 0.175 of stature (ESTIMATE; the review's 0.188 reading is too big, the shoe seat should be about .165 to .17).

## 3. AGES: differences from the adult

### 3a. Measured by NHANES 2017-18 (COMPUTED medians; share of stature)

| Age | Stature cm M / F | BMI M / F | Mid-arm girth share M / F | Arm length (acromion-elbow, NHANES method) M / F | Upper leg length M / F |
|---|---|---|---|---|---|
| 2-3 | 95.6 / 92.9 | 16.5 / 16.1 | .171 / .174 | .207 / .206 | n.m. |
| 4-5 | 109.4 / 108.4 | 15.9 / 16.1 | .159 / .161 | .209 / .206 | n.m. |
| 6-7 | 123.4 / 122.4 | 16.3 / 16.5 | .155 / .158 | .210 / .211 | n.m. |
| 8-9 | 134.2 / 133.9 | 17.4 / 17.5 | .155 / .158 | .213 / .214 | .236 / .236 |
| 10-11 | 145.7 / 148.7 | 19.1 / 19.5 | .160 / .162 | .216 / .217 | .243 / .241 |
| 12-13 | 160.5 / 157.4 | 20.3 / 22.3 | .159 / .166 | .218 / .220 | .245 / .244 |
| 14-15 | 172.4 / 158.9 | 22.0 / 23.7 | .167 / .173 | .221 / .222 | .246 / .244 |
| 16-17 | 174.6 / 160.9 | 23.1 / 23.9 | .174 / .176 | .221 / .220 | .247 / .242 |
| 18-24 | 174.7 / 161.2 | 25.6 / 25.4 | .187 / .185 | .221 / .222 | .245 / .242 |
| 25-39 | 175.4 / 161.2 | 28.4 / 28.4 | .202 / .199 | .223 / .222 | .241 / .237 |
| 40-59 | 174.4 / 160.4 | 29.1 / 29.2 | .200 / .204 | .224 / .224 | .236 / .229 |
| 60-69 | 172.4 / 158.6 | 28.4 / 30.0 | .194 / .206 | .226 / .226 | .234 / .227 |
| 70-79 | 171.1 / 156.8 | 28.3 / 28.5 | .191 / .199 | .228 / .227 | .233 / .225 |
| 80+ | 170.5 / 156.2 | 27.2 / 27.5 | .181 / .190 | .229 / .229 | .233 / .227 |

BMI spread (P10 to P90) for 8-9: 14.7 to 24.8 (boys); 12-13: 16.4 to 30.5; adults 25-39: 22.2 to 38.3 (men). So within one age there are very thin and very heavy kids.

### 3b. Children (about 4, 7 and 10)

- Heads tall: 5 at 2-3, 6 at 5, 6.25 at 8, 7 at 12, adult 7.5 (OPENED earlier: Dunlop 1912 via USF ETC; US Navy drafting manual). Interpolated (ESTIMATE): 4 years 5.5 heads (head .182 of stature), 7 years 6.1 (.164), 10 years 6.6 (.152); adult .133.
- Limb lengths: arm share is only 6 percent below an adult's at 4 (.209 vs .222 at 18-24; computed), so the child look is the large head and short LEG, round trunk and small hands and feet, not short arms. Upper leg (hip to knee) .236 at 8-9 against .245 at 12-17: 4 percent shorter share. Crotch height share (ESTIMATE, scaled from the leg ratio and head size): 4 years about .44, 7 years .46, 10 years .47, adult .48. Waist circumference .46 to .47 of stature at 6-11 (earlier doc).
- Limb girth (measured, not "chubbier"): mid-arm girth share is .159 to .161 at 4-5 and .155 to .158 at 6-9, about 0.8 of the adult average (.20) and equal to a slim adult (.158-.165). At 2-3 it is .171 to .174 (round toddler). The round look of a young child comes from the large head, the belly and the short limbs, not from thick limbs: girth over length is 0.76 for the arm at 4 vs 0.90 in an adult (computed ratio of medians: .159/.209 vs .200/.224). So ring girths of the child: arm .16, thigh (ESTIMATE) .27 of stature, calf (ESTIMATE) .18.
- Trunk: round and deep, belly out, no waist; chest and belly nearly the same girth (waist share .46-.52); a short neck; posture: lordosis (swayback) and a protruding belly at 4, straighter by 10 (ESTIMATE, clinical description). Child shoulder breadth is NOT measured here; hips and shoulders are about equal width with no taper (ESTIMATE).
- Hands and feet: hand length about .10 stature at 4 and .108 at 10; foot .16 at 4 (feet are bigger as a share in the young child: ESTIMATE, from the known fact that feet and hands reach adult size early; no table found).
- Minors are never hurt in this game: do not model them to appear in fights; shape only.

### 3c. Teenagers (about 13 and 16)

- Growth order (clinical description, STANDARD teaching, remembered, not opened: Wikipedia could not be fetched): hands and feet first, then arms and legs, then the trunk; boys' shoulders and chest widen last and keep widening after height stops; girls' hips and fat on thighs and hips arrive at 11 to 14.
- Numbers (COMPUTED): boys' stature jumps from 160.5 cm at 12-13 to 172.4 at 14-15 (12 cm in two years) while BMI rises only 20.3 to 22.0, and mid-arm girth share is .159 at 12-13 (the lowest of any age after 8) and only .174 at 16-17 against .202 for adults. Upper leg share is already .245 at 12-13 (adult .241 to .245), arm length .218 against .221 at 14: so legs and arms reach adult SHARES by 12-13 while the arm girth is 80 percent of adult share at 13 and 86 percent at 16 (boys). Girls: stature stops at 14-15 (158.9 vs 161.2) while BMI goes on rising (22.3 at 12-13 to 23.7 to 25.4 adult); arm girth share .166 / .173 / .176 vs .185.
- So a 13 year old boy: adult leg and arm lengths, thin arms (girth .159 of stature vs .20), a head 0.14 of stature (about 7 heads; ESTIMATE), narrow shoulders and chest, large hands and feet (hand .105 ESTIMATE, foot about .158), a thin neck (earlier doc: adult neck .226 men; teenage neck ESTIMATE about .20). 16 year old boy: full height; limbs still about 86 percent girth; shoulders still narrow by about 5 to 8 percent (ESTIMATE). Girls at 13: stature close to adult (97 percent), hips widening, more thigh fat; at 16: adult proportions, arms thinner than an adult woman's (.176 vs .185).
- Gangly look = long limbs, thin limbs, big hands and feet, narrow shoulders, sometimes a forward head.

### 3d. Elders (about 70 and 85)

- Stature (COMPUTED NHANES cross-section, civilians): men 175.4 cm (25-39) to 171.1 (70-79) to 170.5 (80+): minus 4.3 / 4.9 cm; women 161.2 to 156.8 to 156.2: minus 4.4 / 5.0 cm. Cross-section, so part is the shorter generation, part real shrinkage (spine discs and vertebrae, posture; clinical). Use: 70: minus 2.5 percent, 85: minus 3 to 4 percent (the cross-section gives 3.0 / 2.9 percent for men and 3.2 / 3.6 percent for women at 80+; true longitudinal shrinkage is larger, ESTIMATE 5 percent at 85).
- The loss is in the trunk: arm length share rises .223 to .229 (men) and leg (hip-knee) share falls .241 to .233 (men), .237 to .227 (women), so legs lose share and the trunk loses more (stature falls, arms and shins do not shrink).
- Thinner limbs, same joints: mid-arm girth share falls from .202 (25-39) to .181 (80+) in men (minus 10 percent) and .199 to .190 in women (minus 5 percent; women peak at .206 at 60-69). The waist share rises (men .556 to .616) so the trunk stays thick while the limbs thin. Weight (median) men 86.5 to 78.5 kg, women 72.6 to 67.6 kg. Rule for the mesh: elder arm and leg girth multiplied by 0.88 (men) / 0.93 (women) at 85, 0.95 / 0.97 at 70 against an adult of the same BMI band (ESTIMATE derived from the numbers above), elbow, wrist, knee and ankle girths unchanged (bone), so those joints look bigger.
- Spine and head: thoracic kyphosis angle (OPENED, search excerpts; Katzman 2010 JOSPT and Roghani 2016 PMC5316378, Radiopaedia "Kyphosis"): about 25 degrees (20 to 29) in adolescents and young adults, about 38.5 (35 to 42) in adults, begins to rise after 40, above 40 is excess, a mean of 43 degrees in women aged 55 to 60 rising to 52 in the oldest group quoted (the age of the older group was cut off in the excerpt I saw), faster in women than men. Rule: rounded upper back adds about 10 to 15 degrees by 70, 20 to 25 by 85 against the adult (ESTIMATE from those numbers; for the mesh: tilt the upper-back ring forward with the C7 level forward and down).
- Head: craniovertebral angle (OPENED, search excerpts of studies on older adults, mean age 67.9: standing 48.1 degrees; young adults without pathology about 55.9; a 2024 study of 122 healthy adults fits minus 1.6 degrees per decade): the head carried about 6 to 8 degrees more forward at 70 and 8 to 12 at 85 (ESTIMATE from the slope); the head sits forward of the shoulders by 2 to 4 cm and the chin juts; the neck looks thinner and longer in front, with a visible hollow at the collarbone; neck girth ESTIMATE minus 5 to 8 percent in the thin elder, but the neck often looks thicker from a heavy trapezius hump in women.
- Shoulders: roll forward and down (rounded), the shoulder cap flattens, the collarbone shows (muscle loss); acromion drop (neck base to shoulder tip) up by about 1 cm (ESTIMATE).
- Trunk: softer lower belly forward, a flatter, lower, sagging seat (the buttock loses height and depth; buttock depth falls ESTIMATE 8 to 10 percent) , wider hips relative to thighs in women; waist share higher.
- Stance and gait: slightly flexed knees (about 8 to 12 degrees at rest, ESTIMATE; do not conflict with the knee bend GAIT corrected), feet wider apart (stance width about 12 to 15 percent bigger, ESTIMATE), steps shorter (Not measured here.).
- Men and women differ: men lose limb girth faster (minus 10 percent arm vs minus 5 percent); women lose more height (3.6 vs 2.9 percent), have the earlier and stronger kyphosis ("dowager's hump") and the lower, wider seat.

## 4. For a low-polygon mesh (6 to 10 vertices per ring)

Silhouette (must be geometry): shoulder cap width and the armhole line; the arm's taper from upper arm to wrist (cone, not tube); the elbow as a slight bulge with a back point when bent; the forearm's belly in the first third then taper; the wrist as the narrowest neck above the hand; the thigh cone (wide top, narrow knee); the thighs' contact line at the crotch; the knee block; the calf belly at s = 0.33 with the straight shin line and the narrow ankle; the foot's heel and arch. Paint or shade only: the deltoid's three heads, the biceps/triceps split, the tendons, the kneecap outline, the ankle bones, the Achilles, the inner/outer calf heads (use a 0.04 stature normal push, or a darkening line), veins and the elbow crease.

Rings (vertex count 6 to 10, all in an ellipse with the axes of 1c/2b): arm 7 rings: shoulder cap, mid upper arm, above elbow, elbow, forearm peak, mid forearm, wrist (wrist ring may share vertices with the hand). Leg 8 rings: top of thigh, mid thigh, above knee, knee (two rings 1 cm apart if the knee must bend cleanly), calf peak, narrowest above ankle, ankle. With 8 vertices on a ring the ellipse is good (axes at 0, 90, 180, 270 degrees and the four diagonals); 6 vertices give a hexagon and lose the width/depth ratio unless the two side vertices sit on the width axis (put them there). Triangles: an 8-vertex ring pair costs 16 triangles, so 7 arm rings = 96 per arm and 8 leg rings = 112 per leg, 416 triangles for four limbs, inside the budget of 6,400 (about 6 percent).
Middle level (1,600 triangles): keep shoulder cap, mid upper arm, elbow, forearm peak, wrist (5 rings, 6 vertices) and thigh top, above knee, calf, ankle (4 rings, 6 vertices): the ratios 1c/2b can drop to 1.0 except the wrist (flat) and the thigh (depth over width). Far level (360): one tapered tube per segment with the girths of the ring table (mid upper arm, forearm max, wrist; top thigh, above knee, calf, ankle) as two 4-vertex rings per segment; fade the elbow and calf bulge to 0.5 of the close value, the ellipses to circles.

## 5. Open points and what is not found

- No measured width/depth for limbs (the survey gives only girths): the ratios in 1c and 2b are anatomical estimates; a caliper table or MRI sections (not found: the MRI sources on the first search were not open-access text) would settle them.
- No child shoulder or hip breadth (Snyder 1977 scan not readable), no elder limb girth other than NHANES mid-arm, no measured stance width or knee angle for elders, no teenager neck girth.
- Elbow, knee, mid-thigh girths: estimates.
