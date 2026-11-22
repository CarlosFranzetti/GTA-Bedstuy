# Character bodies: how real people are built and move, and what makes GTA V's street people read

Status: current, growing (RESEARCH body seat, 22 Nov 2026). For the BODY, GAIT, POSE, CLOTHES and REVIEW seats.
Style reference only: nothing here comes from game files. Where a number is "CHECKED" it was computed or read
from a source opened in this session. "ESTIMATE" means remembered or inferred, not checked: do not build to it
without a second look.

## 0. How the numbers were made

- ANSUR II (US Army anthropometric survey, 2012; public data, 4,082 men and 1,986 women, adults mostly 17 to 51).
  Downloaded in this session from the Penn State OpenLab mirror (`tools.openlab.psu.edu/publicData`, linked from
  `openlab.psu.edu/ansur2`) and every row below was COMPUTED by percentile from the raw files: "share" is each
  person's measure divided by that same person's stature, then the 5th, 50th and 95th percentile of those shares.
  So a column is not "5th percentile man's value over median stature"; it is the spread of the ratio itself.
- CAVEAT that matters: ANSUR is soldiers. Fitter, trimmer than the civilian street (median male BMI 27.5, median female 25.3, computed, so already
  not slim, but fewer very heavy people and no elders). Section 3 corrects for build with a BMI table.
- Heights are measured from the floor, widths are breadths of the body (not circumferences), "circ" is a girth.
- Canon: figure drawing's average adult is 7.5 heads tall, ideal 8, heroic 8.5 (Wikipedia, "Body proportions",
  opened: it says exactly this and cites Lanteri 1903 and Tobin 1975 for the 8-head Classical canon). Head height is
  not in ANSUR's public list; head LENGTH (front to back) is.

## 1. ADULT PROPORTIONS (all as share of stature; P5 / P50 / P95; CHECKED against ANSUR II raw data)

Stature: men 1648 / 1755 / 1870 mm; women 1525 / 1626 / 1740 mm. (Civilian US adults are about 1.76 m men and 1.62 m
women on CDC NHANES; ESTIMATE, not opened.) Women are 0.927 of the man's median stature.

### 1a. Heights from the floor (the vertical landmarks)

| Landmark | Men P5 / P50 / P95 | Women P5 / P50 / P95 | ANSUR variable |
|---|---|---|---|
| Top of shoulder (acromion) | .804 / .821 / .836 | .805 / .820 / .834 | acromialheight |
| Base of neck back (cervicale, C7) | .853 / .864 / .875 | .846 / .857 / .868 | cervicaleheight |
| Notch of the collarbones (suprasternale) | .807 / .819 / .831 | .804 / .816 / .828 | suprasternaleheight |
| Nipple line (chest height) | .718 / .735 / .753 | .695 / .719 / .743 | chestheight |
| Navel / waist | .580 / .602 / .622 | .580 / .602 / .624 | waistheightomphalion |
| Top of hip bone (iliac crest) | .584 / .604 / .626 | .590 / .611 / .632 | iliocristaleheight |
| Hip joint / greater trochanter | .489 / .512 / .540 | .496 / .519 / .543 | trochanterionheight |
| Crotch | .459 / .481 / .506 | .456 / .480 / .505 | crotchheight |
| Wrist (standing, arm hanging) | .462 / .482 / .503 | .468 / .487 / .508 | wristheight |
| Knee, mid kneecap | .263 / .278 / .294 | .261 / .275 / .291 | kneeheightmidpatella |
| Knee, outer joint line | .267 / .280 / .293 | .269 / .286 / .302 | lateralfemoralepicondyleheight |
| Top of shin (tibia) | .253 / .266 / .280 | .255 / .269 / .283 | tibialheight |
| Ankle bone (outer) | .037 / .041 / .046 | .034 / .039 / .043 | lateralmalleolusheight |
| Sitting height (floor to head, seated) | .500 / .524 / .544 | .502 / .527 / .548 | sittingheight |

What follows from it, for the BODY seat:
- The crotch sits at 48 percent of stature in both sexes; legs (crotch down) are about half the person. Men's and
  women's leg share is the same to within 0.001 at the median. Women's hip joint is a hair lower (0.519 against 0.512)
  and the waist the same; what differs is width and girth (1b), not leg length. Women are NOT "longer legged" as a share.
- The fingertips: wrist is at 0.482 to 0.487, the hand adds about 0.11, so the fingertips of a hanging arm end at about
  0.37 to 0.38 of stature from the floor, which is mid-thigh (thigh runs .48 down to .28). Check: hand length 0.110 is
  CHECKED (1c); the fingertip height is that arithmetic, not a measured landmark.
- The head: stature minus cervicale is 0.136 of stature (the top of the C7 spine to the crown, includes the back of the
  neck). A chin-to-crown head is about 1/7.5 = 0.133 by the drawing canon; ESTIMATE (no chin-to-vertex in the public file).

### 1b. Widths and depths (breadths, straight lines, not girths)

| Measure | Men P5 / P50 / P95 | Women P5 / P50 / P95 | ANSUR variable |
|---|---|---|---|
| Biacromial (bone-to-bone shoulder width) | .221 / .237 / .253 | .208 / .224 / .240 | biacromialbreadth |
| Bideltoid (shoulder width, outside the muscle) | .262 / .290 / .322 | .250 / .276 / .306 | bideltoidbreadth |
| Chest breadth (at nipple level) | .149 / .165 / .182 | .148 / .165 / .185 | chestbreadth |
| Chest depth (front to back) | .120 / .145 / .169 | .127 / .151 / .181 | chestdepth |
| Waist breadth (at navel) | .156 / .186 / .218 | .155 / .183 / .219 | waistbreadth |
| Waist depth | .107 / .134 / .170 | .104 / .128 / .167 | waistdepth |
| Bicristal (pelvis, iliac crests) | .143 / .157 / .171 | .148 / .167 / .189 | bicristalbreadth |
| Hip breadth (widest, standing) | .177 / .196 / .220 | .193 / .217 / .243 | hipbreadth |
| Buttock depth | .116 / .140 / .165 | .121 / .142 / .171 | buttockdepth |
| Head breadth | .081 / .088 / .095 | .084 / .091 / .099 | headbreadth |
| Head length (front to back) | .106 / .114 / .122 | .108 / .117 / .125 | headlength |
| Shoulder (acromion to neck base) length | .076 / .085 / .095 | .074 / .083 / .093 | shoulderlength |

Read it as shapes: the male shoulder (bideltoid .29) is 1.48 times the hip breadth (.196). The female shoulder (.276)
is only 1.27 times the hip (.217). In ratios of shoulder to hip, that is the whole difference between the sexes
on a front view, together with the female waist being the same width as the male waist as a share of stature.
A chest is deeper than it is wide only for the heaviest builds: median chest is .165 wide, .145 to .151 deep, so the
torso cross-section is a rounded rectangle about 1.1 : 1, not a flat board and not a cylinder.

### 1c. Limbs, hands, feet, neck

| Measure | Men P5 / P50 / P95 | Women P5 / P50 / P95 | ANSUR variable |
|---|---|---|---|
| Upper arm (acromion to elbow) | .197 / .207 / .217 | .196 / .205 / .215 | shoulderelbowlength |
| Elbow to wrist (radiale to stylion) | .143 / .152 / .163 | .138 / .148 / .160 | radialestylionlength |
| Elbow to fingertip (forearm and hand) | .261 / .273 / .288 | .257 / .269 / .287 | forearmhandlength |
| Hand length (wrist crease to middle fingertip) | .103 / .110 / .117 | .104 / .111 / .119 | handlength |
| Hand breadth (across knuckles) | .047 / .050 / .054 | .044 / .048 / .052 | handbreadth |
| Foot length | .146 / .154 / .163 | .143 / .151 / .160 | footlength |
| Foot breadth | .053 / .058 / .063 | .052 / .057 / .062 | footbreadthhorizontal |
| Arm span (fingertip to fingertip) | .991 / 1.031 / 1.081 | .975 / 1.018 / 1.072 | span |
| Neck girth | .203 / .226 / .254 | .185 / .201 / .225 | neckcircumference |

Rules the BODY seat can build to:
- Upper arm : forearm (elbow to wrist) = 0.207 : 0.152 = 1.36 : 1 in men, 1.39 : 1 in women. The hand is a further 0.110.
  So shoulder-to-wrist is .359 (men) / .353 (women) of stature, and wrist-to-fingertip adds .11: total arm .47 to .48,
  which is why the fingertip lands at .37 from the floor.
- Arm span is slightly MORE than stature (1.03 men, 1.02 women): arms are long, not short. A figure whose reach is
  under 1.0 of its height is stubby.
- The hand is about as long as the face is tall: 0.110 of stature is 1/9; the 7.5-head head is 0.133.
- The foot is 0.15 of stature, about 1.15 head-heights (0.154/0.133): "a foot is about a head and a bit".
- Elbow rests at about the waist: shoulder-to-elbow .207 puts the elbow at .82 - .207 = .614 of stature, i.e. at the
  navel / iliac crest height (.602 to .604). Check this against the arm hanging rest in POSE.
- Shoulder drop: acromion .821 against cervicale .864: the shoulder tips sit 4.3 percent of stature (about 7.5 cm on a
  1.75 m man) BELOW the base of the neck. The neck-to-shoulder line slopes, it is not a horizontal shelf.

### 1d. Girths (circumferences), men and women, as share of stature

| Girth | Men P5 / P50 / P95 | Women P5 / P50 / P95 |
|---|---|---|
| Neck | .203 / .226 / .254 | .185 / .201 / .225 |
| Chest | .523 / .603 / .685 | .507 / .576 / .674 |
| Waist (at navel) | .438 / .534 / .640 | .441 / .524 / .637 |
| Buttock (widest hip girth) | .514 / .581 / .653 | .560 / .625 / .704 |
| Thigh (top) | .302 / .356 / .410 | .326 / .377 / .433 |
| Calf | .197 / .223 / .252 | .204 / .228 / .259 |
| Biceps, flexed | .172 / .204 / .237 | .160 / .186 / .222 |
| Forearm, flexed | .157 / .177 / .197 | .145 / .162 / .181 |
| Wrist | .093 / .100 / .108 | .088 / .095 / .102 |
| Ankle | .118 / .130 / .145 | .119 / .132 / .148 |
| Weight (kg per metre of stature, not a share) | 37.5 / 48.1 / 61.6 | 32.5 / 41.0 / 52.1 |

Computed from the same files; weight row = kg divided by m of stature (ANSUR weight is stored in 0.1 kg and was
converted). Median man 85 kg at 1.755 m, median woman 67 kg at 1.626 m (CHECKED).

Wrist girth is 10 percent of stature in men. Use: forearm girth tapers .177 flexed at the thickest to .100 at the wrist, thigh .356 to calf .223 to ankle .130. The thigh is
nearly three times the ankle in girth.


## 2. CHILDREN, TEENAGERS AND ELDERS

Sources opened: CDC NHANES 2017-2018 body measures (file BMX_J, with demographics DEMO_J, downloaded from
`wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/`; civilians, all ages, 8,704 people measured), medians computed
per age band and sex in this session. For heads-tall: Dunlop, "Anatomical Diagrams for the Use of Art Students" (1912)
as shown on the USF Clip Art ETC page "Relation of Head to Height by Age" (opened); and the US Navy training manual
page "Figure Drawing, Continued" (Integrated Publishing, `draftingmanuals.tpub.com`, opened). CDC's own growth-chart
files were refused by the server from here, so the CDC growth charts were NOT opened; NHANES measurements stand in.

### 2a. Heads tall by age (drawing canon; two opened sources, they agree)

| Age | Heads tall | Source |
|---|---|---|
| Birth | 4 | Dunlop 1912 via USF ETC |
| 1 year | 4.5 (neck to feet 3.5) | US Navy drafting manual, Figure 3-37 text |
| 2 to 3 years | about 5 | ESTIMATE (interpolated between 4.5 at 1 and 6 at 5, not read from a source) |
| 5 years | 6 | Dunlop 1912 via USF ETC |
| 8 years | 6.25; "the centre of the body is just above the hips" | US Navy manual |
| 12 years | 7; "the centre of the body is now the crotch" | US Navy manual |
| Adult | 7.5 | Dunlop; Wikipedia "Body proportions" (opened) |

So a 6 to 7 year old is 6 heads, a 10 year old about 6.6 (ESTIMATE, interpolated), a 12 year old 7, a 15 to 16 year old
within a quarter head of an adult. The centre of the body (half the stature) drops from above the navel in a baby to the
crotch at about 12. Careful with the Navy line for one year: the body is 4.5 head units and the neck-to-feet span is 3.5, so the head is 1.

### 2b. Measured segment shares by age (NHANES 2017-18, MEDIANS, share of stature)

Landmarks differ from ANSUR (section 1): NHANES "upper arm length" is shoulder to elbow measured by the survey's own
method, "upper leg length" is hip to knee, so compare ages with each other here, not with section 1's numbers.

| Age band | Median stature cm (boys / girls) | Upper arm length (boys / girls) | Upper leg length (boys / girls) | Waist girth (boys / girls) | Arm girth (boys / girls) |
|---|---|---|---|---|---|
| 2 to 3 | 95.8 / 92.8 | .207 / .206 | not measured | .514 / .522 | .171 / .174 |
| 4 to 5 | 109.4 / 108.3 | .209 / .206 | not measured | .483 / .488 | .159 / .161 |
| 6 to 7 | 123.3 / 122.5 | .210 / .211 | not measured | .457 / .469 | .155 / .158 |
| 8 to 9 | 134.3 / 133.8 | .213 / .214 | .236 / .236 | .464 / .463 | .155 / .158 |
| 10 to 11 | 146.0 / 148.7 | .216 / .217 | .243 / .241 | .469 / .472 | .160 / .162 |
| 12 to 13 | 160.3 / 157.3 | .218 / .220 | .245 / .244 | .447 / .489 | .159 / .166 |
| 14 to 15 | 172.4 / 158.8 | .221 / .222 | .246 / .244 | .457 / .503 | .167 / .173 |
| 16 to 17 | 174.7 / 161.3 | .221 / .220 | .247 / .242 | .456 / .496 | .174 / .176 |
| 18 to 24 | 174.7 / 161.2 | .221 / .222 | .245 / .241 | .507 / .541 | .187 / .185 |

What it says, for BODY:
- Arms get relatively longer with age (upper arm .207 at 2 to 3 to .221 at 14), from 94 percent of the adult share to
  full. The arm of a 6 year old is only 5 percent shorter, as a share, than an adult's: the child look is the HEAD and
  the SHORT LEG, not short arms.
- Upper leg (hip to knee) is .236 at 8 and .245 to .247 at 12 to 17: legs gain about 4 percent of their share over the
  ages 8 to 14 (a modest change as measured; the bigger leg change is shin and foot, not measured here).
- Pre-teens carry a rounder trunk than their heads imply: waist girth is .46 to .47 of stature at 6 to 11, the same as
  a slim adult (section 3), so a child is not a thin adult in the middle. At 2 to 3 the waist girth share is .51 to .52,
  as big as an average adult's (.53 to .56) while the child is 0.55 of the adult's height: toddlers are round.
- Stature at which the sexes diverge: girls lead at 10 to 11 (148.7 against 146.0 cm), boys pass them from 12 to 13
  and by 14 to 15 are 13.6 cm taller (172.4 against 158.8). Girls reach their adult height by about 14 to 15
  (158.8 is within 2.4 cm of the 18 to 24 median of 161.2); boys at 16 to 17 (174.7, equal to 18 to 24).
  Waist share drops at puberty for boys (.469 at 10 to 11 to .447 at 12 to 13: they stretch faster than they widen).
- Weights (median, boys / girls): 2 to 3 years 15.0 / 13.9 kg; 6 to 7 years 25.0 / 24.4; 10 to 11 years 39.9 / 44.1
  (girls heavier); 14 to 15 years 65.9 / 61.4; 18 to 24 years 78.0 / 66.7. BMI (boys / girls) 16.5/16.1, 16.3/16.5, 19.1/19.5,
  22.0/23.7, 25.6/25.5.
- Shoulder width of children: NOT measured in NHANES and not found; ESTIMATE only that shoulders are narrower than hips
  in a child (shoulder:hip near 1.0) and that the male adult ratio of 1.48 (section 1b) arrives with puberty. The
  hip-to-shoulder circumference ratio of Wikipedia (women 1:1.03, men 1:1.18, opened) is the adult figure.

### 2c. Elders (NHANES, medians, share of stature or centimetres)

| Age band | Men: stature cm / waist / hip girth share | Women: stature cm / waist / hip girth share |
|---|---|---|
| 25 to 39 | 175.4 / .556 / .590 | 161.2 / .577 / .657 |
| 40 to 59 | 174.4 / .591 / .595 | 160.4 / .613 / .673 |
| 60 to 69 | 172.4 / .598 / .593 | 158.6 / .641 / .685 |
| 70 to 79 | 171.1 / .616 / .602 | 156.7 / .639 / .676 |
| 80 and over | 170.5 / .606 / .598 | 155.9 / .625 / .666 |

- Stature loss from the 25 to 39 band to 80 and over: men 4.9 cm (2.8 percent), women 5.3 cm (3.3 percent). Careful:
  this is a cross-section (today's 80 year olds were also shorter as young adults), so some of it is not shrinkage.
  Real shrinkage, from the clinical literature, is larger in women than men; that claim is from memory, not checked.
- Elders carry a thicker waist: waist/stature .556 to .616 men, .577 to .641 women, and their arms and legs get
  thinner (arm girth share falls from .202 at 25 to 39 to .181 at 80+ in men, .199 to .190 in women).
  Elder arm length share rises (.223 to .229) only because the trunk and legs shrink.
- Weight median falls after 70: men 86.5 kg (25 to 39) to 78.5 kg (80+), women 72.6 to 67.6 kg.
- Posture of elders (stooped trunk, forward head, bent knees and hips, shorter steps): STANDARD clinical teaching,
  quantified numbers NOT checked in this session. See section 4 for the gait slow-down, also not yet opened.

## 3. BUILD (how weight sits on the body)

### 3a. ANSUR II, men and women, MEDIAN girth and breadth shares by BMI band (soldiers, computed here)

Median of each person's measure divided by that person's stature. BMI = kg / m^2 from the same file. WHR is
waist girth over buttock girth (ANSUR landmarks: waist at the navel, buttock at the widest point).

MEN (n in brackets)
| BMI band | Waist girth | Buttock girth | Thigh girth | Biceps (flexed) | Neck | Chest girth | Waist depth | Hip breadth | WHR |
|---|---|---|---|---|---|---|---|---|---|
| under 18.5 (9) | .401 | .474 | .273 | .157 | .191 | .506 | .099 | .173 | .84 |
| 18.5 to 22 (291) | .437 | .513 | .300 | .173 | .206 | .522 | .108 | .180 | .86 |
| 22 to 25 (770) | .476 | .542 | .327 | .187 | .215 | .558 | .117 | .187 | .88 |
| 25 to 27.5 (988) | .516 | .568 | .349 | .200 | .223 | .588 | .128 | .194 | .90 |
| 27.5 to 30 (916) | .553 | .592 | .365 | .209 | .230 | .616 | .139 | .200 | .93 |
| 30 to 35 (921) | .596 | .619 | .385 | .219 | .239 | .650 | .154 | .207 | .96 |
| 35 and over (187) | .661 | .663 | .419 | .238 | .251 | .703 | .174 | .221 | 1.00 |

WOMEN
| BMI band | Waist girth | Buttock girth | Thigh girth | Biceps (flexed) | Neck | Chest girth | Waist depth | Hip breadth | WHR |
|---|---|---|---|---|---|---|---|---|---|
| under 18.5 (13) | .416 | .540 | .310 | .154 | .185 | .492 | .103 | .193 | .77 |
| 18.5 to 22 (298) | .459 | .572 | .337 | .165 | .191 | .526 | .110 | .201 | .80 |
| 22 to 25 (638) | .498 | .605 | .363 | .179 | .197 | .558 | .120 | .211 | .82 |
| 25 to 27.5 (520) | .539 | .638 | .387 | .190 | .203 | .589 | .134 | .221 | .85 |
| 27.5 to 30 (327) | .577 | .661 | .403 | .201 | .210 | .621 | .144 | .228 | .87 |
| 30 to 35 (171) | .620 | .695 | .426 | .220 | .217 | .657 | .160 | .238 | .89 |
| 35 and over (19, thin sample) | .689 | .755 | .472 | .233 | .223 | .693 | .180 | .257 | .91 |

Whole survey BMI: men 21.4 / 27.5 / 34.8 (P5 / P50 / P95), women 20.3 / 25.3 / 31.7. Age P5 / P50 / P95: men 19 / 28 / 47,
women 19 / 27 / 45.

### 3b. NHANES 2017-18 civilians, ages 20 to 59, MEDIAN shares by BMI band (a heavier, more street-like population)

NHANES waist is at the top of the hip bone and hip is the widest girth, so the landmarks are not ANSUR's.

| BMI band | Men waist/ht | hip/ht | WHR | arm girth/ht | Women waist/ht | hip/ht | WHR | arm girth/ht |
|---|---|---|---|---|---|---|---|---|
| under 18.5 | .408 | .482 | .84 | .144 | .430 | .532 | .81 | .141 |
| 18.5 to 25 | .476 | .534 | .89 | not computed | .492 | .585 | .84 | .168 |
| 25 to 30 | .555 | .582 | .96 | .195 | .575 | .645 | .89 | .195 |
| 30 to 35 | .622 | .623 | .99 | .212 | .646 | .701 | .92 | .217 |
| 35 to 40 | .685 | .670 | 1.03 | .228 | .704 | .765 | .92 | .235 |
| 40 and over | .773 | .738 | 1.04 | .246 | .794 | .849 | .93 | .262 |

Civilian adult spread, share of stature (P5 / P50 / P95), men 20 to 39 / 40 to 59 and women 20 to 39 / 40 to 59 / 60+:
- waist/ht: M 20 to 39 .416 / .548 / .730; M 40 to 59 .468 / .591 / .769; W 20 to 39 .432 / .576 / .802; W 40 to 59 .464 / .613 / .832
- hip/ht: M 20 to 39 .501 / .587 / .725; W 20 to 39 .541 / .651 / .850; W 40 to 59 .556 / .672 / .898
- BMI P5 / P50 / P95 for women 20 to 39: 19.0 / 27.95 / 44.7; for adults 60 and over men 20.6 / 28.2 / 39.3, women 20.8 / 29.0 / 42.2.
- The median American adult in this survey is BMI 28 to 29, i.e. "overweight" by the band. A street crowd built from
  slim and athletic figures only would be wrong: half the street is at or above .55 waist to stature.

Cross-check with Wikipedia "Body proportions" (opened): waist-to-height ratio for a healthy man 0.46 to 0.53, woman 0.45 to
0.49, above .63 for morbid obesity, US swimmers .42 to .43. The tables above agree (ANSUR waist .476 to .516 for BMI 22 to 27.5).

### 3c. Where the mass goes (read off the tables, not a model)

Going from BMI 18.5 to 22 to BMI 35 and over (ANSUR, the share of stature gained):
- Men: waist girth +.224 (.437 to .661), a gain of 51 percent; buttock girth +.150 (+29 percent); thigh +.119 (+40);
  biceps +.065 (+38); neck +.045 (+22); chest girth +.181 (+35); waist depth +.066 (+61); hip breadth +.041 (+23).
  So men's mass goes first to the ABDOMEN (depth more than width), then the chest wall and thigh, last to the neck
  and hip breadth. WHR reaches 1.0: waist as wide as the hips.
- Women: waist girth +.230 (+50 percent); buttock girth +.183 (+32); thigh +.135 (+40); biceps +.068 (+41); neck
  +.032 (+17); waist depth +.070 (+64); hip breadth +.056 (+28). Women gain at the hip and thigh more than men in
  absolute girth (hip breadth +.056 against +.041) and their WHR only rises from .80 to .91, never to 1.0: the
  pear shape holds, with the waist still smaller than the hip.
- Both sexes: the arm gets thicker (biceps +38 to +41 percent) but the WRIST and ANKLE barely change (see the
  girths table: ankle .130 at median; ESTIMATE, wrist and ankle by BMI band not computed): fat widens the upper arm
  and thigh, not the extremities. Neck girth gains least.
- Slim to heavy in plan: waist depth grows faster (+61 to +64 percent) than waist breadth (men .157 to .223 = +42 percent;
  women .162 to .231 = +43 percent): the heavy torso grows ROUND, deeper front to back than it is wider.
- Muscular against slim, same stature: ANSUR has no muscle measure; but the pattern: at the same BMI of 27.5 to 30 the
  male median biceps is .209 and the waist .553 (heavy build). To separate athletic from heavy, use WHR: soldiers at
  BMI 25 to 27.5 have WHR .90, and the whole top 5 percent of male BMI (34.8 and up) is 1.0. A muscular build, by general knowledge (NOT from this data), is a wide shoulder and deep chest with a waist
  lower than the same-BMI average. ESTIMATE only: no muscular/average split was computed because the file has no body-fat or muscle variable.
  Chest girth minus waist girth (a "V" taper, computed from the table) is .085 for BMI 18.5 to 22 men, .072 for 25 to 27.5, .042 for 35 and over: the V flattens.
- Frail (elders, very low BMI): see 2c, thinner arms (arm girth .181 at 80+) with thicker waist; NHANES gives no
  very-frail row; ESTIMATE only.

### 3d. What to build

Six body types per sex covering the actual street (shares of stature; waist = at navel, ANSUR landmarks):
| Type | BMI | M waist / buttock / thigh / biceps / neck | W waist / buttock / thigh / biceps / neck |
|---|---|---|---|
| Lean | 20 | .44 / .51 / .30 / .17 / .21 | .46 / .57 / .34 / .165 / .19 |
| Average slim | 23.5 | .48 / .54 / .33 / .19 / .215 | .50 / .605 / .36 / .18 / .20 |
| Average | 26 | .52 / .57 / .35 / .20 / .22 | .54 / .64 / .39 / .19 / .20 |
| Heavy | 29 | .55 / .59 / .365 / .21 / .23 | .58 / .66 / .40 / .20 / .21 |
| Obese | 32 | .60 / .62 / .385 / .22 / .24 | .62 / .695 / .425 / .22 / .22 |
| Very heavy | 36 | .66 / .66 / .42 / .24 / .25 | .69 / .755 / .47 / .23 / .22 |
These rows are the band medians above, rounded; the BMI values are band mid-points (a design choice, not a survey result).
Height is independent: shoulders and limbs do not scale with BMI (bone lengths, section 1) except the shoulder tips
(bideltoid .264 slim to .325 very heavy in men).

Pending in this file: 4 movement, 5 the GTA V look.
