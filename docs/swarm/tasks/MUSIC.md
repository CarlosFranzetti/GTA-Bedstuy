# MUSIC - legal sources for real recorded music (research only)

Owner: MUSIC (research, Haiku). Scope: find legal sources of real recorded music for the radio stations in docs/RADIO.md, report reachability from this sandbox, and say what the user must do. No source edits, no audio shipped into the repo. Sample files live in `/tmp/claude-0/-home-user-GTA-Bedstuy/b724b335-0535-5878-9045-0474ae836c7e/scratchpad/music/samples-cc0-openlofi/` (10 mp3, 1.0-2.4 MB each, with SHA256SUMS.txt, SOURCES.txt and licence copies).

## Reachability from this sandbox (checked 2026-11-03)

Reachable: `raw.githubusercontent.com` (HTTP 200), `registry.npmjs.org` (200, search API works), `api.github.com` (200 for search; per-repo API returns 403 unless the repo is attached), `github.com` (400 on root probe). WebSearch works.

Blocked or unreachable (`curl -sI` returns 000 or a proxy 403): freemusicarchive.org (proxy 403 policy denial), files.freemusicarchive.org, ccmixter.org, jamendo.com and api.jamendo.com, archive.org, musopen.org, incompetech.com, audionautix.com, opengameart.org, freepd.com, bensound.com, api.mixcloud.com, widget.mixcloud.com, w.soundcloud.com, youtube.com, api.audius.co, bandcamp.com, cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, code.jquery.com.

## Source table

| # | Source | Licence (as checked) | Reachable here | Genre fit vs stations | Verdict |
|---|---|---|---|---|---|
| 1 | Open Lo-Fi (btahir/open-lofi, 166 tracks in the mirror) via `MdShahnawazSheikh/thaxas-lofi` mirror | CC0-1.0 declared by upstream README and LICENSE (raw fetch). Upstream says the tracks are Suno v5 AI generations donated by the uploader | Yes: mirror audio over raw.githubusercontent.com, 10 tracks downloaded and verified | Jazz-hop, funk-soul, late-night, soul: fits Nostrand Jazz-Rock, Lewis Ave Echo-Dub, Flashback 80s (retro bounce); no rap, trap, house | USE, with a caveat: CC0 is declared by the uploader, not independently verified; AI chain-of-title unverified. Needs orchestrator approval per PRD 2.1 |
| 2 | DURU-AI CC0 BGM (`uncle-sheepsky/duru-ai-cc0-bgm`, plus `hyak-cc0-bgm`, `duru-cc0-bgm`) | CC0-1.0 in LICENSE (raw fetch). Track readme says some tracks layer third-party CC0 sfx and VSCO 2 CE (CC0) samples | Yes (README, LICENSE). MP3 320 kbps, so tracks are likely 5-8 MB each: not downloaded (size cap) | Instrumental bed, lounge, music box, steel pan, Korobeiniki; weak for pop, rap, trap | MAYBE: good for ambient or talk beds. Track sizes not verified |
| 3 | Beatscribe homebrew VGM (`Beatscribe/homebrew_vgm`) | CC0-1.0 (LICENSE raw fetch; README says CC0, credit optional) | README yes; audio not listed from here (no tree access) | 8-bit fanfares and jingles: fits WBSY station IDs and Radio jingles, not the genre stations | MAYBE for jingles, unverified files |
| 4 | SoundSafari CC0-1.0-Music (`SoundSafari/CC0-1.0-Music`) | CC0-1.0 (LICENSE raw fetch). README: ~7000 songs, about 40 GB, grouped by source website; per-file licence is not verified | README yes; repo tree not reachable (no attach) | Broad but unsorted; very large | NOT USED. Too big to ship, per-track licence must be checked. User may browse it for ideas |
| 5 | XSXB-Band (`sparklecatta-lang/XSXB-Band`) | MIT for the code; README says it plays "real CC0 recordings" of instruments | README yes; the recordings are instruments, not songs | Instrument samples, not songs | NOT USED. Generative tool, not a song source |
| 6 | Free Music Archive, ccMixter, Jamendo (CC), Incompetech, Audionautix, Bensound, Internet Archive netlabels, Musopen | FMA: mixed CC licences per track (must check each). Jamendo: CC per track. Incompetech: CC BY 4.0 per WebSearch snippets (attribution "Kevin MacLeod (incompetech.com)"). Musopen: public domain recordings, not re-verified | NO: all blocked (see above) | Varies; Incompetech is mostly cinematic and cinematic-lo-fi | NOT VERIFIED from here. User can download in a normal browser after checking each licence |
| 7 | Open Goldberg Variations (CC0 recording and score) | CC0 per WebSearch (2012 release); Bandcamp, archive.org and MuseScore pages not fetched | NO (archive.org and musescore not reachable); WebSearch only | Classical, not in the 10 stations | Not used; not verified for MusicXML or MIDI formats |
| 8 | Mixcloud widget (DJ mixes) | Widget docs at mixcloud.com/developers exist; terms snippet is third-party and stale. Permits embedding on personal sites per tracker snapshot (not confirmed on mixcloud.com/terms) | Docs via WebSearch only; widget.mixcloud.com not reachable | DJ mixes, all genres | VIABLE as a Radio SC-style list for the user. Verify terms at mixcloud.com/terms first. Autoplay needs a user gesture (same as SoundCloud) |
| 9 | YouTube IFrame Player API | Embedded playback is allowed under YouTube API Services Terms; exact autoplay and mobile clauses not confirmed (WebSearch returned revision history only). The API reports onAutoplayBlocked (Nov 2023). A July 2025 change added orientation and attestation flags | Not reachable from here | Any genre, official uploads | VIABLE for a user-pasted list, but hidden background playback may break Terms and mobile autoplay. Treat as a visible player only; do not claim it is legal as a hidden radio without a check |
| 10 | Audius public API | Docs say the API is free, "adhere to the guidelines" and credit artists. Key optional (app_name strongly encouraged). Embed terms not confirmed | Not reachable (api.audius.co 000) | Electronic, hip-hop, house-leaning; creator-uploaded, licences vary per track | NOT VERIFIED. Per-track licence must be checked before use |
| 11 | Bandcamp embeds | Not fetched | NO | Any genre | NOT VERIFIED. Embed-only player, per artist settings |
| 12 | Internet Archive embeds | Not fetched | NO | Public domain and CC items, many 78 rpm and 80s-era | NOT VERIFIED. Good candidate for a later check |
| 13 | npm: `tone` 15.1.22 (MIT, Tone.js) | MIT, verified from registry metadata | Yes | Generative and synth music in browser | USABLE for generative stations (house, dub, psych); not recorded songs |
| 14 | npm: `@generative-music/utilities` 5.2.0 (MIT) | MIT | Yes | Web Audio generative helpers | USABLE as helpers |
| 15 | npm: `chiptune3` 0.8.10 (MIT) | MIT | Yes | Chiptune module player; plays tracker music files | USABLE only with tracker files whose licence is checked |
| 16 | npm: `free-music-library-mcp` 0.4.3 (MIT) | MIT, an index of CC music (points to external hosts) | Yes, but the catalogue data is external | Broad catalogue index | Index only; download hosts blocked here |
| 17 | npm: `workfm` 0.1.5 (ISC) | ISC; streams Jamendo through its API (needs a Jamendo client id) | Yes, but Jamendo API blocked | Jamendo CC catalogue | Usable by the user with their own Jamendo key |
| 18 | npm: `8bitpeoples-mcp` 1.0.5 (MIT) | MIT on the wrapper; label releases' own licence not verified | Yes (wrapper only) | Chiptune label catalogue | Check each release licence before use |
| 19 | npm: `jinglescript`, `@mubert/n8n-nodes-mubert` | MIT (wrapper); Mubert music needs their API and licence terms | Yes | AI-generated jingles / royalty-free generator | Not used. Paid or account terms |

## Verdict and plan

The fastest legal path to real songs:

1. **Open Lo-Fi (CC0, declared, 166 tracks).** Already 10 samples prove the audio is reachable and plays as mp3. The user can download the full set in a browser from the mirror (`https://cdn.jsdelivr.net/gh/MdShahnawazSheikh/thaxas-lofi@<commit>/audio/<filename>`, or the raw GitHub audio path) and drop it into a folder named for a station. Filename keywords in docs/RADIO.md: "jazz" (Nostrand Jazz-Rock), "funk" (Nostrand), "echo" or "dream" (Lewis Ave, Hazy Tompkins), "soul" (Flashback 80s is weaker). Example folder: `Nostrand Jazz-Rock/` (then the library picks it up through **Fill from folder**). Record in CREDITS: source, licence, and the AI-origin caveat.
2. **Mixcloud and YouTube pasted lists**, parallel to Radio SC. Each needs a Radio SC style link list. Build cost is about one lane of work (copy RADIO2's pattern). Check each service's terms first, and do not claim hidden background play.
3. **Full CC library by hand** (FMA, Jamendo, Incompetech, Internet Archive, Musopen): the user downloads files in a normal browser after checking each track's licence, then keeps the CC-BY credit lines in CREDITS.md. Sandbox cannot reach these hosts, so no file or licence from them is verified here.

Generative stations (house, dub, techno, trap, psych) can use `tone` (MIT) to synthesise music in browser with no licence risk. That is already close to the existing synth loops.

Gaps: no rap, trap, house, dub or drill recordings were found that are both CC0 and reachable. The only fully-CC0 pack found covers lo-fi and retro bounce. The user must supply rap and trap from their own library or a licensed service.

## Samples (proof)

10 files, all Open Lo-Fi (CC0 declared), in the scratchpad folder above:
almost-floating, dusk-between-stoops, basement-groove-86, block-party-slow-jam, cafe-da-tarde, ashes-in-the-coffee-cup, breezy-afternoon-terrace, 3-am-echoes, antenna-after-midnight, 3am-sink-light (mp3). SHA256 values are in SHA256SUMS.txt. Not in the repo. Nothing was executed from them.

## Not verified

Freemusicarchive, Jamendo, ccMixter, Incompetech, Audionautix, Internet Archive, Musopen, Mixcloud and YouTube terms, Audius and Bandcamp embed terms, Beatscribe audio files, DURU track file sizes, Open Goldberg file formats. All of these were either unreachable here or only seen in WebSearch snippets.
