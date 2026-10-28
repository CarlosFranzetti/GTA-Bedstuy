# World notes: per-face checklist for Street View (R2, Stage 2)

Purpose: a checklist for filling the block faces of the 10-block Bed-Stuy grid from Street View screenshots, once the user supplies them. It turns what to look at into D1's schema fields (`src/world/data/schema.ts`, `LotSpec` and `FaceDef`). Values go into `src/world/data/bedstuy.json` (faces with `lots`, or `typology` defaults). The screenshots themselves stay out of the repo.

## Rules (from PRD §2.1)

- Street View imagery is reference only. Record values (counts, floors, a material family from a closed list). Never copy pixels, never sample them into textures, never commit screenshots. Keep screenshots in a git-ignored folder or outside the repo.
- Business names and sign text are not recorded. Record the storefront archetype only (bodega, laundromat, barber, deli, liquor, pharmacy, church, daycare, restaurant, cellphone, generic). Use the parody name in the game.
- Each value gets a confidence tag: `H` (seen clearly in the screenshot, with a date), `M` (visible but partly hidden or old imagery), `L` (guessed from a small view or from the typology defaults).
- Record the Street View capture date for each face. Imagery older than about 3 years needs an `L` on `scaffold` and `vacant`.

## Face ids

A face is one side of a block: `rRcC-<bounding street id>`. Rows r0..r4 lie between Hart, Pulaski, Kosciuszko, Lafayette, Van Buren and Greene (row r sits between the street at index r and the one at index r+1). Columns c0 and c1 lie between Tompkins and Throop, and between Throop and Marcus Garvey. The row/column mapping is assumed (L) until D1 confirms it against the Grid block ids. The game's `side` value (N, S, E, W) for each face must be copied from the BlockFace D1 uses, not guessed.

## Per-face checklist (what to look at, then the D1 field)

Work through a face in this order. Mark each line when filled.

1. **Count lots and widths** (`widthM`, one entry per lot in authoring order from the face's `from` end to its `to` end). Count the party walls and measure each frontage against a known object: a standard car is about 4.5 to 5 m long, a door about 0.9 m wide. Row houses are commonly 5 to 7 m wide. If the sum of the widths differs from the face length, record the difference in `note`.
2. **Floors** (`floors`): count storeys above the sidewalk, not counting a raised basement, and not counting a roof-top bulkhead. A basement window at sidewalk level is not a floor. Brownstone rows: usually 3 to 4 storeys plus a stoop.
3. **Material family** (`family`), one of `brownstone` (stone, tan to brown, smooth or rusticated), `brickRed`, `brickTan` (buff or yellow brick), `brickPainted` (brick under paint), `limestone` (pale, smooth, with carved detail), `frame` (wood clapboard, vinyl or asphalt siding), `church`, `vacant`, `newBuild` (post-2000, flat, uniform, large windows). When unsure between two, record the one you see at street level and set `L`.
4. **Stoop** (`stoop`: true or false; `stoopHeightM`): a raised entrance with steps from the sidewalk. True if the steps reach a door above ground. Measure the height from the sidewalk to the stoop landing against a door height (about 2.1 m) or a car roof if possible. Avenue storefronts and new infill: usually false.
5. **Cornice** (`cornice`): `bracketed` (projecting brackets or modillions under the roofline), `plain` (a flat band or moulded line, no brackets), `none` (a flush parapet, typical of post-2000 infill and some flats).
6. **Bays** (`bays`): count bay windows (projecting windows) on the front of each lot. Count only storeys that have them. Note a bay that runs the full height as one bay.
7. **Use** (`use`): `residential`, `mixed` (ground-floor shop with apartments above), `church`, `school`, `vacant` (empty lot, fence, or demolished), `garage`. Use `mixed` only when the ground floor is clearly a storefront (glazing, awning, roll gate). Do not record names.
8. **Storefront archetype** (`storefront`, only if `use` is `mixed`, `church` or `school`). Use the archetype from the closed list. Cues: a laundromat has large glazing with machines and a sign that says WASH or DRY; a bodega has a deli counter, a grocery display and a lottery sign; a barber has a pole or a chair in the window; a daycare has child-scale play signs or fenced yard; a church has a cross, a steeple or a bible-verse banner. If unsure, use `generic` at `L`.
9. **Street trees** (`trees`): count street trees within the face's frontage. Include tree pits without a tree. Say whether the pits are empty.
10. **Scaffolding** (`scaffold`): `true` if scaffolding, netting or a sidewalk shed is visible in the view (date it). Otherwise `false`.
11. **Vacant** (`vacant` lot): a gap in the row with a fence, a lot with no building, or a building marked for demolition. Record the lot as `use: vacant` and `family: vacant`. A lot with new construction under way is `newBuild` with `scaffold: true`.
12. **Confidence and note** (`confidence`, `note`): one line for what you saw, the capture date, and any doubt.

## Typology-only fields (no Street View needed)

- `typology` for the face (D1): use the block-faces §5 hint. The file gives the street-level default used when lots are missing.
- `pins`: any fixed landmark or church on the face, with its address, only if it sits on that face. Examples from pass 2: the magnolia at 677/679 Lafayette (block unconfirmed, see C3). Antioch Baptist at 828 Greene is outside the grid and is not a pin.

## Per-face table

Fill the last column with the values listed under the checklist. Use the field names exactly as D1 names them.

| Face id | Bounding street | Block span | Kind | Pass 2 typology hint (see `reference/block-faces.md` §5) | Filled from Street View (values only) |
|---|---|---|---|---|---|
| `r0c0-hart` | Hart St | Tompkins Ave to Throop Ave | street frontage | 3-4 storey rows; 173 Hart 2004 infill (3 fl, L); 226 Hart pre-war 4 fl (L) | |
| `r0c0-pulaski` | Pulaski St | Tompkins Ave to Throop Ave | street frontage | 3-4 storey rows; 185/195A between Tompkins and Throop (listings); 197 Pulaski 2023 filing, 4 fl, 7 units (M); 156 Pulaski 1931, 3 fl (M) | |
| `r0c0-tompkins` | Tompkins Ave | Hart St to Pulaski St | avenue frontage | Corner storefront 435 Tompkins (condo replacement, L); Tompkins Congregational outside grid; Tompkins/Kosciuszko St Ambrose parish house (L) | |
| `r0c0-throop` | Throop Ave | Hart St to Pulaski St | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r0c1-hart` | Hart St | Throop Ave to Marcus Garvey Blvd | street frontage | 3-4 storey rows; 173 Hart 2004 infill (3 fl, L); 226 Hart pre-war 4 fl (L) | |
| `r0c1-pulaski` | Pulaski St | Throop Ave to Marcus Garvey Blvd | street frontage | 3-4 storey rows; 185/195A between Tompkins and Throop (listings); 197 Pulaski 2023 filing, 4 fl, 7 units (M); 156 Pulaski 1931, 3 fl (M) | |
| `r0c1-throop` | Throop Ave | Hart St to Pulaski St | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r0c1-garvey` | Marcus Garvey Blvd | Hart St to Pulaski St | avenue frontage | Bethany Baptist 460 Marcus Garvey (M address, L block); 106 MG 2025 permit (L); 469 MG Queen Anne outside grid (corner Decatur); Marcus Garvey Houses location unconfirmed | |
| `r1c0-pulaski` | Pulaski St | Tompkins Ave to Throop Ave | street frontage | 3-4 storey rows; 185/195A between Tompkins and Throop (listings); 197 Pulaski 2023 filing, 4 fl, 7 units (M); 156 Pulaski 1931, 3 fl (M) | |
| `r1c0-kosciuszko` | Kosciuszko St | Tompkins Ave to Throop Ave | street frontage | 3-4 storey rows; 289 Kosciuszko vacant-lot history (YIMBY, L); P.S. 79 near Throop (1907 photo) | |
| `r1c0-tompkins` | Tompkins Ave | Pulaski St to Kosciuszko St | avenue frontage | Corner storefront 435 Tompkins (condo replacement, L); Tompkins Congregational outside grid; Tompkins/Kosciuszko St Ambrose parish house (L) | |
| `r1c0-throop` | Throop Ave | Pulaski St to Kosciuszko St | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r1c1-pulaski` | Pulaski St | Throop Ave to Marcus Garvey Blvd | street frontage | 3-4 storey rows; 185/195A between Tompkins and Throop (listings); 197 Pulaski 2023 filing, 4 fl, 7 units (M); 156 Pulaski 1931, 3 fl (M) | |
| `r1c1-kosciuszko` | Kosciuszko St | Throop Ave to Marcus Garvey Blvd | street frontage | 3-4 storey rows; 289 Kosciuszko vacant-lot history (YIMBY, L); P.S. 79 near Throop (1907 photo) | |
| `r1c1-throop` | Throop Ave | Pulaski St to Kosciuszko St | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r1c1-garvey` | Marcus Garvey Blvd | Pulaski St to Kosciuszko St | avenue frontage | Bethany Baptist 460 Marcus Garvey (M address, L block); 106 MG 2025 permit (L); 469 MG Queen Anne outside grid (corner Decatur); Marcus Garvey Houses location unconfirmed | |
| `r2c0-kosciuszko` | Kosciuszko St | Tompkins Ave to Throop Ave | street frontage | 3-4 storey rows; 289 Kosciuszko vacant-lot history (YIMBY, L); P.S. 79 near Throop (1907 photo) | |
| `r2c0-lafayette` | Lafayette Ave | Tompkins Ave to Throop Ave | street frontage | Neo-Grec brownstone rows; magnolia 677/679 Lafayette (H tree, block conflict C3); 664 and 672 near Tompkins Park (M, block unclear) | |
| `r2c0-tompkins` | Tompkins Ave | Kosciuszko St to Lafayette Ave | avenue frontage | Corner storefront 435 Tompkins (condo replacement, L); Tompkins Congregational outside grid; Tompkins/Kosciuszko St Ambrose parish house (L) | |
| `r2c0-throop` | Throop Ave | Kosciuszko St to Lafayette Ave | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r2c1-kosciuszko` | Kosciuszko St | Throop Ave to Marcus Garvey Blvd | street frontage | 3-4 storey rows; 289 Kosciuszko vacant-lot history (YIMBY, L); P.S. 79 near Throop (1907 photo) | |
| `r2c1-lafayette` | Lafayette Ave | Throop Ave to Marcus Garvey Blvd | street frontage | Neo-Grec brownstone rows; magnolia 677/679 Lafayette (H tree, block conflict C3); 664 and 672 near Tompkins Park (M, block unclear) | |
| `r2c1-throop` | Throop Ave | Kosciuszko St to Lafayette Ave | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r2c1-garvey` | Marcus Garvey Blvd | Kosciuszko St to Lafayette Ave | avenue frontage | Bethany Baptist 460 Marcus Garvey (M address, L block); 106 MG 2025 permit (L); 469 MG Queen Anne outside grid (corner Decatur); Marcus Garvey Houses location unconfirmed | |
| `r3c0-lafayette` | Lafayette Ave | Tompkins Ave to Throop Ave | street frontage | Neo-Grec brownstone rows; magnolia 677/679 Lafayette (H tree, block conflict C3); 664 and 672 near Tompkins Park (M, block unclear) | |
| `r3c0-vanburen` | Van Buren St | Tompkins Ave to Throop Ave | street frontage | 127 Van Buren Queen Anne row, Throop-MG (M); 64 Van Buren 1901 brownstone (M); 25 Van Buren 2014 new build (M); 180 Van Buren church and corner lot (L); Hattie Carthan farm Throop-Tompkins | |
| `r3c0-tompkins` | Tompkins Ave | Lafayette Ave to Van Buren St | avenue frontage | Corner storefront 435 Tompkins (condo replacement, L); Tompkins Congregational outside grid; Tompkins/Kosciuszko St Ambrose parish house (L) | |
| `r3c0-throop` | Throop Ave | Lafayette Ave to Van Buren St | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r3c1-lafayette` | Lafayette Ave | Throop Ave to Marcus Garvey Blvd | street frontage | Neo-Grec brownstone rows; magnolia 677/679 Lafayette (H tree, block conflict C3); 664 and 672 near Tompkins Park (M, block unclear) | |
| `r3c1-vanburen` | Van Buren St | Throop Ave to Marcus Garvey Blvd | street frontage | 127 Van Buren Queen Anne row, Throop-MG (M); 64 Van Buren 1901 brownstone (M); 25 Van Buren 2014 new build (M); 180 Van Buren church and corner lot (L); Hattie Carthan farm Throop-Tompkins | |
| `r3c1-throop` | Throop Ave | Lafayette Ave to Van Buren St | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r3c1-garvey` | Marcus Garvey Blvd | Lafayette Ave to Van Buren St | avenue frontage | Bethany Baptist 460 Marcus Garvey (M address, L block); 106 MG 2025 permit (L); 469 MG Queen Anne outside grid (corner Decatur); Marcus Garvey Houses location unconfirmed | |
| `r4c0-vanburen` | Van Buren St | Tompkins Ave to Throop Ave | street frontage | 127 Van Buren Queen Anne row, Throop-MG (M); 64 Van Buren 1901 brownstone (M); 25 Van Buren 2014 new build (M); 180 Van Buren church and corner lot (L); Hattie Carthan farm Throop-Tompkins | |
| `r4c0-greene` | Greene Ave | Tompkins Ave to Throop Ave | street frontage | 620 Greene c.1872 Second Empire, Tompkins-Throop (M); 677 Greene 1899 brownstone, Throop-MG (M); 650 Greene 2022 4-storey filing (L vacancy); 626 Greene 4 fl (M) | |
| `r4c0-tompkins` | Tompkins Ave | Van Buren St to Greene Ave | avenue frontage | Corner storefront 435 Tompkins (condo replacement, L); Tompkins Congregational outside grid; Tompkins/Kosciuszko St Ambrose parish house (L) | |
| `r4c0-throop` | Throop Ave | Van Buren St to Greene Ave | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r4c1-vanburen` | Van Buren St | Throop Ave to Marcus Garvey Blvd | street frontage | 127 Van Buren Queen Anne row, Throop-MG (M); 64 Van Buren 1901 brownstone (M); 25 Van Buren 2014 new build (M); 180 Van Buren church and corner lot (L); Hattie Carthan farm Throop-Tompkins | |
| `r4c1-greene` | Greene Ave | Throop Ave to Marcus Garvey Blvd | street frontage | 620 Greene c.1872 Second Empire, Tompkins-Throop (M); 677 Greene 1899 brownstone, Throop-MG (M); 650 Greene 2022 4-storey filing (L vacancy); 626 Greene 4 fl (M) | |
| `r4c1-throop` | Throop Ave | Van Buren St to Greene Ave | avenue frontage | Laundromat 442 Throop (M, block L); churches 299 and 417 Throop (M); day care 268 Throop (L); 320 Throop 1910 (M-L); 277 Throop 2016 5-storey filing (M); 330 Throop Second Empire at Pulaski corner (M); 470 Throop outside grid | |
| `r4c1-garvey` | Marcus Garvey Blvd | Van Buren St to Greene Ave | avenue frontage | Bethany Baptist 460 Marcus Garvey (M address, L block); 106 MG 2025 permit (L); 469 MG Queen Anne outside grid (corner Decatur); Marcus Garvey Houses location unconfirmed | |

## Known gaps to check on Street View first

- Block-face order: confirm the north-south street sequence (Lafayette, Kosciuszko, Van Buren, Greene) and which avenue sides the face ids are (pass 1 item 4).
- 828 and 816-826 Greene: confirm they lie outside the grid east of Marcus Garvey (block-faces C1).
- 677/679 Lafayette magnolia: confirm the block (C3).
- 180 Van Buren and the corner lot at Van Buren and Marcus Garvey: is there a building, a fence or nothing? (block-faces 5.5)
- 289 Kosciuszko (vacant-lot history), 197 Pulaski (2023 filing), 650 Greene (2022 filing), 482 Throop (demolition filing): check each site's current state.
- 330 Throop (Second Empire, Pulaski corner): which corner, and the cladding (the 1980s tax photo showed asphalt siding).
- Trees and scaffolding on every face: no source reached; these are the fields with the least evidence.
