# GTA IV and GTA V: a style and design study for the Bed-Stuy rework

Author: Ines Calloway (STUDY). Written 21 Nov 2026 for Fable Hart and the people, vehicle and textures lanes.
Sources and failures: `docs/reference/gta4-5-study-sources.md`. Replaces nothing; extends `docs/reference/gta5-style-notes.md`
(whose rendering claims I re-checked against the primary pages, see section 5).

## Read this first: what this document is and is not

This is STYLE AND DESIGN ANALYSIS ONLY. We copy no assets, textures, models, names, logos, fonts, sounds or animations
from Grand Theft Auto IV, Grand Theft Auto V or any other game. Nothing here was downloaded from a game, a rip or a mod.
Everything below describes and measures how those games work so that our own generated people, cars, textures and streets
can reach a similar level of polish with our own designs. Vehicle names in the games are never targets: where a source
names a real-to-fake pairing I have left it out. Quotes are one short line at most.

How to read the tags:
- READ = stated on a page I opened and read (URL in the sources file). Some pages were read through a page-extraction tool
  that summarises; those are tagged READ (extract) and are slightly less certain than READ (full text).
- SEVERAL = consistent across several sources I read or saw in search excerpts.
- INFER = my inference or standard practice; not a claim about what Rockstar did.
- EST = a number I could not source; an estimate to tune.
Confidence: H, M or L.

Tools and reach: the web was reachable through Firecrawl and the search tool. Some sites failed (see sources file). No
public GDC or SIGGRAPH talk by Rockstar staff turned up in my searches, and no published triangle budgets for GTA IV or V
people were found. Where evidence is thin I say so in the section.

---

## One-page summary: the twenty most useful rules for our lanes

Each is traceable to the section in brackets.

1. Silhouette first: a person or car must read from 30 m as a shape before any texture helps. [1, 3]
2. Build crowds from components, not whole bodies: head, upper, lower, hands, feet, accessory, each with texture variants,
   and pick them by district. GTA V's ped format has 12 slots with a drawable and a texture each. [1]
3. Aim for at least 12 heads x 20 uppers x 15 lowers x 8 shoe/hand/accessory options per gender per age band, with 4 to 6
   colourways each, and bias every district to its own subset so a block looks like a place. [1, 2]
4. Faces matter more than any other pixels: spend the skin and head budget first (GTA V adds a skin light pass to every
   ped for this reason). [1]
5. LOD must be invisible: three body levels plus a dithered cross-fade, never a pop. GTA V's own fade is a stipple. [1, 5]
6. Clothing is geometry first (collars, hems, cuffs, layer thickness of 6 to 15 mm), folds painted into the texture. [2]
7. Wear sells material: dark at hems and knees, sheen at elbows and seat, edge wear on shoes and bag corners. [2]
8. Signal job and tribe by cut and colour, never lettering: scrubs, hi-vis, aprons, uniforms, work boots, headwear. [2]
9. Brooklyn 2008 is baggy and layered: oversize tees, fitted caps, hoodies under jackets, puffy coats, boots. [2]
10. A class reads in silhouette: roofline, overhang, wheel size and stance differ per class. Keep 20+ classes. [3]
11. Parody means blend three or more real inspirations per car and alter proportions; never a one-to-one copy. [3]
12. Give every model three to four LOD levels with distance gates at about 15, 30, 60 and 120 m for cars. [3]
13. Heavy but controllable = high yaw inertia, soft but well-damped suspension, a traction floor close to the peak,
    brake bias to the front, steering that narrows with speed. [4]
14. IV is soft and rolls and needs planning; V is stiff, grippy and forgiving. Target the middle, closer to IV in feel. [4]
15. In 2D, fake load transfer from longitudinal and lateral acceleration and show it as body pitch and roll. [4]
16. Use a slip-angle grip curve: grip rises to a peak near 8 to 12 degrees and falls to a floor, so slides are recoverable. [4]
17. A street is modules plus props plus decals: repeat the module, never the combination; vary by lot. [5]
18. Hide repetition with dithered LOD, grime layers at the base and under sills, and unique hero lots every few blocks. [5]
19. Night is lit windows, sodium and cool white streetlamps, wet roads, and a bloom threshold on emissives only. [5]
20. Keep real places under invented names but keep massing, material and function; compress and edit, do not trace. [6]

---

## 1. Characters

### What the games do
- **Component system (V).** Modding documentation for GTA V's pedestrian format lists 12 component slots numbered 0 to 11:
  head, berd (beards, masks), hair, upper body, lower body, hands, feet, teeth, accessories, task (extra gear), decals,
  and an "alternative upper body" slot (names vary by ped). Each slot has a drawable number and a texture number. SEVERAL (search excerpts of the LCPDFR wiki, which
  returned a block when I tried to open it; plus mod changelogs), confidence M. The lesson is the structure: one body,
  many swappable parts, each with palette variants.
- **Face light.** GTA V adds a subsurface scattering pass applied to skin of both the player and NPCs, using a skin mask
  written in the G-buffer; the author notes people look at faces most. READ (full text, Courrèges part 1), H.
- **Crowd archetypes by district (IV).** The community wiki lists pedestrians with a "popcycle group" per ped, for example
  cops, prostitutes and pimps, Eastern European, generic, park. Groups spawn by neighbourhood (a retired Eastern European
  crowd near the docks, businessmen downtown, muggers in the poorer borough). READ (extract), M; the district examples are from
  a search excerpt only.
- **Body language.** IV's people run on NaturalMotion's Euphoria physics, so they react to shoves and falls with
  unscripted motion. READ (full text, Traxion), H for the claim, nothing sourced on idle behaviour.
- **Triangle budgets.** NOT FOUND in a reputable source. Lore only: PS2-era peds around 3 to 5 thousand triangles
  (forum, anecdotal, from ART-BAR); a mod setting for GTA V ped LOD distances of 25, 50 and 80 m (one mod, not Rockstar).
  A modding guide puts GTA V road cars at 60 to 120 thousand triangles at the top level (section 3). Confidence L for
  people.
- **Proportions.** No source for head heights or shoulder-to-hip ratios. The following are INFER, from realistic figure
  proportion and from what the art bar already says (realistic faces, never caricature).

### Why it works
Most of the perceived variety in a GTA crowd comes from the top 30 per cent of the body (head, hair, upper garment,
headwear) and from colour, not from body shape. Players read people in a glance at 5 to 20 m, then faces only when close.

### What it means for us (concrete)
- Proportions (INFER, tune by eye): adult 7 to 7.5 heads tall; head about 23 cm tall; shoulder width 2 to 2.3 heads for
  men, 1.8 to 2 for women; shoulder-to-hip 1.2 to 1.4 head heights. Vary stature 1.55 to 1.95 m and build in five
  steps (slight, average, athletic, heavy, very heavy) through the mesh morph, with at least 3 distinct belly and
  hip-width presets per gender. Children and elders as their own groups (children 5 to 6 heads).
- Component grid for each of male and female: heads 12+, hair 14+ (with colour tints), uppers 20+, lowers 15+, shoes
  8+, hats 10+, bags and accessories 10+. Each component 4 to 6 palette variants. With those numbers one gender has
  about 12 x 14 x 20 x 15 x 8 = 400 thousand distinct combinations before colour, which is plenty. Keep a per-district weight table so
  a block shows 4 to 6 repeating "families" of choices instead of a flat random mix.
- Silhouette variety: hat brims, hoods up, bags on one shoulder, long coats, shopping bags, strollers, a cane, a bike.
  Every 5th pedestrian should have a distinct silhouette addition.
- Budgets for the people lane (EST, ours): hero at 3 m 12 to 18 thousand triangles; crowd at 3 to 12 m 4 to 6 thousand;
  crowd at 12 to 40 m 1 to 1.5 thousand; beyond 40 m a 300 to 500 triangle impostor mesh. Face texture 512 square for
  heroes and 256 for crowd at high tier; half that on phone (existing rule).
- Faces at distance: keep a dark eye band, a strong nose-and-brow value, and lips one value step off skin; do not add
  detail below 16 pixels of face height.
- Hands: a closed hand at crowd range (mitten with separate thumb), five fingers only for heroes.
- Hair: separate cards or shells in 3 to 4 masses (cap, sides, back), plus styles that matter in Brooklyn 2008 (INFER): low
  cut, fade with line-up, waves, braids, cornrows, locs, afro, bun, ponytail, shaved, relaxed and shoulder length.
- Posture and idle: five idle sets per age band (stand with phone, lean on wall, arms folded, sitting on stoop, waiting at
  kerb). Elders slower with a forward lean; teens loose and wide-stepped.
- Age, build, neighbourhood show through wardrobe palette and wear, not through different faces only (section 2).

### Must not
- No clone rows: never place the same component set twice inside 25 m.
- No A-pose idles, no figure that stands with both feet identical and arms straight.
- Do not give a heavy build a thin-person mesh with a scaled belly. Do not copy any real face, any named character look,
  or any GTA character's outfit.

---

## 2. Clothing

### What the games do
- **Categories.** GTA IV's clothing, per the community wiki, comes in five groups: headwear, eyewear, tops, trousers,
  footwear; you cannot remove top, bottom or shoes. Three stores define the style positions: a cheap "street" shop in
  post-Soviet fashion, a casual and sporting shop, and an upscale suits-and-dress shop. READ (extract) and a search excerpt, H.
  GTA Online's clothing is split into Tops, Pants, Shoes, Hats, Accessories, Glasses, Masks and Outfits, with thousands of
  items. READ (extract), H. Players change layers: IV shows a jacket over a sweater or hooded sweatshirt, a coat over a
  dress shirt and tie. READ (extract), M.
- **Occupation by outfit.** IV outfits named by the wiki include sanitation (green jacket, knit sweater, light slacks,
  boots), hospital scrubs (green top, white long-sleeved undershirt, light blue slacks, white sneakers, stethoscope and
  name tag), a biker (black jacket, black dress shirt, grey jeans, black boots), a team letterman jacket over a white
  sweater, a balaclava, fingerless gloves and motorcross helmets. READ (extract), H.
- **Materials and shading.** In GTA V, skin gets a light-through-flesh pass; clothes do not. Every material writes specular
  intensity, glossiness and a fresnel value into a buffer. READ (full text, Courrèges part 1), H. So cloth difference is
  mostly specular and glossiness values plus normal map detail: matt wool, glossy leather, mid nylon.
- **Folds.** Not documented by any source I opened. INFER: fine folds are in the normal and diffuse textures; the
  silhouette-level folds (cuff stacks, hem lengths, collar thickness, jacket flare) are in the mesh.

### Why it works
A garment is read from three cues: its outline (hem, collar, sleeve length), its value pattern (light yoke, dark lower),
and its sheen. Detail below that is a bonus.

### What it means for us
- Layer geometry (INFER): each layer as its own shell 6 to 15 mm off the body, hem and cuff drawn as a real ring of 6 to
  10 segments, collars as a separate strip with a fold line, jacket hems that flare 2 to 4 cm, hoods as a bag shape.
- Material table (EST starting points, roughness / sheen): denim 0.8 with weave normal and fading at knees and thighs;
  leather 0.35 to 0.5 with creases at elbow and sheen on shoulders; nylon and puffer 0.5 with large soft panels and quilting
  lines; wool coat 0.9 with soft fuzz and a dark edge; cotton tee 0.9 with a slightly lighter shoulder; sneaker leather 0.4,
  rubber sole 0.9, white rubber cap.
- Wear and dirt: darken hem edge 8 to 15 per cent, scuff shoe toes, fade denim at thighs, stain sleeve ends for workers,
  add dust to boots. Apply per-person from a wear seed.
- Palette by district and class (INFER): brownstone and park-adjacent blocks: muted earth, navy, olive, cream; commercial
  strip: bright accent tees, athletic whites, colour caps; workers: hi-vis orange or yellow, navy, grey, brown; church
  crowd: dark suits, hats, bright dresses; nightlife: black with one accent. Keep 70 per cent of any outfit within a
  restrained palette and let 30 per cent be accent colour. No text, numbers or logos on clothes (owner rule); use stripes,
  colour blocking, piping and seams instead.
- Footwear range: 12 types minimum (below). Headwear 14 types minimum.

### Catalogue of garment types for a Brooklyn-like street
Source marks: [IV] named in the GTA IV clothing page I read; [V] in the GTA Online category list I read; everything else
is INFER from 2008-era street fashion in a Brooklyn setting and from GTA V era differences (more fitted cuts, more
athleisure, more branded-neutral basics, more varied hats). This list numbers 82 types and then adds about 15 bags, jewellery and gear items, so it is over 95 in all. Build from the types, not from any
game's named items.

Tops (18): 1 plain tee, short sleeve (oversize in the 2008 look, fitted in the V look); 2 long tee; 3 tank top or
vest; 4 polo shirt; 5 button-up dress shirt [IV]; 6 short-sleeve camp or work shirt; 7 flannel shirt; 8 henley;
9 turtleneck [IV]; 10 crewneck sweatshirt; 11 pullover hoodie; 12 zip hoodie; 13 knit sweater [IV]; 14 cardigan [V
mentions]; 15 jersey (sleeveless or short, no numbers or lettering); 16 blouse; 17 crop or fitted top for women;
18 scrubs top [IV].

Layers and outerwear (17): 19 track jacket [IV]; 20 golf or bomber-style jacket [IV]; 21 varsity or letterman-style jacket
[IV], colour blocked and without letters; 22 denim jacket; 23 leather jacket [IV]; 24 long leather coat [IV]; 25 wool
overcoat; 26 puffer jacket; 27 down parka with hood; 28 windbreaker; 29 rain slicker; 30 hi-vis vest; 31 work jacket (canvas);
32 trench coat; 33 blazer or suit jacket [IV, V]; 34 fleece pullover; 35 poncho or shawl.

Bottoms (12): 36 baggy jeans (2008); 37 straight jeans; 38 slim jeans (V era); 39 cargo pants [IV]; 40 chinos or slacks
[IV]; 41 track pants; 42 sweatpants; 43 jean or cargo shorts, knee length; 44 basketball shorts; 45 skirt (pencil, A-line,
long); 46 leggings; 47 work trousers and coveralls bottom.

One-pieces (6): 48 sundress or day dress; 49 business dress; 50 jumpsuit or coverall (mechanic, sanitation); 51 apron
over clothes (food worker); 52 robe or long church dress; 53 suit as matched set [IV].

Footwear (13): 54 high-top sneaker; 55 low sneaker or tennis shoe [IV]; 56 running shoe; 57 crepe-soled sneaker [IV];
58 work boot [IV: boots]; 59 timberland-style tan boot (shape only); 60 dress shoe; 61 loafer or moccasin [IV];
62 sandal or slide; 63 flip-flop; 64 heel (pump); 65 ankle boot; 66 rain boot.

Headwear (14): 67 fitted baseball cap, flat brim; 68 curved-brim cap; 69 beanie [IV mentions hats]; 70 bucket hat;
71 fedora or church hat; 72 flat cap; 73 hard hat; 74 hood up; 75 do-rag or durag; 76 headscarf or hijab, bandana;
77 head wrap, kufi or yarmulke; 78 knit watch cap; 79 sun hat; 80 helmet (bike, moto) [IV].

Accessories (10 more): 81 sunglasses and eyeglasses [IV]; 82 scarf; plus bags and gear to extend: backpack, messenger bag,
shopping bag, tote, fanny pack, gloves (including fingerless [IV]), watch, chain, hoop earrings, belt, face mask, stethoscope
and ID lanyard [IV scrubs], tool belt, headphones. (That brings the full list over 95 once bags and jewellery are counted.)

### Must not
- No letters, numbers, logos or readable prints on any garment (owner rule 4).
- Do not recreate named GTA outfits or the exact colourways of the three stores.
- No uniform that mimics a real agency badge or livery without invented marking.

---

## 3. Vehicles

### What the games do
- **Classes and counts.** The community wiki's GTA IV vehicle page lists, by heading: sports and supercars 10, muscle and
  vintage 13, four-door cars 31, two-door cars 7, SUVs pickups and vans 15, commercial and industrial 16, public service 8,
  government and emergency 13, motorcycles 23, boats 10, helicopters 7, miscellaneous 5, plus 7 cut entries. The same
  page for GTA V lists: boats 10, commercial 8, compacts 4, coupes 11, cycles 7, emergency 14, helicopters 8, industrial 9,
  military 4, motorcycles 14, muscle 11, off-road 14, planes 10, sedans 18, service 7, sports 16, sports classics 8,
  super 11, SUVs 15, utility 12, vans 16. READ (extract). The counts were tallied by the page-extraction tool; treat each
  as approximate (M), but the shape is clear: IV is dominated by ordinary four-door cars, V spreads across 20 classes.
  A reviewer puts GTA IV at "just under 120" cars and motorcycles, which matches the road-vehicle subtotal
  here. READ (full text, Traxion), M.
- **Parody practice.** The reviewer says IV cars are unlicensed but mostly recognisable replicas of real equivalents, and
  that behaviour matches the type (front-engined front-drive compact understeers, rear-engined sports behaves differently,
  heavy sedans roll). READ (full text, Traxion). The art director says generally that they "compress, edit, emphasise" rather than
  rebuild (section 6). For us the usable practice is: keep the class proportions and the function; change the grille,
  lights, glass shape, pillars and body lines so no single make is read; blend features of three or more cars.
- **Damage and deformation.** IV: panels dent, cars slow when damaged, bumpers weirdly stay on; V: more forgiving, mostly
  scratches, "simplified". READ (full text, Traxion), M. Note this is one reviewer's view.
- **Levels of detail.** A GTA V modding guide quotes defaults for original road cars: L0 60k to 120k triangles, L1 20k to
  30k at 15 m, L2 10k to 15k at 30 m, L3 5k to 10k at 60 or 70 m, L4 500 to 1,000 at 120 or 140 m. READ (extract), M (a
  modder's guide, not Rockstar documentation). A separate forum aside puts a stock V vehicle with "at most 85,000" triangles. Search excerpt only.
- **Lights and reflections.** Courrèges: headlights on wet roads are drawn as separate light volumes after the main pass;
  the car's own reflection comes from a low-resolution environment map (128 by 128 per face, about 30 draw calls per face)
  of the scenery only, with no cars or people in it. READ (full text), H. This is why cars look chrome-bright but
  never mirror other cars.
- **Interiors.** Not documented by sources I read. INFER: dash and seats are a separate low-triangle mesh visible only at
  under 15 m; at distance, the interior is a dark box behind tinted glass.

### Why it works
Classes are readable by roofline, wheel size, overhang and glass-to-body ratio, and the car is given life by a few
bright accents (lights, chrome, glass) on a mostly flat body colour.

### What it means for us
- Silhouette cues per class (INFER): compact (short overhangs, tall greenhouse, 14 to 15 inch wheels); sedan (three-box,
  long boot, mid-wheel); muscle (long bonnet, short deck, wide rear, fat tyres); sports (low roof, wide stance, big
  wheels); SUV (tall box, high ride); van (flat nose or tall box, big glass area at the cab); pickup (open bed);
  box truck (cab and cube); bus (long, tall, large windows, flat face); motorbike (rider on top).
- LODs for us: L0 at under 15 m 8k to 14k triangles, L1 3k to 5k at 15 to 35 m, L2 1k to 1.8k at 35 to 80 m, L3 a 150
  to 300 triangle blockout beyond. These are EST and sit well below the V figures because of our phone budget
  (existing rule: 300k triangles on phone).
- Wear and dirt: grime on lower body and wheel arches (EST darken 10 to 25 per cent), a few scrapes along door edges, rust
  on 20 per cent of older vehicles, faded roofs, mismatched replacement panels on taxis and vans.
- Damage in our setup: dent the panel by swapping to a second pre-dented mesh in stages (3 stages) and tilt the bumper;
  smoke and sparks are free. No blood and nobody dies (owner rule).
- Lights: separate emissive meshes for head, tail, brake, indicator, with lamp-sized sprites; headlights as one spotlight
  budget at night (existing capped lights).

### Roles a New York borough street needs (to design originally)
At least 40, grouped. Make each a distinct original design.
Private (12): 1 city compact hatchback; 2 small sedan, old; 3 mid-size family sedan; 4 large old sedan or "land
yacht"; 5 luxury sedan; 6 coupe; 7 muscle or restored classic; 8 sports car; 9 minivan; 10 SUV; 11 crossover; 12 pickup.
Commercial (10): 13 yellow-style taxi (own livery); 14 livery or black car; 15 delivery van; 16 cargo van with ladder rack;
17 box truck; 18 refrigerated truck; 19 flatbed or stake truck; 20 food truck; 21 ice-cream or mister-softee-style
truck (invented name); 22 tow truck.
Service (8): 23 garbage truck; 24 street sweeper; 25 utility company truck with cherry picker; 26 plumber or contractor van;
27 construction pickup with cones; 28 mail van; 29 cement mixer; 30 dump truck.
Emergency (6): 31 police cruiser; 32 unmarked police sedan; 33 police SUV; 34 ambulance; 35 fire engine; 36 fire chief
SUV or rescue truck.
Public transport (5): 37 city bus; 38 articulated bus; 39 school bus; 40 shuttle or dollar van; 41 trolley-style tourist
bus; also a subway or elevated train backdrop as set dressing, not drivable.
Oddities and small (9): 42 delivery scooter or moped; 43 motorcycle; 44 police motorcycle; 45 bicycle with crate; 46 e-scooter;
47 hand cart or pushcart vendor; 48 mobility scooter; 49 rare limousine; 50 hearse; 51 parade or wedding car; 52 ice truck;
53 moving truck; 54 car carrier; 55 abandoned wreck on blocks; 56 tuned imports with spoilers; 57 lowrider.
(57 roles; pick a first set of 24 and add the rest by lane.)

### Must not
- No real-to-fake lookalike copy of any single make or GTA's own cars; no real marque names, badges or plates.
- No licensed-looking livery (the NYPD or the MTA); use invented wording.

---

## 4. Handling

### How IV and V differ (reviewers)
- IV: heavy and strongly affected by weight transfer, pronounced body roll, understeer, soft suspension; braking in a
  straight line works better and "loading the suspension before a corner" beats flat-out entry; cars slow when damaged;
  police drive by the same rules. Too much body roll and not forgiving at the limit. READ (full text, Traxion), H.
- V: "tight, predictable and easy to master" (search excerpt), more grip, weight transfer and suspension travel muted,
  less fishtailing, direction changes feel immediate. READ (extract, The Drive), M (a 2026 preview article about a later
  game, so a retrospective view). Community view is split on which is better.
- Steering assistance: neither source describes it. INFER: both games reduce steering input at speed and in IV the
  weight of the car does the rest.

### Parameters and what they do
(GTA IV from the Grand Theft Wiki breakdown: READ extract, H. GTA V from a modding tutorial and a handling-tools guide:
READ extract, M.)
- Mass (kg): weight. Heavier cars accelerate and corner slower and are harder to stop.
- Drag multiplier: scales air drag with speed squared and sets top speed along with drive force. In V an example is 8.0;
  top speed arises where drive and drag balance (guide) and a V example shows 145 mph.
- Centre of mass offset (x, y, z, metres): position of the weight. Lower z and forward y reduce roll and weight transfer.
  Guidance: y between the axles, z just under engine height.
- Traction curve maximum: the peak grip (in g-ish units) before skidding. V tutorial: about 1.7 for most cars; a
  Phoenix example 2.15; a sports mod 3.92. IV wiki: sports cars have lower minimum and much higher maximum; offroaders
  relatively low maximum, high minimum.
- Traction curve minimum: grip while sliding. V examples: 1.5 for most cars (with max 1.7); Phoenix 1.75; sports mod 3.84.
  Ratio min over max in those examples: 0.88, 0.81, 0.98.
- Traction curve lateral: the slip angle at which tyres grip best (degrees in V; about 22 in the example; in IV
  "angle divided by 10" and about 0.9 realistic).
- Traction bias: front versus rear grip share (IV: 0.01 rear to 0.99 front). In V the term is a loss multiplier on
  rough ground (1.0 normal, 1.2 to 1.4 race cars).
- Drive bias: 0 rear, 1 front in IV (most real set-ups 0.5 or 0.6). In V a value 0 is rear-drive, 1 is front-drive.
- Drive force, gears, top speed: force is torque; gears modulate it (IV: sports cars 5 to 7, sedans usually 4, big rigs 10 or
  more; V guide describes ratios from about 3.33 down to 0.9). Top speed is a transmission limit (IV, km/h; V, mph in the
  tutorial's example).
- Brake force: how hard the brakes bite (V guide: scale from a quarter of the traction maximum for four wheels; example 0.8).
- Brake bias: front share, 0.6 to 0.7 in IV; 0.55 to 0.7 in V guidance; example 0.65.
- Steering lock: how far the wheels can turn. IV wiki: most vehicles about 0.5; 0.9 becomes unstable. The page lists the
  unit as degrees, which I cannot verify, so treat as a ratio.
- Suspension force: spring stiffness (V: 3.0 for sedans or muscle in the tutorial; Phoenix stock 1.7). Suspension bias
  front versus rear (best near 0.5 in IV).
- Damping: compression and rebound. IV wiki: stiff compression makes the car nimble but jolting; soft compression absorbs
  bumps but rolls. Stiff rebound keeps it stable in corners but reacts slowly on rough roads. V tutorial: about 1.3 each; over
  3.0 overpowers compression.
- Suspension raise and limits: ride height and travel upward and downward (metres, lower limit negative).
- Anti-roll force: resists body roll (V Phoenix example 0.8).
- Inertia multiplier (V): scales yaw and pitch inertia; the guide names it as the lever for "heavier or nimbler".
- Deformation, collision, engine damage multipliers (IV): how much the model dents or loses power.

### Typical ranges by class
Documented class ranges are thin: I found no page with a table. What exists is above (drive bias, gears, brake bias, grip
max and min patterns, suspension 3.0 for sedan or muscle). EST for masses, from ordinary real-world vehicles, to be tuned:
compact 1,100 to 1,300 kg; sedan 1,500 to 1,900; muscle 1,600 to 1,900; sports 1,300 to 1,600; SUV 2,000 to 2,500; van
2,200 to 3,000; truck (box) 6,000 to 10,000; bus 10,000 to 13,000. Top speeds EST in our units: compact 150 km/h, sedan
170, muscle 200, sports 240, SUV 170, van 140, truck 100, bus 90.

### What makes a car heavy but controllable (SEVERAL, M, plus INFER)
Mass and yaw inertia up; centre of mass low; softer springs with firm rebound; anti-roll to keep the car from tipping;
brake bias front; traction min close to max (the floor stays high so a slide is recoverable); steering narrower at speed;
the engine and gearing slow to build torque (IV: higher drive inertia for big trucks). A reviewer says IV rewards early
planning, i.e. the car responds slowly and predictably.

### Camera while driving
No source covered stock camera values. INFER: follow camera trails the car heading, lifts and pulls back with speed
(about 1 to 1.5 m back and 5 degrees wider field of view at top speed), looks slightly into the turn, and returns behind
in a second or two when the player stops steering. Existing owner ask: the camera returns behind you two seconds after a
look.

### Approaching it in our flat 2D grip model (INFER, all EST numbers to tune)
- Yaw inertia: set I_z = k * m * (a*b) with a and b the CG-to-axle distances, k 1.1 for light cars, 1.4 to 1.7 for
  heavy ones; this is the main "weight" feeling.
- Slip-angle grip curve per axle: lateral force = N * mu(alpha) where mu rises linearly to a peak at about 8 to 12 degrees,
  then falls toward the floor mu_min = 0.8 to 0.9 times the peak for road cars and 0.7 for sports cars; offroad vehicles use
  a low peak and high floor. A little rear-slip hysteresis (hold the slide for 0.2 s) gives the recoverable power-slide.
- Load transfer faked from acceleration: front axle load N_f = (m g b - m a_long h)/L, rear N_r the remainder;
  lateral transfer adds a roll term that scales the outside grip. Use h about 0.5 m cars, 0.9 m SUV or van, 1.2 m bus or
  truck. Braking therefore adds front grip and removes rear grip; throttle in a rear-drive car loses front grip.
- Body roll and pitch as visuals only: roll angle = clamp(a_lat * rollGain, +-6 degrees) low-pass filtered with damping
  about 0.7; pitch = clamp(a_long * pitchGain, +-3 degrees). Apply to the body mesh over the wheels. Bigger angles for
  SUVs, vans and heavy sedans (IV feel); smaller for sports cars (V feel).
- Steering: rate limited, steering lock reduced with speed (for example full lock under 30 km/h, 35 per cent at 120 km/h).
- Brake bias front 0.6 to 0.7; handbrake releases rear grip by a multiplier 0.4 for 0.3 s.
- Camera: speed pull-back and look-ahead into the turn.

### Must not
- Do not copy GTA's handling files or numbers as data; the ranges above are for orientation. Do not make cars floaty:
  weight is in inertia, not in slow acceleration. Do not give every class the same grip curve.

---

## 5. World surfaces and geometry

### What the games do (V rendering, READ full text from Courrèges parts 1 to 3, H)
- Deferred pipeline; one frame in the study had 4,155 draw calls, 1,113 textures and 88 render targets. The G-buffer
  holds diffuse, normal, a specular map (intensity, glossiness, fresnel), an irradiance map (sun irradiance, second
  light and an emissive channel for neon and bulbs), plus depth and a stencil that marks object class.
- Shadows: four cascaded shadow maps packed into a 1024 by 4096 texture; cloud shadows in a second channel; sampled
  with dither then blurred.
- Ambient occlusion at half resolution, noisy then blurred. Water: planar reflection at 240 by 120. Reflection cubemap from
  low-poly scenery only.
- Distance: a low-poly model of a whole hillside district is drawn in one call (about 2,500 triangles), a block-sized
  district in a single call; fog hides the lack of detail in the low-poly distant buildings. Courrèges says fog "conveniently hides" this.
- LOD fade: opaque meshes dither (alpha stipple) while swapping LOD and a post-pass smooths the checkerboard. Details
  such as grass vanish beyond a cutoff.
- Tone mapping: not Reinhard but an Uncharted 2 style filmic curve, with an average-luminance exposure that adapts slowly
  and faster from dark to bright than bright to dark. Bloom is a bright-pass at a threshold, downsampled to 1/16. A lens
  distortion with slight chromatic aberration at frame edges; sun flare: about 70 sprites plus 12 streak quads; depth of
  field from a circle of confusion map. The "wasted" screen blurs, greys, vignettes and adds grain.
- Correction to `gta5-style-notes.md`: its guess of "Reinhard" is the author's own preview tone map; the game uses a
  filmic curve. Its 128-pixel cube map and four cascades claims are confirmed. Its colour-grade LUT claim remains unconfirmed.
- World building: the art director says the world is built from a "blocked in" map made by six to eight people over nine
  months to a year, treated "like a sculpture" so perspectives down streets look right, then built up block by block from
  detailed guides and location photographs, with city neighbourhood tone changing within a few blocks. Tone changes
  quickly across blocks where real life takes ten miles. READ (full text, MCV), H. Quote budget: one line.
- Handcrafted and unique, per search excerpts of interviews (not fully opened): "all hand-crafted", layered detail, a
  hundred days of research and thousands of photographs (a New Yorker report). M.
- Texel density, grime decals, façade modules and signage density: NO primary source found. All numbers below are INFER or EST.

### Why it works
Rockstar spends detail where the eye goes (street level, faces, car bodies), compresses the rest, hides LOD changes with
dither and fog, and lets the lighting and grade do the mood. Compression of tone across a few blocks makes places feel
distinct.

### What it means for us
- Texel density (EST): street-level façades 256 to 512 texels per metre on high, 128 on low; ground 128 per metre;
  props 256 per metre; hero faces 1,000 per metre. Phone halves it (existing rule).
- Façade modules: 6 bay types x 4 storey heights x 5 material families (brick, brownstone, stucco, clapboard, painted
  brick); each with 3 trim sets (cornice, stoop, window surround). Randomise by lot, not by tile, and use a shared sheet to
  cut draw calls (existing plan).
- Props per 50 m block side (EST, existing note): 4 to 6 bins, a pole per 25 m, 2 wire spans, a hydrant, a bench or
  newspaper box, 1 dumpster per alley, 3 to 5 ground decals at the kerb, a tree every 12 m on residential blocks.
- Signage density by street type (EST): residential 1 small sign per 30 m; commercial strip 1 sign per 6 to 8 m, hanging
  blade signs plus awnings and a lightbox; with invented wording only.
- Hide repetition: vary tint per lot, vary wear seed, vary window states (curtains, blinds, lit and unlit), add one
  unique landmark per block, mix building heights, use dithered LOD and distance fog; 10 to 15 per cent colour variance in
  brick.
- Grime: darken 0 to 60 cm above the ground and under sills, vertical streaks beneath windows and pipes, stains where
  signs and AC units hang.
- Night: lit windows on 35 to 55 per cent at 9 pm falling to 10 per cent at 3 am; sodium lamps on older blocks and cool white
  on newer; emissive-only bloom; wet roads with sky reflection; puddle masks.
- Colour grade and fog: grade by time of day (shadows teal, highlights warm in the evening); exposure adapts slowly,
  faster to brightness than to darkness (V behaviour, READ); fog colour matches the sky at the horizon.
- Distance: low-poly block masses at 150 to 400 m (a few hundred triangles per block), dithered swap from detailed LOD,
  fog to hide the join, instanced props that disappear beyond 80 m.

### Must not
- No tiled-looking ground; no building with the same façade next door; no readable real-world signage or brand; no extraction
  or screenshots of Liberty City or Los Santos as references in the repo.

---

## 6. Places

### What the games do
- IV maps New York's boroughs onto invented ones: Brooklyn becomes Broker, Queens becomes Dukes, Manhattan becomes
  Algonquin, the Bronx Bohan, New Jersey Alderney; Staten Island is absent. SEVERAL (search excerpts, not opened pages), M.
- Rockstar's VP of creative has said the city is "an approximation", not the full city, and the art director says they
  "compress, edit, emphasise" and take the feel of a city "through media" rather than rebuilding it, so the result can
  feel more like the popular perception of the place. READ (full text, GamingBolt quoting Edge), H.
- A research team in New York scouts, and each city block gets a detailed guide before photographs are taken. READ (full text, MCV), H.

### What it means for us (general principles)
- Keep: massing, street grid and widths, building heights, material family, ground-floor function (laundromat, bodega,
  barbershop, church, school), the position of landmarks relative to corners, parks and transit.
- Change: names, lettering, logos, liveries, exact façade ornament, signature colours, and anything that makes a place
  trivially identifiable as a brand. Give each real landmark an invented name that fits its role (for example a
  made-up "Bridge Street Savings" for a bank), and check the invented name is not a real business.
- Compress: shorten a long block so each corner carries a different note; merge two small parks into one; move a
  landmark one block if it improves the sight line.
- Emphasise: the stoops, the brownstone cornices, the corner stores, the street trees and the church spires.
- Use only open data and our own photos (owner rule); no Google imagery. Do not trace GTA's Broker or Dukes.

### Must not
- No real brand or business names, real addresses on signs, real people, or GTA's Liberty City place names.

---

## 7. Where the evidence is thin
- People triangle and texture budgets: not found. Heads, uppers and lowers counts for V: a structure but not counts.
- Body proportions and idle behaviour: nothing sourced.
- Clothing folds and materials: only the specular, gloss and skin-pass structure is sourced.
- Per-class handling ranges: only fragments sourced; masses and speeds are estimates.
- Façade modules, texel density, signage density, grime rules: no primary source; all EST.
- Driving camera: no source.
- No GDC or SIGGRAPH Rockstar talk was found; Courrèges (a third-party reverse-engineering study of the PC version) is the
  strongest technical source, and the Grand Theft Wiki handling breakdown the strongest handling source.
