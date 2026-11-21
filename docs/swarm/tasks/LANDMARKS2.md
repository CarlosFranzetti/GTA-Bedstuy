# LANDMARKS2: fifteen more real places, built to match open-licence photographs

Lane: LANDMARKS2, 21 Nov 2026 (night). Code: `src/world/landmarks/` (rows in `landmarks2.ts`, builders in `buildCivic2.ts` and `buildStreet2.ts`, shared parts in `parts.ts`). Tests: `tests/unit/world/landmarks.test.ts`, `landmarks-names.test.ts`. Harnesses: `scripts/landmarks-shots.{html,mjs}`, `scripts/landmarks-game.mjs`. Frames and reference photos: `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/landmarks2/`.

This file is a note for the studio. It names the real places on purpose. The game shows the invented names only; the real names live here and in the TEST list of `landmarks-names.test.ts`.

STATUS: in progress (this file is kept current while the lane works).

## Image rules used

- Photos looked at (Read tool) and measured from: only public domain, CC0, CC BY and CC BY-SA files (Wikimedia Commons file pages, US National Archives). The licence of each file page was read through the Commons API (field `LicenseShortName`) before the file was fetched.
- Nothing else was downloaded: no news photos, listings, Flickr all-rights-reserved, Street View or Maps.
- Written facts (designation reports, Wikipedia, MapPLUTO, Building Footprints) are used freely.
- No texture was cut from a photo in this lane: walls use the shared material library and are coloured by the wall tone; colours and proportions were read off the photos by eye and set in code (so nothing here is a CC BY-SA derivative).

## The fifteen

(filled in as each place is built: invented name, real identity, lot, photos looked at with licence, the recognisable features, matched or approximate)

