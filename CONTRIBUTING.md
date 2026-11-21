# Contributing

Status: current (checked 21 Nov 2026)

GTA Bed-Stuy is a free fan tribute made by one owner and a team of AI agents. This page is for anyone, human or agent,
who is about to change something. The standing rules are in [MEMORY.md](MEMORY.md); lane work also follows
[docs/swarm/RULES.md](docs/swarm/RULES.md).

## Set up

You need Node 20.19 or newer (`engines` in `package.json`; CI uses Node 22).

```
npm install
npm run dev          # dev server
npm run typecheck    # npx tsc --noEmit: must show no errors under src/
```

## Rules that cannot be bent

1. No assets, fonts, logos, sounds, animations or traced art from GTA, Rockstar or any other game. They are style
   references only. No lookalike fonts.
2. No Google Maps or Street View data or imagery. Map data is NYC Open Data. Photos only from open sources.
3. Third-party assets must be CC0, or CC-BY or CC-BY-SA with credit, and each one is recorded in
   [docs/CREDITS.md](docs/CREDITS.md) before it lands. MakeHuman data is CC0, its AGPL code must not be used. The eSpeak NG
   phonemizer (GPL-3.0) is fetched from a CDN at run time and never vendored.
4. Real places appear under invented names. Shops, brands and liveries are parodies. Real DJ and artist names appear only
   for real public radio streams. No lettering, logos or numbers on clothes.
5. No blood or gore; nobody dies on screen.
6. The owner's email is private and never goes to an outside service; prompts to outside services never carry the
   project's or the owner's name.
7. No AI model names in commits, code or docs.
8. Only the project lead edits `src/main.ts`. Never `git stash`. Keep `src/` compiling.
9. Say what you verified and what you did not. Never report frames per second measured on a software renderer; report
   triangles and draw calls from `renderer.info`.

## Tests and builds

- Run only the tests for what you touched, one folder at a time; the whole suite at once is heavy:
  `npx vitest run tests/unit/entities --maxWorkers=1`. Add or update tests for what you change.
- Hosted build (what Vercel runs): `VITE_HOSTED=1 npx vite build`, or `npm run build:hosted` for `dist-hosted/`.
- Single-file build: `npm run build` (one HTML file, budget 12 MB). Say your byte change if you add data.
- Desktop apps: `docs/NATIVE.md`.
- Headless browser jobs: the full game page must hide its canvas or the page is killed for memory. The recipe and the
  standard check scripts are in `docs/swarm/RULES.md` and `MEMORY.md`, "Builds and checks".

## How a change is released

Vercel builds every push to `master` and puts it on https://gta-bedstuy.vercel.app, unless the commit message contains
"work in progress" or "[skip deploy]", or starts with "WIP" (`ignoreCommand` in `vercel.json`).

- Unfinished or unchecked work: commit with a message such as "Lanes' work in progress". It is not deployed.
- Work the lead has checked in the running game (type check, scoped tests, a hosted build, a boot check on desktop and on an
  emulated phone, a look at real frames): commit with a plain description. It goes live.
- A push to another branch makes a preview deployment, which can be promoted from the Vercel side.
- Commits end with the attribution lines the session gives. Releases that went live are listed in [CHANGELOG.md](CHANGELOG.md).

## Where to ask

- Owner: Carlos Franzetti, through the project lead (Fable Hart) in the studio session.
- Questions inside the studio: post to `docs/swarm/transcript.md` with `scripts/swarm-say.sh "Name (LANE)" "<message>"`.
- Bugs and ideas: open an issue at https://github.com/CarlosFranzetti/GTA-Bedstuy.
- Who is who: [docs/swarm/ORG.md](docs/swarm/ORG.md). What is true today: [docs/README.md](docs/README.md).
