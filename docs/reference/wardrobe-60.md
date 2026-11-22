# Wardrobe 60: parts, mix rules, sixty outfits, and the details that read at 3 metres

Author: Imani Rhodes (RESEARCH, wardrobe), 22 to 23 Nov 2026. Builds on `docs/reference/clothing-brooklyn.md` (sixteen outfits, cut
numbers, open fabric list: not repeated here) and on the code as it stands (`src/textures/painters/pedWardrobe.ts`,
`pedOutfits.ts`). Status: part 1 (parts list) written; parts 2 to 4 follow in this file.

HOW TO TRUST THIS FILE. Everything below is my own synthesis of widely documented street dress, standard garment-pattern practice,
`clothing-brooklyn.md`, and a look at the owner's reference pictures (other games' screenshots, looked at only: a fitted grey
suit with an open-collar white shirt and a loosened striped tie, a belt visible at the waist, a jacket that fits the shoulder and
falls straight; a city street of people in plain dark jackets, trousers and bags). I opened no per-outfit photo source, so no photo
is named and none needs a licence. No source is invented. Numbers are starting values to tune by looking. Where a figure is an
estimate I say so. No lettering, logos or numbers on any garment, no real brand names in any table (rule 4); "tan work boot" and
"retro high-top" are shapes, not makes.

THE KEY TO THE TABLES.
- id: camelCase. An id that already exists in `pedWardrobe.ts` / `pedOutfits.ts` is written as is. A name marked NEW is a part that
  does not exist yet; the "from" column then says which existing kind it is built on and what is different (one line).
- from: `kind` (TopKind, BottomKind) plus the style / cut / flags the code already has (`TopStyle`, `BottomCut`, `fabric`, `zip`,
  `open`, `long`, `pattern`), or "new" with the shape in one line.
- fit: ease is garment minus body in cm (chest or waist, as in clothing-brooklyn.md): SKIN-CLOSE 0 to 4, REGULAR 8 to 12, RELAXED
  14 to 20, OVERSIZED 24 to 36. Hem anchors: HIP (about 15 cm below the waist), UPPER-THIGH, MID-THIGH, KNEE, MID-CALF, ANKLE.
  For bottoms: rise (waist to crotch placement) and ankle opening (cm round), plus the hem break.
- colourways: three or four, name and hex each, inside the muted palette of DIRECTION.md (black, navy, grey, olive, brown, denim,
  off-white; albedo about 0.04 to 0.75). `*` marks the one accent colour; a part never has more than one accent among its ways, and
  an outfit never has more than one accent in total.
- who: age bands c child (to 12), t teen (13 to 18), y young adult (19 to 35), a adult (36 to 59), e elder (60 plus). The code's age
  codes are k t a o; map c = k, t = t, y and a = a, e = o. Sex: any, M mostly men, W mostly women (a weight, not a rule, except where
  the code already has `sx`).
- decade: the decade the cut belongs to. The game's people are mixed by age: elders wear 1990s and 2000s cuts, young adults and teens
  today's (DIRECTION.md). "now" = 2020s.
- season: warm, cool (spring and autumn), cold, any. Maps to the code's `w` warmth (0 light, 1 mid, 2 heavy).
- formality: street, work, smart, church, sport, uniform. Maps to the code's looks (street s, work w, smart m, church c, sport p,
  uniform u; elder e, teen t and night n are who-based looks, see part 2).
- wt: how common on a Bed-Stuy street, 1 rare to 5 everywhere.

---------------------------------------------------------------------------------------------------------------

## PART 1. THE PARTS LIST

### 1.1 Tops (24). Worn alone or under an outer layer (then only the collar, hem and cuff show)

| id | from | fit and length | fabric | colourways (hex; * = accent) | who | decade | season | formality | wt |
|---|---|---|---|---|---|---|---|---|---|
| tee | tee, short | REGULAR, ease 10; hem at HIP, sleeve to mid-upper-arm, rib collar 2 cm | cotton jersey, limp | off-white #b4b0a4; grey #9c9a94; black #1c1c20; olive #4a5a48 | any age, any | now | warm, cool | street | 5 |
| tallTee | NEW: tee with fit flag `oversized` (chest ease 32, hem UPPER-THIGH, shoulder seam dropped 6 cm, sleeve to mid-forearm) | OVERSIZED | heavy jersey 200 gsm, hangs and ripples at hem | off-white #b8b8b2; black #1c1c20; grey #8a8a86; navy #2a3248 | y, a, e; M | 2000s | warm, cool | street | 4 |
| pocketTee | tee, style pocket | REGULAR, ease 12; hem HIP; one chest patch pocket 10 x 11 cm, centred on the left chest | cotton jersey, a little stiffer | grey #9c9a94; sand #bdb49c; navy #2a3248; faded black #34363e | y, a, e; M | now | warm, cool | work, street | 3 |
| longTee | tee, long | REGULAR; hem HIP; sleeve to the wrist bone, rib cuff 1.5 cm | cotton jersey | off-white #b4b0a4; charcoal #3a3f48; olive #4a5a48; brown #5a5448 | t, y, a | now | cool, cold | street | 3 |
| henley | NEW: tee long or short with a 3-button placket 12 cm long, no collar | REGULAR to RELAXED, ease 12; hem HIP | waffle or slub cotton | oatmeal #b0a894; charcoal #3a3f48; navy #2a3248; olive #4a5a48 | y, a, e; M | now (and 1990s) | cool, cold | street, work | 2 |
| tank | tee, sleeves none | RELAXED, ease 16; hem HIP; deep armhole to 4 cm below the armpit; 3.5 cm shoulder straps | cotton rib, limp | white #b8b8b2; black #1c1c20; grey #9c9a94; olive #4a5a48 | t, y, a; M | now (and 1990s) | warm | street, sport | 3 |
| ribTank | NEW: tee, sleeves none, women's fit: scoop neck, 2.5 cm straps, hem at the waist or HIP | SKIN-CLOSE, ease 2 | 2 x 2 cotton rib, clings, shows ribs as vertical lines | off-white #b4b0a4; black #1c1c20; sage #8a9482; brown #7a5a42 | t, y, a; W | now | warm | street, sport | 3 |
| crewSweat | tee, long, fabric fleece, pattern heather | RELAXED, ease 18; hem HIP with 5 cm rib band; rib collar 3 cm | brushed fleece, soft | heather grey #9c9a94; navy #2a3248; black #1c1c20; forest #3a4a30 | any age | now, 1990s | cool, cold | street | 4 |
| hoodie | hoodie, no zip; hood up or down | RELAXED to OVERSIZED, ease 22; hem HIP with 6 cm rib band; kangaroo pocket 28 x 16 cm; hood rolled 12 cm when down | heavy fleece | grey #7c8088; black #1c1c20; navy #2a3248; olive #4a5a48 | t, y, a; any | now | cool, cold | street | 5 |
| zipHoodie | hoodie, zip | REGULAR to RELAXED, ease 16; hem HIP, rib band | fleece | charcoal #2a2c32; grey #7c8088; navy #2a3248 | any, t to a | now | cool, cold | street, sport | 3 |
| polo | tee, style polo | REGULAR, ease 10; hem HIP; flat collar, 3-button placket 10 cm; short rib cuff | pique cotton | navy #2a3248; grey #8a8a86; olive #4a5a48; off-white #b4b0a4 | a, e; M | 2000s, now | warm, cool | work, smart | 3 |
| knitPolo | tee, polo, fabric knit | REGULAR; hem HIP | fine knit, matte | camel #a89e88; navy #2f3a58; grey #7c8088 | a, e; M | 1990s | cool | smart, elder | 2 |
| sweater | tee long, style sweater, fabric knit | RELAXED, ease 16; hem HIP with 6 cm rib band; crew neck rib 3 cm | chunky knit, heather | oatmeal #a89e88; navy #2f3a58; maroon #5a2a34; forest #3a4a40 | a, e, any | any | cool, cold | street, smart, church | 4 |
| turtleneck | NEW: tee long with a folded roll neck 7 cm tall, standing 4 cm off the throat | SKIN-CLOSE to REGULAR, ease 6; hem HIP | fine rib knit | black #1c1c20; oatmeal #b0a894; charcoal #3a3f48; rust #7a4a32* | y, a; any | now, 1990s | cold, cool | smart, street | 2 |
| shirt | blouse, long, style shirt | REGULAR, ease 12; hem HIP, tucked or untucked; point collar 7.5 cm, collar stand 3 cm, cuff 6 cm | cotton poplin, crisp | pale blue #a8b4be; off-white #b8b8b0; grey-blue #98a8b8; faint stripe #a8a8b4 | a, e, y; any | any | any | smart, work, church | 5 |
| dressShirt | blouse, long, style shirt (existing, men) | REGULAR to RELAXED (elders); long sleeve with 1 cm showing at the jacket cuff | cotton, pressed, vertical crease | off-white #b8b8b0; pale blue #a8b4be; lilac-grey #a8a8b4 | a, e; M | 1990s to now | any | smart, church, uniform | 4 |
| flannel | blouse long, style workshirt, pattern plaid | RELAXED, ease 18; hem upper-HIP; plaid repeat 8 to 10 cm | brushed cotton | red-black #7a3028; navy check #2f4a6a; green #34503a; grey #3a3f48 | t, y, a; M | 1990s, now | cool, cold | street, work | 3 |
| campShirt | blouse short, style shirt, pattern stripe | RELAXED, ease 18; hem HIP; open camp collar, no stand | rayon, limp | faint stripe #6a8098; olive #3a5a46; sand #b0aa96; brown #7a4a32 | a, e; M | 1990s, now | warm | street, elder | 2 |
| blouse | blouse, short or long (existing, women) | REGULAR to RELAXED, ease 12 to 16; hem HIP; round or V neck, or a 2 cm tie neck | crepe or cotton, limp | cream #c8bfae; dusty pink #b4a0a2; sage #a8b0a0; pale blue #a0aab4 | a, e; W | 1990s to now | any | smart, church, work, elder | 4 |
| bballJersey | jersey, sleeves none (existing) | RELAXED, ease 18; hem UPPER-THIGH; deep armhole, 5 cm binding; V or round neck binding | mesh knit, limp | black #14161a; navy #2a3a5a; grey #b4b4b4; maroon #5a2030 | t, y, a; M | 2000s, now | warm | sport, street | 3 |
| scrubs | scrubs (existing) | REGULAR to RELAXED, ease 14; hem HIP with side slits; V neck | cotton-poly, limp | teal #3a6a74; navy #2f3a58; ceil-blue #7a9ca8; maroon #6a2a36 | a, y; any | now | any | uniform | 3 |
| uniformShirt | uniform, short or long | REGULAR, ease 12; hem HIP tucked; point collar, 2 chest pocket flaps, shoulder epaulettes as plain loops, NO insignia | poly-cotton, slightly shiny at shoulders | light blue #98a8b8; navy #243a52; grey #8a8a86; white #b8b8b0 | y, a; M | 2000s, now | any | uniform | 3 |
| bandShirt | NEW: shirt, long, with a band (mandarin) collar 2.5 cm and a short placket, no point collar; hem KNEE (long) or HIP | RELAXED, ease 16 to 20 | cotton or linen, pressed | white #b8b8b0; sand #b0a48a; olive #6a6a50; charcoal #3a3f48 | a, e; M | any | warm, cool | street, church, elder | 2 |
| dashiki | NEW: blouse long:true, style kaftan, wide sleeves to the elbow, a rounded V-neck with a 2 cm band, hem HIP to UPPER-THIGH, in a SOLID colour with the band the accent (no prints, plain panels allowed) | OVERSIZED, ease 28 | cotton, medium | ochre #8a6a2a*; deep green #34503a; indigo #2f3a58; cream #c8bfae | y, a, e; any | any | warm, cool | street, church | 2 |

### 1.2 Bottoms (16)

| id | from | fit and length | fabric | colourways | who | decade | season | formality | wt |
|---|---|---|---|---|---|---|---|---|---|
| jeansStraight | jeans, straight | REGULAR; mid rise (waist to crotch about 27 cm); thigh ease 8; ankle opening 20 cm; hem breaks once on the shoe | mid denim, medium wash, stiff | #4d6c98; #34506f; #232b3b; #5a7494 | any age (not c); any | any | any | street, work | 5 |
| jeansSlim | jeans, slim | SKIN-CLOSE at thigh, taper to ankle opening 15 cm; hem at the ankle bone | stretch denim | #1f2a3a; #151a22; #2e3848; #667f9a | t, y; any | now | any | street, smart | 4 |
| jeansBaggy | jeans, baggy | RELAXED, thigh ease 24; low rise (waist to crotch 30 cm); ankle opening 26 cm; hem stacks over the shoe, back drags below the heel | heavy denim, broad creases, lap fade | #34506f; #232b3b; #4d6c98; #5a7494 | t, y, a, e(2000s); M | 2000s, now | any | street | 4 |
| jeansWide | NEW: jeans cut baggy plus fit flag `wide`: straight from the hip, ankle opening 32 cm, hem 3 cm stack | OVERSIZED leg; high rise (waist to crotch 25 cm) | washed denim, pale fade down the thigh | pale #667f9a; mid #4d6c98; black #1c1c20; grey #6c7078 | t, y; W and M | now | any | street | 3 |
| chinos | trousers, straight | REGULAR; rise navel minus 2; ankle opening 21 cm; one break | cotton twill, pressed crease | khaki #a89a78; stone #c8bca0; olive #4a4a40; navy #2f3a48 | a, e, y; any | any | any | work, smart, elder | 4 |
| suitTrousers | trousers, straight | REGULAR; high rise (navel minus 3); ankle opening 22 cm (elder) or 19 cm (now); pressed centre crease; full or half break | wool blend, matte, shine at seat and knee | charcoal #3a3e4a; navy #2f3442; black #1c1c24; grey #4a4a52 | a, e; M and W | 1990s to now | any | smart, church, uniform | 4 |
| cargo | cargo, pocket | RELAXED, thigh ease 20; mid rise; ankle opening 24 cm; two bellows thigh pockets 15 x 18 cm with a 5 cm flap, plus patch back pockets | cotton ripstop or twill | olive #4a4a40; black #1c1c20; stone #8a8478; brown #5b4a30 | t, y, a; M and W | now (and 2000s) | any | street, work | 4 |
| workTrousers | trousers, cut patch (existing) | REGULAR to RELAXED; rise navel minus 2; ankle opening 24 cm; knee patches, hammer loop; hem frayed and pale | canvas duck, stiff | brown #5b4a30; tan #6a5f48; charcoal #3a3f48; navy #2f3442 | a; M | any | any | work | 3 |
| sweatsCuffed | sweats, cuffed (the slim jogger) | SKIN-CLOSE at calf, thigh ease 10; elastic waist with drawcord; ankle cuff 14 cm opening, hem above the shoe | heavy jersey, ripples at knee | black #1c1c20; grey #6c7078; navy #2a3248; olive #3a4a30 | t, y, a; any | now | any | street, sport | 5 |
| trackPants | sweats, cut stripe | REGULAR, ease 14; straight leg, ankle opening 20 cm; a plain 2 cm side stripe (no letters) | nylon, a little sheen | black with grey stripe #aaa69a; navy with stripe #a8582a*; forest #2d5a3a | e, a, y, t; M | 1990s, 2000s | any | sport, street | 3 |
| bballShorts | shorts, long | RELAXED, ease 20; hem 3 cm below the knee; elastic waist, side seam 4 cm slit | mesh poly, limp | black #14161a; navy #2a3a5a; grey #b4b4b4; maroon #5a2030 | t, y; M | 2000s, now | warm | sport, street | 3 |
| cargoShorts | shorts, cut pocket | RELAXED, ease 20; hem 3 cm above the knee; bellows pocket with flap on each thigh | cotton twill | khaki #a89a78; olive #4a4a40; stone #8a8478; black #1c1c20 | t, y, a; M | 2000s, now | warm | street | 4 |
| chinoShorts | shorts, knee | REGULAR; hem 4 cm above the knee; ankle-to-hem 25 cm round | cotton twill | sand #a89a78; navy #2e3848; olive #4a4a40 | y, a, e; M | any | warm | street, work | 3 |
| midiSkirt | skirt, knee (existing) | REGULAR; waist ease 6; straight to A-line; hem MID-CALF (8 to 12 cm below the knee) | crepe, wool blend | navy #2f3442; charcoal #3a3248; black #1c1c20; plum-brown #4a3a44 | a, e, y; W | 1990s to now | any | church, smart, work, elder | 4 |
| maxiSkirt | skirt, long, cut maxi (existing) | RELAXED; elastic or gathered waist; hem ANKLE; gathered fall | cotton, limp | navy #2f3442; forest #34483a; brown #4a3a30; black #1c1c20 | a, e, y; W | any | warm, cool | street, church, elder | 3 |
| leggings | leggings (existing) | SKIN-CLOSE, ease 0; hem ankle | stretch jersey with a faint sheen | black #1c1c20; charcoal #34363e; navy #2a3248 | t, y, a; W | now | any | street, sport | 3 |

Carry-over bottoms that exist and stay (not in the sixteen, kept by weight): jeansCropped, jeansFlare, cargoF, pencil, pleated,
denimSkirt, denimShorts, denimMaxi, trousersSlim, cordTrousers, workDark, sweatShorts, tennisSkirt, runShorts. New bottoms wanted
beyond the sixteen: trousersWide (NEW: trousers straight, high rise, ankle opening 30 cm, pleat at the waist, a soft fall; navy
#2f3442, camel #a89e88, charcoal #3a3e4a, black #1c1c20; y; any; now; street, smart; wt 2) and scrubPants (the code pairs scrubs
with `workDark`: fine).

### 1.3 Outer layers (12). Over a top; the top shows at collar, opening and hem

| id | from | fit and length | fabric | colourways | who | decade | season | formality | wt |
|---|---|---|---|---|---|---|---|---|---|
| blazer | jacket, style blazer | REGULAR, ease 10; hem mid-crotch; notch lapel 8 cm, 2-button, a visible roll to the middle button | wool blend, a little shine at elbow | navy #2f3442; charcoal #3a3e4a; black #1c1c24; brown-grey #4a3a44 | a, e, y; any | any | cool, cold | smart, church, work, night | 4 |
| overcoat | jacket long, wool, style overcoat | RELAXED, ease 20; hem KNEE; notch lapel 9 cm; covered placket | wool coating, long vertical folds | camel #7a6a4c; charcoal #2f3442; black #1c1c20; olive #5a5a40 | a, e, y; any | any | cold | smart, church, street | 3 |
| bomber | jacket open, style bomber; fabric leather OR canvas (nylon) | REGULAR, ease 12; hem HIP with 6 cm rib; rib collar 5 cm and rib cuffs; zip; one sleeve pocket on the upper left arm | leather (heavy, creased at elbow) or nylon (sheen) | black leather #1c1c20; brown leather #2a1c18; olive nylon #3a4a30; navy nylon #2f3a58 | t, y, a, e; M and W | 1990s (leather), now (nylon) | cool, cold | street, night | 4 |
| denimJacket | jacket open, fabric denim, style denim | REGULAR, ease 12; hem at the waist to HIP; point collar, two chest flap pockets with a seam yoke | denim, stiff, whiskered at the elbow | mid #4d6c98; dark #34506f; black #232b3b; faded #667f9a | t, y, a; any | any | cool | street | 4 |
| pufferShort | puffer | OVERSIZED, ease 28 (plus 30 mm baffle loft); hem HIP or waist; 12 to 16 cm baffles; stand collar 8 cm | quilted nylon, sheen, pinches | black #1c1c20; navy #2f3a58; olive #3a4a30; grey #6c7078 | t, y, a; any | now | cold | street | 5 |
| pufferLong | puffer, long:true | RELAXED to OVERSIZED, ease 24; hem MID-THIGH to KNEE; hood or tall collar | quilted nylon | black #1c1c20; stone #aaa69a; olive #3a4a30; navy #2f3a58 | y, a, e; W and M | now | cold | street, work | 3 |
| workJacket | jacket zip, fabric canvas, style workshirt | RELAXED, ease 14; hem HIP; flat collar with corduroy facing; 2 chest and 2 hip patch pockets; 3 cm cuff | duck canvas, stiff, boxy, pale at shoulders | tan #6a5f48; brown #5b4a30; olive #4a4a40; black #1c1c20 | a, y; M | any | cool, cold | work, street | 3 |
| windbreaker | tracksuit zip, style track | REGULAR to RELAXED, ease 14; hem HIP, elastic; high collar; colour-block panel at the chest and shoulders in two muted tones (no logo) | thin nylon, sheen | navy #2f3a58; black #1c1c20; olive #3a4a30; grey #6c7078 | t, y, a; any | 1990s, now | cool | sport, street, uniform | 3 |
| fleece | jacket zip, fabric fleece | RELAXED, ease 16; hem HIP; stand collar 4 cm; chest zip pocket | polar fleece, fuzzy 8 to 12 mm | grey #6c7078; navy #2f3a58; forest #3a4a40; brown #6a4e34 | a, e; any | 2000s, now | cool, cold | work, street | 3 |
| cardigan | cardigan (open or buttoned) | RELAXED, ease 16; hem HIP; shawl collar or V; two patch pockets | chunky knit | maroon #5a2a34; oatmeal #a89e88; navy #2f3a58; forest #3a4a40 | e, a; W and M | 1990s | cool | elder, church, smart | 4 |
| velourTrack | tracksuit zip, style track, pattern none | REGULAR to RELAXED, ease 14; hem HIP with rib; zip to the chin; two zip pockets; plain 2 cm stripe down the sleeve in a contrast tone (no letters) | velour, plush, a soft nap that catches light | navy #243a52; burgundy #5a2a34*; forest #2d4a3a; black #1c1c20 | a, e; any | 2000s | any | street, elder, sport | 3 |
| hiVisVest | vest (existing workVest) | RELAXED, ease 20; hem HIP; zip or velcro front; two grey reflective bands 5 cm wide round the body and two vertical over the shoulders | mesh poly, limp, translucent | safety yellow-green #aab22e* (desaturated); orange #bc5420* | a, y; M | now | any | work | 3 |

Carry-over layers that exist and stay: shirtOpen, cardiganOpen, denimClosed, bomberNylon (now a fabric of `bomber`), parka, trench,
peacoat, varsity, leatherCoat, rainSlicker, labCoat, apron. New layer shapes wanted for the outfits (each built on an existing kind):
chefJacket (NEW: labCoat, white, double-breasted, two rows of 4 cloth buttons, 3/4 sleeve cuff turned back; with `apron`; used in
kitchen outfits), barberSmock (NEW: apron or labCoat, short sleeve, snap front, hem MID-THIGH, black or grey), cropJacket (NEW:
jacket with hem at the waist, RELAXED, ease 14, a work-jacket or bomber cut; `cropped` hem flag), boubou (see 1.1 dashiki, long form).

### 1.4 Headwear (16 including none)

| id | from | shape and fit | fabric | colourways | who | decade | season | formality | wt |
|---|---|---|---|---|---|---|---|---|---|
| none | hat 'none' | bare head | | | any | | any | any | 5 |
| cap | hat 'cap' | baseball cap: crown 9 cm, curved brim 6 cm, no logo, no lettering; the front panel plain | cotton twill | black #1c1c20; navy #2a4a7a; grey #6c7078; olive #4a5a48 | t, y, a, e(2000s); M | 2000s, now | any | street, work, uniform, sport | 4 |
| snapback | hat 'snapback' | flat brim 7 cm, tall crown 10 cm, six panels, plain | wool or poly | black #1c1c20; grey #6c7078; navy #2f3a58; red-brown #7a3028* | t, y; M | 2000s, now | any | street | 3 |
| beanie | hat 'beanie' | knit cap, rolled cuff 5 cm, 20 cm tall, snug | knit | black #1c1c20; charcoal #2f3442; oatmeal #b0aca0; rust #7a3028* | any age | any | cold, cool | street, work | 4 |
| bucket | hat 'bucket' | 4 cm drooping brim all round, crown 9 cm | cotton twill | olive #4a5a48; sand #bdb49c; black #1c1c20; slate #6a8098 | t, y, e; any | 1990s, now | warm | street | 3 |
| flatCap | hat 'flat' | low round crown, a short peak 4 cm, slouch 3 cm over the front | wool tweed or cotton | brown #5a5348; charcoal #3a3028; navy #2f3442; grey #6c7078 | e, a; M | 1990s | cool, cold | elder, smart | 3 |
| fedora | hat 'fedora' | brim 5 cm, crown 11 cm with a centre pinch, band 2.5 cm | felt, with a 2 tone band | charcoal #2f3442; brown #3a3028; grey #5a5348; black #101014 | e, a; M | 1990s | cool, cold | church, smart | 2 |
| churchHat | hat 'church' | wide round brim 8 to 12 cm, crown 8 to 10 cm, a slight tilt, a ribbon band | felt or straw | plum #3b2a52; cream #d8c8b0; navy #2d2638; dusty rose #c9a2a0 | e, a; W | 1980s to 2000s | any | church | 3 |
| headwrap | hat 'headwrap' | cloth wound round the head, 6 to 10 cm above the hairline, a knot or tuck at the front 3 cm, 2 to 3 folds visible, SOLID colour | cotton, soft or starched | ochre #8a6a2a*; teal #3a6a74; rust #8a4a32; cream #c8bfae | a, e, y; W | any | any | street, church, elder | 3 |
| durag | hat 'durag' | smooth tight cap over the skull, knotted tail 20 cm at the back, seam over the crown | satin, sheen | black #1c1c20; navy #2f3a58; grey #6c7078; wine #5a2a34 | y, a; M | 2000s, now | any | street | 2 |
| kufi | hat 'kufi' | round close cap 5 to 8 cm high, fine knit or woven | cotton knit | white #d8d4c8; cream #c8bca0; black #1c1c20; brown #5a4228 | a, e, y; M | any | any | church, street, elder | 2 |
| hardhat | hat 'hardhat' | rigid dome, a short brim all round, a rib ridge over the crown | hard plastic, gloss | white #f4f4f0; yellow #d8c84a*; orange #c87a2a* | a, y; M | now | any | work | 2 |
| helmet | hat 'helmet' | cycle helmet: rounded shell 8 cm high with 6 vent slots, a chin strap line | gloss shell | black #1c1c20; grey #6c7078; white #b8b8b4 | y, a, t; any | now | any | street, uniform | 2 |
| hijab | hat 'hijab' | headscarf pinned under the chin, a soft drape to the collarbone, no hair showing | cotton or jersey | black #1c1c20; navy #2f3a58; grey #8a8a86; oatmeal #b0a894 | t, y, a, e; W | now | any | any (modest dress) | 2 |
| bonnet | NEW: hat 'headwrap'-like smooth gathered cap, a wide soft band round the forehead, a puffed crown 6 cm, no tail | satin, sheen; worn at home and on short errands | black #1c1c20; wine #5a2a34; navy #2f3a58; cream #c8bfae | t, y, a; W | now | any | street (errand) | 1 |
| strawHat | NEW: hat 'bucket'-like wide soft brim 7 cm with a low rounded crown | woven straw, coarse | natural #b4a078; dark straw #8a7048; band the one accent | a, e; any | 1990s, now | warm | street, church | 1 |

Carry-over: hood and hoodDown (from the garment), scarf (neck, see accessories), cop and kippah and peyot are not in this list
(police is another seat; the lead is asking the owner about the Hasidic community separately: nothing here depends on it).

### 1.5 Shoes (14). The code has 11 `ShoeKind`s; colour, sole and height variants make the rest

| id | from | silhouette and fit | sole at heel | ankle height | colourways | who | decade | season | formality | wt |
|---|---|---|---|---|---|---|---|---|---|---|
| sneakerLow | sneakerLow (clean court style) | slim, rounded toe, flat thin sole | 2.5 cm | 8 cm | off-white #b8b8b4; grey #aaa6a0; cream-black #161616 | any | now | any | street, sport, work | 5 |
| sneakerDark | sneakerLow, dark | same, black or charcoal uppers, thin pale sole | 2.5 cm | 8 cm | black #161616; charcoal #2a2c32; navy #1c2a4a | any | now | any | street, uniform, work | 4 |
| sneakerHigh | sneakerHigh (retro basketball high-top) | bulky, padded, round toe box, flat cupsole | 3 cm | 15 cm | white #b8b8b4; grey #aaa6a0; black #161616; navy #2a4a7a* | t, y, a(2000s); M | 2000s, now | any | street, sport | 3 |
| runner | runner | long, low, toe spring, a heel flare, a mesh upper | 3.5 cm, heel thicker than toe by 1.5 | 7 cm | grey #8a8a86; black #1c1c20; off-white #b8b8b4; sand with blue sole #6a8098* | any | now | any | sport, street, uniform | 4 |
| canvasLow | sneakerLow, canvas | slim, rubber toe cap, thin white foxing line | 2 cm | 8 cm | off-white #b8b8b4; black #161616; olive #4a5a48; navy #2f3a58 | t, y; any | any | warm, cool | street | 3 |
| chunkySneaker | NEW: sneakerLow with a platform sole, 4 cm heel, wide round toe, layered panels | thick sole line | 4 cm | 8 cm | off-white #b8b8b4; grey #aaa6a0; black #161616; sage #8a9482 | t, y; any | now | any | street | 2 |
| workBoot | workBoot | square toe, stout heel 2.5 cm, lace to the top | 3.5 cm, lugged | 15 to 18 cm | brown #5b3a24; dark brown #3a2418; black #161616 | a, y; M | any | cool, cold | work | 3 |
| tanBoot | workBoot, tan | same, pale wheat leather, a padded collar, round toe | 4 cm | 17 cm | wheat #98804e; tan #7a5e36; dark tan #8a6a48 | t, y, a; M | 2000s, now | cool, cold | street, work | 3 |
| ankleBoot | workBoot, sleek | pointed or almond toe, block heel 3.5 cm, a side zip | 3 cm | 12 cm | black #161616; dark brown #2a1c18; oxblood #4a2a2a | y, a; W (and some M) | now | cool, cold | night, smart, street | 2 |
| loafer | loafer | slim, rounded toe, a leather strap vamp, heel 2.5 cm | 1.5 cm | 7 cm | brown #3a2418; oxblood #5b3a24; black #161616 | a, e; M | 1990s, now | any | smart, elder, work | 3 |
| dressShoe | dressShoe | slim, cap or plain toe, a heel 3 cm, shine on the toe | 1.2 cm | 7 cm | black #161616; dark brown #2a2220; oxblood #4a2a2a | a, e; M | 1990s | any | church, smart, uniform | 3 |
| flat | flat | round toe, low vamp, thin sole; a small bow or strap OK | 1 cm | 4 cm | nude #a89078; black #1c1c20; plum #5a2a34; navy #2f3442 | a, e, y; W | any | any | church, elder, work, smart | 4 |
| heel | heel (court shoe) | pointed or round toe, heel 4 to 5 cm, a low vamp | 1 cm sole + 4.5 heel | 8 cm at the instep | nude #a89078; black #1c1c20; navy #2f3442 | a; W | any | any | church, smart, night | 2 |
| slide | slide | flat open sole, a wide strap over the instep, a bare foot (socks sometimes) | 3 cm foam | 3 cm | black #1c1c20; grey #6c7078; off-white #b8b8b4; olive #3a4a30 | any age | now | warm | street | 4 |

Carry-over: sandal, flipFlop, rainBoot, tallBoot (kept, with the code's weather rules).

### 1.6 Accessories (12). Bags are existing `gear` kinds (backpack, bag, tote, messenger) plus new shapes; worn things are painted or small

| id | from | shape and size | fabric | colourways | who | decade | season | formality | wt |
|---|---|---|---|---|---|---|---|---|---|
| backpack | gear 'backpack' | 35 x 45 x 15 cm, rounded top, two straps, slung on one shoulder by teens | nylon, canvas | black #1c1c20; navy #2f3442; olive #34363e; grey #6c7078 | c, t, y; any | now | any | street, school | 4 |
| handbag | gear 'bag' | structured, 24 x 18 x 9 cm, carried on the forearm or shoulder, a clasp line | leather, a little shine | black #1c1c20; brown #3a2a22; tan #8a7048; wine #4a2a2a | a, e; W | any | any | church, smart, elder | 4 |
| tote | gear 'tote' | 38 x 40 cm, two handles hanging 20 cm | canvas, limp | natural #b0aca0; black #1c1c20; olive #8a7048; navy #2f3a58 | y, a, e; any | now | any | street, errand | 4 |
| crossbody | gear 'messenger' | 22 x 16 x 6 cm, a strap across the chest, a diagonal line over the torso | nylon or leather | black #1c1c20; brown #3a2a22; grey #2a2c32; tan #8a7048 | t, y, a; any | now | any | street, night | 4 |
| sling | NEW: a small pack 20 x 12 x 8 cm worn on the chest or hip, one strap diagonal | nylon | black #1c1c20; olive #3a4a30; grey #34363e | t, y; M | now | any | street | 3 |
| duffel | NEW: a barrel bag 55 x 28 cm carried in one hand or on the shoulder, two handles | canvas or nylon | black #1c1c20; navy #2f3442; olive #34363e | y, a; M | any | any | sport, work, street | 2 |
| groceryBag | NEW: a plastic or paper shopping bag, a bulb 30 cm tall, swinging at the knee, in one hand | thin plastic, translucent white or tan paper | off-white #b8b8b0; tan #a89a78 | a, e, any | any | any | street, elder | 3 |
| deliveryBag | NEW: a square insulated pack 35 x 35 x 30 cm on the back or a cube on a bike, plain, no marks | nylon | black #1c1c20; charcoal #2a2c32 | y, a; M | now | any | uniform, work | 2 |
| glasses | face.glasses (existing) | rectangular or round frame 1.5 cm band | metal or acetate | black #2a2a2a; tortoise #8a6a3a; gold-grey #6a5a3a | a, e; any | any | any | any | 3 |
| sunglasses | face.glasses, dark lens 4.5 cm | darker lens colour | acetate | black lens #121216 with a black frame | y, a; any | any | warm | street | 2 |
| headphones | NEW: on-ear (band over the head, 5 cm cups) OR wired earbuds with a thin cable; around the neck is an option | plastic | black #1c1c20; grey #6c7078; white #b8b8b4 | t, y; any | now | any | street | 3 |
| scarf | hat 'scarf' (neck) | wool, wound twice, 12 cm thick at the neck, tail to the chest | wool | charcoal #3a3f48; oatmeal #b0aca0; navy #2f3a58; rust #7a3028* | any | any | cold | street, elder, smart | 3 |

Paint-only extras that need no new geometry and can be switched on per outfit: belt (3.5 cm band at the waist, leather or webbing,
a small buckle square; important on jeans, chinos and suit trousers, see part 4), chain (thin line at the collar), gloves (hand
colour change: black or grey), lanyard (a thin line over the chest to a blank card at the hip), watch (a 3 cm dial on a strap),
earring (a small ring), a plain pin (a dot, never a text). An umbrella (NEW prop, a closed one carried or an open dome 100 cm wide)
is wanted only in rain.

---------------------------------------------------------------------------------------------------------------
## PART 2. THE MIX RULES (so random combinations are believable people, never clowns)

The existing code already has a weighted draw (look x season x age x sex) and three pair functions (`goes`, `layerOk`, `shoeOk`). These
rules are meant to replace the hand-typed lists in those functions with data: give every part the fields below, and let one
generic scorer multiply them. A score of 0 means never; 0.05 to 0.3 means "rare, allowed"; 1 neutral; 2 likely.

### 2.1 The formality rank, the one number that does most of the work

Give every part a rank F from 0 to 4: 0 sport and lounge, 1 casual street, 2 neat or work, 3 smart, 4 dress and church.

| Rank | Tops | Bottoms | Outer | Shoes |
|---|---|---|---|---|
| 0 | tank, bballJersey | trackPants, bballShorts | windbreaker, velourTrack | slide, runner |
| 1 | tee, tallTee, pocketTee, longTee, henley, ribTank, crewSweat, hoodie, zipHoodie, flannel, campShirt | sweatsCuffed, leggings, jeansStraight, jeansSlim, jeansBaggy, jeansWide, cargo, cargoShorts, chinoShorts | pufferShort, pufferLong, bomber, denimJacket, fleece | sneakerLow, sneakerDark, sneakerHigh, canvasLow, chunkySneaker, tanBoot |
| 2 | polo, knitPolo, sweater, turtleneck, bandShirt, dashiki, scrubs, uniformShirt, blouse (casual) | workTrousers, chinos, maxiSkirt | workJacket, cardigan, hiVisVest | workBoot, ankleBoot |
| 3 | shirt, dressShirt, blouse (smart) | suitTrousers, trousersWide, midiSkirt, pencil | blazer | loafer, flat |
| 4 | dressShirt with a tie, church blouse | suitTrousers (church cut) | overcoat | dressShoe, heel |

RULE F1. top and bottom must be within 1 rank of each other. Allowed 2-rank gaps, each at weight 0.3: hoodie or tee with chinos or
workTrousers (young adults, a common real mix); shirt with jeans (any age: very common, weight 1.5, the one exception that is
GOOD); sweater with jeans (1.5).
RULE F2. shoes within 1 rank of the bottom, and within 2 of the top. Exceptions: sneakerLow or sneakerDark with suitTrousers or
chinos (young adults only, `t`, `y`: weight 0.8; a modern office look; elders never); sneakerLow with a midiSkirt on a young or
adult woman commuter (0.5).
RULE F3. outer within 1 rank of the TOP, except these named pairs: blazer over tee or longTee or turtleneck with jeansSlim, chinos
or suitTrousers (night and creative looks, y and a, weight 1.2); overcoat over hoodie (young, 0.15, hood out over the collar); bomber
or denimJacket over shirt (1.5). Never: blazer or overcoat over bballJersey, tank, ribTank, hoodie with a drawstring pulled
forward, zipHoodie (weight 0.04, as the code does now).
RULE F4. in a WHOLE outfit (part 3) the ranks are fixed by the author; F1 to F3 apply to the random mix only.

### 2.2 Compatibility table: top family x bottom (score)

| top family \ bottom | jeans (all) | cargo | chinos, workTrousers | sweatsCuffed, trackPants | suitTrousers, trousersWide | shorts (all) | skirts (midi, maxi) | leggings |
|---|---|---|---|---|---|---|---|---|
| tank, ribTank | 1 (warm) | 1.2 (warm) | 0.3 | 1 | 0 | 2 | 0.5 | 1.5 (ribTank), 0.4 (tank) |
| bballJersey | 1 | 0.6 | 0.1 | 1.5 | 0 | 2 (bballShorts), 0.3 other | 0 | 0.1 |
| tee family (tee, tallTee, pocketTee, longTee, henley) | 2 | 2 | 1 | 1.5 | 0.15 | 2 | 0.5 | 1.5 (W) |
| hoodie, zipHoodie, crewSweat | 2 | 2 | 0.5 | 2 | 0 | 1 | 0.1 | 1.2 |
| flannel, campShirt | 1.5 | 1.5 | 1.5 | 0.2 | 0.3 | 1 (campShirt 1.5) | 0.6 | 0.3 |
| polo, knitPolo | 1.2 | 0.8 | 2 | 0.2 | 1.5 | 1.2 | 0.8 | 0.2 |
| sweater, turtleneck | 1.5 | 0.6 | 1.5 | 0.3 | 1.5 | 0 | 1.5 | 1 |
| shirt, bandShirt | 1.5 | 0.4 | 2 | 0.1 | 2 | 0.8 | 1.5 | 0.3 |
| dressShirt | 0.6 | 0.1 | 1.5 | 0 | 2.5 | 0.1 | 0.3 | 0 |
| blouse | 1 | 0.2 | 1.5 | 0.1 | 2 | 0.3 | 2 | 0.6 |
| dashiki | 1.2 | 0.5 | 1.5 | 0.2 | 1.5 | 0.4 | 1 | 0.4 |
| scrubs | one-piece set: its own `workDark` bottom only (as the code does) |||||||
| uniformShirt | 0.15 | 0.5 | 1.5 | 0 | 2.5 | 0.15 | 0 | 0 |

Plain extra rules. Shorts only with a short-sleeve or sleeveless top (never long-sleeve knit); a skirt only with a top that is not
a hoodie or a jersey (as the code does); pencil skirt needs a rank 3 top; leggings with a hem at HIP or longer, never with a
cropped top plus low-rise (a body fit matter, not a clothing one); a flannel is a top: it may NOT be worn open over another
flannel; a tie only with dressShirt under a closed blazer.

### 2.3 Shoes: what goes with what (multiply with F2)

| shoe | yes (x2) | rare (x0.2) | never (x0) |
|---|---|---|---|
| slide | shorts, sweatsCuffed, leggings, jeans (warm) | chinos, skirts | any outer layer of warmth 2, cold season, rain, suitTrousers, workTrousers |
| runner | trackPants, sweatsCuffed, leggings, shorts, jeans | chinos | suitTrousers, pencil, midiSkirt (as the code), blazer |
| sneakerLow, sneakerDark, canvasLow, chunkySneaker | jeans, cargo, chinos, sweats, shorts | suitTrousers (see F2) | heels, dress-skirt church looks |
| sneakerHigh | jeansBaggy, jeansWide, cargo, bballShorts, sweats | chinos | suitTrousers, skirts, cropped jeans (as the code) |
| workBoot | cargo, workTrousers, jeans, cargoShorts (worker, 0.3) | chinos | suitTrousers (0.05), skirts, church looks |
| tanBoot | jeans, cargo, sweatsCuffed, workTrousers | | shorts (warm), skirts, suitTrousers |
| ankleBoot | jeansSlim, leggings, midiSkirt, trousersWide, pencil | | shorts, trackPants, cargo |
| loafer, dressShoe | suitTrousers, chinos, midiSkirt (loafer) | | sweats, shorts, baggy jeans, tank, hoodie, jersey (0.1 as the code) |
| flat | skirts, suitTrousers, chinos, jeansStraight, leggings | | cargo (0.3), shorts-in-work |
| heel | pencil, midiSkirt, suitTrousers, wrap dress | | sweats, shorts, cargo; kids, teens, elders over 75 |

Bans in one line: no sandals or slides with a puffer, parka or overcoat (cold shoes only: boots, sneakers, workBoot, tanBoot); no
sandals, slides or heels in rain; no tall boots with shorts, cargo or sweats; no dress shoes with baggy jeans; no heels with sweats;
no work boot in a suit; no loafer or dress shoe on a child under 10 (kids: sneakerLow, canvasLow, slide, rainBoot, flat for a
girl's church look, dressShoe for a boy's church look at weight 0.3 only).

### 2.4 Headwear rules

- churchHat only with `church` or `smart` looks and women over 40 (fedora for men, flatCap for elders); never with a hoodie or
  crewSweat; never with durag or headwrap (one head covering only).
- hardhat only with `work` (hiVisVest, workJacket, workTrousers, cargo + workBoot); helmet only with deliveryBag, a runner, or a
  uniform outfit; neither with church, smart or night.
- cap, snapback, bucket: street, sport, teen, work, uniform (cap); not with blazer or overcoat (0.05), not with church.
- beanie only when cold or cool (warm 0.02), except the bonnet. durag and bonnet: street errand looks and home-hours (early morning),
  never with a suit, church or work look. headwrap: any season, with blouse, dress, maxiSkirt, kaftan, cardigan, or a plain tee.
- kufi with bandShirt, dashiki, shirt + trousers, loafer or sandal; not with a hoodie.
- hijab with long sleeves and a long hem (shirt + maxiSkirt or trousers, cardigan, long coat); never with a tank, shorts or a
  short skirt (that would be a different wearer, not an error; the rule is a believability guard); not with a hat.
- A hood from the garment (hoodie, parka, rainSlicker) replaces other head coverings (the code does: `HAT_STYLED`). A beanie over a
  down hood: no. hat + hood UP: no. Hood DOWN with a cap on top: no.
- sunglasses by day only (hour 7 to 19) and warm or mild; not with scarf in cold wet weather.

### 2.5 Layering: what goes over what, and what shows

| outer | over which tops | at the collar | at the hem | never over |
|---|---|---|---|---|
| blazer | dressShirt, shirt, blouse (smart); tee, longTee, turtleneck (night and creative) | shirt collar 2 cm above the lapel, tie knot | top hem is tucked; blouse hem may show 3 cm | bballJersey, tank, hoodie, crewSweat |
| overcoat | dressShirt, shirt, sweater, turtleneck, blouse | scarf or shirt collar, high neck | the jacket hem is longer than anything under it | tank, hoodie (rare), shorts |
| bomber | tee, longTee, henley, crewSweat, hoodie (hood out), shirt, turtleneck | tee rib collar or hood | tee hem shows 2 to 3 cm below the rib band | blouse in smart looks |
| denimJacket | tee, longTee, henley, flannel (no), hoodie (hood out), ribTank, shirt | tee collar | tee hem shows | flannel (bulk), blazer, denim-on-denim same wash (see 2.7) |
| pufferShort | tee, longTee, crewSweat, hoodie, sweater, polo | hood or high collar; a hoodie hood out | top hem shows 4 cm below the waist hem if the puffer is cropped | bballShorts or tank in cold; blouse in church looks |
| pufferLong | sweater, crewSweat, hoodie, tee, shirt | high collar or scarf | hem MID-THIGH to KNEE: nothing shows | shorts (0.1), slides |
| workJacket | tee, pocketTee, longTee, flannel (no), crewSweat, hoodie | contrast collar facing | tee hem 2 cm | blazer pairing, church looks |
| windbreaker | tee, tank, ribTank, longTee, crewSweat | high collar | rib hem | blazer |
| fleece | tee, longTee, scrubs, polo, shirt | stand collar | | blazer |
| cardigan | blouse, shirt, tee, polo, turtleneck | the collar of the top flat over the cardigan's V | top hem tucked | hoodie, jersey, tank |
| velourTrack | tee, tallTee, tank, polo | the zip to the chin: only the collar shows | rib band | blazer |
| hiVisVest | tee, pocketTee, longTee, hoodie, crewSweat, polo, flannel | | the top hem | blazer, church looks, smart |

Rule L1: warmth is additive. Each part has a warmth value (0 light, 1 mid, 2 heavy; the code's `w`): top 0 to 1, outer 1 to 2, bottom
0 to 1, hats and scarf +0.5. L2: the SUM, kept inside the season's band (see 2.9). L3: at most one outer layer (two only for a
cardigan under an overcoat or a hoodie under a bomber/puffer, where the hoodie is a "top"). L4: a layer's value is DIFFERENT from the
layer under it (see colour).

### 2.6 Age, sex and decade steering

Draw order for one person: age band (the population gives it), sex, look (from age and place), decade bias (below), season, then the
slots. Multiply each part's weight by the decade bias for the wearer's age:

| age band | now (2020s) | 2000s | 1990s | 1980s |
|---|---|---|---|---|
| child (c) | 1 | 0 | 0 | 0 |
| teen (t) | 1 | 0.1 | 0.05 | 0 |
| young adult (y) | 1 | 0.3 | 0.1 | 0 |
| adult (a) | 0.7 | 1 | 0.4 | 0 |
| elder (e) | 0.2 | 0.8 | 1 | 0.4 |

A part's decade field in part 1 gives it a set ("2000s, now" = both). Parts with decade `any` are never penalised. The effect:
an elder man draws velourTrack, cardigan, shirt + suitTrousers, flatCap, loafer; he rarely draws pufferShort, jeansWide, tank,
chunkySneaker, snapback, sling. A teen draws hoodie, jeansBaggy, jeansWide, sweatsCuffed, sneakerHigh, backpack, and no cardigan,
no fedora, no loafer (except church best). A woman over 60 gets midiSkirt, blouse, cardigan, flat, handbag, headwrap or churchHat;
jeansStraight at 0.6, sweatsCuffed at 0.3.

Children (c): allowed parts only: tee, longTee, crewSweat, hoodie, zipHoodie, polo, bballJersey, jeansStraight, jeansBaggy,
sweatsCuffed, leggings, bballShorts, cargoShorts, midiSkirt (church), pufferShort, windbreaker, fleece, cardigan, sneakerLow,
canvasLow, slide, rainBoot, flat (girl), cap, beanie, backpack, and one-piece sundress. No blazer or overcoat except `churchKid`.
Colour: kids may take one stronger muted colour on a top (not neon). Teens (t): all of `c` plus the youth cuts and from the adult
list: everything of rank 0 and 1 and the church and school rank 3 looks (schoolUniform, church best); no hardhat, no heel, no
suit except for church.

Sex weights are soft (the code's `sx` is a hard filter only for obviously gendered cuts: skirts, ribTank, blouse W, bballJersey M).
A person of `x` sex (the code's unspecified) gets a 0.3 factor on gendered parts. Women also draw cargo, jeansWide, tank, bomber,
sweatsCuffed, sneakerHigh at about 0.6 of the men's weight; men draw ribTank, blouse, skirts at 0.

### 2.7 Colour rules

1. ONE ACCENT. A person has at most one accent. An accent is any colour with saturation (HSV) above 0.45 that is not one of the
   neutral families: black, white, off-white, grey, navy, olive, brown, tan, denim blue, charcoal. Check by looking at the part
   tables: those marked `*` are accents. Pick the accent's carrier in this order of likelihood: hat or bag (35 percent), a shoe
   (20), a layer (20), the top (15), nothing (the rest: 30 percent of people carry none).
2. VALUE GAP. Top and bottom must differ in lightness by CIE L* of at least 18 (about 0.10 in albedo; the code's `distinct`
   measures RGB distance 60, which is about the same). Layer and the top under it: at least 12 L*. If a draw fails, re-draw the
   COLOUR of the less visible piece (the top under a layer, the lower hem), then fall back to black or off-white as `distinct` does.
   Exceptions with a tonal intent, where the gap may be 8 to 12 L* but the HUE must be one hue family: matching suit (jacket and
   trousers), scrubs (top and bottom match exactly), tracksuit sets, boilerSuit, uniform dark-on-dark, all-black night looks,
   a church coloured suit.
3. SHOES. Neutral (black, white, grey, brown, tan, navy) in 75 percent of draws; otherwise the shoes echo ONE other item (a sneaker
   colour taken from the bag, hat or top within 15 L* and the same hue) or are THE accent (then no other accent). Shoes darker than
   the hem by at least 12 L*, or lighter by 12 (white sneakers against a dark hem are the norm for the young).
4. MATCH SETS. Belt matches the shoes (leather) or the trousers (webbing). Bag and shoe within one family for church and office
   looks. Hat colour matches either the top or the jacket for beanies and caps (60 percent).
5. DENIM ON DENIM. Allowed only for the young and adult (y, a), for jeans + denimJacket where the jacket is lighter or darker than
   the jeans by at least 15 L* (mid jacket over black jeans: the usual; pale jacket over dark jeans), weight 0.25. Never the same
   wash, never denim shorts or skirt with the jacket except a young woman (0.1), never denim top (chambray shirt in this list: it
   is `shirt` in pale blue, which is fine with any jeans).
6. PATTERN. One pattern per person: flannel plaid, campShirt stripe, sundress print, kaftan print, dashiki panel, or a shirt's
   faint stripe. Never two. Solid colour everything else. No lettering anywhere.
7. WHITES. Nothing pure white: off-white 0.65 to 0.72 albedo (the albedo rule of DIRECTION.md); hi-vis is the only high-chroma
   item and counts as the accent.
8. WEAR. Dark at the hem, light at the elbow and shoulder: painter detail, see part 4.

### 2.8 Place and time of day

`DISTRICT_LOOKS` already biases the looks by district; keep. Add: before 9:30 and after 16:30 on a weekday, `work` and `service`
weights x1.5 (the 9-to-5 rhythm); on a Sunday before 14:00, `church` x8 in the church districts (the code's `sunday`); night
(after 21:00) `night` x3, `church` x0, `work` x0.3 except uniform and delivery; early morning (5:30 to 8:00) bonnet and durag x2.

### 2.9 Weather steering

Warmth budget (sum of the warmth values, hats and scarf +0.5, then the season's band):

| season (temperature, a guide) | allowed sum | hard rules |
|---|---|---|
| warm (above about 24 C) | 0 to 1.5 | no outer layer (0.05) except a vest, a thin cardigan at the office (0.3) or a windbreaker at 0.1; shorts, tank, ribTank, slide, sandal, sundress, bucket, strawHat all at x2 to x3; no beanie (0.02), no scarf, no pufferShort, no pufferLong, no overcoat |
| cool (about 8 to 24 C) | 1 to 3 | at most one outer layer of warmth 1 (denimJacket, bomber, windbreaker, fleece, cardigan, workJacket, blazer); shorts 0.2 (teens and young men 0.35); a puffer in the cool band 0.2 |
| cold (below about 8 C) | 3 to 5 | a warmth 2 outer (puffer, overcoat, parka) at 4 x; long sleeves; no shorts (0.03), no tank (0.02), no slide, no sandal (0), boots and high shoes up; beanie, scarf, gloves 3 x; a hat is likelier |
| rain | | slicker and a hood (the code: rainSlicker x7 in the wet), umbrella, rain boots, no slides, no sandal, no flat suede; church and smart hats down to 0.3; people with bags: tote kept under the arm |
| heat plus a storm (the code: `seasonForWeather`) | | demote to the cool band |

Hot-day detail: a person in a tank or a tee carries the cap or the bucket hat at x2 (sun) and sunglasses at x3 by day.

---------------------------------------------------------------------------------------------------------------
## PART 3. THE SIXTY OUTFITS

Format. T top, L layer, B bottom, S shoes, H headwear, G gear (a bag). Ids are from part 1; `-` = none. Each outfit has two or three
colourways (W1, W2, W3) written as `T hex, L hex, B hex, S hex, H hex, G hex`, only for the slots the outfit has. One accent at most
per colourway, marked `*`. `wt` = how common (1 to 5). "who" uses part 1's age bands and sex weights. Every outfit obeys part 2
except where a "tonal set" or a named exception is noted. Respect note for the cultural outfits: they are ordinary clothing worn by
ordinary people of any build and age on this street; build them plain and solid, not as costume; do not put them on every person of
a skin tone; the lead is asking the owner separately about the Hasidic community, and none appears here.

### 3.1 The seventeen that exist (keep their ids; colourways are as in `src/textures/painters/pedOutfits.ts`)

| id | parts (T / L / B / S / H / G) | who | wt |
|---|---|---|---|
| churchAuntie | blouse / blazer / midiSkirt / flat / churchHat / handbag | e, a; W | 3 |
| churchDeacon | dressShirt / blazer / suitTrousers / dressShoe / fedora / - | e, a; M | 3 |
| elderErrand | shirt / - / chinos / loafer / flatCap / - | e; M | 4 |
| elderHeadwrap | blouse / cardigan / maxiSkirt / flat / headwrap / tote | e; W | 3 |
| oldTimerTallTee | tee (to become tallTee) / - / jeansBaggy / sneakerHigh / cap / - | a, e; M | 3 |
| leather90s | shirt / bomber (leather) / suitTrousers / dressShoe / - / - | a, e; M | 3 |
| canvasWorker | pocketTee / workJacket / workTrousers / workBoot / beanie / - | a; M | 3 |
| hiVisCrew | tee / hiVisVest / cargo / workBoot / hardhat / - | a; M | 3 |
| clinicScrubs | scrubs / fleece / workDark / sneakerDark / - / handbag | a; any | 3 |
| transitUniform | dressShirt (uniformShirt) / - / suitTrousers / dressShoe / cap / handbag | a; any | 3 |
| winterTeen | crewSweat / pufferShort / sweatsCuffed / sneakerLow / beanie / backpack | t | 4 |
| creativeCoat | sweater / overcoat (peacoat) / jeansBaggy (jeansWide) / sneakerDark / - / tote | y | 2 |
| denimMidSeason | tee / denimJacket / jeansSlim / sneakerLow / beanie / crossbody | y | 4 |
| summerSlides | tee / - / chinoShorts / slide / bucket / - | y | 4 |
| schoolDay | hoodie / - / jeansStraight / sneakerLow / - / backpack | t | 4 |
| deliveryRider | tee / windbreaker / trackPants / runner / helmet / backpack (deliveryBag) | y, a; M | 3 |
| nightOut | tee / blazer / jeansSlim / ankleBoot / - / - | y, a | 3 |

Suggested light edits to these (for the WARDROBE seat to choose): swap oldTimerTallTee's top to `tallTee`; swap creativeCoat's
bottom to `jeansWide` or `trousersWide`; let deliveryRider's backpack be `deliveryBag` once it exists.

### 3.2 Forty-three new outfits

#### Older men and women (the 1990s and 2000s)

| id | parts (T / L / B / S / H / G) | colourways | who | wt |
|---|---|---|---|---|
| elderVelour | tee / velourTrack / trackPants (the same velour colour: a tonal set) / sneakerLow / flatCap or - / - | W1 T #b8b8b2, L #243a52, B #243a52, S #b8b8b4. W2 T #1c1c20, L #5a2a34*, B #5a2a34, S #b8b8b4. W3 T #b4b0a4, L #2d4a3a, B #2d4a3a, S #aaa6a0, H #3a3028 | e; M, some W | 3 |
| elderTrackWoman | tee / velourTrack / trackPants / sneakerLow / headwrap or - / tote | W1 T #b4aa94, L #3a3248, B #3a3248, S #b8b8b4, G #b0aca0. W2 T #b8b8b2, L #34483a, B #34483a, S #aaa6a0, H #8a6a2a*, G #8a7048. W3 T #1c1c20, L #6c7078, B #34363e, S #b8b8b4 | e; W | 3 |
| elderCardiganWalk | blouse / cardigan / pleated / flat / - (glasses) / groceryBag | W1 T #c8bfae, L #5a2a34, B #2f3442, S #1c1c20, G #b8b8b0. W2 T #b8b8b0, L #2f3a58, B #4a3a44, S #2a2220, G #a89a78. W3 T #b4aa94, L #a89e88, B #34483a, S #1c1c20 | e; W | 4 |
| elderOvercoat | sweater / overcoat / suitTrousers / loafer / flatCap / - (scarf) | W1 T #a89e88, L #2f3442, B #3a3e4a, S #161616, H #3a3028, scarf #b0aca0. W2 T #2f3a58, L #7a6a4c, B #4a4a52, S #2a2220, H #2f3442. W3 T #5a2a34*, L #1c1c20, B #2f3442, S #161616 | e; M | 3 |
| elderSummerPolo | polo / - / chinos / sneakerLow / bucket or cap / - | W1 T #b4b0a4, B #7a6a4a, S #b8b8b4, H #6a8098. W2 T #6a8098, B #c8bca0, S #aaa6a0, H #b4b0a4. W3 T #8a8a86, B #2f3a48, S #b8b8b4, H #4a5a48 | e, a; M | 3 |
| elderJeansBlouse | blouse / cardigan (open) / jeansStraight / sneakerLow / - / tote | W1 T #c8bfae, L #8a7048, B #34506f, S #b8b8b4, G #b0aca0. W2 T #a0aab4, L #3a4a40, B #232b3b, S #aaa6a0, G #2f3442. W3 T #b4a0a2, L #5a5a40, B #4d6c98, S #b8b8b4 | e; W | 3 |
| elderKufiTunic | bandShirt (long, hem KNEE) / - / chinos or suitTrousers / loafer or sandal / kufi / - | W1 T #b8b8b0, B #8a8478, S #3a2418, H #d8d4c8. W2 T #b0a48a, B #4a4a40, S #2a2220, H #1c1c20. W3 T #6a6a50, B #3a3f48, S #3a2418, H #c8bca0 | e, a; M | 2 |
| tallTeeTan | tallTee / - / jeansBaggy / tanBoot / durag or snapback / - (a thin chain, paint) | W1 T #b8b8b2, B #34506f, S #98804e, H #1c1c20. W2 T #1c1c20, B #4d6c98, S #7a5e36, H #6c7078. W3 T #8a8a86, B #232b3b, S #98804e, H #2f3a58 | a (2000s style), some y; M | 3 |

#### Workers

| id | parts | colourways | who | wt |
|---|---|---|---|---|
| kitchenWhites | T tee / L chefJacket (white, double-breasted) / B workDark (dark check) / S sneakerDark / H cap or beanie / - | W1 T #1c1c20, L #b8b8b2, B #34363e, S #161616, H #b8b8b2. W2 T #3a3f48, L #b4b0a4, B #2f3442, S #1c1c20, H #2f3442. | a, y; any | 2 |
| barberSmock | T tee / L barberSmock / B jeansSlim / S sneakerDark / H - / - | W1 T #b4b0a4, L #1c1c20, B #232b3b, S #161616. W2 T #9c9a94, L #3a3f48, B #151a22, S #2a2c32. W3 T #1c1c20, L #6c7078, B #34506f, S #b8b8b4 | y, a; M | 2 |
| mechanicCoveralls | one-piece boilerSuit (zip front, chest pockets, knee patches) / S workBoot / H cap / G - | W1 suit #2f3442, S #3a2418, H #1c1c20. W2 suit #5b4a30, S #161616, H #5a5348. W3 suit #4a4a40, S #3a2418, H #2f3442 | a; M | 2 |
| counterApron | T longTee or tee / L apron / B jeansStraight / S sneakerDark / H cap or - / - | W1 T #b4b0a4, L #6a5f48, B #34506f, S #161616. W2 T #3a3f48, L #8a8a86, B #232b3b, S #2a2c32, H #1c1c20. W3 T #7c8088, L #3a3f48, B #4d6c98, S #b8b8b4 | a, y; any | 3 |
| securityGuard | T uniformShirt / L windbreaker (plain, no panel) / B workDark / S workBoot (black) / H cap / G - | W1 T #98a8b8, L #1c1c20, B #1c1c20, S #161616, H #1c1c20. W2 T #b8b8b0, L #243a52, B #2f3442, S #161616, H #243a52. | a, y; M | 3 |
| housePainter | T pocketTee / - / B workTrousers (painter off-white: a tonal set with spatter) / S canvasLow / H cap / - | W1 T #8a8a86, B #b4b0a4, S #b8b8b4, H #b4b0a4. W2 T #b4b0a4, B #c8bca0, S #8a8a86, H #6c7078. | a; M | 2 |
| baristaApron | T tee / L apron / B jeansSlim / S sneakerDark / H beanie or - / G crossbody | W1 T #b4b0a4, L #3a3f48, B #232b3b, S #161616, H #2f3442, G #3a2a22. W2 T #1c1c20, L #6a5f48, B #151a22, S #b8b8b4, G #2a2c32. W3 T #a8a290, L #34363e, B #34506f, S #161616 | y; any | 3 |
| parksCrew | T tee / L fleece / B cargo / S workBoot / H cap / - | W1 T #9c9a94, L #3a4a40, B #4a4a40, S #3a2418, H #3a4a40. W2 T #3a3f48, L #46607a, B #2f3442, S #161616, H #1c1c20. | a; M | 2 |

#### Office and smart

| id | parts | colourways | who | wt |
|---|---|---|---|---|
| officeSuit | T dressShirt / L blazer / B suitTrousers (a matching suit: a tonal set) / S dressShoe / H - / G crossbody (dark) | W1 T #b8b8b0, L #2f3442, B #2f3442, S #161616, tie #5a2a34* (the accent). W2 T #a8b4be, L #3a3e4a, B #3a3e4a, S #2a2220. W3 T #b8b8b0, L #1c1c24, B #1c1c24, S #161616, tie #3a4a5a | a, y; M | 3 |
| officeShirtChinos | T shirt (cuffs turned once) / - / B chinos / S loafer or sneakerDark / H - / G crossbody | W1 T #a8b4be, B #a89a78, S #3a2418, G #3a2a22. W2 T #b8b8b0, B #2f3a48, S #161616, G #2a2c32. W3 T #98a4b0, B #4a4a40, S #2a2220, G #3a2a22 | a, y; any | 4 |
| officeBlouse | T blouse / L blazer / B suitTrousers or trousersSlim / S flat or heel / H - / G handbag | W1 T #c8bfae, L #3a3e4a, B #3a3e4a, S #1c1c20, G #2a2220. W2 T #a0aab4, L #2f3442, B #2f3442, S #2f3442, G #1c1c20. W3 T #b4a0a2, L #4a4a52, B #4a4a52, S #1c1c20, G #3a2a22 | a, y; W | 4 |
| officeWrapDress | one-piece wrapDress / L blazer or cardigan (optional) / S heel or flat / G handbag | W1 dress #2f3a58, L #b0aca0, S #1c1c20, G #1c1c20. W2 dress #5a2a34*, L #1c1c24, S #1c1c20, G #2a2220. W3 dress #34483a, L #3a3e4a, S #2a2220, G #3a2a22 | a, y; W | 3 |
| commuterOvercoat | T dressShirt or sweater / L overcoat / B suitTrousers / S dressShoe / H - / G handbag (and a scarf, accessories) | W1 T #b8b8b0, L #2f3442, B #3a3e4a, S #161616, G #1c1c20, scarf #b0aca0. W2 T #a89e88, L #7a6a4c, B #2f3442, S #2a2220, G #3a2a22, scarf #3a3f48. W3 T #98a4b0, L #1c1c20, B #1c1c24, S #161616, scarf #7a3028* | a, y; any | 3 |

#### Young adults, today

| id | parts | colourways | who | wt |
|---|---|---|---|---|
| pufferWide | T hoodie / L pufferShort / B jeansWide or cargo / S sneakerHigh or chunkySneaker / H beanie / G sling | W1 T #6c7078, L #1c1c20, B #4d6c98, S #b8b8b4, H #1c1c20, G #34363e. W2 T #1c1c20, L #3a4a30, B #1c1c20, S #aaa6a0, H #2f3442, G #1c1c20. W3 T #b0aca0, L #2f3a58, B #6c7078, S #b8b8b4, H #7a3028* | t, y; any | 4 |
| oversizedWide | T turtleneck / L overcoat (camel, oversized) / B trousersWide / S chunkySneaker / H - / G tote | W1 T #1c1c20, L #7a6a4c, B #3a3e4a, S #b8b8b4, G #b0aca0. W2 T #b0a894, L #2f3442, B #1c1c20, S #aaa6a0, G #8a7048. W3 T #3a3f48, L #5a5a40, B #a89e88, S #161616, G #1c1c20 | y; any | 2 |
| croppedJogger | T tee / L cropJacket (bomber or work cut, hem at the waist) / B sweatsCuffed / S sneakerLow / H cap / G crossbody | W1 T #b4b0a4, L #4a4a40, B #1c1c20, S #b8b8b4, H #1c1c20, G #2a2c32. W2 T #3a3f48, L #6a5f48, B #6c7078, S #aaa6a0, G #3a2a22. W3 T #b8b8b2, L #1c1c20, B #34363e, S #b8b8b4, H #7a3028* | y; any | 3 |
| athleisureW | T ribTank / L windbreaker / B leggings / S runner / H - / G sling | W1 T #b4b0a4, L #2f3a58, B #1c1c20, S #8a8a86, G #1c1c20. W2 T #1c1c20, L #6c7078, B #34363e, S #b8b8b4, G #34363e. W3 T #8a9482, L #1c1c20, B #1c1c20, S #aaa6a0 | y, a; W | 3 |
| summerTankShorts | T tank / - / B cargoShorts / S canvasLow or slide / H bucket / G - (headphones around the neck) | W1 T #b8b8b2, B #4a4a40, S #1c1c20, H #6a8098. W2 T #1c1c20, B #a89a78, S #b8b8b4, H #4a5a48. W3 T #9c9a94, B #2e3848, S #161616, H #bdb49c | t, y; M, some W | 4 |
| vintageSport | T tee / L windbreaker (colour-block, 2 muted tones, no logo) / B trackPants or jeansBaggy / S sneakerHigh / H bucket / G - | W1 T #b4b0a4, L #6a8098 over #aaa69a, B #1c1c20, S #b8b8b4, H #1c1c20. W2 T #1c1c20, L #3a4a30 over #8a8a86, B #34506f, S #aaa6a0, H #4a5a48. W3 T #8a8a86, L #2f3a58 over #b4b0a4, B #232b3b, S #b8b8b4, H #a8582a* | y; M, some W | 2 |
| flannelBoots | T flannel / - / B jeansStraight / S tanBoot / H beanie / G backpack | W1 T #7a3028*, B #232b3b, S #98804e, H #1c1c20, G #2f3442. W2 T #2f4a6a, B #34506f, S #7a5e36, H #2f3442, G #34363e. W3 T #34503a, B #151a22, S #98804e, H #3a3f48 | y; M | 3 |
| denimDouble | T tee / L denimJacket (pale) / B jeansStraight (dark, black or indigo) / S tanBoot or sneakerLow / H - / G crossbody | W1 T #1c1c20, L #667f9a, B #151a22, S #98804e, G #2a2c32. W2 T #b4b0a4, L #4d6c98, B #1f2a3a, S #161616. W3 T #b0aca0, L #232b3b, B #667f9a, S #b8b8b4, G #3a2a22 | y, a; any | 1 |

#### Teenagers and children

| id | parts | colourways | who | wt |
|---|---|---|---|---|
| schoolUniform | T polo / L cardigan / B chinos (M) or pleated (W) / S sneakerDark / H - / G backpack. No insignia anywhere | W1 T #b8b8b0, L #2f3a58, B #6c7078, S #161616, G #1c1c20. W2 T #98a8b8, L #34363e, B #2f3442, S #161616, G #2f3a58. | c, t; any | 3 |
| hoopsCourt | T bballJersey (no numbers) / - / B bballShorts / S sneakerHigh / H - / G backpack (a duffel for a y) | W1 T #14161a, B #14161a, S #b8b8b4. W2 T #2a3a5a, B #b4b4b4, S #161616. W3 T #b4b4b4, B #5a2030*, S #aaa6a0 | t, y; M | 3 |
| teenGirlWide | T tee / L bomber (nylon) / B jeansWide / S chunkySneaker / H - / G crossbody | W1 T #b4b0a4, L #3a4a30, B #667f9a, S #b8b8b4, G #1c1c20. W2 T #1c1c20, L #6c7078, B #4d6c98, S #aaa6a0, G #3a2a22. W3 T #b8b8b2, L #1c1c20, B #232b3b, S #b8b8b4 | t; W | 3 |
| kidPlayground | T tee / - / B sweatsCuffed or cargoShorts / S sneakerLow / H cap or - / G backpack | W1 T #6a8098, B #34363e, S #b8b8b4, H #1c1c20, G #2f3442. W2 T #9a8040*, B #232b3b, S #aaa6a0, G #1c1c20. W3 T #b4b0a4, B #4a4a40, S #b8b8b4, G #46607a | c; any | 4 |
| kidPuffer | T crewSweat / L pufferShort / B jeansStraight or leggings / S sneakerLow / H beanie / G backpack | W1 T #9c9a94, L #7a3028*, B #232b3b, S #aaa6a0, H #1c1c20, G #1c1c20. W2 T #3a3f48, L #2f3a58, B #1c1c20, S #b8b8b4, H #6c7078. W3 T #b4b0a4, L #3a4a30, B #34506f, S #b8b8b4, H #3a4a30 | c; any | 3 |
| churchKidBoy | T shirt / L cardigan or blazer / B suitTrousers / S dressShoe or sneakerDark / H - / G - | W1 T #b8b8b0, L #2f3442, B #2f3442, S #161616. W2 T #a8b4be, L #4a3a44, B #3a3e4a, S #2a2220. | c, t; M | 2 |
| churchKidGirl | one-piece shirtDress or sundress (long enough: hem KNEE) / L cardigan / S flat / H - / G handbag (small) | W1 dress #b4a0a2, L #2f3a58, S #1c1c20, G #3a2a22. W2 dress #a0aab4, L #5a2a34, S #2a2220. W3 dress #a8b0a0, L #3a3248, S #1c1c20, G #1c1c20 | c, t; W | 2 |

#### Sport and leisure, and the night

| id | parts | colourways | who | wt |
|---|---|---|---|---|
| runningKit | T tank or tee / - / B runShorts (existing) / S runner / H cap / G - (headphones) | W1 T #b8b8b2, B #14161a, S #8a8a86, H #1c1c20. W2 T #1c1c20, B #2a3a5a, S #b8b8b4, H #6c7078. W3 T #8a9482, B #1c1c20, S #aaa6a0, H #1c1c20 | y, a; any | 2 |
| yogaStudio | T ribTank / L fleece or cardigan (cool only) / B leggings / S slide or sneakerLow / H - / G tote (a rolled mat) | W1 T #b4b0a4, L #6c7078, B #1c1c20, S #1c1c20, G #8a7048. W2 T #1c1c20, L #3a4a40, B #34363e, S #b8b8b4, G #b0aca0. W3 T #8a9482, L #2f3a58, B #1c1c20, S #aaa6a0 | y, a; W | 2 |
| nightWrap | one-piece wrapDress / S heel or ankleBoot / G handbag or crossbody / H - | W1 dress #1c1c24, S #1c1c20, G #1c1c20. W2 dress #5a2a34*, S #161616, G #2a2220. W3 dress #34483a, S #1c1c20, G #3a2a22 | y, a; W | 2 |

#### Culturally specific dress worn on this street (ordinary clothing, plain and solid)

| id | parts | colourways | who | wt |
|---|---|---|---|---|
| boubouWoman | one-piece kaftan (wide cut, long, to MID-CALF or ANKLE, a solid colour with one plain panel of a second tone, no loud print) / H headwrap (the same family) / S flat or sandal / G handbag | W1 dress #34483a, H #8a6a2a*, S #2a2220, G #2a2220. W2 dress #2f3a58, H #b8b8b0, S #1c1c20, G #3a2a22. W3 dress #8a4a32, H #3a3248, S #5b3a24, G #1c1c20 | a, e (and y); W | 3 |
| dashikiSet | T dashiki (solid, plain collar band) / - / B chinos or suitTrousers / S loafer / H kufi or - / G - | W1 T #8a6a2a*, B #3a3f48, S #2a2220, H #1c1c20. W2 T #34503a, B #b0a48a, S #3a2418, H #d8d4c8. W3 T #2f3a58, B #4a4a40, S #161616 | y, a, e; M | 2 |
| hijabModest | T shirt (long, hem HIP) or blouse / L cardigan (long) or - / B maxiSkirt or suitTrousers / S flat or sneakerLow / H hijab / G tote or handbag | W1 T #b8b8b0, L #2f3a58, B #1c1c20, S #1c1c20, H #1c1c20, G #3a2a22. W2 T #a8b0a0, L #3a4a40, B #34483a, S #2a2220, H #b0a894, G #b0aca0. W3 T #c8bfae, L #1c1c20, B #3a3f48, S #b8b8b4, H #8a8a86 | t, y, a, e; W | 3 |
| bonnetErrand | T crewSweat or hoodie / - / B leggings or sweatsCuffed / S slide / H bonnet / G groceryBag. Early morning and short errands only (part 2.8) | W1 T #7c8088, B #1c1c20, S #1c1c20, H #5a2a34*, G #b8b8b0. W2 T #3a3f48, B #34363e, S #b8b8b4, H #1c1c20, G #a89a78. W3 T #b0aca0, B #2f3442, S #1c1c20, H #c8bfae | y, a; W | 2 |

### 3.3 Count and coverage

17 existing + 43 new = 60. By group, with the new ones: older (7 + 1 tallTeeTan), workers 8, office 5, young adults today 8, teen and
children 7, sport and night 3, cultural 4. By age band the sixty cover: children 5 (schoolUniform, kidPlayground, kidPuffer,
churchKidBoy, churchKidGirl), teens 8 with the shared ones, young adults 21, adults 22, elders 17. Plus the mix (parts) draws the
rest of the street, at about half the people (the code's whole-outfit share; the owner may wish to lift it).

---------------------------------------------------------------------------------------------------------------
(PART 4 FOLLOWS)
