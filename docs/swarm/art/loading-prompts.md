# Loading posters: prompts

Six original graphic-novel style posters for the loading screen. Status on 18 Nov: NOT made yet. The free image services
reachable from the build box refuse without a Hugging Face token, and a keyless service tried on 18 Nov gave weak pictures
with its own watermark, so it was not used.

How to add them: make each picture at 16:9, at least 1600 px wide, save it as WebP under `public/art/loading/` with the
file name given below, about 350 kB or less. The loading screen (src/render/Loading.ts) shows posters as soon as one exists
and falls back to the in-engine shots until then. Record the tool, model and licence in docs/CREDITS.md.

Rules for any generator: no game, studio, artist or brand names in the prompt; original characters only; no lettering or
logos in the art; do not send the project's or the owner's name to the service.

## Shared style (append to every prompt)

Original graphic-novel poster illustration, bold confident black brush-ink outlines of varying weight, flat cel-shaded colour with hard-edged shadow shapes, screen-print poster look, limited punchy palette of about five colours, simplified graphic background with strong silhouettes, stylised caricature with exaggerated but handsome proportions, three-quarter figure posed in the foreground with attitude, dynamic composition, widescreen poster, no photorealism, no soft gradients on the figure.

## Negative prompt

text, letters, words, logo, watermark, signature, photo, photorealistic, 3D render, CGI, blurry, soft gradients, extra fingers, deformed hands, low resolution

## The six pictures

### `public/art/loading/poster-taxi.webp`

A woman in her thirties with long braids and a bomber jacket leans confidently on the hood of a boxy yellow taxi, arms crossed, knowing smile. Behind her brownstone stoops and an elevated train on a steel viaduct, sunset sky in orange and purple flat bands.

### `public/art/loading/poster-grocer.webp`

A heavyset older man in a flat cap and cardigan stands proudly outside a corner grocery with a striped awning, crates of fruit stacked beside him, a ginger cat sitting on the step. Warm morning light, long hard-edged shadows.

### `public/art/loading/poster-rider.webp`

A young delivery rider in a helmet with a big insulated backpack on an electric bike, leaning mid-turn, speed lines. Steel columns of an elevated railway overhead, night, wet street with neon reflections in magenta and cyan flat shapes.

### `public/art/loading/poster-dj.webp`

A radio DJ wearing big headphones behind a mixing desk and two turntables in a cramped studio, one hand on a record, grinning. Stacked vinyl crates, a window behind showing rooftop water towers and the dusk skyline.

### `public/art/loading/poster-stoop.webp`

Two friends sitting on a brownstone stoop, one holding a basketball under his arm, the other laughing with a paper cup. An open fire hydrant sprays water across the street behind them, summer afternoon, bright sun, hard shadows.

### `public/art/loading/poster-detective.webp`

A tired plain-clothes detective in a rumpled trench coat leans beside an unmarked dark sedan holding a paper coffee cup, weary half-lidded eyes. Steam rises from a street manhole, rain, rainy blue hour in deep blues with one warm window glow.
