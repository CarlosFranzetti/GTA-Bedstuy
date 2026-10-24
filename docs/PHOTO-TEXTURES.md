# Your own Bed-Stuy textures

The fastest way to make the city look like *the actual block* is to photograph its surfaces and
let the game use them. Nothing is ripped from any game or map service; these are your photos.

## Shooting list (phone is fine)

Shoot square-on to the surface, in flat light (overcast or in shade, no direct sun), no flash,
about 1 m away for masonry and 0.6 m for ground. Fill the frame with the material only.

| file name | what to shoot | notes |
|---|---|---|
| `brownstone.jpg` | a brownstone facade, between windows | include a few course joints |
| `limestone.jpg` | a limestone/pale stone facade | |
| `brickRed.0.jpg` | red brick | `brickRed.1.jpg` brown brick, `.2` painted white, `.3` painted grey |
| `brickPainted.0.jpg` | painted brick (white) | `.1` grey |
| `sidewalk.jpg` → name it `concrete.0.jpg` | sidewalk slab, including one joint | |
| `concrete.1.jpg` | backyard concrete / paving | |
| `asphalt.0.jpg` | road surface | `asphalt.1.jpg` worn/patched asphalt |
| `roof.jpg` | tar roof (if you can see one) | |
| `rollGate.0.jpg` | a closed bodega gate | `.1` `.2` tagged variants |
| `cornice.jpg` | cornice/bracket detail | optional |

Variant numbers follow the game's material variants; `.0` can be left off.

## Convert

```
python3 scripts/photo-to-pbr.py photos/
```

For each photo this writes `src/assets/textures/user/<key>.<variant>_{color,normal,rough}.jpg`:
cropped square, lighting gradient removed, made tileable (offset + feathered seam blend),
a normal map derived from the fine detail (dark = recessed, which is right for mortar and
joints; pass `--invert` for surfaces where bright is recessed), and a roughness estimate.
Tune `--strength` (normal depth), `--feather`, `--rough`.

Then `npm run build` (or `npm run artifact`): the game picks up every file in that folder
automatically and uses it instead of the built-in texture for that key/variant.

Keep an eye on size: each set is roughly 0.4 MB and the single-file artifact must stay
under 16 MB.
