# RECORDS2: the dance crate at WAX DELI (lane RECORDS2)

Status: built and checked in a headless browser (21 Nov 2026). Lane RECORDS2, signed Ines Calloway. Not yet verified in the full game (only the lead edits `src/main.ts`).

Owner's ask (21 Nov, late): WAX DELI's real records are "dance records only and 1980-2025, under parody sleeves, each with a liner note giving the real
credits"; later the same day: "Do the open source tracks with parody covers. Add another 10 records from whatever era is post copyright, with spoof covers."
Result: 18 openly licensed dance tracks (2005 to 2018), ten public-domain 78s kept as "Pre-war dance floor", four streamed listening-post tracks, 8 synthesised dance loops.

## Sources tried (reachability tested 21 Nov 2026 from this box, plain GET, nothing worked round)

| source | answered? | what came of it |
|---|---|---|
| Internet Archive (advancedsearch, metadata, download) | yes | the only source of audio used. Netlabel items carry `licenseurl`; used as a lead, never alone where a second statement existed |
| Free Music Archive (listing by genre and licence, track pages, the file the player serves) | yes (it did not for the last lane) | track page shows licence, date and an "AI generated?" flag. The licence filter also lists BY-NC tracks (CODESCORN), and its listings only surfaced 2026 uploads, many flagged AI: nothing within 1980 to 2025 was cleared from it |
| ccMixter API (`/api/query`) | yes (JSON with licence) | file downloads still answer 403 to a plain request: not used, not worked round |
| Wikimedia Commons (search API) | yes, rate limited | hits are mostly uploader-claimed "type beat" and loop files; none cleared |
| SoundCloud (soundcloud.com pages, w.soundcloud.com) | yes | used for the listening post: user and track pages carry `verified`, `embeddable_by`, `release_date` |
| MusicBrainz web service | yes, 503 under load, retried | invented-name check: no hit for any of the 18 invented artists and 10 invented labels of this lane (exact-field query, score 85 or more; not exhaustive; the first lane's 27 and 14 names stay checked) |
| Discogs, Bandcamp | no (403) | not worked round |
| Label sites: toucanmusic.co.uk, tektek.org, Wayback Machine | no (do not answer through the proxy) | so no label-site cross-check for Toucan or TekTek |
| monofonicos.net | yes | see "Left out" |
| kompakt.fm | yes | links to soundcloud.com/kompakt: used for the listening post |

## The honest finding on the era
Openly licensed dance music from the 1980s and 1990s barely exists on these sources, and none was cleared: **0 tracks from the 1980s, 0 from the 1990s.** The crate is
2005 to 2018 (2005: 2 tracks, 2006: 5, 2008: 1, 2009: 3, 2010: 2, 2011: 3, 2018: 2). No year was relabelled. DnB, jungle, garage, Italo (one spacesynth/italo-disco track),
amapiano, Jersey club and footwork: nothing cleared, so no crate for them. The pure techno crate was dropped: the techno-tagged tracks measure 122 to 128 BPM (tech house, dub techno) and sit in "House & tech house".

## Licence check, per track
Tier A: the item's licence field and a second statement agree (the release notes name Creative Commons, or the audio file's own tag does).
Tier B: only the item's licence field, set by the label's own account when it uploaded the release, was reachable (label sites do not answer here). Tier B is weaker: the owner can drop the B rows by deleting them from `src/game/danceRecords.ts` and `scripts/records/crate.py`.
Tier A rows: Anaconda E.P. (Toucan: release text "free to download under a Creative Commons licence", file tag copyright Toucan Music, field CC BY 3.0) and Aquatone "Alpha Song" (field CC BY-SA 4.0, release text and file tag both say CC BY-SA 4.0).
Other checks done: file tags name the rights holder and label (Pasquale: Pascal Krucker, TekTek; Das Boogie: Waldemar Biller, TekTek; Toucan: Toucan Music), and each tag's tempo (125, 125, 130 BPM) agrees with the measured one.

## Left out, and why
- **Monofonicos (Medellin netlabel, 2011 to 2025, house and techno, ~45 releases):** the Internet Archive items say CC BY-SA 3.0 or 4.0, but the label's own site (monofonicos.net, every album page and the footer) says Creative Commons BY-NC-SA 4.0. A contradiction between the item and the label: all of it left out. This is the mislabel the brief warned about, found by the cross-check.
- **Aquatone "Mental Images" and "Synthetic Clouds":** item field says CC BY 4.0 but the release text says BY-SA 4.0. Contradiction: left out (Alpha Song's three statements agree).
- **Disco Romancin' tracks with sampled elements** ("Love & Mind - This Girl" remix, "The Man Rocks", "The Way That You Love Me"): the release notes say they contain elements of commercial songs. Left out. The three tracks kept have no such note. The label statement is "All releases are under the Creative Commons License" with no version: the version comes from the item field only (tier B).
- **J4ck Shark "Anthology '13: Real Disco" remixes** (Rita Lee, Claudja Barry): remixes of commercial songs.
- **Das Boogie "Muzique Vol. 1":** a 69-minute mix, content unknown.
- Digi Hartatak (DnB, CC BY 3.0): no release year on the item. KMDP (CC0): the title is not fit for the shop. dc-solar (Redmann "Solar Rush") and dc-workout (Disco Romancin' "Workout Machine"): cut after measuring (tempo ambiguous; clip too quiet).
- Free Music Archive tracks: see the table above.

## Tempo
`scripts/records/crate.py` now measures at a 1.27 ms hop (0.3 percent steps; the first lane's 10 ms hop gave steps of 2.5 BPM) and I re-checked each clip at 0.25 BPM steps. Folded halves and doubles checked against the file tags (three agree to 1 BPM) and the genre guide ranges
(house 118 to 128, electro 128 to 140, breaks 128 to 140, disco 112 to 140; a unit test holds them). Two breakbeat tracks have no single stable pulse (the estimator flips between x and 1.5x: Power Line 130 or 87, Cry Over You 90 or 135): marked **not beat-matched** with a guide tempo, so the decks say "free tempo". Nobody listened: nudge by ear. The clip starts at an arbitrary bar, so the beat grid may need the nudge buttons.

## Track table (18 clips, `public/records/dc-*.mp3`, 60 s stereo 56 kbit/s MP3 of about 410 kB; with the ten prewar clips 12 MB)

| id | sleeve (invented) | really | source | licence | crate, rarity, price | tempo |
|---|---|---|---|---|---|---|
| dc-anaconda | Stoop Surgeon: Bodega Python (Basement Mix) (Throop Basement Sound TBS 017) | Beat Doctor: Anaconda (original mix), 2010 | ia:tou269 | CC BY 3.0, tier A | electro, uncommon, $17 | 130 BPM |
| dc-itchy | Scratch Card Syndicate: Lotto Fever (Dub Cut) (Throop Basement Sound TBS 018) | Beat Doctor: Itchy And Scratchy, 2010 | ia:tou269 | CC BY 3.0, tier A | house, common, $13 | 123 BPM |
| dc-aerial | Antenna Mary: Rooftop Aerial (Antenna Mix) (Halsey Heights Recordings HHR 04) | Marc Burt & Beat Doctor: Aerial Photograph (Marc Burt mix), 2006 | ia:tou220 | CC BY-SA 2.5, tier B | electro, uncommon, $16 | 133 BPM |
| dc-house | Penny Pickle & the Stoop Kids: H.O.M.E. (Hip House Mix) (Corner Store Discs CSD 301) | Pasquale: H.O.U.S.E, 2006 | ia:tek07 | CC BY-SA 2.5, tier B | house, rare, $22 | 125 BPM |
| dc-sunshine | Pennyroyal Pete: Sunday Rent Come Back (Corner Store Discs CSD 302) | Pasquale: Sunshine Come Back, 2006 | ia:tek07 | CC BY-SA 2.5, tier B | house, common, $12 | 121 BPM |
| dc-iliketoknow | Lenox Lola: Who's At The Door (Corner Store Discs CSD 303) | Pasquale: I Like To Know, 2006 | ia:tek07 | CC BY-SA 2.5, tier B | house, common, $12 | 125 BPM |
| dc-caribbean | Kings Highway Collective: Carnival Vibes on Utica (Utica Avenue Tech UAT 03) | Das Boogie: Caribbean Vibes, 2005 | ia:tek03 | CC BY-SA 2.5, tier B | house, uncommon, $18 | 125 BPM |
| dc-cuba | Kings Highway Collective: Rum and Coke at the Corner (Utica Avenue Tech UAT 04) | Das Boogie: Cuba Libre, 2005 | ia:tek03 | CC BY-SA 2.5, tier B | house, common, $14 | 123 BPM |
| dc-lineoffly | Pigeon Control Unit: Flight Path (Rooftop Coop) (Dollar Van Dispatch Records DVD 10) | Battle Breaks: Line of Fly, 2009 | ia:Bo010-BattleBreaks-LineOfFlight | CC BY-SA 3.0, tier B | house, rare, $24 | 128 BPM |
| dc-lineofflight | Pigeon Control Unit: Flight Path (Dub Techno) (Dollar Van Dispatch Records DVD 11) | Battle Breaks: Line of Flight, 2009 | ia:Bo010-BattleBreaks-LineOfFlight | CC BY-SA 3.0, tier B | house, uncommon, $19 | 122 BPM |
| dc-powerline | The Blackout Brothers: Third Rail Breaks (Marcy Mixtapes MM 12) | Psychadelik Pedestrian: Power Line (original mix), 2006 | ia:tou227 | CC BY 2.5, tier B | breaks, uncommon, $17 | free tempo (guide 130) |
| dc-cry | Lemon Ice Lenny: Cry Over Cold Ice (Marcy Mixtapes MM 13) | Psychadelik Pedestrian: Cry Over You (original mix), 2009 | ia:tou258 | CC BY 2.0, tier B | breaks, rare, $21 | free tempo (guide 135) |
| dc-plasma | Sodium Vapor Kid: Streetlight Plasma (Afterhours Cut-Outs AHC 05) | Redmann: Plasma (original mix), 2008 | ia:tou252 | CC BY 3.0, tier B | electro, uncommon, $18 | 137 BPM |
| dc-aquadisco | Fire Hydrant Orchestra: Hydrant Disco (Italo Mix) (Gowanus Gold Records GGR 11) | Aquatone: Magic AquaDisco, 2018 | ia:aquatone-alpha-song | CC BY-SA 4.0, tier A | disco, rare, $24 | 137 BPM |
| dc-alphasong | Fire Hydrant Orchestra: Alternate Side Song (Gowanus Gold Records GGR 12) | Aquatone: Alpha Song, 2018 | ia:aquatone-alpha-song | CC BY-SA 4.0, tier A | disco, uncommon, $19 | 127 BPM |
| dc-run4 | Rosalind Rooftop: Run 4 Da Shade (Gold Stoop Boogie GSB 49) | Disco Romancin': Run 4 Da Sun, 2011 | ia:TDCDV003 | CC BY-SA 3.0, tier B | disco, uncommon, $18 | 120.3 BPM |
| dc-starburstz | Rosalind Rooftop: Streetlampz (Gold Stoop Boogie GSB 50) | Disco Romancin': Starburstz, 2011 | ia:TDCDV003 | CC BY-SA 3.0, tier B | disco, common, $14 | 120.5 BPM |
| dc-discodown | Mirrorball Marcy: Disco Downstairs (Gold Stoop Boogie GSB 43) | Disco Romancin': Disco Down, 2011 | ia:TDC043 | CC BY-SA 3.0, tier B | disco, common, $13 | 127 BPM |

## The ten kept 78s ("Pre-war dance floor", public domain in the US, details in RECORDS.md)
Kept for being dance records with the best-documented years, preferring the six the last lane found steady-beat: Four O'Clock Blues (1923, 125 BPM), Cake Walking Babies (1925, 118), Shake Your Feet (1923, 109), Charleston (1925, 100), Waitin' for the Evenin' Mail (1923, 137), I Wish I Could Shimmy Like My Sister Kate (1923, 131), plus Castle House Rag (1914, Victor 35372, recorded 10 Feb 1914), Livery Stable Blues (1917), Africa (fox trot, 1924, recorded 21 Jul 1924) and New Orleans Stomp (1923, Columbia 13003-D, recorded 16 Oct 1923). The other 18 are withdrawn (clips deleted, CREDITS rows removed, one-line note kept). `PD_LAST_YEAR` and the PD-US logic stay.

## Withdrawn records and old saves
A save keeps full record definitions, so an old save can hold a withdrawn record. `src/game/recordsWithdrawn.ts` lists them (18 archive refs and the synthesised wax-05, wax-06, wax-07, wax-10: jazz, dub and trap are not dance floor for this shop). On load (`Inventory` and `applySave`) they are removed and **the price paid (the price stored on the record) is refunded in cash, in full**. Nothing is substituted.

## Listening post (stream only)
Built with four tracks, all from Kompakt's own SoundCloud account. Checked 21 Nov 2026 for each: the account carries the verified badge (soundcloud.com/kompakt, 185k followers); kompakt.fm links to it; the track page says `embeddable_by: all`; the release date and ISRC show on the track page.
Kölsch "Liath" (2017-08-28), WhoMadeWho & Mano Le Tough "Oblivion" (2020-09-18), T.Raumschmiere "Wacker" (2017-03-03), Kollmorgen "Taciturn" (2022-03-18). None from 1980 to 1999.
Other accounts looked at: Strictly Rhythm (verified, but only 2 tracks), Ministry of Sound (verified, no tracks chosen), Defected and Ninja Tune (not verified: left out; the handle I first tried for Defected belonged to a stranger, which is why verification matters).
How it plays: a shop crate chip "Listening post"; Listen opens SoundCloud's own embedded player (an iframe at w.soundcloud.com, `autoplay`) under the parody sleeve, which shows the real artist and title; nothing is downloaded, cached, re-hosted or put on the decks. The radio collision is solved by pausing: the shop calls `post.onListen(true)` when a stream starts and `onListen(false)` when it stops or the shop closes; the host (main.ts) pauses and resumes the audio system. The owner can add tracks in `src/game/listeningPost.ts` (three checks written at the top of the file); with an empty list the shop says so. Not verified: that SoundCloud's player actually plays inside the shop in a real browser (the build box blocks it; the screenshot shows the iframe element only).

## Parody sleeves
Four new styles in `src/ui/sleeve.ts`, Anton and Barlow Condensed only: `twelve` (1980s 12-inch, black jacket with die-cut centre and label), `promo` (1990s white-label with a crooked rubber stamp), `picture` (2000s picture sleeve: skyline of stoops, title band, barcode), `minimal` (2010s digital cover). Dance tracks wear the era of their real release year (2005 to 2010: picture; 2011 and 2018: minimal); no real track is 1980s or 1990s, so the 12-inch and promo jackets are worn by synthesised originals (wax-04, wax-12 twelve; wax-08, wax-09 promo).

## Files
New: `src/game/danceRecords.ts`, `src/game/listeningPost.ts`, `src/game/recordsWithdrawn.ts`, `scripts/records2-harness.html`, `scripts/records2-harness.ts`, `scripts/records2-shots.mjs`, `public/records/dc-*.mp3`. Changed: `src/game/archiveRecords.ts`, `src/game/records.ts`, `src/game/Inventory.ts`, `src/ui/GameSave.ts`, `src/ui/ShopUi.ts`, `src/ui/LinerNote.ts`, `src/ui/sleeve.ts`, `src/ui/shop.css`, `scripts/records/crate.py`, tests, docs.

## Not verified
Nobody listened to any clip (decoded and measured only). The native (Electron, file://) build. SoundCloud playback. The year of each track beyond what the source shows. Tier B licences beyond the item field.
