# Posting GTA Bed-Stuy: Instagram story, feed post, bio link

Status: current (checked 21 Nov 2026)

Placeholders: `@yourhandle` stands for your own Instagram handle. Nothing here invents one.

## Files

| File | Use |
|---|---|
| `docs/launch/export/story-1-announce.png` | Story 1: announcement (1080 x 1920) |
| `docs/launch/export/story-2-inside.png` | Story 2: a look inside |
| `docs/launch/export/story-3-source.png` | Story 3: made in the open (GitHub) |
| `docs/launch/export/post-square.png` | Feed post, 4:5 (1080 x 1350) |
| `public/links/index.html` | Link-in-bio page, live at https://gta-bedstuy.vercel.app/links/ once deployed |

The HTML sources are in `docs/launch/`; to re-export run `SWARM_SMALL=1 scripts/swarm-render.sh node docs/launch/export.cjs` with `NODE_PATH` set for Playwright and sharp.

## Posting the story (three frames, in this order)

1. Open Instagram, tap + then Story, pick `story-1-announce.png`.
2. Tap the sticker icon, choose **Link**. In the URL box paste `https://gta-bedstuy.vercel.app/`. Sticker text (custom text, if offered): `PLAY FREE`.
3. Drag the sticker into the empty dark band in the lower middle, just under the small "TAP THE LINK" arrow, above the printed address. Do not cover the printed address or the arrow.
4. Share. Repeat for `story-2-inside.png` (same link, sticker text `PLAY FREE`) and `story-3-source.png` (URL `https://github.com/CarlosFranzetti/GTA-Bedstuy`, sticker text `SEE THE SOURCE`).
5. Optional: add the story to a Highlight called "Play" so the link stays reachable.

The addresses printed in the images are for people who screenshot. Only the sticker is tappable.

## Bio

Bio line (fits in 150 characters):

> Open-world Bed-Stuy you can play in your browser. Free, no install. A fan tribute.

Bio link: `https://gta-bedstuy.vercel.app/links/`

That page has the two buttons (play, source), what the game is, and the fan-tribute line, and previews with a share picture when pasted into a chat.

## Feed post (`post-square.png`)

The feed does not make links tappable in captions, so every caption points to the bio link.

**Short**

> GTA Bed-Stuy is a free open-world game set in Bedford-Stuyvesant. It runs in your browser, on desktop and phone. Link in bio. A fan tribute. @yourhandle

**With a little story**

> I wanted to see my neighbourhood as a place you can walk around in, so I built it: brownstones, stoops, the elevated train, the avenues at dusk. It runs in a browser tab on a laptop or a phone, nothing to install, and the source code is open on GitHub. It is a fan tribute and not affiliated with Rockstar Games or Take-Two. Link in bio. @yourhandle

(Edit the first sentence if it is not true for you.)

**Plain**

> GTA Bed-Stuy: an open-world Bed-Stuy you can play in your browser. Free, no install, desktop and phone. Play and source code through the link in bio. A fan tribute, not affiliated with Rockstar Games or Take-Two.

## Hashtags (12)

`#BedStuy #BedfordStuyvesant #Brooklyn #BrooklynNYC #BrowserGame #IndieGame #IndieDev #GameDev #OpenWorld #threejs #WebGL #MadeInBrooklyn`

Keep it to these; do not add tags that name the publisher or the franchise it pays tribute to.

## Alt text

- **Story 1:** "GTA Bed-Stuy title in white and gold lettering over a dusk street in the game: brick buildings, a street lamp and a yellow centre line. Text: An open-world Bed-Stuy you can play in your browser. Free, no install, desktop and phone. gta-bedstuy.vercel.app."
- **Story 2:** "Three photo-print style game screenshots captioned Walk, Drive and The neighbourhood: people walking along a sidewalk, a car under the elevated train at night, and a row of stoops on a tree-lined street. gta-bedstuy.vercel.app."
- **Story 3:** "Made in the open. A fan-made tribute to the neighbourhood, with the source code on GitHub at github.com/CarlosFranzetti/GTA-Bedstuy. Play it free at gta-bedstuy.vercel.app."
- **Feed post:** "GTA Bed-Stuy title in white and gold lettering over a dusk street in the game. An open-world Bed-Stuy you can play in your browser. Free, no install, desktop and phone. gta-bedstuy.vercel.app."

## GitHub repository About box

Description (paste in the About field):

> GTA Bed-Stuy is a free, non-commercial, fan-made open-world game set in Bedford-Stuyvesant, Brooklyn. It runs in the browser on desktop and phone with nothing to install, and is built with TypeScript, Three.js and Vite. A fan tribute, not affiliated with Rockstar Games or Take-Two.

Website field: `https://gta-bedstuy.vercel.app/`. Topics: `threejs`, `webgl`, `browser-game`, `open-world`, `typescript`, `brooklyn`, `vite`.

## Checks before you post

- Open `https://gta-bedstuy.vercel.app/links/` on your phone once the deploy is live and tap both buttons.
- Paste the bio link into a chat to see the share picture (`public/links/share.jpg`) appear.
