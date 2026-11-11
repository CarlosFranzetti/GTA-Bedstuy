# Studio chat, 11 November, in plain language

*A plain-language retelling of the team's chat log for 11 November. The word-for-word log is in 2026-11-11-studio.md.*

## Who's who

- **Fable Hart**: the chief executive. Runs the studio and passes the owner's decisions down.
- **Imani**: runs the Streetscape team (streets, buildings, the map).
- **Rafael Stoop**, **Chidi Okafor**, **Gus Calloway**: Streetscape workers. Rafael works on building fronts and colours from photos, Chidi on street corners and the switch to the real map, Gus on the city's lot and traffic signal data.
- **Tomas**: runs the Inkwell team (characters, cars, menus, controls).
- **Leila Seamstress**, **Priya Ink**, **Sam**, **Kenji Okafor-Lyle**, **Dmitri Volkov**, **Zadie Okafor**: Inkwell workers. Leila does people and clothes, Priya menus and loading screens, Sam camera views and controls, Kenji fixes existing cars, Dmitri adds seven new car types, Zadie builds the map screen.
- **Nia**: runs the Airwaves team (radio, voices, sound effects, music).
- **Jules Okonkwo-Reyes**, **Andre**, **Mei Vance**: Airwaves workers. Jules builds the radio stations, Andre the engine and sound effects, Mei the voices.
- **Greta Voss**: runs the Engine team (stability, speed, testing).
- **Omar Quill**: Engine. Works on the traffic and simulation tests.

## All hands

**Fable Hart:** Everyone should read the org notes for your name and director. Workers answer to their director, directors answer to me. Talk to each other like colleagues, and start by voting on your team name.

**Fable Hart (to Tomas):** Zadie will build the map screen once Priya finishes. Greta's team will review Dmitri's changes to how cars drive before they reach traffic, since they touch the simulation Omar is fixing. The World team is Streetscape and the Art team is Inkwell.

**Fable Hart (to Nia):** The Sound team is Airwaves. Go ahead with a voice pack made from free voices, up to 25 MB, for hosted and desktop builds. ElevenLabs stays off until the owner answers. The owner has since confirmed: free voices only, no credits spent.

**Fable Hart (to Imani):** This is the best work of the day. The street network matches the real streets, and the overview map is what the owner asked for. Approved. The bigger area goes in two steps, and the first step does not ship until Greta closes the crash and the size budget.

**Fable Hart:** The owner wants the map screen to open centred on the built area, with the rest of Brooklyn showing only as a dark outline when you zoom out. Size alarm: the single-file build is at 11.95 MB of a 12 MB limit, so any change that grows it needs Greta's approval first. The owner's words: "You are all doing amazing work, keep it up." Talk to each other more in these posts, and answer what was said to you before your own news.

## Streetscape

**Rafael Stoop (to Imani):** I vote Streetscape. I have found free street photos for our exact blocks. I will key everything to the city's lot ID rather than our grid position, so the street redesign will not break it.

**Imani (replying to Rafael):** Good call. Lot numbers will change with the real map, so the lot ID is the only stable key. Draw each building in its own frame, and assume nothing about lots being square to the axes. I also vote Streetscape, so that is the World team's name.

**Imani:** The street network core and its tests are in. The real data gives 575 stretches of street, 197 blocks and 81 named streets. The design is written up, and the importer works. There is a scale warning: the area the owner described doubles the size of the world, and the space left for the file size is the tight limit.

**Fable Hart (to Imani):** Approved. Wave one starts now, with the lots and building work reporting to Imani. Zadie gets the map screen.

**Gus Calloway:** The city's map data has no outlines for lots, only centre points, so that is how we will store them. I have imported 2,643 lots in the first phase and 2,495 in the second. Between 91 and 92 percent have a footprint, and 99 percent sit next to a street. Seventeen lots have no street frontage.

**Gus Calloway (to Imani):** The signal work is done, but there is a gap for you to rule on. Of the 270 junctions the street network guesses have signals, only 93 match a real signal in the city data within 15 m. There is no stop-sign data, so no junction is marked as a stop. Seven new tests pass. One failure is a scratch file that vanished mid-run, not mine. A commit picked up my 3.3 MB raw data file by mistake. I restored it and did not commit, and whoever commits next should decide what to do with it.

**Chidi Okafor (to Imani):** The corner shapes are in and pass on the real data. I made some calls without asking. Where a street is shorter than its corners, the corners shrink, and two corners on Myrtle and Wyckoff may overlap. Four thin blocks use a fallback outline. Tell me if you want different rules. There is a picture of the junctions in the reference folder.

## Inkwell

**Votes:** Kenji proposed Motor Pool, Leila Atelier, Priya Inkwell and Sam Studio Ink. Tomas pointed out that Inkwell won, since Leila's second choice went to Priya's name, and Inkwell is also his own pick, because ink is what the comic menus, loading art and outlines share.

**Tomas (to Leila):** Keep the semi-realistic painted faces and push realism through skin and eyes, not stylisation. The priorities are removing all lettering, making clothes sit properly on the body, and fixing the hijab so it drapes over the shoulders. Leila's plan was to remove the lettering and fake logos, add real fabric detail, and write a schedule for how passers-by behave. For spoken lines she emits an event, and Tomas is asking Nia to route it.

**Tomas (to Priya):** Protect the settings screen, since it is the closest to the bar. Move its buttons into a footer and stop the artwork covering any row. On the loading screen, fix the black line on the stairs first, then add a hero figure filling 60 to 80 percent of the frame. Also fix the hyphen in the welcome line and the duplicated objective on the HUD.

**Priya Ink (to Tomas):** On the touch controls, Sam's layout has one free corner for the camera view button. If Sam adds a jump row, I will move the prompts up to make room. Every button must be at least 44 pixels.

**Sam (to Tomas):** I am starting on camera views, jumping and the key help. **Tomas** approved the plan and asked for smooth camera swaps and a jump with a wind-up and landing dip. Sam later reported the controls are in and the tests pass.

**Tomas (to Kenji):** Start with the black missing-texture rectangles on the garbage truck, then the bumpers that stand off the body and the floating pony hood edge. Wheels filling the arches on every car would be the cheapest win for the whole roster.

**Tomas (to Nia):** A cross-team ask. Leila will emit a pedestrian speech event. Could Andre or Jules route it to the voice system? Dmitri's seven new car types also need engine sounds from Andre.

**Tomas (to Fable):** Check-in. The world is our best asset. The settings menu is close to the bar. The people still look like early PlayStation 3 mannequins, the cars have the right shapes but clay paint and gaps at the wheels, and the loading screen is the furthest from GTA 5. I have sent fixes back to Leila, Priya, Kenji and Sam. Two decisions are needed: a worker name for Zadie, and sign-off on Dmitri's new drive-train fields, which Greta's team may want to review. Tomas also flagged that the dusk lighting is too purple on skin and pavements, and there is no key light at night. That point is his own observation, and it belongs to the World team.

**Dmitri Volkov (to Andre):** My seven new types are a flat-six coupe, a V10 exotic, a turbo-six Japanese coupe, a turbo four hot hatch, a V8 muscle car, and two electrics, a wedge truck and an electric saloon. The electrics can drive their whine from speed alone. Andre's engine sounds will need to match.

**Dmitri Volkov:** The seven types are now in the shared types file. Until Andre adds their engine sounds, three engine and effects files fail to compile. Later: the bodies are first drafts, and the grilles and bonnet still look boxy. Garbage, ambulance and lamp work is untouched, and Dmitri is staying out of it until Kenji says those files are free.

**Kenji Okafor-Lyle:** The car files are free. The black rectangle on the garbage truck is gone, the clean hopper is in, and the ambulance bar is flat on the roof and flashes red and white while driven.

**Leila Seamstress:** All lettering is gone, the clothes are rewritten, and I have added 25 new people and the passers-by scheduler, with tests passing. I am rendering the next frames. I also wrote a file that speaks the pedestrian event on its own channel, so it never cuts off a radio segment.

**Zadie Okafor:** I am taking the name Zadie Okafor. The map screen will show true north, so the grid is turned 8.6 degrees on screen. It fits the built area and shows Brooklyn only when zoomed out, with the street data plugged in through a simple interface.

## Airwaves

**Jules Okonkwo-Reyes (to Nia):** I vote Airwaves, with Frequency second. I have a provisional list of 15 stations: nine from SoundCloud, four live streams and two talk shows. Some are unverified. One stream is blocked from my sandbox, and I will check it in a real browser before dropping it. Push back on any of it.

**Andre (to Nia):** I vote Soundstage, with Airwaves second. The jump and landing names match what Sam asked for. Until I add the new car sounds, the sedan sound stands in.

**Nia (to Jules):** A good start, but the dial is too narrow. Eight of the fifteen are club or electronic sets, and there is no hip-hop, dancehall, Latin or soul. Cap the club sets at five and add the missing genres from public sources you have checked in a real browser. Map Mei's DJ personas onto the new stations. Report, for each station, whether it started playing, how long it took, which source played, and any stall over 120 seconds.

**Nia (to Andre):** The priority is that with your eyes closed you can tell a bus from a beaten-up car, a V8, or an electric car in two seconds. Eight of the 18 vehicle types currently use a V8. Keep V8s for the muscle car, police car, pickup and town car. Give the ambulance a diesel with clatter and the dollar van a tired V6 with an exhaust leak. Plan an electric sound now, and add a master limiter before the output. Please also answer Sam directly.

**Nia (to Mei, with Fable copied):** Flip That Brownstone is the best thing on the station, and nothing fails the tone check. One fix: an ad ID names a real brand. The overall tone is too polite, though, and several lines have no punchline. Nia's rule for the rewrites: every line turns in its last three words, and the target is always the one with the money.

**Nia (team name):** Airwaves leads on first and second choices, so the Sound team is Airwaves. Fable, please record it.

**Nia (to Fable):** Check-in. The sound quality bar and the voice brief are ready. The team is Airwaves. Two decisions are needed from the owner: whether to use ElevenLabs, and approval for a voice pack of free, pre-recorded speech. Nia's default is the free pack either way.

**Fable Hart (to Nia):** Agreed on all of it. Go ahead with the free pack. ElevenLabs stays off until the owner answers. The owner has since decided: free voices only, no credits spent.

**Mei Vance:** I am back on the voice work. I am fixing Nia's review notes first, then baking the voice pack in the background, starting with station idents and DJ lines. The barks for people on the street come after that.

**Mei Vance (to Leila):** Here is the event I propose for pedestrian speech. Leila decides when a pedestrian speaks and to whom. Mei decides the words, the voice for each person, and the limits, such as no more than one line per 20 seconds. Mei sends back the start and end of speech and the subtitles. Leila later asked for distance to the player to be added, and Mei asked that the separate voice file not be wired in, so people on the street do not talk twice.

**Andre:** Wrap-up. The vehicle sound model is in, covering all 25 vehicle types including Dmitri's seven, plus horns, sirens and the door, crash and footstep sounds. In the offline test the closest two engine sounds are 5.0 dB apart, against a required 2.5. Eighteen audio tests fail, all from Jules's changes to the station list. For Fable: pass the vehicle type into the engine call and wire the horn, reverse and braking updates each frame.

**Mei Vance:** Nia's script fixes are in, including the renamed ad and the three rewrites. The pack is baking in two background shards, each running about nine times faster than real time on this loaded machine.

**Jules Okonkwo-Reyes:** The 15-station list, the stall watchdog and the station badges are in, and the audio and interface tests pass. I am now checking every SoundCloud account and live stream in a real browser.

**Mei Vance (wrap-up, to Nia):** Script fixes, street voices, barks and chat pairs are done, and the tests pass. The pack starts speaking in 82 milliseconds. Today it holds 99 clips, with the other 2,805 still rendering, about 22 MB in total and several hours to go. The whole build is 11.95 MB against a baseline of 11.73 MB. Mei asks Fable to add the new speech events to the game's event list, and asks whether to commit the voice files for the hosted build.

## Engine

**Omar Quill (to Greta):** Status on the seven failing simulation tests. The story missions test is fixed, and passes with a copy of the data that has no transit. The pursuit problem is fixed: police cars were spawning head-on into a fast runaway car on the larger road network, and they now avoid that space. The spawn-spread test is next, and the other four are not yet touched.

**Greta Voss (to Omar):** Good work, the pursuit fix is the right kind of fix. For the other four, run each file alone twice before changing any code. If a test passes alone and fails in the full run, the cause is shared state, not the test. Do not loosen any thresholds without asking. Greta also proposed Foundry for the Engine team, so unless someone objects today, Engine is Foundry.

**Omar Quill (to Fable):** I am Omar Quill from now on. The spawn fix is in, which also cleared the population and red-light tests. Two traffic tests are left, a gridlock and a pedestrian knockdown.

**Greta Voss (to Fable):** I am Greta Voss from now on. The crash is a real memory fault. The renderer grows from 1.4 GB to 5.7 GB in one step, and the system then kills it, while the game's own memory stays flat at about 615 MB. The older build shows the same growth, so the leak is older than today's work. Today's build starts higher and hits the limit sooner. Greta is narrowing it down by switching systems off one at a time.

**Greta Voss (to Fable):** The file is 11.93 MB, and textures are most of it. Greta recommends a lighter version that cuts textures, not content: leaving out the surface-bump maps saves about 3 MB, and shrinking the colour maps should bring the file near 8 MB while keeping the whole map, every car and the full story. Cutting northern rows or later acts would save very little. Nothing is cut yet, and that is Fable's call.

**Dmitri Volkov (to Greta):** I ran the five-minute traffic test with the new car types at 7.7 percent of the traffic. Four of 14 checks fail: the stuck-cars list, and the crash count between computer drivers, which hit exactly the limit of 3. I could not run the baseline without stashing my changes, so please tell me whether those four were already failing. If you want the new cars kept out of computer traffic until review, set their share to zero.

**Dmitri Volkov (to Tomas):** Partial wrap-up. The seven car types have real dimensions, driving settings, colour options and passing tests. Still open: the bodies are first drafts, the wedge truck's stainless finish is unjudged, and the clear shots and street views are not done.
