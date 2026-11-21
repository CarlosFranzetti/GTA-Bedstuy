# STORES (STORES2): shop names, trades, signs and dressing

Status: in progress (21 Nov 2026). The first STORES lane was cut off by the usage limit before it wrote anything; this is the second.

## What exists
- `src/world/shops/shopTypes.ts`: 27 trades (type table below). `shopNames.ts`: deterministic parody names and taglines by (type, lot id, seed). `shopDressing.ts`: sidewalk and window dressing.
- `resolveStorefront` (mixeduse.ts) takes the trade, name, tagline, sign colours, window decals, fascia style and dressing from the shops folder. Hand-authored shops keep their own names and take the look of their archetype.
- Real-map shops: PLUTO land use gives only a store kind (buildingsReal.ts `pickKind`); no business name is read anywhere, so a real name cannot reach the screen. The trade and parody name come from the same generator, keyed by the lot id (BBL).


## Type table (27 trades; `src/world/shops/shopTypes.ts`)
| Trade | Frame (store kind) | Sign look | Awning (faded accents) | Window decals | Pavement and window dressing |
|---|---|---|---|---|---|
| pizzeria | restaurant | lit box, dark ground | red, green | HOT SLICES, OPEN, menu | sandwich board, counter and oven glow behind glass |
| bodega | bodega | lit box | red, yellow, blue, green | OPEN, ATM, EBT, lotto, camera | crates, ice box, newspaper rack |
| corner grocery | bodega | lit box, green | green, gold, red | FRESH FRUIT, OPEN, EBT | fruit stand with painted produce, crates, flower buckets |
| deli | deli | lit box | red, green, gold | OPEN, EBT, camera | sandwich board, newspaper rack |
| Chinese takeout | restaurant (chinese) | lit box, dark red | red, gold | menu, OPEN | sandwich board |
| Caribbean and jerk | restaurant (caribbean) | hand-painted fascia | gold, green, red | menu, OPEN | sandwich board, plastic chairs |
| fried chicken | restaurant (soul) | lit box | red, orange, yellow | menu, OPEN | sandwich board |
| halal grill | restaurant | lit box, green | green, gold, blue | HALAL FOOD, menu, OPEN | sandwich board, plastic chairs |
| bakery | deli | hand-painted fascia | wheat, brown, pink | FRESH BAKED, OPEN | sandwich board |
| coffee shop | deli | lit box | dark green, brown, navy | COFFEE, OPEN | sandwich board, plastic chairs |
| liquor store | liquor | lit box, neon border | black, wine, navy | OPEN, lotto, ATM | crates |
| bar | liquor | lit box, neon | black, oxblood | OPEN, no-loitering | plastic chairs |
| dollar store | generic | lit box, deep red | yellow, red | OPEN, camera | bag stack, sandwich board |
| pharmacy | pharmacy | lit box, green | green, blue | green cross, OPEN | sandwich board |
| laundromat | laundromat | lit box, navy | blue, teal | OPEN, no-loitering | row of washers behind glass, plastic chairs |
| barbershop | barber | lit box | black, red, blue | barber pole, OPEN | blade pole on a bracket |
| hair braiding | generic | hand-painted fascia | gold, red, green | OPEN, camera | plastic chairs |
| beauty supply | generic | lit box | plum, navy, gold | OPEN, camera | bag stack |
| nail salon | generic | lit box | pink, violet, teal | OPEN | flower buckets |
| phone repair | cellphone | lit box, navy | navy, violet, cyan | SCREENS decal, OPEN | sandwich board |
| check cashing | generic | lit box, deep green | yellow, green | CHECKS CASHED, ATM | none |
| hardware | generic | hand-painted fascia | red, navy, yellow | OPEN | crates, bag stack |
| auto repair | generic | hand-painted fascia | yellow, black | OPEN | crates |
| funeral home | generic | hand-painted fascia | charcoal, plum | none | flower buckets |
| storefront church | church | hand-painted fascia | purple | none | none |
| daycare | daycare | hand-painted fascia | pink, yellow, green, blue | none | none |
| smoke shop | generic | lit box, dark green | green, violet, black | OPEN, camera | none |

## How a shop gets its look
1. Store kind (frame, hours, tile) comes from the lot data as before. The trade is picked from the trades of that kind by weight, deterministically from the lot id; a hand-made POI keeps its own name and takes the trade of its archetype. A plain bodega, deli or liquor hint becomes the mix (grocery with fruit stand, bakery, coffee, bar) unless the shop is a POI.
2. Name and tagline: `shopIdentity(type, id, seed)` in `shopNames.ts`. About 2,500 to 40,000 names per type from parts lists (naming-habit adjectives, neighbourhood street names, invented first names, number-one habit, type words) plus 1 to 5 hand-written standouts per type (1 per cent of shops), 8 to 11 taglines per type in the game's voice.
3. The awning text is "NAME  ·  TAGLINE"; the lit box says the trade with badge words. The text is checked at build time against the art code (`classifyArchetype`, `cuisineOf`): a name or tagline that would turn a pizzeria into a barber is re-rolled.
4. The sign is a lit box (backlit, now sun-faded and grimed) or a hand-painted fascia (Anton, each letter a little off its line, brush streaks, a painted rule). Decals and dressing art live on the existing sticker sheet; dressing is merged boxes in the lot batch with materials the lot already uses.

## Names: how they were checked
- Real map: shops come from PLUTO land use, which carries no business type or name (`buildingsReal.ts` `pickKind` is a hash of the BBL). No business licence data is held in the repository, so no real name can come from there.
- Default map: the data holds 15 hand-made POI signs (kept) and, on the north import, `sign` strings written by earlier import scripts (for example BRIGHT STAR PIZZA & FALAFEL). Nobody checked those against real shops. They are now a hint for the trade only; the generator writes the sign. The Flushing Avenue warehouse names in `warehouse.ts` (not shops) are untouched and not checked.
- Tests (`tests/unit/world/shops-names.test.ts`): deterministic by id and seed; every type reads as its trade to the art code; at least 85 per cent distinct among 400 lots of a type; no whole-word match with a banned list of about 70 real chains and well-known New York businesses (the list lives only in the test); never equal to a street name held in the data. The test found one real collision on its first run (a "FAMILY DOLLAR-FIFTY PIZZERIA"): the word was removed from the lexicon.
- Not possible to prove: that a common-sounding generated name (for example "ROYAL MOON CHINESE KITCHEN") is not also the name of some real shop somewhere in New York. Names are built to be jokes on habits and are long and specific, but nothing here can search every business. The owner may want a spot check by eye.

## Sample names (40, as generated on the default map; the awning shows NAME then the tagline)
PIZZERIA: EVER QUINCY PIZZA & HEROES; YOLANDA'S BROOKLYN-STYLE PIZZA & PASTA. BODEGA: UPTOWN GROCERY; CORNER KING PUTNAM FOOD MART. DELI: LUCKY CLUB HERO SHOP & DELI; NO. 88 DELI & HEROES. CHINESE: LUCKY DRAGON CHINESE TAKE-OUT; ROYAL MOON CHINESE KITCHEN. CARIBBEAN: HONEST CLINTON ROTI SHOP; NOT-MY-UNCLE'S SPICE ISLAND KITCHEN. CHICKEN: HONEY HOT MIDWOOD CHICKEN & FISH. HALAL: SUNNY CORNER HALAL GRILL; RED-SAUCE FULTON KEBAB & GRILL. LIQUOR: UNITED LEWIS LIQUORS; QUINCY WINES. DOLLAR: MORE-FOR-LESS DOWNTOWN DOLLAR & UP; PLATINUM DISCOUNT STORE. PHARMACY: GOOD NEIGHBOR QUINCY RX PHARMACY; KENNY'S RX PHARMACY. LAUNDROMAT: PROFESSOR'S DOUBLE-LOAD WASH-O-MAT; MISS DEE'S WARM-DRY COIN LAUNDRY. BARBER: CLASSIC CLIPPER BARBERS; UPTOWN CUTZ. BRAIDING: TERRELL'S DEEP-ROOTS BRAIDS & WEAVES. BEAUTY: DOCTOR'S BEAUTY WORLD. NAILS: DIAMOND MADISON NAIL BAR; MYRTLE NAILS & SPA. PHONE: NO. 1 PHONE REPAIR; FONE FIXERS OF THE FUTURE. CASHING: UNITED CLINTON CHECK CASHING. HARDWARE: SUPER MYRTLE HARDWARE & PLUMBING. AUTO: SPARK AUTO CENTER. FUNERAL: PEACEFUL FUNERAL SERVICE. DAYCARE: EXTRA LEARNING ACADEMY. SMOKE: GRAND SMOKE & GIFTS. Hand-made POIs kept as they were: NOT-RAY'S PIZZA, TROOP DELI & GROCERY, GOLDEN LUCKY No. 1 KITCHEN, 99¢ & UP & UP & UP, GENTLY GOING FUNERAL HOME, and the rest of the 15.
Taglines (taken from the lexicon): "THE CAT RUNS THE REGISTER", "OVEN OLDER THAN THE BLOCK", "WALK-INS WELCOME, PATIENCE REQUIRED", "DRYER 4 IS FINE, DRYER 5 IS NOT", "INSPECTION, PROBABLY".

## What changed outside src/world/shops/
- `src/world/buildings/mixeduse.ts`: `resolveStorefront` (trade, name, colours, decals; data `sign` strings ignored except on POIs), `StorefrontSpec` new optional fields, `planStorefront` (decal set, fascia = unlit board), `signTile(.., style)`, sticker sheet tier scaling, one `addShopDressing` call at the end of `buildGroundFloor`. No frame geometry touched.
- `src/textures/painters/storefront-art.ts`: five archetypes (bakery, coffee, hardware, cash, smoke), three pictograms (bread, leaf, dollar), RULES for them, `salon` also matches BEAUTY/COSMETIC/LASH, twelve new decal slots, sticker sheet 512 x 896 (was 512 x 384). Two old pool names lost a COFFEE word that now classifies as a coffee shop.
- `src/textures/painters/signage.ts`: fonts (Barlow Condensed for boxes, vinyl and decals; Anton for metal awnings and fascias, system faces behind them), `signPainter(.., style)` with the fascia painter, `signWear` (sun-fade, grime, drips) on every sign, the new decals and dressing art.
- `src/ui/MapScreen.ts`: `placesFromLots` also lists corner shops of the default grid under their parody name.
- Tests: `tests/unit/world/shops-names.test.ts` (new); `storefront.test.ts` and `signage.test.ts` updated for the new trade copy and the `cash` archetype.

## Costs
- Draw calls: none added. Dressing uses the lot's own tile material, `m.metal` and the sticker sheet; a first version with four new flat colours broke `buildings.test` (39 meshes against 36) and was removed.
- Triangles: dressing is at most about 150 triangles per shop (12 per box), estimated from the code, under 5 per cent of a frame on the default map (frames show 330,000 to 470,000 on `q=low`, not a measured delta).
- Texture memory: the sticker sheet is 512 x 896 on medium and high (about 1.8 MB RGBA, was 0.8 MB) and is painted at half size on phone and low (256 x 448, about 0.46 MB, smaller than before). Sign sheets are untouched (768 x 384 on phone).
- Download: about 48 KB of new source (about 14 KB gzipped, estimate). The hosted bundle delta could not be measured against HEAD because earlier lane commits already contain part of this work.
- No real-map code in the single-file build: nothing in `src/world/shops/` imports roadnet.

## Sources
Nothing external. Names, parts lists and taglines are written for this game. Colours are the plain trade colours of New York shops, written from general knowledge. No photo, no open-data text and no image from any game or map service was used for signs; the 215 KartaView photos (CC BY-SA 4.0, `docs/CREDITS.md`, ENV14) were used by ENV14 only for wall colour, material class and awning colour per lot (`src/world/data/facade-observed.json`); they are not used here. Street View: not looked at, nothing taken from it.
