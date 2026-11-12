# ART-BAR v2: "Rockstar polish" (Tomas Inkwell, ARTDIR, 11 Nov, Stage 15)

> **Owner ruling, 11 Nov (after seeing the first ink tests): "i dont want the inked look i just want better polygons for the
> characters".** The inked, posterised panel pipeline in section (a) is retired. Title and loading art are clean, polished
> in-engine shots of our own world: composed with the free camera, gently graded, soft vignette, thin letterbox, nothing
> filtered into a drawing. Characters are the top art priority: better geometry on heads, shoulders and hands. Where this
> note and a section below disagree, this note wins. (Fable Hart)


Replaces v1 (comic / Borderlands idiom). The owner: "Not loving the cartoon design I want more polished as per GTA and
rockstar", "shoulders are weird", "more variation in body types", "title screen slicker like a gta drawing", "HUD needs some
live", "fonts more readable and slick", "less but more conservative polygons ... look at gta 3 and 4".
Every lane checks its frames against this page before posting FINAL. A worker should be able to hold a screenshot next to
each section and answer yes or no.

## Hard limits (never bend)
- GTA III / IV / V are a STYLE reference only. No Rockstar or other game assets, logos, fonts, HUD sprites, traced or copied
  artwork, no screenshots or their pixels anywhere in the repo or in a render pipeline.
- No Pricedown, no Chalet, no font that is not open licence (SIL OFL 1.1 or similar, verified at its source). See (b).
- Store, brand, venue and vehicle names stay our own parodies. No "Wasted"/"Busted" lettering in a lookalike face.
- Reference images may be looked at by a person; they are never put in the repo, a prompt-to-image tool, or a filter input.

## What the research says (and how sure we are)
Web research, 11 Nov, search-level only (fandom, gtabase, gta.wiki and fontsinuse were not reachable from our network,
so most HUD facts below are from playing the games, labelled "observed"). Use as direction, not as specs to copy.
- Key art (Stephen Bliss and team, covers and loading screens 2001 to 2016, per gta.wiki and gameranx summaries): realistic
  figure drawing, firm black contour that varies in weight, hard-edged cast shadows in two or three values, flat but grounded
  (not neon) colour, one figure or a small group in a confident pose, often a low camera, often a cropped grid of panels.
  Observed: faces are drawn realistically, never caricatured; hands, weapons, cars and clothes folds carry the drawing.
- Loading screens: IV used character art with a slow move (observed); V shows large illustrated panels that pan and
  crossfade slowly (observed). Fan remakes exist, which tells us the look can be rebuilt from a 3D render plus a shader.
- HUD, V (observed, GTA V features guide on gtabase summarised via search): radar bottom-left, health / armour / special bars
  directly under it; cash top-right in white, a spend shows below it in red and fades; wanted stars top-right and only while
  wanted, flashing while the police search; area name and vehicle name bottom-right, fading in on change and out after a
  few seconds; radio station name top-centre on change; "mission passed" a large centred banner over a dark band with a
  sting. GTA V's UI faces are reported as Chalet 1960 / Chalet Comprime (fontsinuse via search) and Pricedown for big
  banners; we use neither.
- HUD, III and IV (observed): III puts clock, cash, health and stars in a stacked top-right block; IV puts a round radar
  bottom-left with health and armour as arcs on the ring, cash top-right, and fades almost everything when nothing changes.
- Polygon budgets: I found NO published, verifiable triangle counts for GTA III or IV peds or cars. What exists is lore:
  forum talk puts PS2-era characters at roughly 3,000 to 5,000 triangles at the top end (Reddit r/blender thread, anecdotal),
  GTA III PC peds had LOD variants (TCRF), GTA IV cars had about 3 LODs (Polycount post), modern GTA V car mods quote
  30 to 40 k tris for L1 (modding-forum.com guide). Our budgets below are OUR decisions, informed by that, not copied numbers.
- The habit that matters from III/IV: few polygons, each one placed where the silhouette bends (shoulder, elbow, knee,
  jaw, wheel arch, roof line), smooth shading across the rest, and the detail painted into the texture.

## Global rules (all areas)
1. Judge at the distance the player sees it: people at 3 m and 12 m, cars at 6 m front three-quarter and 8 m side,
   UI at 1280x720 and 390x844 portrait and 844x390 landscape.
2. Silhouette, then value grouping (light / mid / dark), then colour, then detail. A detail never fixes a silhouette.
3. Polish means: clean edges, consistent light, no jaggies, nothing floating, nothing flickering. One visible seam,
   sliver, spike or z-fight at a judged distance is a defect.
4. Palette: grounded, slightly desaturated city colour (brick red, brownstone umber, asphalt blue-black, sodium orange,
   sky teal). Saturated colour is an accent (a car, a sign, a jacket), never a whole frame.
5. Every FINAL ships before/after frames at the judged distances, same camera, same time of day, plus one street frame.

## (a) Title and loading shots (Priya, SHOTS) — rewritten 12 Nov after the owner rejected the inked look
Clean, polished in-engine shots of our own world. No ink pass, no posterising, no paper grain, no halftone, nothing filtered
into a drawing. Composed with the free camera, rendered at the highest tier, then only: a gentle grade (lift shadows a touch,
warm highlights, saturation -5 to -10 %), a soft vignette (corners 15 to 25 % darker), an optional thin letterbox
(about 8 % of height top and bottom). No outside imagery, no traced references.
A passing shot:
- A subject: one or two people, a car, or a person with a car, at 40 to 70 % of frame height, eye-level or low camera,
  a clear pose (leaning on a car, mid-stride, looking back). A building is a background, not the subject.
- Golden hour, dusk or night with lit windows and street lamps: a key light from one side and a separate rim light on the
  subject. No flat noon light, no grey sky.
- Faces: three-quarter, profile, under a brim or in shadow, until the people lanes pass (d2) at 3 m. Never a frontal close-up.
- Nothing in frame that fails another section: no seams, no z-fighting, no floating props, no camera inside a mesh,
  no visibly tiled ground.
- Depth: the background a little softer or hazier than the subject (fog or a light depth of field), never a blur filter.
- Loading: 3 to 5 shots, slow push 3 to 5 % over 6 to 8 s, crossfade 0.6 s, every 7 to 8 s. Title: one shot, the wordmark
  in Anton (our own lettering, no GTA logo box), a thin menu on a scrim, never on a face.
Fails: any drawing filter, a shot where the subject is a mannequin in A-pose, empty streets at noon, text on the art.

## (b) Type system (Zadie owns the tokens, everyone uses them)
Two families, both SIL OFL 1.1, verified 11 Nov from the OFL.txt in github.com/google/fonts (ofl/anton, ofl/barlowcondensed,
ofl/barlowsemicondensed, ofl/barlow); neither declares a Reserved Font Name.
- Display: **Anton** (one weight). Title wordmark, MISSION PASSED / FAILED, WASTED-type state banners (our own words),
  loading-screen headline. Uppercase, tracking +2 to +4 %.
- UI: **Barlow Condensed** (500, 600, 700, plus 600 italic) for every HUD number and label; **Barlow Semi Condensed** (500)
  for subtitles, tips, menu rows and the map. Use tabular figures for cash and timers (`font-variant-numeric:
  tabular-nums`; if the build lacks tnum, set each digit in a fixed-width span).
- Hosted web build and Electron apps: self-host woff2 subsets (Latin + $, digits, punctuation) in public/fonts, all font
  files together under 120 kB, OFL.txt beside them, both fonts named in the credits.
- Single-file build: do NOT inline the fonts (it is at 11.96 of 12 MB). It loads Anton and Barlow Condensed through a Google
  Fonts stylesheet link, with a fallback stack that still reads condensed and bold offline: "Anton", "Arial Narrow Bold",
  Impact, sans-serif for display; "Barlow Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif for UI.
  Layout must not break if the link fails (no text that only fits in the condensed face).
- Remove Impact / Roboto Condensed / system stacks as the primary face everywhere else.
Sizes at 1280x720 (scale with the shorter viewport side, clamp so phone portrait never goes below the minimum):
| Role | Face | Size | Min on phone |
|---|---|---|---|
| Mission banner | Anton | 64 to 72 px | 40 px |
| Title wordmark | Anton | 96 to 120 px | 56 px |
| Cash | Barlow Cond 700 | 30 px | 22 px |
| Area name | Barlow Cond 600 italic | 30 px | 20 px |
| Vehicle name / street | Barlow Cond 600 | 20 to 22 px | 15 px |
| Radio station | Barlow Cond 700 | 24 px | 18 px |
| Subtitles | Barlow Semi Cond 500 | 22 px | 16 px |
| Help / tips | Barlow Semi Cond 500 | 16 px | 14 px |
Readability over a bright 3D scene:
- HUD text: white #f4f1ea (cash green #6fbf5a, spend red #d9534f, banner gold #e8b53a as accents only) with a 1.5 to 2 px
  near-black outline (`-webkit-text-stroke` or paint-order stroke) AND a soft drop shadow 0 2px 3px rgba(0,0,0,.6).
  Outline + shadow are allowed on HUD text only, because it floats over a moving world.
- Subtitles and tips: no outline; a dark scrim rgba(10,10,12,.55) behind the line, 6 px radius, 4.5:1 contrast.
- Menus and map: no outline; text on solid or scrimmed panels.
- Never more than two weights in one element. No letter-spaced lowercase. No text in textures at a size it cannot be read.

## (c) HUD (Zadie)
Layout, safe area 4 % of the short side inset plus `env(safe-area-inset-*)` on phones:
- Bottom-left: radar (rounded square, 18 % of the short side, min 120 px), with health (green) and armour (blue) as two thin
  bars directly under it, 4 px high, the radar's width. Nothing else bottom-left.
- Top-right: cash, wanted stars under it, weapon or ammo under that only when armed. Stars appear only while wanted.
- Bottom-right: area name, then street name / vehicle name under it, on change only.
- Top-centre: radio station name on change; mission objective text and subtitles bottom-centre above the bottom safe line.
- On phone portrait the touch controls own the bottom third: radar moves to top-left, area name moves to top-centre under the
  radio slot. Nothing overlaps anything, nothing is cut, at 390x844 and 844x390.
What animates (and nothing else does):
- Cash: counts up or down over 0.6 to 1.2 s with tabular digits; a "+$120" / "-$40" delta line under it in green or red
  fades after 2 s.
- Stars: pop in with a 120 ms scale 1.3 -> 1 per star; while police search, stars blink at 2 Hz (on 250 ms, off 250 ms);
  when lost, they fade over 1 s.
- Area name: fades + slides 8 px in over 300 ms when the player enters a new neighbourhood area, holds 3 s, fades out 600 ms.
  Same rule for vehicle name on entering a car (lower, smaller, after the area name if both fire).
- Radio: station name and our own station badge top-centre, in 250 ms, hold 2.5 s, out 400 ms; changing again restarts.
- Mission passed: full-width dark band (rgba(0,0,0,.6), 18 % of height) fades in 300 ms, Anton "MISSION PASSED" in gold
  scales 1.08 -> 1 over 400 ms, reward line "+$500" in white under it counts up, hold 3.5 s, fade 600 ms. Failed: same in
  red-orange #d9643a, no reward line. Plays with Nia's sting.
- Health bar flashes red when below 25 %. Radar edge pulses only for a new waypoint, once.
- Idle: after 6 s without change, cash and bars dim to 55 % opacity; any change restores them. Area name never stays up.
Colours: the radar has a dark translucent fill rgba(14,16,20,.75), roads light grey, our neighbourhood in the asphalt
palette, blips in our own simple shapes (no GTA blip sprites).
Fails: web-app buttons in the HUD, pills with borders, emoji, overlapping cards, text breaking at a hyphen, anything that
moves when nothing changed, two instances of the same information.

## (c2) Settings and pause menu (Priya, after title, credits and loading art) — Fable ruling, 11 Nov
Keep the layout the owner asked for in Stage 13: tabs across the top, the list of rows "label ◄ value ►" on the left, the
description panel on the right, APPLY / DEFAULTS / BACK in a footer bar. Restyle it to the polished dark look:
- Scrimmed dark panels rgba(10,10,12,.72) over a blurred or darkened game frame (or one illustrated panel from (a) on the
  right, never under a row), 2 px radius, hairline dividers rgba(255,255,255,.08).
- Type from (b): tabs Barlow Cond 600 20 px uppercase, rows Barlow Semi Cond 500 20 to 22 px, description 16 px, title in
  Anton 56 to 64 px. No ink outlines, no halftone, no stroke on any menu text.
- Selected row: a solid accent bar (gold #e8b53a, 4 px) on the left plus a lighter row fill; values in white, arrows dim
  until hovered. Selection moves with a 120 ms fade, nothing bounces.
- Fits 1280x720 and 390x844 with no row cut and no control on top of art.

## (d) Characters (Leila)
Proportions: 7.5 heads for men, 7 to 7.25 for women; shoulders 2 to 2.3 head widths on men, 1.6 to 1.8 on women.
Shoulder and neck construction (this is the owner's "shoulders are weird"):
- The neck is a cylinder 0.45 to 0.5 head widths wide that enters the torso, with a trapezius slope from the neck base to the
  shoulder point; the slope reads as a smooth curve, not a peak. No V-shaped collar spikes, no shirt shards at the neckline.
- The deltoid is a round cap: at least one extra edge loop between the trapezius and the upper arm, so the shoulder has a
  rounded corner seen from the front and the side. The arm hangs 3 to 5 degrees off the body with a visible gap at 12 m.
- Collars, hems and cuffs are closed rings with a 1 to 2 cm lip, never zigzag cut edges. The torso garment overlaps the
  trouser waistband by at least 5 cm; no skin or underlayer shows through anywhere at any pose of the idle and walk cycles.
Body types: at least eight, and they must differ in SILHOUETTE (outline filled black, still tell them apart), not only in
scale. Each one varies at least two of: height, shoulder width, waist width, hip width, belly depth, limb thickness.
1. Slim young man (narrow shoulders, long limbs, 1.80 m). 2. Athletic man (wide shoulders, narrow waist, thick neck).
3. Heavy man (belly forward 15 to 20 cm, wide hips, short neck). 4. Tall broad man (1.95 m, wide everywhere).
5. Older man (slight stoop, forward head, softer chest, narrower shoulders). 6. Slim woman (narrow shoulders and hips).
7. Curvy woman (hips 1.3 x shoulders, fuller thighs). 8. Heavy woman (full torso and arms, wide hips).
9. Older woman (shorter, rounded upper back). 10. Teen (shorter, 6.5 to 7 heads, thin limbs).
In a lineup of 12 random peds: at least six different outlines, at least three heights, at least two heavy bodies.
Triangle budget (our own numbers, accepted by Fable 11 Nov; the GTA III / IV figures remain unverified): ped LOD0 2,500 to 4,000 tris, LOD1 (beyond 25 m) 800 to 1,200, LOD2 / impostor beyond 60 m;
player and story characters up to 7,000 at LOD0. Fewer polygons, placed at joints and the silhouette; flat areas get none.
Smooth-shade the body and garments as one group; no visible facets on jaw, skull or shoulder at 3 m.
Clothes: texture first (fabric grain, seams, pockets, zips painted with a normal map), geometry only where the silhouette
needs it: hood, long coat hem, skirt, puffer bulk, cap brim, hijab drape over the shoulders.
Faces: semi-realistic painted, GTA IV direction: real proportions, warm skin, no cartoon eyes or mouths.

## (d2) People checklist: what separates ours from a GTA III / IV pedestrian (round 1, 12 Nov)
Measured on people/final/line10-sil.png (1280x720, about 190 to 250 px per figure) and read from close3q-a/-b, street.png
and smoke/smoke-player.jpg. GTA III / IV reference is observed from the games, no numbers copied. Tick every box at 3 m and
12 m before posting a round. Owner's words: "smooth not bubbly or blocky".
Proportion (Leila, PEOPLE)
- [ ] Adults 7.0 to 7.5 heads tall. NOW: four men measure 8.0 to 8.5 heads (ba-hoodie-fade 8.1, ba-work 8.0, la-delivery 8.3,
      wh-flannel 8.5): pinheads. Heavy bodies keep a normal head; do not scale the head down with height.
- [ ] Head width 0.65 to 0.75 of head height; skull back and jaw corner visible in profile, not an egg.
- [ ] Neck 0.5 to 0.6 head widths on men, 0.45 on women, visible length 0.3 to 0.4 head heights; jaw overhangs the neck in
      profile. NOW: the black ring collar on la-hoodie-cap reads as a neck brace; the yellow-vest man's neck is a long stalk.
- [ ] Shoulders 2.0 to 2.3 head widths (men), 1.6 to 1.9 (women), one round deltoid each side. NOW: slim bodies pass;
      heavy bodies hit 3.1 to 3.5 head widths: balloons.
- [ ] Torso wedge: shoulder to waist 1.25 to 1.35 on men, waist to hip 0.75 to 0.8 on women. NOW: most torsos are tubes,
      shoulder roughly equals hip (ratio 0.92 to 1.08).
- [ ] Heavy bodies carry the mass IN FRONT (belly 15 to 20 cm forward in profile) and in the upper arms and neck; hips at
      most 1.15 x shoulders on heavy men, 1.3 x on curvy women. NOW: the orange puffer woman is 1.4 x with bowed sausage
      thighs; the red-check man is a pear. That is the "bubbly" the owner means.
- [ ] Arms rest 5 to 8 degrees off the body, elbows slightly bent, palms facing the thighs. NOW: 15 to 20 degree A-pose on
      every figure, player included; it makes all of them read as mannequins. (Also an animation idle fix.)
- [ ] Arm taper: forearm 0.8 of upper arm, wrist 0.55 of upper arm. Leg taper: calf 0.65 of thigh, ankle 0.4, a knee
      bump at the side view, a gap between the thighs down to the knee. NOW: tubes of one thickness, no knee.
- [ ] Hands 0.7 to 0.75 head heights long, mitten plus separate thumb, fingers slightly curled. NOW: small flat paddles.
- [ ] Shoes 1.0 to 1.1 head heights long, flat sole on the ground, toe slightly up, pointing forward (10 degrees out at most).
      NOW: white pointed blobs splayed out, several float.
Shading (Leila geometry, Rozzie pieces)
- [ ] Smooth normals across the body, but split normals (a crisp edge) at collar, cuffs, hem, waistband, shoe welt and hat
      brim. NOW: the body is balloon-smooth everywhere, so garments do not read as cloth over a body.
- [ ] No facets visible at 3 m on jaw, cheekbone, skull, hair, hijab or bun. NOW: hair shells, the bun and the hijab
      opening are faceted, and the face reads as a flat card pasted on a sphere (hijab case: a bald patch shows above it).
- [ ] Clothes hide anatomy: a coat or puffer hangs straight from the chest; no breasts or nipples modelled or painted
      through cardigans, puffers or tops. NOW: visible on ba-elder, ba-puffer-braids and the blue top in close3q-a. Defect.
Texture (Marisol, PEDTEX; Rozzie for hair, hats, shoes)
- [ ] Face at 3 m: small dark eyes with light-grey (not white) sclera, no eyeliner, soft broad brows, lips only a little
      darker than skin, value shadow under brow, nose and lower lip, stubble as a soft value. NOW: graphic eyeliner, glossy
      white sclera with a sideways glance, thin plucked brows, red lipstick on almost everyone: it reads as cartoon.
- [ ] Skin: two or three gentle value zones (forehead lighter, cheeks warmer, jaw darker), same colour across the face,
      neck and hands, no seam at the neck.
- [ ] Hoodie / sweater / jacket: low-contrast knit or twill, painted seams, hem and cuff rib, pocket, drawstrings, baked
      shadow under collar, at armpits and at elbow folds. NOW: grey knits are high-frequency noise (shag rug); the player's
      red hoodie and the blue top are flat colour.
- [ ] Jeans: indigo with lighter fades on thighs and knees, outer seam, pocket shapes, a darker crotch and knee-back crease,
      a cuff at the hem.
- [ ] Shoes: a sole band, a darker upper, a lace area; trainers off-white, never pure white.
- [ ] Hair: strand direction painted, a broken hairline painted onto the scalp, not a hard helmet edge.
- [ ] Baked ambient occlusion: under chin, under arms, between legs, under hat brims.

## (e) Vehicles (Dmitri, Kenji)
- Body: one clean low-poly hull, LOD0 traffic 4,000 to 7,000 tris, sports and player-focus cars up to 10,000, LOD1 1,000 to
  1,500 beyond 40 m. Smoothing groups: smooth across panels, hard edges only at real creases (shoulder line, hood edge,
  sill, wheel arch lip). No faceted hoods, no shading seams where panels meet.
- Greenhouse (the owner's "wonky tops"): the roof, pillars and glass are one closed shape that sits ON the body's belt line.
  The windshield base meets the cowl with no gap and no step (max 1 cm overlap, never a dark slot); A-pillars are body
  colour or black trim at least 6 cm wide, rake 55 to 65 degrees from vertical on sports cars, 35 to 50 on sedans and trucks;
  the roof edge is continuous from A to C pillar with no bright outline or floating lip; side glass sits 2 to 4 cm inboard of
  the body side (tumblehome), never flush outboard. Glass reads dark and reflective, never paper-thin or see-through to grey.
- From the side the daylight opening (DLO) is one clean shape; the B-pillar is black. From the front the windshield is
  symmetric and narrower at the top than the bottom.
- Detail lives in the textures: panel gaps, door handles, grilles, badges (our own), vents and lamps as texture plus normal
  map; geometry only for wheels, mirrors, spoilers, lamp lenses and bumpers that change the silhouette.
- Wheels fill the arches (tyre top 3 to 6 cm under the lip), flush with the body side.
Fails: windshield gaps, glass sitting above the roof line, roofs that change width between pillars, spoilers floating off the
deck, stripes or vents drawn as geometry steps, chrome outline on every edge.

## (f) Banned
- Cartoon faces (big eyes, simplified mouths), caricature proportions, toon/cel shading on 3D models.
- Flat vector posters, halftone dots, comic speech bubbles and sound-effect lettering (the v1 comic idiom is retired:
  settings keep their layout and move to the polished dark look in (c2)).
- Lettering, numbers or logos on clothing; text in textures that cannot be read.
- Visible seams, slivers, spikes, zigzag hems, floating parts, z-fighting, windshield gaps.
- Any Rockstar or other game asset, logo, font or traced image; Pricedown or lookalikes; non-open-licence fonts.
- Outline and stroke used to fix contrast outside the HUD.

## (g) World surfaces (Bea, ROADS: ground and trees; Noor, FACADES: walls, windows, shopfronts)
- [ ] Asphalt: patches and cracks are rare (one patch per 15 to 25 m of lane), irregular, low contrast; no cobble or
      rectangle stamps repeating across the frame. NOW (realworld2/medium/shop-corner.png): stamp patches and cartoon
      crack lines everywhere; the road reads as a pattern.
- [ ] Sidewalk: grey concrete flags, about 1.5 m, value variation of 5 to 10 %, joints as thin darker lines. NOW
      (smoke-ped.jpg): flags in blue, brown and slate like planks; dotted moiré patches (decal or shadow acne).
- [ ] Trees: a soft canopy of leaf clusters, no cube or voxel leaves (smoke-player.jpg), trunks taper and branch.
- [ ] Bags and small props: smooth low-poly, not faceted icospheres.
- [ ] Brick at true scale: 20 x 6.5 cm courses, so about 9 to 10 courses per metre; no rubble-sized bricks (smoke-ped.jpg),
      no visible tile repeat across a facade (shop-corner.png), mortar a little lighter than brick.
- [ ] Facades: grime and darkening at the base and under sills, lintel and sill shadows, slight variation per window
      (blinds, curtains, lights at night); no grid-aligned rectangles from lotTone.

## Scoreboard (lane, round, verdict)
| Lane | Round | Verdict |
|---|---|---|
| PEOPLE (Leila) | 12 Nov r1, people/final | FAIL: pinheads on four men, balloon heavy bodies, A-pose arms |
| PEDTEX (Marisol) | 12 Nov r1, same frames (pre-lane baseline) | FAIL: cartoon eyes and lips, noise knits, flat hoodies |
| PEDHAIR (Rozzie) | 12 Nov r1, same frames (pre-lane baseline) | FAIL: faceted helmet hair, blob shoes, faceted hijab |
| CARS2 (Dmitri) | 12 Nov r1, cars14/hi_after | FAIL (better): cowl slot fixed on 3 of 4; wedge truck slot, mottled paint, white disc rims |
| ROADS (Bea) | 12 Nov r1, realworld2 + smoke | FAIL: stamped asphalt, coloured plank sidewalks, cube trees |
| FACADES (Noor) | 12 Nov r1, realworld2 + smoke | FAIL: brick scale and repeat, no base grime |
| SHOTS (Priya) | none yet | waiting |
| HUD2 (Zadie) | none yet | waiting |

## Earlier read, 11 Nov midday (frames in c14b/, cars14/hi_before/, ui14/)
- People: shoulders peak at the collar with zigzag shirt shards at neck, hem and cuffs; one body for everyone; the hijab is
  still a diving hood (tight to the face, ruffle at the neck, no drape). The flat-shaded faces facet at 3 m.
- Cars: paint and wheels hold up. The tops are the problem: a dark slot at the windshield base, the glass sits proud of the
  pillars, a bright lip runs round the roof edge, and the wedge truck's windshield overhangs its cowl.
- Map: clean and readable; avenue labels run under the zoom buttons (phone portrait, desktop zoomed in). The waypoint
  route must follow the streets (Fable ruling): the grid route exists now, the real-map route comes with Imani's team.
