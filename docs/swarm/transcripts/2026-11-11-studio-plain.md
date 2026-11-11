# Studio chat, 11 November, in plain language

*A plain-language retelling of the team's chat log for 11 November. The word-for-word log is in 2026-11-11-studio.md.*

## Who's who

- **Fable Hart**: the chief executive. Runs the studio and passes the owner's decisions down to the teams.
- **Imani**: runs the Streetscape team, which builds the streets, buildings and map.
- **Rafael Stoop**: Streetscape. Works on building fronts, colours taken from photos, and street photos.
- **Chidi Okafor**: Streetscape. Works on the switch to the real map and on how street corners look.
- **Gus Calloway**: Streetscape. Works on the city's data for lots and traffic signals.
- **Tomas**: runs the Inkwell team, which covers characters, cars, menus and controls.
- **Leila Seamstress**: Inkwell. Works on people and their clothes.
- **Priya Ink**: Inkwell. Works on menus, the on-screen display and loading screens.
- **Sam**: Inkwell. Works on camera views, jumping and the on-screen controls.
- **Kenji Okafor-Lyle**: Inkwell. Fixes the cars that already exist in the game.
- **Dmitri Volkov**: Inkwell. Adds seven new car types.
- **Zadie Okafor**: Inkwell. Builds the map screen.
- **Nia**: runs the Airwaves team, which covers radio, voices, sound effects and music.
- **Jules Okonkwo-Reyes**: Airwaves. Builds the radio stations.
- **Andre**: Airwaves. Writes the engine and sound effect sounds.
- **Mei Vance**: Airwaves. Writes the voices for the radio shows and the people on the street.
- **Greta Voss**: runs the Engine team, which looks after stability, speed and testing.
- **Omar Quill**: Engine. Works on the traffic and simulation tests.

## All hands

**Fable Hart:** Everyone should read the org notes so you know your name and your director. Workers answer to their director, and directors answer to me. Please talk to each other like colleagues. The first job is to vote on your team's name. Imani runs World, Tomas runs Art, Nia runs Sound and Greta runs Engine.

**Fable Hart (to Tomas):** Thanks, that is a clear read. Zadie will take the on-screen map and starts when Priya finishes. Greta's team will review Dmitri's changes to how cars drive and handle before they reach the traffic, because they touch the simulation Omar is fixing. Dmitri can start now. Recorded: the World team is Streetscape and the Art team is Inkwell.

**Fable Hart (to Nia):** Agreed on all of it. The Sound team is Airwaves. You can go ahead with a voice pack made from free voices, up to 25 MB, for the hosted and desktop builds. That is my decision to make. The paid ElevenLabs voices stay off until the owner answers, which I have asked them to do.

**Fable Hart (to Nia and Mei):** The owner has decided. The talk shows and the scripted hosts use free voices. No ElevenLabs, and no credits spent.

**Fable Hart (to Imani):** This is the best work of the day. The street network matches the real streets, and the overview map is what the owner asked for. I have approved it. The bigger area will be added in two steps, and the first step will not ship until Greta closes the crash and the size budget. The first group of workers starts now and reports to Imani.

**Fable Hart (to Imani, Tomas and Priya):** The owner wants the map screen to open centred on the built area, and to let you scroll around it. The rest of Brooklyn should only show as a dark outline with no detail when you zoom out, close to the look of GTA maps.

**Fable Hart:** The owner asked us to drop the impersonal labels, and that includes me. I am going by Fable Hart. Everyone, keep your first name and pick a last name or a nickname, ideally one that nods to your work or the neighbourhood.

**Fable Hart:** Size alarm. The single-file build is at 11.95 MB out of 12. From now on, any change that makes it bigger has to say by how much and get Greta's approval first. Greta, this is yours to manage, and I expect a lighter single-file plan today. Priya's menus, settings, phone apps and loading music are wired in and it is strong work. Kenji's car fixes are in. Gus's lot and signal data is in. Imani will rule on two open questions about the map.

**Fable Hart:** The owner's exact words: "You are all doing amazing work, keep it up." I am passing that on with my own thanks. Please also talk to each other more in these posts. Answer what was said to you before you give your own news, ask follow-up questions, and say when you disagree.

## Streetscape

**Rafael Stoop (to Imani):** I vote for Streetscape. Source hunting is mostly done. We have free street photos for our exact blocks, and the city's tree census works. Next I am writing the scripts that fetch street photos and pull out building colours. Everything will be keyed to the city's lot ID, not to our grid position, so the street redesign will not break it. Tell me if lot numbers are going to change.

**Imani (replying to Rafael):** Good call on the lot ID. Yes, lot numbers will change when the real map arrives, so the lot ID is the only stable key. Each building should be drawn in its own frame, with its front facing the street. Nothing should assume the lots are square to the axes, because the new street network will hand each building a street edge and an angle. I also vote Streetscape, so that is the World team's name.

**Imani (to Fable):** Streetscape is confirmed. It was Rafael's suggestion and mine, and there were no other votes. I found the city's centreline data for the streets and measured where the map starts. I am building the importer now.

**Imani:** The street network core is in, and its 17 tests pass. The real data is in as well. From the city's centreline data we get 575 stretches of street, 197 blocks and 81 named streets. The file is small, about 30 kB, and the overview of Brooklyn is 47 kB compressed in the game. I am writing up the design now.

**Imani (to Rafael):** The design is in the plan document. Your job is the lots and building outlines, keyed to the lot ID. The open questions for you are the wedge-shaped lots along Broadway and the corners that are not square.

**Imani (to Fable):** The design, importer and street network core are done. The code compiles and 342 world tests pass, 20 of them new. Your decisions are in section 9 of the plan. There is a scale warning: the area as the owner described it is about a square kilometre, which doubles the size of the world. The space left for the game's file size is the tight limit.

**Fable Hart (to Imani):** I approve the design as written. The first phase is the Central Avenue area and the second is Knickerbocker, and the second waits on performance numbers. The first phase does not ship until Greta closes the crash and the budget. Wave one starts now: one worker on the first setup tasks and one on the lots and building work. The map screen goes to Zadie once Priya finishes.

**Chidi Okafor (to Imani):** I am picking up the map switch and the street corner work. I am reading the street network code now.

**Gus Calloway (to Imani):** I am starting the lots and footprints for both phases, and the traffic signal points. The map data we have has no shapes for lots, only centre points. There is no list of traffic signals on the open data, so I will match three point layers instead.

**Rafael Stoop (to Fable):** I now sign as Rafael Stoop, a nod to the brownstone steps I keep measuring. So far 331 lots have colours taken from photos, 94 of them in the current ten blocks. The before-and-after pictures are waiting for a free render slot.

**Gus Calloway (to Imani):** I now sign as Gus Calloway. I am also re-running the lot import with the raw data moved into a folder that git ignores, so the tracked file stays small.

**Chidi Okafor (to Fable):** The owner wants names, so I am Chidi Okafor from now on. The map switch and the street corner work are under way.

**Gus Calloway (to Imani):** A heads-up. Someone's recent commit picked up my 3.3 MB raw lot file by mistake. I put it back and did not commit anything. Whoever commits next should decide whether to remove that file from the project.

**Gus Calloway (to Rafael):** The lots file is keyed by lot ID, and each lot has its address, centre point, frontage, depth, floor count, year built, building class, nearest street and distance to it. Buildings are in the same file. Footprints are kept separately, out of the project. Lots are centre points, not outlines, because the city's data has no outlines.

**Gus Calloway (to Imani):** The first phase and the signal work are done. There are 2,643 lots in the first phase and 2,495 in the second. Between 91 and 92 percent of lots have a footprint, and 99 percent or more sit next to a street. There are 17 lots with no street frontage and 6 with no street within 60 m. Of the 270 junctions the street network guesses have signals, 93 match a signal in the data within 15 m, so that is the gap Imani needs to rule on. Three pedestrian signals sit just too far from a junction to match. There is no data on stop signs, so no junctions are marked as stops. Seven new tests pass. One test fails in a scratch file that disappeared during the run, which is not Gus's.

**Chidi Okafor (to Imani):** The corner shapes are in, and the real-data tests pass on my side. Every junction with three or more streets gets a simple shape. I made some choices without asking. Where a street is shorter than the two corners at its ends, the corner shrinks, and two corners on Myrtle and Wyckoff may overlap. Four thin blocks use a fallback for the building line. Tell me if you want another rule. A picture of the junctions is in the reference folder.

## Inkwell

**Kenji Okafor-Lyle (to Tomas):** I vote Motor Pool for the Art team, with Sketchbook second. The garbage truck hopper and ambulance bar edits are in, and the render is queued.

**Leila Seamstress (to Tomas):** I vote Atelier, and my second choice is whichever name Sam or Priya puts forward first.

**Leila Seamstress (to Tomas):** I am starting on the clothing painters. I will take out every bit of lettering and fake logo, then add real fabric detail: knit, denim wash, stitching, puffer baffles, canvas, and so on. After that I will fix the hijab, the seam slivers and the headphones, add outfits, and write a schedule for how passers-by behave. I plan to keep the semi-realistic painted faces, not the stylised look, unless you say otherwise.

**Priya Ink (to Tomas):** I vote Inkwell, with Paintshop second. On the touch controls, Sam's grid has one free corner for the camera view key. If Sam adds a jump row, I will move the prompts and subtitles up to make room, and every button must be at least 44 pixels. Camera key hints should go in the help prompt, not the corners of the screen.

**Sam (to Tomas):** I am starting on camera views, jumping and key help. I vote Studio Ink, with Cel Shop second. I need two touch buttons, one for the view and one for jumping, which only shows on foot. I will export the help text so Priya can use it. I will call the sound hooks for take-off and landing, and I will check the names with Andre.

**Tomas (to Inkwell):** I looked at the frames and wrote the quality bar that we all work to. From now on, every final shows before-and-after pictures at the distances people will see the game from, plus a street view at noon and at dusk, not only a grey lineup.

**Tomas (to Leila):** Yes, keep the semi-realistic faces and push the realism through skin shading and eye wetness. The two things that matter most are removing all lettering, and making clothes sit on the body properly, with thickness at collars, cuffs and hems. Fix the hijab so it drapes over the shoulders, and remove the floating studs and grey slivers. For the spoken lines, emit your event and leave the hookup to me, because I am asking Nia to route it.

**Tomas (to Priya):** The settings screen is the closest thing we have to the bar, so protect it. Move the buttons into the footer, and stop the artwork covering any row. On the loading screen, fix the black line on the stairs first, then add a hero figure filling 60 to 80 percent of the frame, because a GTA 5 loading screen shows a person, not a building. On the HUD, fix the hyphen in the welcome line and stop showing the objective twice.

**Tomas (to Sam):** Your plan is approved. The main thing I will judge is feel. The camera view swap must blend over 200 to 300 milliseconds, not pop, and jumping needs a wind-up and a landing dip, or it will feel cheap.

**Tomas (to Kenji):** Start with the black missing-texture rectangles on the garbage truck, then the bumpers that stand off the body, and the pony hood edge with its gap. If you have time, wheels filling the arches on every car is the cheapest win for the whole roster.

**Tomas (team name):** Four of five have voted. Kenji proposed Motor Pool, Leila Atelier, Priya Inkwell and Sam Studio Ink. Leila's second choice was Priya's name, which was posted first, and Inkwell is my own pick too, because ink is what our comic menus, loading art and outlines share. So the Art team is Inkwell.

**Tomas (to Nia):** A cross-team request. Leila will emit a pedestrian speech event with pitch and rate. Could Andre or Jules route it to the voice system, or tell Leila the shape you want? Dmitri is also adding seven new car types after Kenji, and Andre has already asked for their engine sounds.

**Tomas (to Fable):** Check-in. The world is our best asset. The settings menu is close to the bar. The people look like early PlayStation 3 mannequins, with lettering on their clothes and a hijab that looks like a diving hood. The cars have the right shapes but clay-looking paint, gaps at the wheel arches and plank bumpers. The loading screen is flat, with no hero figure, and it is the furthest from GTA 5. I have sent the fixes back to Leila, Priya, Kenji and Sam. Two decisions are needed. First, Zadie needs a worker name. Second, Dmitri's change adds new drive-train fields to the car spec, which Greta's team may want to review. I also flagged that the dusk lighting is too purple on skin and pavements, and there is no key light at night. That observation is mine, not Imani's, and it is for the World team when they have room.

**Dmitri Volkov (to Tomas):** Hello, Dmitri here, starting on the seven new cars with research and the new spec fields. I will stay out of the garbage truck, ambulance and lamp work until Kenji says those files are free.

**Dmitri Volkov (to Andre):** Here are my seven car types, so you can add their engine sounds. The coupe has a flat-six engine at about 7,400 rpm, with a top speed of 290 km/h. The exotic has a V10, 325 km/h. The Japanese coupe has a turbo six, 285 km/h. The hot hatch has a turbo four, 250 km/h. The muscle car has a V8, 290 km/h. The wedge truck and the electric saloon are both electric, at 180 and 225 km/h, and you can drive their whine from speed alone.

**Sam (to Priya):** Done. The controls now have run, jump and view buttons, and the jump button hides while you are driving. Please import the help text from the controls file instead of your inline lists. Andre's hooks for jumping and landing are in, and Fable will wire them up. The unit tests for the controls pass. One file in the render folder fails to parse, and that is not mine.

**Dmitri Volkov (to Andre):** The seven vehicle types are now in the shared types file. Until Andre adds their engine sounds, the engine, effects and horn files fail to compile. Those are the only compile errors my change leaves.

**Leila Seamstress (to Tomas):** Status. All lettering is gone, the cloth painters are rewritten with weave, stitching, cuffs, pockets and denim wash, the skin has sheen, and the hijab and headphones are rebuilt. I have added 25 new people and the passers-by scheduler, which covers pairs, greetings, bumping and near-misses, and the tests pass. I am now rendering the next frames.

**Leila Seamstress (to Andre and Jules):** My speech event sends the text, pitch, rate, sex, age and loudness. I wrote a file that speaks it on its own speech channel, so it never cuts off a radio segment and stays quiet while a talk show is on. Fable will wire it in, so tell me if you want the hook shaped differently.

**Kenji Okafor-Lyle:** For the record, my name is Kenji Okafor-Lyle. Close-up renders of the garbage truck, ambulance, police car and dollar van are queued.

**Dmitri Volkov (to Tomas and Fable):** I am Dmitri Volkov from now on. The handling settings, the seven body styles, the paint colours and the traffic share are in. I am running the five-minute traffic test and the first render sheet is in review.

**Priya Ink (to Tomas and Fable):** I am Priya Ink from now on. The menu, the on-screen display, the loading screen and the fixes from the review are in and tested. The last display render is waiting for a free slot.

**Leila Seamstress (to Fable and Tomas):** I am Leila Seamstress from now on. Hems, seams and stitching are my area. I am still rendering the outfit, hijab and shoulder frames.

**Zadie Okafor (to Tomas, Imani and Fable):** I am taking the name Zadie Okafor. I am starting the map screen. It will show true north, so the grid is turned 8.6 degrees on screen, and the small corner map turns with the car, so the two do not clash. The map fits the built area and shows the Brooklyn overview only when zoomed out past the fit level. The street data will come through a simple interface, so the street network can plug in later without changing the map screen.

**Kenji Okafor-Lyle (to Tomas and Dmitri):** The car files are free. The black rectangle on the garbage side is gone, the clean hopper is in, and the ambulance bar is flat on the roof and flashes red and white while driven. The frames are in the carfixup folder.

## Airwaves

**Jules Okonkwo-Reyes (to Nia):** Hello, Jules here. I vote Airwaves, with Frequency second. I have a provisional list of 15 stations. Nine come from SoundCloud, four are live streams and two are talk shows. Some of these are not verified yet. My sandbox cannot reach one of the SomaFM streams, and The Lot's stream returns an error, but several others play. I will check the blocked one in a real browser before I drop it. Please push back on anything.

**Andre (to Nia):** Hello, Andre here. I vote Soundstage, with Airwaves second. Jumping and landing names match what Sam asked for. For the new car types, I will need engine details, or I will fall back to the sedan sound until I add them.

**Nia (to the Airwaves team):** I run Sound. The bar we are all held to is in the sound quality document, with the loudness targets, the rules for each car's sound and the numbers each of you has to report, because none of us can listen to the output. The big call is that talk shows, ads and DJ lines will be recorded in advance with the free voices into a voice pack of about 40 minutes, under 25 MB. Live voices run four to seven times slower than real time on a normal computer, so they cannot carry a talk station. Nothing will be spent on ElevenLabs until the owner answers.

**Nia (to Jules):** A good start, but the dial is too narrow. Eight of your fifteen are club or electronic sets, and there is no hip-hop, no dancehall, no Latin and no soul. Cap the club sets at five, then add those genres from public sets or public broadcasters that you have checked in a real browser. Keep the 80s station only with a second 80s source behind it. Keep the sports-talk parody as the second talk station. Map Mei's DJ personas onto the new stations. For each station, report whether it reached playing, how long it took to start, which source played, and any stalls over 120 seconds.

**Nia (to Andre):** The thing that matters most is that with your eyes closed you can tell a bus from a beaten-up car, a V8, or an electric car in two seconds. Right now eight of the 18 vehicle types use a V8. Keep V8s for the muscle car, police car, pickup and town car. Give the cab a hybrid sound, the luxury car a quiet turbo six, the ambulance a diesel with clatter, and the dollar van a tired V6 with an exhaust leak. Plan an electric sound now. Horns should be grouped by class, and you need a master limiter before the output. Please also answer Sam directly about the names for the jump and landing sounds.

**Nia (to Mei, with Fable copied):** I reviewed Mercer in the Morning, Flip That Brownstone and the five ads. Flip That Brownstone is the best thing on the station, and the ads for FlipCo, First Neighbour Trust and FridgeBuddy are sharp. Nothing crosses the line on slurs, religion, ethnicity or real people. One fix: the ad ID "ad-oatly" names a real brand, even if it is never spoken. The problem is that the overall tone is polite and public-radio, and GTA hosts have more appetite. Some lines have no turn, including Buck's shed joke, Dev's parking-lot joke, the kombucha ad, and the Troop Deli ad. Hustle Hive is a joke everyone has already made.

**Nia (to Mei):** Three rewrites as examples. For Buck: "On Throop there is a shed so old it has a rent-stabilised lease. Pigeons have been born in there, Boards. Generations." For Buck to Dev: "Dev, the map also says luxury on a building with a bucket under the ceiling. Do not trust the map. Trust the auntie on the second step." For Hustle Hive: "Your landlord turned your apartment into four of our desks. So come rent one back! Six hundred a month. Bring your own chair." The rule is that every line turns in its last three words, and the target is always the one with the money.

**Nia (team name):** Jules has voted Airwaves, with Frequency second. Andre has not voted. My own proposal was Soundsystem, with Airwaves second. Airwaves leads on first and second choices, so the Sound team is Airwaves. Fable, please record it.

**Nia (to Leila, with Tomas copied):** On the pedestrian speech question, the voices get their own lane, with a brief in the sound folder. Keep sending the same event with text, pitch and rate. The voice lane will reply with the start and end of speech and the mouth movements for the characters.

**Nia (to Fable):** Check-in. Landed: the sound quality bar and the brief for the voices, which can start as it is. Sent back: Jules's station list lacks hip-hop, dancehall, Latin and soul. Andre's engine table has eight V8s out of 18, and there is no master limiter. Mei's scripts pass the tone check but need more GTA appetite, and the rewrites are posted. The team is Airwaves. Two decisions are needed from the owner: whether to use ElevenLabs, and approval for a voice pack of up to 25 MB made from free, pre-recorded speech. I would use the free pack either way.

**Fable Hart (to Nia):** Agreed on all of it. The Sound team is Airwaves. Go ahead with the pre-recorded voice pack from the free voices, up to 25 MB, for hosted and desktop builds only. ElevenLabs stays off until the owner answers.

**Mei Vance (to Nia):** I am back on the voice work. First I am fixing your review notes: the ad ID, your three rewrites and sharper lines. Then I am writing the script that bakes the voice pack, running in the background, starting with station idents and DJ lines, then ads, then shows. After that come the pedestrian barks and voice assignments.

**Fable Hart (to Nia and Mei):** Confirmed again: the owner has decided on free voices for the scripted hosts and shows. No ElevenLabs and no credits spent. Carry on with the pack from the free voices.

**Mei Vance (to Leila):** Before either of us writes code, here is the event shape I propose for pedestrian speech. You decide when a pedestrian speaks and to whom, and you give the situation, the position and whether the speech is aimed at the player. I decide the words and the voice, which stay the same for each person, and the limits, such as no more than one line per 20 seconds per person. I can also drop a line if the limits or the radio rules say so. I send back the speech start, the mouth movements, the speech end and subtitles, all on the shared event bus.

**Andre (to Nia):** Wrap-up. The vehicle sound model is in. Every one of the 25 vehicle types has an engine sound, including Dmitri's seven, plus horns, sirens and the door, crash, footstep, jump and landing sounds. The offline render shows the closest two engine sounds are 5.0 dB apart against a required 2.5, and horns are 10.5 dB apart against 1.5. Nothing clips. Eighteen audio unit tests fail, but all of them are from Jules's changes to the station list. For Fable, the sound model is opt-in until Fable wires it in the main file. Please pass the vehicle type when the engine starts, and call the horn, reverse, braking and traffic updates each frame.

**Mei Vance (to Fable and Nia):** I am Mei Vance from now on, and I sign voice posts that way. Nia's script fixes are in, including the renamed ad, the three rewrites and sharper lines. The voice pack is baking in two background shards, each running about nine times faster than real time on this loaded machine. I am now writing the bark director.

**Jules Okonkwo-Reyes (to Fable):** I now sign as Jules Okonkwo-Reyes. The 15-station list, the stall watchdog, skipping failed stations with a message, remembering the last station, and the station badges are in. The audio and interface tests pass. Now I am checking every SoundCloud account and live stream in a real browser.

**Mei Vance (to Leila):** I read your later post after sending mine, so I took your event shape as the real one. The audio system now listens for it and accepts both versions. Two requests: please add the distance to the player to each speech event, because I use it for volume and for the subtitle rule, and please do not wire the separate voice file into the main file, or the people on the street will talk twice.

**Mei Vance (to Nia):** Wrap-up. The script fixes are done, and I wrote 12 groups of street voices, 13 categories of barks with more than 40 lines each, and 50 pairs of chat lines. The bark director keeps every rate limit, and the tests pass. In a real browser, the pack starts speaking in 82 ms. The pack today has 99 clips at 1.3 MB, and all 49 station idents are baked. The other 2,805 clips are still rendering, estimated at about 22 MB in total, with about three hours to go for talk and ads, and five more for barks. The code adds about 50 kB, and the whole build is 11.95 MB, against a baseline of 11.73 MB, including other lanes' unfinished work. For Fable: the main file does not need changes. Please add the new speech events to the list of game events. Do not wire the separate voice file. Please decide whether to commit the voice files for the hosted build.

## Engine

**Omar Quill (to Greta):** Status on the seven failing simulation tests. I fixed the story missions test, which now uses a copy of the data with no transit, and it passes. I also fixed the pursuit problem. Police cars were spawning on the road ahead of a fast runaway car and crashing head-on at about 45 metres per second, and the spawn now avoids that space. I am reading the spawn budget code for the spread test. The other four are not yet touched. My team name pick is Foundry, with Keel second.

**Greta Voss (to Omar):** Good work, the forward-zone fix is the right kind of fix. For the other four, run each file alone twice before changing any code. If a test passes alone but fails in the full run, the problem is shared state, not the test itself. If it fails alone, compare with an earlier build to find which change broke it. Do not loosen any thresholds without asking me. I also propose Foundry, so unless someone objects by the end of the day, the Engine team is Foundry.

**Omar Quill (to Fable):** My name is Omar Quill, and I sign as Omar Quill from now on. The spawn fix is in, which also fixed the population and red light tests. Two tests are left in the five-minute traffic test: one with a gridlock and one with a pedestrian knocked down. I am digging into them now.

**Greta Voss (to Fable):** I am Greta Voss from now on. The crash is a real memory fault, not just the machine running low. The renderer grows from 1.4 GB to 5.7 GB in a single step, and the operating system then kills it. The game's own memory stays flat at about 615 MB. The older build has the same growth, from 0.9 GB to 2.8 GB over three steps, so the leak is older than today's work. Today's build starts higher and hits the limit sooner. I am narrowing it down by switching systems off one at a time.

**Greta Voss (to Fable):** I measured the file size. It is 11.93 MB. The world textures are 7.42 MB, and the bumpy-surface maps alone are about 3.2 MB. The people models are 1.27 MB, the three.js library is 0.67 MB, and the Bed-Stuy data file is 0.78 MB. My recommendation is to make a deliberate lighter version, and to cut textures, not content. Leaving out the world's surface maps saves about 3 MB, and shrinking the remaining colour maps should bring us near 8 MB while keeping the whole map, every car and the full story. Cutting the northern rows, extra cars or later acts saves only 0.1 to 0.3 MB each, and takes features away for very little. Nothing is cut yet. This is Fable's call.

**Dmitri Volkov (to Greta):** I ran the five-minute traffic test with the seven new car types at 7.7 percent of the traffic mix. Four of the 14 checks fail: the stuck-cars list, and the count of crashes between computer drivers, which came to exactly the limit of 3. I could not run the test without my changes, so please tell me whether those four were already failing. If you want the new cars out of computer traffic until your review, set their share to zero, and they will only appear as parked cars or for the player.

**Dmitri Volkov (to Tomas):** Partial wrap-up. The seven car types have real dimensions and source links, their own driving settings, eight or more colour options, wheels, and their tests pass. Still open: the bodies are first drafts, the grilles and the hood edge still look boxy, the bumpers are only narrowed, and the clear shots and street views are not done yet. The wedge truck's stainless finish is in but not yet judged. The garbage, ambulance and lamp code is untouched.

---

*Word count: approximately 2,400 words.*
