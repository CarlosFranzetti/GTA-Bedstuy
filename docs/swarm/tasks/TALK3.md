# TALK3: more skits, the owner's new targets, a host on every station

Lane TALK3 (writer and producer: Nell Barrow), 27 Nov. Owner's ask of 26 to 27 Nov (MEMORY.md, top of "What the owner
wants"), plus his two notes on parody impressions relayed by the lead the same day.
Status: DONE for this round. Nothing here has been HEARD by anyone. Nothing was run in a browser.

## Files
- `scripts/dev/talk3/groupchat-bits.txt`, `scripts/dev/talk3/wbsy-shows.txt`: the writing, in a plain line format.
  `python3 scripts/dev/talk3/build.py` turns them into the two JSON files below. Edit the sources, not the JSON.
- `src/audio/talk/script-groupchat-bits.json`: 11 new Group Chat bits, 12 idents, 10 links.
- `src/audio/talk/rotation.ts`: cuts the old Group Chat script into its 22 bits and shuffles old plus new (`BitRotation`).
- `src/audio/voice/shows/extra-shows.json` and `extra.ts`: 9 new WBSY shows, 6 new ads, 10 station breaks, 4 new cast.
- `src/audio/announcer/stationHosts.ts` and `LiveHost.ts`: hosts for the six live stations and the two talk stations.
- `tests/unit/audio/talk3-content.test.ts`: 21 tests (the lint, the rotation, the hosts).

## Shared code touched (small, additive edits)
- `src/audio/talk/script.ts`: `TalkSegment.parodyOf?` and the parser passes it through.
- `src/audio/talk/TalkPlayer.ts`: `setScript(script, nextLoop?)`; at the end of a pass `nextLoop()` gives the next one
  (also while tuned away); caption gets " (PARODY)" on a parody line.
- `src/audio/voice/types.ts`: `ScriptLine.parodyOf?`. `src/audio/voice/cast.ts`: `registerShowCast`.
- `src/audio/voice/Scheduler.ts`: `Rotation.extend` (new items join the current bag at random places), `TalkSchedule`
  fourth argument `{ midStart }` and `addShows(shows, ads)`. `src/audio/voice/TalkStation.ts`: passes `midStart: true`.
- `src/audio/AudioSystem.ts`: loads WBSY's extras, and the Group Chat as a rotation (falls back to the old flat script).
- `src/audio/RadioDirector.ts`: a `liveHost` field, built next to the announcer; `tuneAway` beside each
  `announcer.tuneAway`; tune-in in `announcerTune`; `setPaused`, `update` (with a song-change check on the live title),
  `dispose`; `trackName` shows the host's name while they talk; `announcerLine` gives the live host's line.
- `src/main.ts`: not touched.

## The rotation
- Group Chat: one pass = every bit once (22 old, 11 new). The old morning opener stays first and the sign-off last; the
  rest shuffle. A station ident goes before every bit that does not open with its own jingle; a host link follows every
  second bit. A pass never opens (after the opener) with the bit that closed the last one. A first tune-in lands on a
  random line, so inside a bit (TalkPlayer's existing `midShow`). One pass is about 79 minutes by the estimate.
  Side effect: TALK2's running jokes that relied on order (the disclaimer that grows each reading, "Is Pat Real" as the
  payoff) now come in shuffled order. They still read as jokes; the growth is no longer strictly in order.
- WBSY: the extra shows join the existing shuffle bag (`Rotation`), so 16 shows play once each before any repeats, with
  one or two ads or station breaks between. The first tune-in starts part-way into a show (somewhere in its first three
  quarters); before, it always started on line one.

## Segments per station (forms)
Group Chat, new (2 to 4 minutes each, estimated at 2.6 words a second):
| id | form | title | about |
|---|---|---|---|
| gc-rockets | two-host argument | Rockets and Renames | 2.9 min |
| gc-bubbles | call-in, three callers | The Bubble War | 3.2 |
| gc-professor | fake expert interview | The Professor of Things That Are Going On | 2.9 |
| gc-desk | consumer-advice desk | Gloria Fenn, Your Money's Lawyer | 2.9 |
| gc-ads | ad break of three ads | Three Ads Nobody Paid For | 2.3 |
| gc-mail | listener mail | Letters to the Group Chat | 2.9 |
| gc-quiz | quiz | Billionaire or Bodega Cat | 2.8 |
| gc-field | field report | Bunny Castellano, Live From the Problem | 2.8 |
| gc-gens | two-host argument | Generations, Apps and the Family Chat | 3.0 |
| gc-tiny | news desk | Tiny News, Big Men | 2.3 |
| gc-director | interview with an impression | The Solemn Director Visits Bed-Stuy | 2.5 |
Plus TALK2's 22 old bits (morning show, call-ins, money desk, landmarks tour, advice clinic, scene reports, news, weather,
transit, sign-off).

WBSY Talk, new (2 to 4 minutes each by `lineSeconds`):
| id | form | host | title |
|---|---|---|---|
| wbsy-billionaire-hour | call-in, three callers | Buck Mercer | The Billionaire Hour |
| wbsy-phone-studies | fake expert interview | Lorraine Static, Dr. Penelope Thrum | Phone Studies |
| wbsy-defender | consumer desk | Marty Kessler | The Consumer Defender |
| wbsy-dear-lorraine | listener mail | Lorraine Static | Dear Lorraine, After Dark |
| wbsy-stoop-quiz | quiz | Buck Mercer | The Stoop Quiz |
| wbsy-field-desk | field report | Dana Okafor, Rico Valdez | Rico Valdez, Live |
| wbsy-tech-tuesday | two-host argument | Declan Frye, Juniper Vale | Pivot Hour |
| wbsy-world-briefly | news desk | Dana Okafor | The World, Briefly |
| wbsy-stoop-wisdom | interview with an impression | Lorraine Static, Vinnie Impressions | Stoop Wisdom |
Ads (played in the ad slots): Premium Moon, Open Door Locksmiths, Cable Family Reunion Kits, Patience Lessons with
Mister Oak, Phase Forty Recliners, Nerve Pass; and ten station breaks (an ident and a Buck Mercer link each).

New recurring invented characters: Professor Hollis Wexley (teaches in a laundromat, "not under oath"), Gloria Fenn
(not a lawyer, always on hold), Bunny Castellano ("live from the problem"), callers Kenji from Nostrand (Android, folding
phone), Brianna from Greene (19, Gen Z), Dale from Kosciuszko (Gen X, eleven-fan PC, the dog video uncle), Mister
Biscuit the bodega cat; on WBSY Marty Kessler, Dr. Penelope Thrum, Rico Valdez, Vinnie Impressions.
Running jokes: renaming things to X and the verified moon; Pat being good at checking; "not the real one, obviously";
the sunflower picture in the family WhatsApp; "say manager slowly, like a spell"; "be the stoop".

## Coverage (checked by the test, for EACH talk station)
| target | Group Chat | WBSY |
|---|---|---|
| Elon Musk | rockets, quiz | billionaire hour, Premium Moon ad |
| Vladimir Putin | quiz, tiny news | world briefly |
| Sam Altman | professor, quiz | billionaire hour |
| Kanye West (Ye) | quiz, tiny news | pivot hour |
| Charlie Sheen | quiz, tiny news | world briefly |
| Warren Buffett | ads, quiz | billionaire hour, stoop wisdom (impression), Mister Oak ad |
| Apple | professor, bubbles | phone studies, pivot hour, cable ad |
| Google | bubbles, professor | phone studies |
| OpenAI | professor | pivot hour, Open Door ad |
| Tesla | rockets | billionaire hour, pivot hour |
| Marvel | ads | pivot hour, world briefly, Phase Forty ad |
| vegans, hipsters | mail | dear lorraine |
| Gen Z, Gen X | bubbles, gens | stoop quiz, phone studies |
| men and women | mail, gens | dear lorraine |
| Instagram, Facebook, Twitter, WhatsApp | gens, bubbles, mail, rockets | stoop quiz, dear lorraine, billionaire hour |
| Macs vs PCs, iPhone vs Android | bubbles | phone studies |
| AI, stocks, crypto | professor, tiny news, old money and AI bits | billionaire hour, world briefly, stoop wisdom |
| Trump, Mamdani | tiny news, old bell bits | world briefly ("the president", "the mayor": style jokes only) |
| subway, landmarks, weather | field, tiny news, old bits | field desk, world briefly |
| dating | mail, old clinic | dear lorraine |
| techno, house, underground | tiny news, old scene bits | dear lorraine, stoop quiz |
| eight news themes (below) | desk, field | defender, field desk, Nerve Pass ad |

## The eight news topics (evergreen running themes, chosen without a web search)
I chose themes that have run for years and will still be true while the game is played, and wrote no figure, date or
event as fact: (1) rent, landlords and broker fees; (2) congestion pricing and the subway fare; (3) delivery apps and
e-bikes; (4) streaming price rises, ads and the password-sharing crackdown; (5) tipping screens; (6) airline fees;
(7) concert ticket fees and resale; (8) return to the office. Self-checkout came along as a ninth. No numbers for fares,
fees or prices appear as facts; the "hundred dollar ticket" and similar are a caller's example.

## Satire rules as applied
- Every speaker is invented. Real people and companies are talked ABOUT, by invented hosts and callers, for public
  conduct and persona as widely reported: renaming Twitter to X and the paid check, landing rockets, Mars, the Cybertruck,
  self-driving "next year"; the long tables and the shirtless horse photographs; the 2023 board firing and return within
  the week; the change of name to Ye, moving album dates, the 2020 run for president, sneaker resale prices; the sitcom
  reruns and the pay (the fame machine, never the person's troubles); the same Omaha house since the fifties, the
  fast-food breakfast, buy and hold. Exaggeration is absurd on its face (a verified moon, a table with its own weather).
- Nothing about anyone's health, addiction, mind, family, children, sexuality, religion or ethnicity; no quotation
  attributed to a real person (the test bans quotation marks in new content altogether); no real slogan.
- Groups: each side loses its turn (men and women both lose; vegans and barbecue people both told off; Gen X, Gen Z and
  millennials each mocked for their own habits; Android, iPhone, Mac and PC all teased).

## Parody impressions (the owner's note of 27 Nov, as the lead relayed it)
Owner: "You can make some impersonated characters based on real people with similar voices but nothing too serious;
parody only. Werner Herzog also, in an interview." Applied: each impression is performed by an invented station
impressionist; the speaker label is the performer, the data carries `parodyOf`; a host frames it as an impression,
"not the real one, obviously", in the first lines and in the last line; the performer's manner is written into the
lines and the voice is a system voice with a pitch and rate, nothing cloned or sampled. Every line is my own; nothing
quoted or closely paraphrased from any film, narration, interview or book, and no opinion, event or project is put on
the person. The lint checks the framing at both ends, no dates, no quotation marks, no reporting verbs, a performer label.
| performer (invented) | parodyOf | station, segment | manner | voice |
|---|---|---|---|---|
| Rudy Falco, impression | Werner Herzog | Group Chat, gc-director | grave, poetic voice-over about a pigeon, the bodega cat, alternate side parking, the dollar slice, scaffolding | caller3 slot (lowest caller pitch), parody character, introduced as such |
| Vinnie Impressions | Warren Buffett | WBSY, wbsy-stoop-wisdom | folksy plain-spoken investing talk applied to bodegas and the stoop | cast `vinnie`, Kokoro bm_george 0.94, fallback host 0.74 / 0.9, parody character, introduced as such |
Two of the allowed four or five; the rest of the figures are talked about, which was funnier in these bits.

## Hosts for every station
| station | kind | host | when they speak |
|---|---|---|---|
| bkhouse, hiphop, dublab, sc, flashback, boogie, yard, latin, weird | SoundCloud | existing nine (personas.ts) | unchanged: tune-in, between sets, DJ mentions, one-liners every 8 min |
| beat (181.FM The Beat) | live | Mo Clement (caller 0.88 / 1.0) | NEW: tune-in, then a link every 10 to 15 min on the timer |
| rnsoul (Soul & Funk Live) | live | Birdie Lowe (sidekick 1.12 / 0.94) | NEW: tune-in; links wait for a song change (the station counts as song-aware because its SomaFM source publishes now-playing; on the WFMU or 181 source the link comes at the 6 minute cap, about 16 to 21 min) |
| wfmu (WFMU Live) | live | Ambrose Fitch (host 0.8 / 0.9) | NEW: tune-in, timer |
| kexp (Indie & Rock Live) | live | Jess Varga (sidekick 1.0 / 1.06) | NEW: tune-in; links between songs on KEXP (now-playing), else timer |
| u80s (SomaFM Underground 80s) | live | Rick Marquee (announcer 0.95 / 1.14) | NEW: tune-in; links between songs on SomaFM, else timer |
| wnyc (WNYC 93.9) | live news | Harriet Moss (announcer 1.0 / 0.96) | NEW: tune-in line only, never over the news |
| talk (WBSY) | scripted | Buck Mercer (existing cast) | its shows; NEW station breaks between shows |
| groupchat | scripted | Odessa Pruitt (existing) | its bits; NEW idents and links between bits |
Each live host has 10 to 12 idents and 10 or 11 links. They are the game's own dial hosts and say so ("on the Bed-Stuy
dial"); none claims to be the real broadcaster's presenter. How it decides: `LiveHost` gets the tune-in from
`RadioDirector.announcerTune`; the timer is game time; "between songs" is read from the live station's now-playing title
changing (KEXP and SomaFM publish one; WFMU, 181.FM, Radio Paradise and KCRW do not in our code), with a 6 minute cap.
The link ducks the stream to 0.3.

## Station by station: what happens at tune-in (traced in code) and the URL check (27 Nov, through the session proxy)
Every SoundCloud station: the official widget loads a shuffled mix from `src/audio/sc/mixes.json` (or the account's
tracks), starting part-way in; if nothing loads the HUD says so, the director retries at 20 s and moves the dial on at
40 s (AUDIOFIX). All 47 station URLs and all 81 mix pages were fetched with a browser user agent.
| station | plays | URL status | fallback |
|---|---|---|---|
| Boiler Room | SC account `platform` + 9 mixes | 200 text/html | next mix, then dial moves on |
| Stoop Hip Hop Radio | 11 mixes + `uhhmradio` | 200 | same |
| 181.FM The Beat | live mp3 | 200 audio/mpeg | retry once, then dial moves on |
| Dekmantel Podcast | `dkmntl` + 5 mixes | 200 | as SC |
| Resident Advisor | RA NYC pool + `resident-advisor` + 7 mixes | SC 200; ra.co site 403 (bot wall, site link only) | as SC |
| Rinse FM | `rinsefm` + 10 mixes | 200 | as SC |
| Soulection | `soulection` + 10 mixes | 200 | as SC |
| Soul & Funk Live | pool: WFMU Rock'n'Soul, 181.FM Soul, SomaFM Seven Inch Soul | WFMU 200, 181 200, SomaFM 403 | SomaFM refuses this box (known since RADIO3); the pool moves to the next source on failure |
| SilverStarSound | account + 9 mixes | 200 | as SC |
| DJ RubyTunes Latin | account + 8 mixes | 200 | as SC |
| The Lot Radio | account + 10 mixes | 200 | as SC |
| WFMU Live | pool of three WFMU streams | all 200 audio/mpeg | next pool source |
| Indie & Rock Live | pool: KEXP, 181 Rock, Radio Paradise, KCRW | all 200 (KCRW site 429, stream 200) | next pool source |
| SomaFM Underground 80s | SomaFM mirrors then 181.FM Awesome 80s | SomaFM 403 here, 181 200 | falls to 181.FM (as designed) |
| WBSY Talk | SpeechSynthesis (or HD voices) | no network | no voices: the bed plays and the HUD says voice unavailable |
| The Group Chat 99.9 | SpeechSynthesis; hosted and native only | no network | single-file build: not on the dial |
| WNYC 93.9 | live mp3, two URLs | both 200 audio/mpeg | second URL, then dial moves on |
Nothing was found dead. The SomaFM 403 is this sandbox; whether SomaFM plays on players' machines is not checked here.
A status 200 on a SoundCloud page does not prove the widget plays that mix.

## Sizes
- Single-file build (`npx vite build`): 11,904,641 bytes before, 11,920,839 after (+16,198), 79,161 bytes left under
  12,000,000. All of the growth is the live hosts' lines (`stationHosts.ts`, in the main bundle so the single file's live
  stations get hosts too) and the small code. If the room is needed, those lines can be moved behind `VITE_HOSTED`.
- Hosted build: new chunks `script-groupchat-bits` 47.1 kB and `extra-shows` 33.7 kB, fetched on demand.

## Tests
`npx vitest run tests/unit/audio --maxWorkers=1`: 38 files, 655 tests green (634 before; the 21 new ones in
`talk3-content.test.ts`). `npx tsc --noEmit` clean. The old lints still apply to the old content unchanged (TALK2's
forbidden list and `voice-content` cover the bundled files only; the owner's new targets are allowed in the new files).

## Not done, not verified
- Nothing heard: the jokes' timing, the system voices on "A I", "Ye", "Cybertruck", "WhatsApp" and "Kosciuszko",
  the impressions' pitch, and how the live host sounds over a stream.
- Not run in a browser or in the game: the hosted chunks loading, the rotation in a real session, the live host ducking.
- WBSY's caption shows the performer's name on an impression line but not the word PARODY (TalkStation captions the
  cast name); the Group Chat's does.
- The HD voice pack is not baked for the new lines; with HD voices on they are synthesized live.
