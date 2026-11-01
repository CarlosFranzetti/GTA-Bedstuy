# GTA Bed-Stuy Design Bible

Owner: BIBLE lane (Stage 3). Audience: every lane, plus the MGR reviewing them. Status: living document, written 2026-11-01.

**What this is.** A set of design targets drawn from analysis of GTA 5, to review lane work against. It is **design analysis only**. Nothing here is copied from GTA: no assets, text, music, logos, names, or extracted game values (PRD §2.1). Every numeric target below is *ours*, tuned by eye; where a public source gives a GTA figure it is cited, and where it does not we say so.

**How claims are marked.**
- `[S#]` is a cited source; full URLs are in the Sources table at the end.
- `[mem]` is the author's unverified memory of the game. Check it against your own play before relying on it.
- `[tune]` is a target we chose for this game. It is not a claim about GTA.
- *Source quality caveat.* Fetching pages directly was blocked in this session, so every `[S#]` claim comes from search-result excerpts of fan wikis, mod changelogs, Wikipedia and a few developer talks, not from a full read. Most GTA internals (camera distances, on-foot input curves, density tables) have **no public primary source**. Where that is the case we say so and give a range to be tuned.

---

## 0. The yardstick: would someone want to live here for a day?

The user's direction, in full: *"Use GTA 5 as your bible: the views, the mechanics, the beautiful graphics, the funny missions, the open world of it and the soundtrack, for some nights and days in Bed-Stuy — want to do them justice **because they were the first to make a world people would live in for days at a time**."*

So the test for every lane is not "does it look like GTA" but **"would someone want to live in this Bed-Stuy for a day?"** A place worth staying in has five properties. Each section below is framed around one or more of them, and the gap list in §8 is ranked by them.

| # | Property | What it means here |
|---|---|---|
| L1 | **It keeps moving without you** | Cars, people, weather and the clock run whether or not you act. Standing still is interesting. |
| L2 | **Something is always one choice away** | A nearby thing to do every ~30 s of travel, at every hour, without a menu. |
| L3 | **It has moods** | Dawn, noon, golden hour, rain, night feel like different places, in light, sound, crowd and mission offer. |
| L4 | **Moving through it feels good** | Camera and controls are a pleasure on their own, so travelling is not a chore. |
| L5 | **It keeps you company** | Radio, chatter, phone calls and jokes: someone is always talking to you. |

Rockstar's team spent more than a hundred days on research trips around the real region and photographed it extensively, and the art director says the aim was not to recreate existing cities [S9, S10, S31]. Our version of that is the same discipline pointed at ten real blocks: recognisable first, then lived-in.

---

## 1. Views and camera (L4, L3)

### What GTA does (sourced)
- **Several camera positions per vehicle, a separate cinematic camera, and a rear view.** The cinematic camera is separate from the normal camera button; the rear view places the camera in front of the windshield facing backward [S12]. The hood view is the closest to first person from a vehicle [S14].
- **First person was added later, on foot too.** The re-release added an on-foot first-person view, which needed an overhaul of the animation system, plus cockpit views with working gauges [S8, S13].
- **The stock follow camera was a known pain point at speed and in corners.** Mod changelogs describe reworking it for "elastic" behaviour, smoother heading when cornering fast, distance that adapts to speed and acceleration, and a fix for the camera getting too close at high speed [S27]. A second mod adds "weight and inertia" so the camera leans into corners and settles under braking, and adds a look-behind control [S27]. Read this as: *players want lag and lean, but not a camera that hugs the bumper.*
- **Rockstar treat the environment as the camera director.** Their GDC talk on spatial cinematography says the designer cannot control where the player looks, so they steer attention through the environment (placement, contrast, movement) [S20].
- **Unsourced:** stock follow distance, height, FOV, catch-up rate, auto-centre delay, wall behaviour. Mods expose these as settings but nobody public has published stock values [S32]. Do not extract them; measure feel in play.

### Our targets

| Aspect | Today (`Camera.ts`) | Target `[tune]` |
|---|---|---|
| On foot | 5 m back, 2.2 m up, 0.5 m shoulder, FOV 60 | Keep. Add a short look-ahead (0.5–1 m) toward the move direction and a 2–4° FOV kick on sprint. |
| In car | 8 m back, 3 m up, grows to 10 m at 30 m/s; FOV 60 to 68 | Keep distance. FOV 60 to 70 at top speed is in range. Add speed-based height drop of ~0.3 m so high speed feels low and fast. |
| Lag / catch-up | exp. smoothing 8 /s | Position ~8 /s, but yaw should lag the car's heading by 0.1–0.25 s in corners (camera "swings out" then settles). Today yaw is purely player-driven plus recentre. |
| Auto-centre | after 1.5 s idle, 2 rad/s | Fine. Make rate rise with speed (2 to 3.5 rad/s) so a fast turn is not looked at from the side. |
| Look back | missing | Hold a key/button: yaw snaps 180° over ~0.15 s, releases back. Required for pursuits (L2). |
| Cinematic cam | missing | Toggle key: low, offset bodywork angles that cut every 4–8 s, slight handheld drift, optional shallow depth of field (PRD says blur only when cinematic is active). |
| First person | missing | On-foot and hood view, FOV 70–75, head-bob under 1 cm. Optional; off by default. |
| Walls | 2D raycast pull-in, 0.35 m margin, 0.9 m min | Good. Add a fade/clip of the target car if the camera ends inside 1.5 m, and never let the pull-in snap faster than ~0.1 s. |
| Mission letterbox `[mem]` | missing | Black bars slide in over 0.4–0.6 s at 2.35:1 on mission intro/outro and phone cutscenes, HUD fades, control returns on the outro. Keep each under ~6 s. |

**Review question for the camera lane:** after 60 s of driving a loop, do you stop noticing the camera? If you notice it, it is wrong.

---

## 2. Mechanics (L4, L2)

### On foot
Public sources confirm cover and fluid cover transitions (refined from Red Dead Redemption) [S9] and the later first-person view [S8]; they do not document walk/jog/sprint speeds or input dead zones. We already have walk 3, run 6.5 m/s with a 0.19 s start and 0.11 s stop (`Player.ts`). `[tune]` targets:
- **Three gaits driven by stick magnitude:** below ~0.25 deflection = dead zone (no move); 0.25–0.7 = walk, 0.7–1.0 = jog, sprint on a held button with ~0.45 s ramp (we have this). Stick response should be a slight curve (square or 1.5 power) so small corrections are precise.
- **Turn rate is capped while sprinting** and the character leans into the turn. Stops take ~0.1–0.2 s with a visible settle.
- **Climb/vault:** low fences and stoop rails are climbable in one motion (0.5–0.8 s). *Weapons and cover are non-goals (PRD §1); vaulting is not.* Without it a brownstone street is a field of tiny walls.
- **Ragdoll on impacts** `[mem]`: a hit above a speed threshold (roughly 6–8 m/s) drops the pedestrian into a physical ragdoll for 2–4 s, then a get-up animation. We have a 'down' state and a `pedKnockedDown` event; the gap is the body response.

### Driving
- **Arcade-sim hybrid.** Fans repeatedly call V's handling "arcadey" next to IV [S26]. The tuning model is public via modding docs: suspension stiffness (soft = more body lean, which costs grip), compression and rebound damping, a front/rear stiffness bias, a handbrake force, a flag that adds rear steering when the handbrake is used, and a traction curve where the gap between peak and post-breakaway grip sets how abruptly a slide begins [S24, S25]. Our `Vehicle.ts` already models split front/rear grip, handbrake, speed-sensitive steering, and weight transfer.
- **Handbrake slide recipe** [S26]: enter fast, tap handbrake to break rear traction, counter-steer and modulate throttle to hold it. Target: slip angle > 15° at > 40 km/h, recoverable in under 1 s with throttle lift (PRD §5.2 already has this).
- **Damage `[mem]`:** bumpers, bonnets and doors deform and detach, smoke at low health, engine fire at very low. Our target is cosmetic only: a dented-panel decal system plus smoke is enough.
- **Enter/exit choreography `[mem]`:** the character walks to the nearest door, the door swings, the seat is entered in ~0.8–1.2 s; exiting reverses it. The car can be left with the engine running and the radio on. V1 is fixing the exit bug now; the bible requirement is that exit **never fails** and is never longer than ~1 s.

### Wanted level and police
What the public wikis say about V [S4, S5]:
- Stars go up to 5. Police search the map by **line of sight**, with no fixed radius; when they lose you the stars flash, and a slower flash means you are closer to getting away. Being seen again resets the timer.
- Sight cones differ: officers on foot narrow, ground cars moderate, helicopters wide. Buildings and elevation changes block sight.
- Community-reported time to lose the heat while hidden: about **30 s at one star, 45 s at two, 60 s at three, 75 s at four, 90 s at five** (older wiki table, may not match the current game) [S5, S4].
- Dispatch: at three stars at least four police cars plus a helicopter; at four stars at least five ground vehicles and two helicopters [S5].
- Other escape routes: change vehicle or appearance, which helps because dispatch uses your last known position and vehicle description [S5].

Our `WantedSystem.ts` has 3 stars, a flat **20 s per star decay that ignores sight**. Target `[tune]` for a 10-block map: keep 3 stars (plus an optional 4th from sustained offence), add per-cop sight cones with building occlusion, a flashing "searching" state, a 25/40/55 s hidden-time to clear 1/2/3 stars, and make swapping cars matter.

---

## 3. Beautiful graphics (L3)

GTA's look is a stack of cheap, well-tuned effects, not one trick. Sourced facts, and the browser translation:

| GTA 5 technique | Source | Our version |
|---|---|---|
| Deferred pipeline, 5 render targets for opaque meshes, each light drawn as a volume with strong specular on wet roads | [S1] | Not feasible in three.js at our budget. Forward renderer with a capped light count (≤ 32 lamp lights, PRD tiers). Fake the wet-road highlight with roughness and a reflection layer. |
| 4 cascaded shadow maps in a 1024×4096 texture; cloud shadows stored separately | [S1] | One 2048 map (medium) with a tight box; cheap moving cloud-shadow multiplier on the sun term. |
| Auto-exposure from a quarter-res luminance average; filmic (Uncharted-2-style) tone map | [S1] | ACES filmic; add a 1–2 s eye-adaptation lag when entering a dark area/tunnel. `lighting-targets.md` §0 has the exposure math. |
| Reflection cubemaps (128 px faces, HDR) fed by a very low-poly version of the world (a distant hill area is one draw call, about 2500 triangles) | [S1, S2] | Keep our env map per hour; add a low-res dynamic cube refresh every 1–2 s for cars. |
| Water/mirror planar reflection at very low resolution (240×120) | [S2] | Same trick for puddles: a small planar reflection, blurred, masked by noise. |
| Distant lights are small instanced quads; car headlights move along roads in real time | [S2] | Distant windows/lamps as instanced emissive quads; headlight cones only on the nearest 8–12 cars. |
| Lens flare: roughly 70 sprites plus 12 streak quads on the sun axis | [S3] via [S32] | 8–12 sprites + 4 streaks, hidden when the sun is occluded. We have `LensFlare.ts`. |
| Depth of field present in post | [S1] | Use only in cinematic cam and mission cutscenes. |
| Rain-soaked reflective streets are a headline look | [S34], [S7] | `Weather.ts` already has dry, rain, wet, drying. |
| Warm "California" sunset, hazy; stock night street lamps warm yellow, modders swap to white | [S31] via [S32], [S33], [S36] | Sodium (~#ffb35c) on older blocks, cool white on newer. Warm haze at sunrise/sunset. |

### Time-of-day palette (our targets `[tune]`; numbers live in `docs/reference/lighting-targets.md`)

| Hour | Sun / sky | Street mood | Must-have detail |
|---|---|---|---|
| 05–06 | Deep blue to peach band on the horizon, no sun yet | Cold, quiet, lit signs and bodega fluorescent | Shop lightboxes still on; first lit windows; lamps fade out at ~06:30 |
| 07–09 | Low warm sun, long shadows down the avenues, thin haze | Fresh, contrasty | Sun flare down Throop/Kosciuszko when aligned |
| 10–15 | High clear sun, shortest shadows, blue-white sky | Flat, bright, saturated brick | Strongest car-paint reflections; heat shimmer is optional |
| 16–18 | Golden hour: warm key, cool shadows, orange haze | The signature GTA look | Longest shadows; windows catch the sun; dust in the air |
| 18–20 | Magenta/violet sky, lamps switch on at ~19:00, storefronts light | Magic hour | Lamp pools, lit stoops, cars with headlights on |
| 21–03 | Moonlit blue, sodium lamp pools, wet-street reflections if rain | Moody but readable (night mean luma ≥ 0.085 per PRD) | Interior glow behind curtains; TV flicker in some windows |
| 03–05 | Darkest, fewest lights | Sleeping city | Random lit window, one delivery truck |

Also required: street-lamp pools with a visible falloff on wet asphalt; bloom on emissives only; a distance fade/fog that hides the edge of loaded geometry instead of popping; instanced far-LOD cars (we have `CarLod`); no bloom haze on the daytime sky.

**Review question for the lighting lane:** take a screenshot at 17:30 and one at 22:00 with nothing else on the screen. Could someone tell the hour and the weather in one second?

---

## 4. Funny missions (L2, L5)

### The structure (derived from the opening missions and heist setups on the public wikis)
The mission "Repossession" [S21] shows the pattern in miniature: a **phone call or a scene in a workplace sets the job**, a companion character **talks all the way there** (banter during driving is where most of the humour lives), a short chain of **different objective types** (follow, search, fight, steal, drive), a **consequence that undercuts the plan** (the owner is dead, the repo is pointless, the friend keeps the bike), and a **gold-medal list** of optional challenges (a time, a headshot count) [S21]. Heists are split into setup missions, each with its own objectives [S30]. Retries count toward the gold medal, so a fail is part of the score and the mission restarts from a checkpoint [S30].

The GTA writing recipe, per its co-writer: satire of American consumerism and culture, shows and ads that are fictional "spoofs of actual radio", cast with friends [S23]. Houser argued that a convincing Los Santos needed LA's sprawl, and art director Garbut said the team was not "dictated by reality" [S10]. For us, the equivalent is that **the humour comes from characters who have a stake in a specific place**, not from jokes bolted onto objectives.

### Our mission template `[tune]`
1. **Giver** (a Bed-Stuy type: aunt, barber, landlord, laundromat owner, bodega clerk) with one want and one flaw.
2. **Setup**: an in-world phone call or a 20–40 s scene at the giver's door, with the letterbox and a fixed camera (§1).
3. **3–5 beats**, each a different verb (carry, drive, chase, wait, talk, tail, deliver), ~90–180 s per mission total. A line of banter roughly every 10–15 s while travelling.
4. **A twist** at beat 3 or 4 that reverses the plan.
5. **A fail-state joke**: a fail message that is funnier than the success one (we have `retryHint`; extend to a one-liner per fail reason).
6. **Reward + text follow-up**: cash, then a text 1–2 minutes later from the giver, which also sets up the next mission (L2: keeps the day moving).
7. **Optional gold challenge** (time, no damage, no stars).

**Pacing rule:** one mission offered per 8–10 min of play per time window (§7); never more than two active markers on the map.

### Six Bed-Stuy concepts (parody only: no real people, no real businesses)
Existing: Bodega Run, Laundromat Getaway, Block Party. New:

| # | Title | Giver + setup | Beats | Twist | Fail joke | Reward + follow-up text |
|---|---|---|---|---|---|---|
| 1 | **Alternate-Side Shuffle** (morning, 07:00–11:00) | Mr. Alvin has sat in his double-parked Buick for 40 min; a street-sweeper truck arrives at 09:30. Phone call. | Move five cars to legal spots; one has the owner in it; chase the sweeper's route | Every spot you free gets taken by a car that was already circling | The sweeper arrives: "the street is clean, you are not." | $120. Text: "Your spot is now my spot. Thank you for your service." |
| 2 | **Soundclash** (evening, 18:00–21:00) | Two rival stoops each have a speaker; Auntie asks you to "even the playing field". | Fetch an extension cord; swap a playlist; unplug the rival; run | The "rival" is her sister | Noise complaint: 1 star | $200. Text: "We are speaking again. Do not tell your cousin." |
| 3 | **Senator the Bodega Cat** (day) | The deli clerk's cat has left the shop. Scene at the counter. | Follow reported sightings across 3 blocks; lure with a chopped-cheese bag; escape a barking dog | He is found asleep in a delivery van that is now driving away | Cat in your car footwell; you cannot stop. A timer to find a quiet parking spot | $100 + the cat on the shop counter from then on |
| 4 | **Dollar Van, Last Run** (night, 22:00–02:00) | A dispatcher's voice on the radio: "cover my shift". | Pick up 3 passengers, each with a 30 s conversation; drop each at a stoop; dodge cops; change the radio when a passenger demands it | The last passenger is the dispatcher | A passenger bails out the door on a red light | $250. Text: "Tip jar's on the dash. Take what you want." |
| 5 | **Moving Day** (day) | A tenant needs a couch down three flights of stoop steps and onto a truck. | Carry (slow walk) to the truck; drive with the couch hanging out; stop at every red | The couch is not hers | The couch falls off at an intersection and blocks it: a honk chorus | $180. Text: "Keep the couch. I never saw it." |
| 6 | **Permit Pending** (day) | A contractor says a sidewalk shed has been up so long it has its own address. He needs one stamp by 17:00. | Tail the inspector's car; wait outside an office; pass a note; race to the contractor | The shed was approved in 2014 | The office closes in your face: "back tomorrow" | $150. Text: "The shed stays. It is part of the block now." |

**Review question for the mission lane:** can a player explain the mission in one sentence, and is the funniest moment something a *character* says, not something the HUD says?

---

## 5. Open world and ambient life (L1, L2)

### What GTA does (sourced)
- **A lot to find on top of the story.** 57 random events (60 in the enhanced edition) plus Strangers and Freaks encounters from recurring characters [S16, S17]. Dynamic mission content throughout the open world was borrowed from Red Dead Redemption [S8, S9].
- **Idle and walking pedestrians are separate systems.** Mods tune density for moving traffic, parked cars, pedestrians and "scenario" pedestrians (people sitting or talking) separately [S28].
- **Density follows time and weather.** Rain makes pedestrian density fall quickly, and street gang presence drops in storms [S7]. Mods interpolate hourly density across the 24 h cycle and expose per-hour values [S28]. Player reports describe quiet nights and busy morning and late-afternoon periods, but also that the city can feel empty [S29]. No official hourly table is public.
- **A day is 48 real minutes: 2 real seconds per in-game minute** [S6].
- **Sound reinforces space.** Radio is played "in a space": muffled outside cars, and it can drop out by location; vehicle audio is layered detail/mid/far plus distant one-shots and a city-noise layer [S18, S19].

### Targets for a 10-block map `[tune]`
The map is about 500 × 500 m (3 N-S avenues 250 m apart, 6 E-W streets 100 m apart; 15 POIs). A sprint across takes about 80 s, a drive 17 s. That is *small*, which means density and variety have to do the work that distance does in GTA.

- **"A thing to do every 30 seconds"** `[mem/tune]`. Rule of thumb, not sourced. For us: at any spot, within ~30 s of walking (≈ 100–200 m) there should be at least one of: a mission marker, a random event, a stranger who talks, a collectible, a ped with a bark, or a visible gag.
- **Random events:** an "alarm" every 90–120 s of play somewhere within 150 m: a car being broken into, a double-parked row, a pickup fight, a ball rolling into the street, a dropped bag. Target 12 types at launch.
- **Strangers:** 5–6 named recurring locals (the stoop sitter, the barber's cousin, the dollar-van dispatcher) who appear at the same spot at the same hour and say something new each visit.
- **Pedestrians:** 6–8 archetypes with different gait, clothes, and 20+ barks each; groups of 2–3 (we have this); 5% now sit on stoops, target 10–15% in the evening (§7). People on phones, with grocery bags, strollers, kids with backpacks.
- **Chatter:** each ped has a 10–20 s bark cooldown within 8 m; a "stoop conversation" pair talks in alternating lines. Needs text only (SpeechSynthesis or captions) so no recorded voice is required.
- **Collectibles:** 30 tags/stashes distributed 2–3 per block, which pays for exploring side streets.
- **Shop interiors:** a non-goal (PRD §1). Substitute: lit windows with silhouettes, open doors at day, a bodega counter visible through glass, a visible person inside at open hours.
- **Rain:** when it rains, peds drop to ~40% and take cover on stoops and under awnings, traffic slows (S7 direction).
- **Population realism:** a day-length of 2 min per game hour (the GTA rate [S6]) gives each hour twice as much real time as our current 1 min/hour (`DayNight`: 24 min per day), which matters if hours are to feel like places. Consider 2 min/hour as the default.

---

## 6. Soundtrack and radio (L5, L3)

### What GTA does (sourced)
- **Stations are fictional shows; only the music is real** (licensed or commissioned). DJs, ads and talk shows are written spoofs of American radio, performed by the writers' friends [S23, S35].
- **The format is music + DJ chat + spoof ads** [S35]; the GTA IV era added dynamic playlists with DJ speech, commercials, weather and news that react to story events [S22b: Radio Stations in GTA IV, https://gta.wiki/w/Radio_Stations_in_GTA_IV]. V's stations span (per the fan wiki; count not verified here) rock, pop, indie, house, world/deep house, rap, golden-age hip-hop, funk/R&B, soul, country, reggae/dub, Latin, punk, plus two talk stations (one left, one right) [S22].
- **The score is separate from radio:** original music by several composers, delivered as stems so intensity can rise and fall with mission state (8 stereo stems plus one-shots, with "mood" definitions for stem mixes and transitions) [S11, S18].
- **Radio exists in space:** muffled outside the car, may drop out by location [S19].

### What our library station must do to feel like GTA radio
**All recordings must be the user's own files** (PRD §2.1: no GTA music, no copyrighted tracks bundled; the library is user-supplied and stays on the user's machine). The station *wrapper* is where the feel lives, and we write it ourselves:

1. **Station identity:** a parody name, a frequency, a one-line slogan, and a short sound identity (3–5 s jingle/sting; synth-made or user-supplied).
2. **Imaging between tracks:** every 2–3 tracks, one of: a station ID, a sweeper ("on the one-one-nine"), a DJ intro of the next track (can be generic: "up next, a heavy one"), an ad break (2–3 ads, 20–30 s each), a 30–45 s news/weather/traffic read for the current in-game hour.
3. **Transitions:** 1.5–3 s equal-power crossfade between tracks; DJ talk *ducks* the music to ~25% and ramps back; start new tracks at a random offset (as if tuning in mid-song) and keep a virtual clock so tuning away and back resumes in a plausible place.
4. **Dayparting:** morning show (news, traffic, chatty), midday playlist, evening talk/call-in, night slow jams. A station can be "live" at some hours and play filler at others.
5. **Talk station:** the WRITE lane's ~22-minute original show via SpeechSynthesis, with host/sidekick/callers/ads/jingles, looped with fresh ad rotation.
6. **Spatial rules:** car radio at full level inside; on foot a low-pass filtered, 25% level leak from a nearby parked car or shop; radio off when far; short static between stations on a dial change.
7. **Slots:** Pop 15, 80s 12, Rap 13, House & Dub 22 (RADIO lane), each with the imaging layer above, so even a short library sounds like a station.
8. **Parody only:** station names, hosts and ads fictional; no real brand, artist or song names in ad copy.

**Dynamic score (optional, later):** 3–4 synthesised stems (pad, pulse, percussion, tension) that crossfade by state: calm, mission, chase, night. This is where we replace the missing "film score" feeling at zero asset cost.

**Review question for the radio lane:** leave the car idling for 5 min. Do you stay because it's pleasant, and does anything in the break make you smile?

---

## 7. Nights and days in Bed-Stuy: a day-in-the-life (L1, L2, L3)

All numbers `[tune]`. Peds and traffic as a fraction of the medium-tier budget (~30 cars, ~40 peds). "Missions" lists what is *offered* in that window.

| Hour | Light | Traffic | Peds / scenes | Sound | Missions and events |
|---|---|---|---|---|---|
| 05–06 | Blue dawn, lit bodega signs | 15% | 10%: bodega owner opens, delivery trucks, a jogger | Shutters, birds, a distant siren | Bodega Run (early) |
| 06–08 | Low sun, long shadows, haze | 60%, rising | 50%: coffee runs, commuters to the subway, parents with kids | Radio morning show, buses | Alternate-Side Shuffle, Bodega Run |
| 08–09 | Bright, contrasty | 90% (rush) | 80%: **school run**, crossing guard, strollers | School bell at ~08:00, honks | Moving Day |
| 09–12 | Clear, high sun | 70% | 60%: shoppers, stoop sitters appear, laundromat full | Radio midday, hose water, kids | Senator, Permit Pending, Laundromat Getaway |
| 12–14 | Flat, brightest | 70% | 70%: **noon stoops**: lunch, domino table, vendors, ice-cream truck | Ice-cream truck jingle (original), music from windows | Random events peak |
| 14–16 | Warm, shadows lengthen | 70% | 80%: school out, kids on bikes, ball games | Basketball, chatter | Collectibles, Block Party (setup) |
| 16–18 | **Golden hour** | 100% (rush home) | 70%: commuters home, grocery bags, groups on stoops (10–15% sitting) | Radio evening show, honks | Block Party, bodega lines |
| 18–21 | Magic hour then lamps on | 60% | 90%: **block party**, cookout smoke, speaker music, string lights | Block party music (the player's own library tracks if any), applause | Soundclash, Block Party payoff |
| 21–00 | Night, sodium pools, lit storefronts | 35% | 40%: people at the corner, delivery bikes, smokers on stoops | Sparse traffic, radio "night slow jams" | Dollar Van (start), police patrols +1 car |
| 00–03 | Darkest, wet streets if rain | 20% | 15%: late workers, a fight outside a bar, a "drunk friend" | Distant sirens, bass from a basement | **Night cops**: stars rise faster, roadblocks at 3 stars |
| 03–05 | Deepest dark, one lit window | 10% | 5%: bakery delivery, a cat | Quiet, hum, first bird | Dollar Van (late) |

**Weather overlays** (§3): rain cuts peds to ~40% and street events [S7]. Schedule rain so that a rainy night happens at least once every 3 game days: wet night streets are the signature look.

**Review question for the world lane:** can a player who has never seen the clock guess the hour from the street alone?

---

## 8. Gap list: today's game vs the bible, ranked by the "live here for a day" test

Ranked by how much each item moves L1 to L5, then by cost. Lane tags: camera, driving, lighting, missions, world, radio, phone. In this list `phone` means **both** the in-world phone (calls/texts that drive missions) and the phone-tier performance work (MOB), because the first is what the player sees and the second is what lets them see it on a phone.

| # | Gap | Today | Bible target | Props | Lane |
|---|---|---|---|---|---|
| 1 | **No "thing every 30 s"** | 3 missions, 15 POIs, no events | 12 random event types, 5–6 recurring strangers, 30 collectibles (§5) | L1 L2 | world |
| 2 | **Too few, too flat missions** | 3 missions with objective text and a reward line | 9+ missions on the §4 template with phone setup, banter, a twist, a fail joke, text follow-up; the six concepts in §4 | L2 L5 | missions |
| 3 | **Radio has no station wrapper** | 3 synth stations, no DJ/ads/news/jingles; user library in progress | Imaging, ducking, crossfades, dayparting, news/traffic reads, talk show (§6) | L5 L3 | radio |
| 4 | **The day has no schedule** | Time-of-day light and a night siren, flat population, 24-min day | Hourly ped/traffic curve, school run, noon stoops, block party, night cops, 48-min day option (§5, §7) | L1 L3 | world |
| 5 | **No in-world phone** | Missions begin at a marker | Incoming calls and texts, a tiny phone UI, letterboxed call cutscene, text follow-up | L2 L5 | phone |
| 6 | **Police are a timer, not a pursuit** | 3 stars, 20 s decay per star regardless of sight | Cop sight cones with occlusion, flashing search state, 25/40/55 s hidden-time, car swap matters, night escalation (§2) | L2 L1 | driving |
| 7 | **Camera is functional, not cinematic** | Follow cam + shake + wall pull-in | Look-back, cinematic toggle, optional first person, mission letterbox, corner swing (§1) | L4 | camera |
| 8 | **Night and weather readability** | Night glazing too bright at spawn (L10 open issue), GTAO halo unverified | Lamp pools on wet asphalt, interior glow, glazing cap, sunrise/sunset haze (§3) | L3 | lighting |
| 9 | **Windows and stoops don't live** | 5% of peds sit on stoops, no silhouettes, no TV flicker | Evening 10–15% stoop sitting, lit window silhouettes, TV flicker, open doors at day | L1 L3 | world |
| 10 | **No ambient bed or barks** | Engine, horn, city hum | Layered city noise by time and place, ped barks, stoop conversation, radio muffling on foot (§5, §6) | L5 L1 | radio |
| 11 | **On foot is bare** | Walk 3, run 6.5, smoothing | Gait bands with a dead zone, sprint lean, one-motion vault over low fences/stoop rails | L4 | driving |
| 12 | **Impacts lack consequence** | Camera shake, ped 'down' state | Panel dents + smoke, skid marks, ped ragdoll with get-up (§2) | L4 L1 | driving |
| 13 | **Corner camera is glued** | Yaw is player-driven | 0.1–0.25 s yaw lag in corners, speed-scaled recentre, brake tuck | L4 | camera |
| 14 | **Nothing to collect or hunt** | None | 30 tags/stashes, 2–3 per block, with a small reward and map reveal | L2 | world |
| 15 | **Phone-tier cost of the above** | MOB lane in progress | Keep peds, events, particles and radio imaging within the low-tier budget (§3, PRD §3) | all | phone |

**What is already strong (keep):** the lighting stack (blown ≤ 0.09 %), weather cycle with wet roads, signalised traffic, instanced draw-call budget, mission framework with 9 objective kinds, and the stoop/phone/knock-down pedestrian states. The gap is mostly *content and life*, not rendering.

---

## Sources

Search-result excerpts only (see caveat at top). The bible makes no claim stronger than these excerpts support.

| ID | Source | URL |
|---|---|---|
| S1 | Courrèges, GTA V Graphics Study (deferred, G-buffer, CSM, cubemaps, exposure, DoF) | https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/ |
| S2 | Courrèges, Part 2 (LOD, reflections, light volumes) | https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study-part-2/ |
| S3 | Courrèges, Part 3 (lens flare) | https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study-part-3/ |
| S4 | Wanted Level in GTA V (Fandom) | https://gta.fandom.com/wiki/Wanted_Level_in_GTA_V |
| S5 | Wanted Level in GTA V (Grand Theft Wiki) | https://www.grandtheftwiki.com/Wanted_Level_in_GTA_V |
| S6 | Time (day length, 2 real s per in-game minute) | https://gta.fandom.com/wiki/Time |
| S7 | Weather (rain reduces pedestrians) | https://gta.fandom.com/wiki/Weather |
| S8 | Grand Theft Auto V (Wikipedia) | https://en.wikipedia.org/wiki/Grand_Theft_Auto_V |
| S9 | Development of Grand Theft Auto V (Wikipedia) | https://en.wikipedia.org/wiki/Development_of_Grand_Theft_Auto_V |
| S10 | Los Santos (Wikipedia; research trips, Garbut) | https://en.wikipedia.org/wiki/Los_Santos,_San_Andreas |
| S11 | Music of Grand Theft Auto V (Wikipedia; stems) | https://en.wikipedia.org/wiki/Music_of_Grand_Theft_Auto_V |
| S12 | Cinematic Camera (Fandom) | https://gta.fandom.com/wiki/Cinematic_Camera |
| S13 | First-Person View (Fandom) | https://gta.fandom.com/wiki/First-Person_View |
| S14 | First person view (Grand Theft Wiki) | https://www.grandtheftwiki.com/First-Person_View |
| S16 | Random Events in GTA V | https://gta.fandom.com/wiki/Random_Events_in_GTA_V |
| S17 | Strangers and Freaks | https://gta.fandom.com/wiki/Strangers_and_Freaks |
| S18 | GDC Vault, The Sound of Grand Theft Auto V | https://gdcvault.com/play/1020587/The-Sound-of-Grand-Theft |
| S19 | Game Developer, Crafting the sound of GTA V | https://www.gamedeveloper.com/audio/video-crafting-the-sound-of-i-grand-theft-auto-v-i- |
| S20 | Game Developer, Rockstar on environment design as spatial cinematography | https://www.gamedeveloper.com/design/video-how-rockstar-tackles-environment-design-as-spatial-cinematography |
| S21 | Repossession (mission structure) | https://gta.fandom.com/wiki/Repossession |
| S22 | Radio Stations in GTA V | https://gta.fandom.com/wiki/Radio_Stations_in_GTA_V |
| S22b | Radio Stations in GTA IV (dynamic radio; IV, not V) | https://gta.wiki/w/Radio_Stations_in_GTA_IV |
| S23 | Lazlow Jones interview coverage | https://www.shortlist.com/news/the-making-of-the-grand-theft-auto-games-with-lazlow-jones-404579 and https://www.grandtheftwiki.com/Lazlow_Jones |
| S24 | handling.meta (GTAMods) | https://gtamods.com/wiki/Handling.meta |
| S25 | GTA 5 metadata glossary | https://gtacars.net/gta5/glossary |
| S26 | How drifting works (GTAForums; "arcadey" comments) | https://gtaforums.com/topic/879982-how-drifting-in-gta-v-works/ |
| S27 | Camera mod changelogs | https://www.gta5-mods.com/nl/scripts/custom-camera-v-plus/download/74219 and https://gta5mod.net/gta-5-mods/scripts/cinematic-v-camera-v1-1/ |
| S28 | Dynamic Population Density mod (hourly density, scenario peds) | https://www.gta5-mods.com/pt/scripts/dynamic-population-density |
| S29 | Traffic/Pedestrian Density thread (anecdotal) | https://gtaforums.com/topic/494558-trafficpedestrian-density/ |
| S30 | Missions in GTA V; The Big Score (setups, retries) | https://www.grandtheftwiki.com/Missions_in_GTA_V and https://gta.fandom.com/wiki/The_Big_Score_(GTA_V) |
| S31 | Garbut interview (GamingBolt) | https://gamingbolt.com/grand-theft-auto-vs-art-director-i-want-to-create-new-cities-not-recreate-existing-ones |
| S32 | Stage 1 style notes (internal) | docs/reference/gta5-style-notes.md |
| S33 | Street-light mods (stock sodium look) | https://www.gta5-mods.com/fi/misc/maxedwhitestreetlights |
| S34 | Digital Foundry via Pure Xbox (wet reflective streets) | https://purexbox.com/news/2022/12/video-digital-foundry-puts-gta5-ray-tracing-to-the-test-on-xbox-series-x |
| S35 | GTA Radio (Tropedia; music + DJ chat + spoof ads) | https://tropedia.fandom.com/wiki/GTA_Radio |
| S36 | Timecycle remake mod changelog (sunset haze) | https://www.gta5-mods.com/sl/misc/skyambient-tr-timecycles |

Internal references: `docs/swarm/PRD.md` §1–3, `docs/reference/lighting-targets.md`, `docs/swarm/checkins/stage2.md`, `src/core/Camera.ts`, `src/entities/Vehicle.ts`, `src/entities/Player.ts`, `src/game/WantedSystem.ts`, `src/game/missions/content/*.ts`, `src/audio/radio.ts`.
