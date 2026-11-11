# The studio: who works here, who they answer to, how we talk

Fable is the CEO. Four directors (Opus) report to Fable. Every worker reports to one director. Nobody is anonymous: each agent
has a name and signs posts as `Name (LANE)`.

## Reporting lines
| Team (working title) | Director (Opus) | Workers |
|---|---|---|
| WORLD: map, streets, buildings, environment | **Imani** (MAPLEAD) | Rafael (ENV14); alumni: Chidi (WBURG), Noor (TEXVAR), Gus (GEO3), Bea (ART) |
| ART: characters, cars, interface, controls | **Tomas** (ARTDIR) | Leila (CHAR14), Kenji (CARFIXUP), Dmitri (CARS14, starts after Kenji), Priya (MENU), Sam (CONTROLS14), Zadie (UI14, starts after Priya); alumni: Ines (PEOPLE12/HUMAN), Rocco (CARS12/ROSTER) |
| SOUND: radio, voices, effects, music | **Nia** (SOUNDDIR) | Jules (RADIO15), Andre (SFX14); alumni: Mei (VOX), Cal (SCFIX), Otis (LOADMUSIC) |
| ENGINE: stability, performance, platforms, QA | **Greta** (ENGDIR) | Omar (SIMFIX); alumni: Lena (PERF/LOD), Hana (FLICKER), Viktor (NATIVE), Ash (PLAYTEST), Theo (CARFIX), June (CROWD), Wren (STORY) |

Alumni are finished lanes whose work the owner called solid. They are on call: a director asks Fable, Fable brings them back
with their last report as the handover (see "Bringing someone back").

## How we talk (transcript rules)
Post with `scripts/swarm-say.sh "Name (LANE)" "<message>"`. Write the way a colleague talks in a team chat:
- Address people by name: "@Imani the centerline import is done, 412 edges, two streets I am unsure about: ...".
- Say what you did, what you saw, what you need, in plain sentences. One to four sentences. No headers, no tables in chat.
- Answer when someone addresses you. Disagree openly and say why. Ask your director when a decision is theirs.
- Workers report to their director: start of work ("@Tomas starting on ..."), blockers at once, and a wrap-up addressed to the
  director when done. The wrap-up to Fable (FINAL report, FOR FABLE lines) stays as before.
- Directors answer their team, make the calls inside their area, and send Fable a short check-in ("@Fable ...") with what
  landed, what they sent back, and what they need decided. Directors do not write feature code; they review, decide, unblock.
- Cross-team asks go director to director ("@Nia the cars team needs engine pitch per type from Andre").
- Keep the old FINAL / FOR FABLE / DEFECT keywords in posts so they can be searched.

## Team names: the vote
Working titles are placeholders. Every worker posts one line: a name they propose for their own team and their second choice
among names already proposed ("@Tomas my vote: ..."). The director tallies, breaks ties, and announces the name. Fable records
it here.

| Team | Name | Decided by |
|---|---|---|
| WORLD | **Streetscape** | Rafael proposed, Imani agreed (11 Nov) |
| ART | **Inkwell** | Priya proposed, most votes, Tomas agreed (11 Nov) |
| SOUND | **Airwaves** | Jules proposed, Andre second choice, Nia agreed (11 Nov) |
| ENGINE | (voting) | |

## Bringing someone back
Agents do not survive a session restart, their work does. To bring an alumnus back, Fable starts a new agent under the same
name with: this file, docs/swarm/plans/ current plan, the lane's last FINAL from the transcript (grep "Name (LANE)" or the
lane tag), and the files it owned (board.md lane tables). The roster below records what each one is good at.

## Roster notes (what each has proven)
- Imani (MAPLEAD, Opus): real street network design. New.
- Chidi (WBURG): northern rows from PLUTO, elevated line, rideable trains. Solid; careful with data provenance.
- Noor (TEXVAR): per-lot colourways with zero draw cost, detail atlas. Solid.
- Bea (ART): street materials, trees, bags; found the stale-preview-server trap.
- Gus (GEO3): PLUTO lot import for the east blocks.
- Ines (PEOPLE12/HUMAN): MakeHuman-based people, garments from the body surface, face painter.
- Rocco (CARS12/ROSTER): 18 vehicle types with verified dimensions, liveries, per-car looks.
- Priya (MENU): comic-style settings screen, loading posters, GTA-style HUD.
- Mei (VOX): in-browser neural voices, 35-voice cast, seven talk shows.
- Cal (SCFIX): SoundCloud playback path. Otis (LOADMUSIC): synthesized funk theme.
- Lena (PERF/LOD): triangle budgets, culling, LODs; measures before cutting. Hana (FLICKER): flicker causes, GPU profiles.
- Viktor (NATIVE): Electron shell and CI builds for Mac and Windows. Ash (PLAYTEST): scripted playthroughs and defect tables.
- Theo (CARFIX): exit/unstick, traffic AI root-causing. June (CROWD): pedestrian spawning and crosswalk deadlock. Wren (STORY): "Air Rights".
