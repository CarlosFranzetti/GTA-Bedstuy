# Measurements from the owner's reference pack (numbers and words only)

Source: the owner's Google Drive folder "GTAREF" (the unpacked sibling of GTAREF.zip), 27 Nov 2026, lane PACKMEASURE.
Rule 1 and rule 3 of MEMORY.md stand: nothing from the pack is in the repository, the docs or any picture. This file holds
dimensions, counts, ratios and descriptions of how things are built. Files were read in a scratch folder with our own
parsing logic (a throwaway Python reader; `src/mods` was not touched).

## 1. What the folder holds (the honest, small answer)

The folder is much thinner than "a pack of models". Counted by kind (each file appears twice, once at the top and once in
a subfolder; counts below are distinct files):

| Kind | Distinct files | What it is |
|---|---|---|
| Model files (.dff) | 2 | one 193 KB car (Car A) and the 1.2 MB 2002 fan car (Car B, already described in MODS.md) |
| Texture dictionaries (.txd) | about 35 | car, pedestrian, building and shop texture sets; about ten of them are exactly 22,064 bytes; the largest are 4.4 MB (Car B), 2.65 MB, 2.35 MB, 1.17 MB, 1.02 MB |
| Loose textures (.png) | a few, each 128 x 128 (65,737 bytes), repeated in several subfolders | seamless wall tiles |
| Text and data | readme (2,765 bytes), handling.cfg (149 bytes), default.ide (91 bytes) | the fan car's readme, its handling line, an object list |
| Archives (.img) | none | so there are NO pedestrian meshes and NO building meshes in the folder |

Consequences: cars can be measured for two models only. People can be measured only as textures (no mesh, so no height,
proportions, triangle count or bones). Buildings can be measured only as texture sets (no storey heights, doors or windows).
Texture dictionaries for three more cars exist (texture sizes only). This is the whole truth of what could be measured.

Parsing: 2 of 2 models parsed; 7 of 7 texture dictionaries I opened parsed (headers read; pixels not decoded). The
dictionary that fails in our `src/mods` parser is Car B's own dictionary, which was not needed again (its cause is in
MODS.md, "MODS3"). Download limits: Drive's connector refuses files over 10 MB; Car B's 4.4 MB dictionary and the other large
building sets (2.35 MB, 2.65 MB, 1.02 MB) were not downloaded because they add nothing to the numbers (more of the same
tile sizes).

## 2. Scale method and its uncertainty

- Model units are metres (the format has no unit field; this is the convention of the era and matches every number below).
- Car A has no wheel meshes in its file; they come from a shared wheel model that is not in the folder. Wheel centres are
  frames. Ground level therefore is not in the file. I assumed a wheel radius of 0.33 m (plus or minus 0.04) to place the
  ground: wheel frame height is -0.48 below the car origin, so ground is about -0.81.
  - Exact (from frames and vertices, no assumption): length, width, wheelbase 3.34, track (frame to frame) 1.66, body panel
    heights relative to the origin, triangle counts, materials, texture sizes.
  - Assumed: ground level (so total height 1.47 plus or minus 0.04, ground clearance 0.17 plus or minus 0.04, bonnet height
    above ground 1.02), wheel diameter (about 0.66).
  - Not known: how much the old game scaled its cars against real ones. Game-scale models of that era tend to be a little
    larger than the real car they imitate; I could not check this against a real figure, so treat Car A's size as "game
    scale", not "real world".
- Car B (the fan car) states its own size in its handling line: width 2.4, length 5.0, height 1.6, mass 1,180 kg. Measured
  from its geometry, the body is 2.2 wide, 5.04 long and 1.32 tall, and its four wheel meshes are each about 1.0 m across
  (0.51 wide), which is out of proportion with a 1.32 m body. Its numbers are unreliable for wheel size and should not set a
  target. It is the only model in the folder with a licence problem, and it is far over budget (see MODS.md).

## 3. Cars

### Car A (a large four-door sedan, one model, two detail levels)

| Measure | Value | Certainty |
|---|---|---|
| Length, bumper to bumper | 5.37 m (body shell 5.26) | exact |
| Width, body | 2.06 m (2.32 with mirrors and door handles) | exact |
| Height | 1.47 m | assumed wheel radius |
| Wheelbase | 3.34 m | exact |
| Track (wheel centre to centre) | 1.66 m | exact |
| Wheel diameter | about 0.66 m (not in file) | assumed |
| Ground clearance, bumpers and sills | about 0.17 m | assumed ground |
| Front overhang / rear overhang | 0.96 m / 1.07 m (18 % / 20 % of length) | exact |
| Wheelbase over length | 0.62 | exact |
| Track over body width | 0.81 | exact |
| Bonnet top over roof height (above ground) | 1.02 / 1.47 = 0.69 | assumed ground |
| Boot lid top over roof height | about 0.62 (lid top 0.31 above the origin, roof 0.66) | assumed ground |
| Windscreen | 7 triangles, a single flat pane, tilted | exact |

- Triangles: the main body shell 868 at high detail; hinged and bolt-on parts: four doors 76 to 84 each, front bumper 116,
  rear bumper 132, bonnet 128, boot lid 22, two wings 35 each, windscreen 7. All parts kept for normal play total 1,663.
  Wheels are not in the file. Low detail body: 84 triangles (a tenth of the high body, one box-like shell). The file also
  carries a "damaged" twin of every part (about 1,700 more triangles); those are not drawn until the car is hit.
- Detail levels: two (high 868 plus parts, and a 84-triangle far body), plus the damaged parts.
- Draw structure: 24 mesh pieces. The body is one mesh; every panel that moves or breaks is its own mesh on a named frame.
  Lights (head, tail, brake, reverse, indicators), exhaust, steering wheel and seat positions are frames only, with no mesh.
- Materials: the main body shell has 9 materials but only 5 different textures plus plain fills. Textures for this car:
  two 64 x 64 body panels, a 64 x 64 underside, a 128 x 128 detail sheet (glass, trim, grille together), shared white and
  black fills. Totals for a car's texture set: 4 to 6 textures, 64 or 128 pixels square, all 32-bit uncompressed in the
  dictionary header (about 16 KB and 64 KB each).
- Colour: the paint materials are two pure marker colours (a green and a magenta) that the game swaps for the car's own
  colours; the paint is not baked into the picture.
- Glass: a single semi-transparent material (alpha 51 of 255) on 5 triangles of the body shell plus the windscreen part; the
  side windows are painted into the 128 px detail sheet. A side-view glass to body ratio is not reliably measurable from
  geometry; not reported.
- Texel density on the body: main panel texture about 69 pixels per metre; secondary panel about 132; the 128 px detail
  sheet about 29; the underside about 20. In short: about 1.4 cm per pixel on the main body, which is very low.
- Whether shading is painted into the textures: not checked (pixels not decoded). The panel names suggest flat colour with
  detail lines, but this is a guess.

### Textures for three more cars (no geometry in the folder)

Each of the three car texture dictionaries holds 4 to 10 textures, all 64 x 64 or 128 x 128 (plus one 32 x 32), 32-bit,
no mip levels, about 200 to 250 KB in all. Body panels use 64 px; one 128 px sheet carries glass and trim; a white 64 and a
white 128 serve as fills; one carries a 64 px badge sheet.

### Car B (fan car, for completeness only)

Body 5.04 x 2.2 x 1.32 m; wheelbase 3.02, track 2.11; 8,058 body triangles, four wheel meshes of 1,144 each plus a merged
4,608 duplicate; about 25,700 triangles in the file (16,600 once duplicates and damage twins are dropped); textures 1024,
512, 256 and 128 pixels, 8-bit. About 15 times Car A's triangles. Not a target for anything.

## 4. People

No pedestrian meshes exist in the folder. What can be said, as numbers:

- Pedestrian texture dictionaries: about ten files of exactly 22,064 bytes (identical size, so the same layout), another of
  67,584 bytes holding one 128 x 128 texture, 32-bit. One 128 x 128 picture per person.
- Height, head-to-body ratio, shoulder and hip width, triangle count and bone count: NOT measurable here. The owner should
  be told this plainly; a separate pack with the ped archives would be needed.

## 5. Buildings and street pieces

No building meshes exist in the folder. Texture dictionaries only:

- Tile sizes: seamless wall and detail tiles are 64 x 64 and 128 x 128 (32-bit, no mips) in the older sets, and 256 x 256
  (16-bit, block-compressed, 9 mip levels) in the shop and block sets. Shop fronts are 256 x 128 (2:1 strips); a tall
  building face is 128 x 256; shop, door and window pieces are 64 or 128 square. The loose PNG is a 128 x 128 brick tile.
- Per set: one block set holds 14 textures, one shop set 8, one industrial and building set 29 (mostly 64 or 128 square,
  about 1.17 MB), so a whole block draws from 8 to 30 small textures.
- How facades are tiled, storey heights, door and window sizes, triangles per building: not measurable without meshes.
  What the sizes imply: a wall is a repeating 64 or 128 pixel tile, with a separate single-purpose tile for a shop front,
  a door, a ledge, a roof top or a sign, rather than one large facade picture.

## 6. Comparison with ours

Our figures: `VEHICLE_SPECS` (length x width x height) and the near-model triangle count measured with the same counting as
`tests/unit/entities/car-lod-tris.test.ts` on the high tier (whole car including wheels, 6 draws; the low tier is lower).
Only Car A has real geometry, so the nearest class is "large sedan". Our nearest types: town car, classic sedan, taxi, cab.

| Type (ours) | L x W x H (m) | Near triangles (high) | Against Car A |
|---|---|---|---|
| Car A (pack) | 5.37 x 2.06 x 1.47 | 1,663 plus wheels | reference |
| sedan | 4.82 x 1.83 x 1.44 | 6,754 | 10 % shorter, 11 % narrower, 2 % lower, about 4 times the triangles |
| towncar | 5.47 x 1.99 x 1.50 | 5,906 | 2 % longer, 3 % narrower, 2 % taller, about 3.5 times the triangles |
| cab / taxi | 5.39 x 1.99 x 1.44 | 8,178 | same length, 3 % narrower, 2 % lower, 4.9 times |
| luxury | 4.96 x 1.87 x 1.48 | 6,140 | 8 % shorter, 9 % narrower, same height, 3.7 times |
| classic | 5.70 x 2.00 x 1.38 | 6,602 | 6 % longer, 3 % narrower, 6 % lower, 4 times |
| beater | 4.83 x 1.77 x 1.37 | 5,830 | 10 % shorter, 14 % narrower, 7 % lower, 3.5 times |

Across all 45 of our types the near model runs from 4,344 (flatbed) to 8,226 (livery sedan) triangles, median about 6,000.
Car A's whole drawn set is about a quarter of that, before adding wheels (the wheel model is not in the folder; ours
carries wheels as instances, so the fair gap is perhaps three times, not four).

Proportions: Car A wheelbase over length 0.62, overhangs 18 and 20 percent; ours are in the same family (our town car and
classic sedan sit within 5 percent of it in length, width and height), so our big sedans are NOT off against this model.
Our plain "sedan" and "beater" are smaller than it in width (11 to 14 percent) and length (10 percent): that is a real
difference, in the direction of ours being smaller, not bigger.

The owner's 22 Nov complaint (SUVs and trucks feel too big against sedans): the folder cannot settle it, because it holds
no SUV, truck or van mesh and no pedestrian. Ratios SUV-to-sedan, truck-to-sedan and car-to-person height cannot be
computed from it; I will not invent them. What can be said: against Car A, our SUV (4.95 x 1.93 x 1.74) is 8 percent
shorter, 6 percent narrower and 18 percent taller; our big SUV (5.35 x 2.05 x 1.92) matches its length and width and is 31
percent taller; our pickup (5.6 x 2.0 x 1.9) is 4 percent longer and 29 percent taller. So against a game-scale large sedan
our big vehicles are taller, not longer, which is the more likely cause of "feels too big". If the owner wants the sedan
to be the game-scale size of Car A (a big car), the SUV and truck lengths would then read as normal.

## 7. What a rebuild should aim for

Caution: only one real sedan is in the pack, so the targets below are for the large-sedan class, from Car A. For other
classes (SUV, truck, van, hatch, coupe) there is no pack measurement; keep our real-world figures and apply the habits.

| Class | Length | Width | Height | Wheelbase | Wheel diameter | Near triangle budget | Texture size |
|---|---|---|---|---|---|---|---|
| Large sedan (pack-style) | 5.3 to 5.4 | 2.0 to 2.1 (mirrors add 0.25) | 1.45 to 1.50 | 3.3 to 3.35 | 0.65 to 0.68 | body 900, parts 800, wheels per our instancing; whole car under 3,000 | one 128 or 256 px detail sheet plus 64 px panels |
| People | not measurable (no meshes) | | | | | keep our current budget | one 128 px picture per person is the pack's habit |
| Buildings | not measurable | | | | | | wall tile 128 px; 256 x 128 for a shop strip; 64 px for small details |

Setting these targets means the sedan class gets about 10 percent longer and 12 percent wider than our present "sedan".
That is a decision for the owner (pack scale against real-world scale), not for the rebuild lane.

### Construction habits worth copying (technique, none of it the pack's art)

1. One body shell plus separate meshes for every panel that moves or breaks (doors, bonnet, boot, bumpers, wings), each on
   its own named frame, so damage and opening need no new geometry.
2. Named frames, not meshes, for wheels, headlights, taillights, indicators, exhaust, seats and steering wheel: placement
   is data, and no triangles are spent on lights.
3. Two detail levels with a very short far body (about a tenth of the near body, 84 against 868 triangles).
4. Paint by marker colours: two pure colours on the body materials are swapped at run time; the texture carries no paint.
5. Very small textures: 64 px panels and one 128 px sheet that holds glass, trim and grille together; shared white and
   black fills instead of one-off pictures. A whole car's textures stay near 100 KB.
6. Glass as a thin transparent material (alpha about 0.2) on a few triangles, with the window frame painted on the sheet.
7. Flat panels with few triangles: a boot lid is 22 triangles, a windscreen 7, a wing 35, a door about 80, a bumper about
   120. Shape comes from silhouette and panel breaks, not from density.
8. Wheels as one shared model placed at four frames (the file holds no wheels at all).
9. Wheel track is 81 percent of body width and the body is wide against its height (width over height 1.4): wheels sit
   near the corners, which reads as planted.
10. Materials grouped by texture: 9 material slots but only 5 textures on the body, so the body draws in few batches.

## 8. Limits of this report

- One regular car and one fan car, no people, no buildings: ratios the owner asked for (SUV to sedan, truck to sedan, car to
  person) could not be produced from this folder.
- Car A's height, clearance and wheel size depend on an assumed 0.33 m wheel radius.
- Texture pixels were not decoded: "painted shading" and real-world colour use are not stated.
- Files not downloaded (over the connector's limit or not needed): the zip itself (15.5 MB), Car B's 4.4 MB dictionary,
  three building and shop dictionaries of 1.0 to 2.65 MB.
