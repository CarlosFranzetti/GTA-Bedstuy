# SOUND BAR: the sound direction (Nia, SOUNDDIR, 11 Nov)

The bar every sound lane is held to. Nobody on this team can listen, so every claim ships with a number from an offline
render or a real-browser probe (see "Checks"). Owner's words we answer to: engines and horns "awful, each should be a bit
different"; "GTA style hosts and talk radio and interviews and talk shows"; "various human sounding voices"; peds "interact".

## 1. The dial (15 stations)
- Range before quantity. The dial must cover at least eight distinct moods/genres; no more than five stations may be
  club/electronic (house, techno, DJ-set culture). Required lanes of taste: club/techno, house/disco/boogie, hip-hop,
  reggae/dancehall/dub, Latin (salsa/reggaeton/cumbia, it is Bushwick), soul/jazz/R&B, indie/eclectic, freeform/weird,
  the 80s station, two talk stations. Bed-Stuy is a hip-hop and Caribbean neighbourhood: a dial without hip-hop and
  dancehall fails the bar whatever else it has.
- Sources: SoundCloud only through the official widget (Dekmantel, Boiler Room, RA, the RA-NYC pool, other labels and
  radio shows with public sets); internet radio only as public stream URLs the broadcaster publishes; real artist, set and
  show names shown on the dial and spoken by DJs. Two talk stations are ours (scripted, voiced locally), never third party.
- Every station has a fallback source: a second stream URL or a SoundCloud pool. The 80s station especially (SomaFM may
  403 from some networks). A station with no working source hides from the dial; it never plays silence.
- Keep Mei's eight DJ personas: map each onto the new station that fits (Pearl to dancehall, Odell to dub, Tommy to the 80s,
  Lou to disco/boogie, Tayo to hip-hop, Deja to house, Wren to freeform, Cass to the techno/RA station). New stations without
  a persona get a station ident voice (Trent/Noelle) until VOICE14 adds hosts.
- DJ over intros: on SoundCloud stations, the DJ speaks over the first 6 to 20 s of a new set (sets open slowly), music
  ducked; never mid-set except the 8-minute idle fill. Live streams that carry their own hosts (KEXP, WFMU style): our DJ
  speaks only a tune-in ident of 4 s or less, never over their presenter. Talk stations own the speech queue.
- Degrade in this order, always audible within 3 s of tuning: playing source -> fallback source -> station ident plus
  our synthesized bed (quiet, on-genre) with the hint "needs the hosted build / internet" -> skip on the next tune. One
  console.warn per station per session, no retry storms (back-off 30 s, then 120 s).

## 2. Mix targets (measured on our own WebAudio graph)
All levels are short-term loudness (3 s window, K-weighted, LUFS) at default volumes, measured by an OfflineAudioContext
render of the real graph. The SoundCloud iframe and non-CORS streams play outside WebAudio: they are set by widget/element
volume to match these numbers by reference, and cannot pass the limiter (state that in reports, do not pretend otherwise).

| Bus / event | In the car | On foot |
|---|---|---|
| Radio music (synth bed, decks, CORS streams) | -16 | n/a (only diegetic car radios: -28 at 5 m, low-passed 3 kHz) |
| Radio speech (DJ, talk, ads) | -16, speech is the anchor | n/a |
| Own engine, cruise / full throttle (radio on) | -24 / -19 | n/a |
| Own engine, radio off | -21 / -16 | n/a |
| Other traffic (nearest 4 voices) | -30 | -24 at 10 m |
| World ambience (day/night bed, birds, crickets) | -34, low-passed 2.5 kHz (cabin) | -26 |
| Horn (own) | -14, short, the loudest repeating sound | -16 |
| Crash / impact | peak -3 dBFS, -12 short-term | same |
| Ped barks and dialogue | -26 through glass, low-passed | -20 at 2 m, inverse distance to 25 m |

- Ducking: DJ over music -13 dB (gain 0.22, as Announcer does now); talk bed under hosts -9 dB (0.25 of 0.7). Attack 120 ms,
  hold 250 ms after the last word, release 800 ms. Mission dialogue and ped speech duck the radio by -6 dB, the engine by -3 dB.
- Master: one DynamicsCompressor as a limiter before destination (threshold -3 dB, knee 0, ratio 20, attack 3 ms,
  release 120 ms), then master gain. Ceiling: no sample above -1 dBFS in any offline render. Today master goes straight to
  destination with no limiter: that is the first change SFX14 makes (one node, AudioSystem).
- The loading theme (Otis) measured -5.5 dBFS peak, -13.3 dB RMS, but 89.6 % of energy below 500 Hz and 1.2 % above 4 kHz:
  it reads dark and boomy on laptop speakers. Target for any music we synthesize: presence (2 to 5 kHz) at least 10 %,
  highs at least 3 %, sub at most 8 %.

## 3. Vehicle identity (SFX14)
Each type must be recognisable with eyes closed within 2 s of idle or 3 s of a pull-away. Class rules:
- Bus / garbage / box truck: diesel six, idle 550 to 650 rpm, injector clatter, turbo whistle on load, air-brake hiss on
  stop, reverse beeper; bus adds kneel hiss and door chime. Slow to rev (high inertia), no limiter bounce.
- Beater: small four with a lumpy idle, random misfire (1 in 20 to 40 cycles), heat-shield rattle at 1.5 to 2.5 krpm, exhaust
  leak buzz, belt squeal on start, weak wavering horn.
- V8 (muscle, cop, pickup, town car only): cross-plane lope at idle, strong half-order, exhaust resonance 80 to 200 Hz,
  burble/crackle on lift-off (muscle most). Today eight of 18 types are V8 (cab, luxury, ambulance and dollar van too): cut
  that to four. Cab becomes a hybrid four (electric creep below 15 km/h, engine cuts in); luxury a hushed turbo six with
  little exhaust and more tyre/wind; ambulance a diesel V8 with clatter; dollar van a tired V6 with an exhaust leak.
- Electric (CARS14 adds them): no firing order. Inverter whine rising 1 to 8 kHz with speed, motor hum, pedestrian warning
  tone below 30 km/h, near silence at idle, tyre and wind carry the speed. Must still read at -24 LUFS in the cabin.
- Horns by class, fundamentals at least 6 % apart between classes: compact single disc (420 to 500 Hz, thin), sedan dual tone
  (a minor or major third apart), luxury dual tone low and clean, truck/bus air horn (250 to 330 Hz, slow 80 ms attack, buzzy),
  beater sagging single tone, cop horn plus yelp. Hold = continuous; tap = 150 ms blip.
- Road and body: tyre roar by surface (asphalt, cobble, steel plate), suspension thunk on curbs and potholes, door open/shut
  per class (van slide, bus fold), skid by speed, glass on hard impact. All synthesized, no samples needed.

## 4. Voice strategy
- Pre-render first. The talk shows, ads and DJ lines are fixed text (about 37,000 characters, about 40 minutes of speech).
  Live Kokoro runs at 4 to 7x slower than real time on a CPU-only machine, so live rendering cannot carry a talk station.
  Decision: bake every fixed line offline with the same Kokoro voices (Apache-2.0, free), ship as a voice pack for the
  hosted and native builds. Slots ({time}, {street}, {weather}) are baked as short fragments over their finite value sets.
- Runtime order for any line: voice pack clip -> ClipCache -> live neural (only if the engine measured itself at or below
  1.6x real time, or WebGPU) -> SpeechSynthesis (role slot, pitch, rate) -> silent with subtitles. Each step logs once.
- Pack format: MP3 mono 24 kHz 48 kbit/s (decodes everywhere, Safari included), each clip loudness-normalised to -16 LUFS,
  peak -1.5 dBFS, head/tail silence trimmed to 30 ms. Manifest `voice/manifest.json`: { version, engine, sampleRate,
  entries: { [ClipCache key]: { file, dur, lufs, peak, who, text } } }. Budget 25 MB hosted/native; never in the artifact
  (the 12 MB artifact keeps SpeechSynthesis and optional live HD).
- If the owner picks ElevenLabs: the same manifest and pack, generated once by an offline script with a cast-to-voice_id map;
  engine field `elevenlabs:<model>`. No API key ever ships in a client; nothing calls ElevenLabs at run time. Hosted/native
  only, same 25 MB budget, credits counted before the run (37k characters now, perhaps 55k with ped barks). Until the owner
  answers, Kokoro is the engine and no credits are spent.

## 5. Humour and darkness (scripts)
- Punch up: landlords, developers, banks, tech, police bureaucracy, politicians in general, advertisers, the host himself.
  Never at tenants, the poor, immigrants, a religion, an ethnicity, disability or a body. No slurs, no fake accents spelled
  out phonetically, no real people, no real brands or real shops (ids and filenames too).
- GTA edge without cruelty: dark is fine (crime, money, the city eating people), cheap is not. Every bit needs a turn in the
  last three words; cut any line whose joke needs explaining. Hosts are characters with an appetite, not neutral narrators.
- Rhythm: lines under 25 words, a laugh beat every 20 to 30 s, no exchange longer than six lines without a turn.

## 6. Checks each lane reports (numbers, not adjectives)
- Every render: peak dBFS and short-term LUFS per bus (table above), headroom to -1 dBFS, NaN/denormal count = 0,
  live node count after stop = 0.
- SFX14: an 18-plus-type matrix of distances between 1/3-octave spectra at idle, 50 % and full throttle; no two types of
  different classes below 0.15 (cosine distance), any pair below 0.05 named as twins and fixed; horn fundamentals table;
  CPU cost of 8 engine voices (ms per 1 s rendered).
- RADIO15: per station, in real Chromium: "reached playing state" yes/no, time to first audio (ms), the source that played
  (primary/fallback/bed), stall count over 120 s; plus the same from a second network if any URL 403s here.
- VOX/VOICE14: time to first audio per line (pack, cache, live), render speed (seconds of compute per second of audio),
  pack size, per-clip LUFS spread (all within -16 +/- 1), subtitle sync error under 150 ms.
