# CARS6: car body shapes after real vehicles (22 Nov 2026, lane CARS6, Odile Brandt)

Status: sedan family, pickup, both SUVs and the hatch done and looked at; coupe, muscle, wagon, vans NOT reshaped (see the end). Owner, 22 Nov: "the car geometry feels off: let's model them on real world vehicles." CARS5 fixed
sizes and contact shadow; this lane changes only the SHAPES. Specs in `Vehicle.ts` untouched; every type keeps its CARS5 length, width, height.

## How a body is defined (what I found in carBodies.ts)
A passenger body is a loft of rings (`buildLoft`, ring = `carHalf`: roof centre, glass, belt crease at slot 6, flank, sill). Per style:
`secs` [u, yT (centre-line height: hood, roof, deck), belt height, roof half-width share], `plan` (half-width by u), `windshield`,
`doorGlass`, `rearGlass`, `hoodBack`, `axle`, `sill`, ends rounded by `endF`/`endR` with a tip width of 0.6 of the body. So the SIDE SILHOUETTE
is exactly the `yT` curve, and the nose and tail are the same quarter-round wedge on every class. Vault (`vault.ts topProfile`) reads `secs`,
`dims`, `Lref/Href`, `windshield`, `rearGlass`: kept meaningful. Skin layout reads `secs`, `hoodBack`, `rearGlass`. LOD `lite` is the same profile at refine 1
(no pop in silhouette by construction). Look-at tool: `scripts/carlineup.html` gained `q3` (front three-quarter) and `r3` (rear three-quarter) views.

## What the loft could not express (and what I added)
Seven small additions to the style profile / loft (all optional fields, default = old behaviour, so the 20 styles I did not touch are unchanged):
* `endW: [front, rear]`: tip width of nose and tail as a share of the body (was a fixed 0.6, a pointed plan on every class). Trucks and SUVs 0.84 to 0.9, old sedan 0.8, family sedan 0.72.
* `archSq`: squared wheel arch (a superellipse, exponent 2 to 4.4) through `archOf`, `archY`, `archStations`; the SUVs 0.55, the pickup 0.75.
* `bumperBeam: [height, depth]`: a separate beam (rounded, bevelled, `bumperGeo`) 3.5 cm proud of nose and tail, dark with a bright top strip (chrome on `chromeBumper` bodies). The loft stops 4 cm short of L / 2, so the length is unchanged.
* `axleShift`: both axles move toward the nose, the wheelbase stays: real overhangs are not symmetric (rear overhang 1.2 to 1.4 m on pickups and big SUVs, 0.1 on sedans). The skin layout reads it.
* `tuck`: how far the glass base sits inside the body side at the belt (shoulder / tumblehome, was a fixed 0.08).
* `cabGap`: pickup only: body-colour cab back wall above the bed rail (the bed front was an open hole above the rail) and a dark gap line down the flank.
* The pickup bed rail, tailgate top and the cab belt are now three different heights (they were one slab height).
What was NOT a loft limit but a data fault: the silhouette is the `yT` column of `secs`, so most of the work is new `secs`, `plan` and glass ranges written in real metres (`Lref = L`, `Href = H`, kx = ky = 1).

## Reference numbers (estimates from memory of published figures and of open photos; NOT measured from images in this session)
Shares are of overall length L from the front unless said. Heights are shares of overall height H. "WB" wheelbase.
| class (example for the numbers) | L x H (m) | WB / L | hood | cabin (cowl to deck) | deck | front / rear overhang | windscreen / backlight rake from horizontal | belt / H | wheel dia / H |
|---|---|---|---|---|---|---|---|---|---|
| mid-size sedan (2018 mid-size front-drive) | 4.88 x 1.45 | 0.58 | 0.24 | 0.55 | 0.21 | 0.20 / 0.22 | 28 / 23 deg | 0.68 | 0.47 |
| old full-size three-box (2003 body-on-frame) | 5.38 x 1.44 | 0.54 | 0.27 | 0.46 | 0.27 | 0.19 / 0.27 | 34 / 36 deg | 0.69 | 0.47 |
| full-size pickup, crew cab (2021) | 5.9 x 1.96 | 0.63 | 0.25 | cab 0.36, bed 0.29 | | 0.15 / 0.22 | 32 deg, rear glass upright | cab 0.74, bed rail 0.62 | 0.40 |
| mid-size 3-row SUV (2020) | 5.0 x 1.78 | 0.60 | 0.21 | 0.67 | tail upright | 0.20 / 0.20 | 30 deg, tail 80 deg | 0.68 | 0.43 |
| big SUV (2022) | 5.35 x 1.92 | 0.57 | 0.22 | 0.66 | upright | 0.19 / 0.24 | 32 deg, tail 85 deg | 0.66 | 0.42 |
| subcompact hatch (2016) | 4.06 x 1.52 | 0.62 | 0.20 | 0.64 | 0.16 (tailgate) | 0.17 / 0.21 | 30 deg, tailgate 70 deg | 0.65 | 0.40 |
(Further rows are added per class as it is built.)

## Per class
(filled in as each class lands)
