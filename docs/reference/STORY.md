# AIR RIGHTS: story bible and playtest guide

Owner: STORY lane (Stage 12). Audience: the PLAYTEST agent, Fable, and any lane touching missions, phone, radio or posters.
Code: `src/game/story/**` (cast, flags, state, director, news, ambient signs), `src/game/missions/content/story/*` (the missions),
`src/game/missions/{types,MissionSystem}.ts` (the new objective kinds). Tests: `tests/unit/sim/story-missions.test.ts`,
`tests/unit/game/{story_lint,story_director,mission_story_kinds}.test.ts`, `tests/unit/ui/story-save.test.ts`.

## One-line pitch

You come home to a block that is being bought. A parody developer (**Parallax Living**) and its soft-spoken fixer
(**Lyle Hobbs**) are buying leases, air rights and loyalty. A record shop and a stoop community stand on one side; hustle,
loyalty and selling out are the three ways out.

Tone: GTA-style satire with real weight. The jokes punch at power (real-estate speak, wellness culture, police forms,
startup nonsense, the player's own bad decisions). The dark beats (eviction, debt, an overdose, a fire of suspicious origin,
a betrayal) are written plain: no gore, no cruelty for its own sake, no slurs, no real brands or people, nothing that
mocks a religion or an ethnicity. The villains are a company and a clipboard, not a people.

## The arc in three acts

**Act I: Welcome Back to the Block.** The paper goes up, the board votes, the records get moved, the first bill comes due.
Opens after Bodega Run (`bodega-run`). The pointer leads through the openers, then Act I, then the DJ chapters.

**Act II: The Vest Comes Out.** The block learns who is buying it and what they are using. Ends with the shutter on Wax Deli.

**Act III: Last Call on Throop.** The consequences land: Tay on the club-yard floor, the fire, the name that should not be on
the list, and a night where the whole block gets a vote. The finale needs the Aftersloth Residency (the DJ chain) done.

Through-line: *what is the block worth, and who gets to say.* Each fork asks the player the same question in a different
currency: money (Back Rent), friendship (Repo the Repo), honesty (Borough Hall Express), the whole block (Last Call).

## Characters (12 recurring + 2 voices)

Every one has a voice (pitch/rate for speech synthesis, `src/game/story/cast.ts`), a motive and a secret, revealed in the
mission named in `reveal`. Speaker tags in subtitles are the `name` field.

| Speaker | Who | Wants | Secret (revealed in) |
|---|---|---|---|
| Ms. Odette | Odette Brathwaite, 71, Barbados-born, owner of Wax Deli | one more winter for the shop | hid two years of lease notices in the jazz sleeves; owes far more than she says (`back-rent`) |
| DJ Sloth | Kwame Mensah, 64, Ghanaian-American, resident DJ at Aftersloth | keep the room alive and hand it on | deaf in one ear and going in the other; training Dee as his ears (`last-call-on-throop`) |
| Auntie G | Gloria Pettiford, 68, stoop captain, rent-stabilised since 1991 | nobody leaves, nobody says goodbye | binned the buyout letters addressed to her neighbours (`smoke-signals`) |
| Mr. Alvin | Alvin Greaves, 74, Jamaican-born, community board gadfly | to be the man who stopped it | signed away his air rights in March for his late wife's hospital bill (`borough-hall-express`) |
| Tay | Tavon Ellis, 30, your oldest friend | to stop owing people | informs for Hobbs; uses pills to stop feeling it (`repo-the-repo`) |
| Dee | Deandra Okafor-Bell, 17, Nigerian-American teen producer | to get paid before someone else does | the Parallax "Stoop" jingle is her beat, sold for $300 (`walk-dee-home`) |
| Mohammed | Mohammed Rahman, 52, Bangladeshi-born, Troop Deli | renew the lease quietly | fourteen months of back-room footage of Hobbs's crew at night (`smoke-signals`) |
| Doña Marisol | Marisol Vega, 58, Dominican, KOSCIUSZ-K-O-MAT laundromat | pay off the building loan | Hobbs holds her mortgage and uses her machines to move cash (`fleece-vest`) |
| Yossi | Yossi Adler, 33, Hasidic, property manager for his family's two small buildings | do right without his father finding out the cost | pays tenants' repairs from his own savings; leaked the shell-company chart (`crate-expectations`) |
| Sgt. Kowalski | Nadine Kowalski, 52, eleven days from her pension | reach the end of the month with no new problems | has been "losing" Hobbs's complaint paperwork; hands over the fire log (`smoke-signals`) |
| Hallie and Bryce | Hallie Moore and Bryce Lindqvist, 31 and 33, the Stillwater Collective wellness studio (one entry: a couple) | to belong without pushing anyone out | their "Community Partner" decal is a non-renewing Parallax contract (`open-house`) |
| Hobbs | Lyle Hobbs, 45, grew up three blocks away, Parallax's Community Liaison | to bring it down gently, because it is coming down | believes the buyouts are kinder than waiting for the building to fall down (`last-call-on-throop`) |
| Pryce | Declan Pryce, CEO of Parallax (voice and billboards only, one finale scene) | a frictionless block | has never been below 14th Street after dark |

Walk-ons already in the game keep their roles: Mrs. Okafor (Dee's grandmother), Big Lou, Ms. Pearl, Lorraine, Tiana.
A speaker that is not in `cast.ts` or `EXTRA_SPEAKERS` fails the content lint.

## Missions (13 core + 1 gated)

All are `act`-tagged `MissionDef`s built by `buildMissions` (order: openers, Act I, DJ chain, Acts II and III, BIBLE concepts,
side jobs). Each has a phone intro, follow-up texts (some by branch), a fail joke, at least three dialogue lines, and a
retry that starts the whole mission again. "Needs F" means the ring only offers the start; press F.

| # | Id | Title | Hours | Needs | Mechanics | Fails |
|---|---|---|---|---|---|---|
| 1 | `notice-of-intent` | Notice of Intent | any | bodega-run | **photo-style spots** (peel 4 notices, F each) on a 130 s clock, deliver, talk | timeUp |
| 2 | `public-comment` | Three Minutes of Public Comment | 13 to 17 (deadline 19) | 1 | cab (soft gate), **petition spots**, **race** a rival car through ordered checkpoints, speak | clockUp, lostRace |
| 3 | `handle-with-care` | Handle With Care | any | 2 | cargo van (soft gate), **fragile cargo with a damage meter** (HUD shows `Test pressings 82%`), speed cap | cargoBroken, timeUp, tooFast |
| 4 | `back-rent` | Back Rent | any | 3 | talk, **shop errand with money** (pay $40), **FORK A**, branch beats | timeUp |
| 5 | `fleece-vest` | Follow the Fleece Vest | 9 to 20 | 4 | **stealth tail** (stay 15 to 50 m back), photograph the handoff, quiet getaway | spotted, lostTarget, leftVehicle |
| 6 | `open-house` | Open House, Closed Door | 10 to 22 | 5 | **stakeout** with a timer and event beats, **photos** of visitors, talk | blownCover, copsCalled |
| 7 | `walk-dee-home` | Walk Dee Home | 20 to 3 | 6 | **on-foot escort** (she waits if you drop back, fails if you abandon her), banter, hand-off | lostTarget, copsCalled |
| 8 | `repo-the-repo` | Repo the Repo | any | 7, laundromat-getaway | sneak, **hotwire**, **repo + getaway** (lose the heat), **FORK B** | copsCalled, leftVehicle |
| 9 | `crate-expectations` | Crate Expectations | 8 to 15 | 8 | **box truck**, **crate collection**, speed cap, **cutscene beat** (the shutter), Hobbs beat if you took his money | timeUp, tooFast |
| 10 | `night-of-the-narcan` | Four Minutes | 19 to 5 | 9 | **timed emergency**: fetch the kit, drive, two-step first aid, hold still for the ambulance | timeUp (sober copy, no joke) |
| 11 | `smoke-signals` | Smoke Signals | 0 to 6 | 10 | **fire evacuation** (ordered doors on a clock), **cat rescue**, **chase on foot** with stumbles, statement to Sgt. Kowalski | timeUp |
| 12 | `borough-hall-express` | Borough Hall Express | 5 to 7 (deadline 9:30) | 11 | **bus** (soft gate), **fragile passengers**, collect 4 stops, **FORK C**, deadline clock | cargoBroken, clockUp |
| 13 | `last-call-on-throop` | Last Call on Throop | 20 to 4 | 12, aftersloth-residency | cutscene, **DJ set**, **FORK D (the ending)**, per-ending coda | lowScore, copsCalled |
| 14 | `last-stop-north` | Last Stop: Model Unit | 9 to 21 | 7 | **gated on the el**: ride up, photograph the model, **stakeout** among the tour group, ride home | blownCover, copsCalled |

Mission 14 exists only when the world has el stations (`detectStoryFeatures`, see below). Nothing else depends on it.

## Branches (4 forks, 11 flags)

A fork is a pair of rings in the world (not a menu): walk into the one you want and press F. The flag is saved.

| Fork id | In | Options (flag) | What it changes later |
|---|---|---|---|
| `back-rent` (A) | Back Rent | Hobbs's envelope, +$1000 (`odette.fixerCash`); or pay $150 from your own crate (`odette.paid`) | Odette's scene; Hobbs or Odette texts you; `crate-expectations` adds a Hobbs beat; the **landlord ending is only offered if you took the envelope**; the closing news and the shutter sign differ |
| `repo-fork` (B) | Repo the Repo | give Gladys back (`tay.returned`); or sell her to the Parallax yard, +$500 (`tay.sold`) | Tay's scene in `night-of-the-narcan` (two different `talkTo`s); the follow-up text (Tay or Hobbs) |
| `alvin-fork` (C) | Borough Hall Express | say it at the press line (`alvin.exposed`); or park in the loading bay and let him testify first (`alvin.spared`) | Mr. Alvin's closing scene; his follow-up text |
| `ending` (D) | Last Call on Throop | hijack the billboard (`ending.trust`); take Pryce's buyout, +$2500 (`ending.buyout`); buy the building with Hobbs's money (`ending.landlord`, needs `odette.fixerCash`) | the whole coda (a different objective chain per ending), the epilogue texts, the closing news bulletin, the signs on the block |

Other flags: `story.act1/2/3`, `story.done`, `odette.evicted`, `auntie.burned`, `tay.revived`, `evidence.footage`,
`evidence.fireLog`, `evidence.northDeed`, `dee.beatKnown`. The table lives in `src/game/story/flags.ts`.
`StoryState.alignment` counts how many choices lean hustle / loyalty / sellout.

## Delivery systems

- **Subtitles.** `ObjectiveBase.say` lines (`{ who, text, at? }`) play in order on the objective; `MissionHud` shows
  `Speaker  line` in the bottom bar, held `max(2.8 s, 0.055 s per char + 1.2)`. The `mission:subtitle` event feeds speech
  synthesis (`StoryDirector` option `speak`, with the cast voice).
- **Cutscene-lite.** `ObjectiveBase.beat: { letterbox: seconds }` emits `mission:beat`; Fable wires it to `cam.setLetterbox(true, s)`.
- **Phone.** Intro texts, `followUps` by branch (`ifFlag` / `unlessFlag`), and a **Mission Log** contact that adds one line per
  finished chapter (the in-game mission log). `StoryDirector.log()` returns the same as data (title, act, status, choice).
- **Radio.** `StoryDirector.broadcast()` returns `{ bulletins, ads }` for `audio.setBroadcast`. The announcers read a
  fresh bulletin 45 s after it unlocks and may swap a one-liner for an ad (30%). Bulletins react to missions and to branch
  flags; ads get more ominous per act. Copy lives in `src/game/story/news.ts`.
- **Ambient signs.** `AmbientNotices` (flag-driven posters, eviction notices, billboards, scorch boards, land-trust or
  Stoopable signs). Sits on the lot frontage line; PLAYTEST should check that none float or clip.
- **Damage meter.** `MissionDef.fragile` plus `cargo: true` objectives; the HUD carry line shows the percentage; impacts
  from the player's vehicle are forwarded as `{ type: 'impact', strength }`.

## New objective kinds (`src/game/missions/types.ts`)

`spots` (F at each point: photos, flyers, notices, doors), `pay` (spend cash with F), `fork` (choice rings), `chase` (runner
with stumbles), `race` (checkpoints versus a rival), `stakeout` (time in a circle with slack and events). Tail gained
`minDistance` (stealth) and `waitDistance` (escort). Every objective gained `say`, `beat`, `when` (branch gate), `vehicle`
(type gate, soft) and `cargo`. Mission gained `act`, `requiresFlags`, `forbidFlags`, `fragile`, `followUps`.

**Soft vehicle gates.** `vehicle: ['bus']` waits for that type for 45 s of the objective, then any vehicle will do ("Fine.
Any wheels will do."). If the host does not report the type, the gate is waived. Nobody is stuck because the bus never comes.

## Feature detection (WBURG: northern extension and el)

`detectStoryFeatures(grid, data)` reads `data.transit.stations` (an array of `{ id, x, z }`, at least two). `home` = the
station nearest the origin, `north` = the northernmost. With fewer than two stations the north mission is not built and
nothing else changes (tested). To override, call `buildMissions(grid, data, lots, { el: { home, north } })`.

## Save and load

`GameSave` is now **v3**: a `story` field (`StoryState.serialize()`: flags, fork choices, heard news). v2 saves migrate
unchanged (story absent, setFlags of completed missions are re-derived). `MissionSystem.serialize()` also embeds the
story block when it is not empty, so the standalone mission key restores branches too. Malformed story blocks are
dropped without losing the save. Slot keys keep the `save.v2.` prefix so nothing is orphaned.

## Playtest checklist (what a human or the PLAYTEST agent should verify in the real game)

1. Start a new game, finish Bodega Run, find Auntie G's ring (the pointer should say Notice of Intent). Peel four notices;
   the `NOTICE OF INTENT` signs on the doors vanish once the mission is done.
2. Public Comment: the cab gate (find a cab, or wait a minute), the race rival marker moves along the loop, the 7 pm clock.
3. Handle With Care: bump a parked car; the HUD should read `Test pressings NN%`. Check that an `impact` reaches
   `missions.notify` (FOR FABLE wiring), otherwise the meter never moves.
4. Back Rent: both fork rings are reachable on foot; the prompt shows the option label; after the fork the right scene follows.
5. Fleece Vest: the stealth tail needs the target marker visible; stay between 15 and 50 m (the minimap blip helps).
6. Open House: the stakeout circle is a street centreline; sit in a car or stand. Leaving for more than 8 s total fails it.
7. Walk Dee Home: walk speed is 3 m/s, run 6.5; she moves at 2.2 and waits when you are 9 m behind.
8. Repo the Repo: hotwire (3 F presses), one star, lose it, then the fork (in a vehicle).
9. Crate Expectations: the box truck gate, six crate rings, drive under 70 km/h; the letterbox at the shutter.
10. Four Minutes: kit, drive, two presses, eight presses, hold still. The tone is deliberately plain.
11. Smoke Signals: ordered doors, the cat, the chase (stumbles help), Kowalski's forms.
12. Borough Hall Express: bus gate, four stops, passengers meter, the Alvin fork rings at the hall.
13. Last Call: DJ set at the club, three fork rings (landlord only if you took the envelope), the coda per ending.
14. Radio: finish a mission, tune a music station, and within about a minute hear the bulletin. Listen for ads.
15. Phone: texts arrive with the right branch text; a "Mission Log" thread lists chapters.
16. Save in the middle of Act II after a fork, reload, finish: the branch scenes still follow your choice.

## Content rules (enforced by `story_lint.test.ts`)

No real brands, institutions or people (deny-list); no slurs, gore or sexual violence; every speaker is in the cast;
subtitle lines at most 150 characters (talk lines 220, phone texts 300); every mission has an intro text, a follow-up, a fail
joke for a rule it can actually break, and at least three dialogue lines; every cast member has a voice, motive and secret, and
a mission that reveals it; flags used in content are all declared in `flags.ts`.
