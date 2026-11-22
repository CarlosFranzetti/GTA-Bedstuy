# SCMIXES: SoundCloud mixes per radio station

Date: 22 Nov 2026. Output: `src/audio/sc/mixes.json` (valid JSON, all ten keys).

## Headline

- soundcloud.com does NOT resolve from this session (`getaddrinfo ENOTFOUND`). No SoundCloud page could be opened.
  Every entry is `search-result-only`. Zero are `page-opened`.
- Titles, DJ names and durations come from search snippets and from set79.com tracklist pages (a third-party
  tracklist site). The SoundCloud URL is the path shown in the search result or in a set79 link. None of it is
  confirmed on SoundCloud. Before any entry goes live, someone with SoundCloud access must open each URL.
- Stations short of seven: `sc`, `bkhouse`, `stoop`, `hiphop` (2 of 7), `dublab` (5 of 7), `latin` (5), `boogie`
  (4, and not four different DJs), `yard` (7 but mostly individual DJs, not sound systems or reggae radio).

## Per station

### weird: The Lot Radio (11 entries, 11 different DJs)
Account: `soundcloud.com/thelotradio` (the links appeared in set79.com tracklist paths for that account).

| DJ | Title (as seen) | URL | Duration | Checked |
|---|---|---|---|---|
| Naone | Naone @ The Lot Radio 01-11-2025 | soundcloud.com/thelotradio/naone-the-lot-radio-01-11-2025 | not seen | search-result-only |
| Loidis | Loidis @ The Lot Radio 01-20-2025 | .../loidis-the-lot-radio-01-20-2025 | not seen | search-result-only |
| Tauceti | Tauceti @ The Lot Radio 02-25-2025 | .../tauceti-the-lot-radio-02-25-2025 | not seen | search-result-only |
| Lea Occhi | Lea Occhi @ The Lot Radio 07-25-2025 | .../lea-occhi-the-lot-radio-07-25 | not seen | search-result-only |
| Dyslecta | Dyslecta @ The Lot Radio 12-04-2025 | .../dyslecta-the-lot-radio-12-04 | not seen | search-result-only |
| Subb-an | Subb-an @ The Lot Radio 10-09-2026 | .../subb-an-the-lot-radio-10-09 | "hour-long" per a blurb | search-result-only |
| Ken Ishii | Ken Ishii @ The Lot Radio 10-23-2026 | .../ken-ishii-the-lot-radio-10-23 | not seen | search-result-only |
| Mor Elian | Mor Elian @ The Lot Radio 10-26-2026 | .../mor-elian-the-lot-radio-10-26 | "an hour" per a blurb | search-result-only |
| Psyk | Psyk @ The Lot Radio 07-20-2026 | .../psyk-the-lot-radio-07-20-2026 | not seen | search-result-only |
| P Relief | P Relief @ The Lot Radio 02-26-2026 | .../p-relief-the-lot-radio-02-26 | not seen | search-result-only |
| Paula Tape | Paula Tape @ The Lot Radio 09-18-2026 | .../paula-tape-the-lot-radio-09-18 | not seen | search-result-only |

Unsure: the dates and the "Tauceti" 2025 and 2026 sets are different sets by one DJ; only the 2025 one is kept.
Titles are set79's, not SoundCloud's. Lot Radio sets are often one to two hours, but that is not confirmed here.
Left out: Dan Ghenacia, Andrew James Gustav (the URL is cut off in the search result).

### sc: Resident Advisor (0 of 7)
Official account: `soundcloud.com/resident-advisor` (seen only as an `m.soundcloud.com` link in a search result; not opened).
RA.1060 (Ogazón) exists on ra.co with a 1:28:06 runtime; no SoundCloud URL was seen for it. Nothing listed.

### bkhouse: Boiler Room (0 of 7)
No official `soundcloud.com/boilerroom` track URL was seen. Search results were set79 tracklist links under
`soundcloud.com/platform/...`. The `platform` account is not confirmed as Boiler Room's; those were not used.
Other Boiler Room sets (Solomun Tulum 2015, Kowton London 2016, Pete Rock NY 2013) were mentioned with no URL. Not listed.

### dublab: Dekmantel (5 entries, 5 DJs)
Account: `soundcloud.com/dkmntl` (the account appears on Dekmantel's own mix pages). Mix 490 is a podcast episode;
the four others are festival sets on the same account, not podcast episodes.

| DJ | Title (as seen) | URL | Duration | Checked |
|---|---|---|---|---|
| Loidis | Loidis at Dekmantel Festival 2025 | dkmntl/loidis-at-dekmantel-festival-2025 | at least 2h53m (timestamps) | search-result-only |
| Teqmun | Teqmun at The Nest, Dekmantel Festival 2025 | dkmntl/teqmun-at-the-nest-dekmantel-festival-2025 | about 2.5 h (set79 estimate) | search-result-only |
| Spekki Webu & Woody92 | at UFO II, Dekmantel Festival 2025 | dkmntl/spekki-webu-woody-92-at-ufo-ii-dekmantel-festival-2025 | about 2 h (set79 estimate) | search-result-only |
| NIKS | Dekmantel Mix 490 - NIKS | dkmntl/dekmantel-mix-490-niks | not seen | search-result-only |
| Rozaly & Tash LC | Rozaly & Tash LC at Dekmantel | dkmntl/rozaly-tash-lc-at-dekmantel | not seen | search-result-only |

Unsure: Loidis also appears on The Lot Radio (different set). Dekmantel Mix 507 (Alfred Anders) and 500 (Job Jobse)
are real podcast episodes per dekmantel.com, but their SoundCloud URLs were not seen. Not listed.

### flashback: Rinse FM (7 entries, 7 DJs or labels)
Account: `soundcloud.com/rinsefm`. Titles marked "title not seen" are set79 pages showing only a generic title.

| DJ | Title (as seen) | URL | Duration | Checked |
|---|---|---|---|---|
| Ploy B2B Victor | Ploy B2B Victor - 26 April 2025 - Rinse FM Tracklist | rinsefm/ployb2bvictor260425 | about 2 h (blurb) | search-result-only |
| Danny Rankin | title not seen (4 Apr 2026) | rinsefm/dannyrankin040426 | not seen | search-result-only |
| Eloq | title not seen (14 Nov 2025) | rinsefm/eloq141125 | not seen | search-result-only |
| Hessle Audio | title not seen (5 Jan 2026) | rinsefm/hessleaudio050126 | not seen | search-result-only |
| Bullet Tooth | bullet tooth - 17 June 2026 - Rinse FM Tracklist | rinsefm/bullettooth170626 | about 1 h (blurb) | search-result-only |
| LILI | LILI - 21 July 2026 - Rinse FM Tracklist | rinsefm/lili210726 | about 1 h (blurb) | search-result-only |
| COIDO | COIDO - 23 March 2026 | rinsefm/coido230326 | one hour (blurb) | search-result-only |

Unsure: Hessle Audio is a label, so "dj" is the label name. Several blurbs say one hour; most Rinse shows are one or two hours,
so the 45-minute bar may fail for some of these. Check durations on SoundCloud.

### boogie: Soulection (4 entries, host not confirmed as different)
Account: `soundcloud.com/soulection` (the Soulection Radio archive). Shows 407, 367 and 375 come from search-result URLs;
show 715 from a set79 link. The host or guest of each show was not seen, so "different DJ" is NOT met. Radio now airs on
Apple Music; SoundCloud archive still lists numbered shows (for example show #739 in a blurb, no URL).
Left out: a 2012 Joe Kay guest set on Serato (not SoundCloud).

### yard: dancehall, reggae, soca (7 entries, not sound systems)
SilverStarSound (`soundcloud.com/silver-star-sound`): not found. Its podcast is on silverstarsound.com and Chartable.
Its SoundCloud URL was not reached. The 7 entries are individual DJs' own accounts from set79 links, not sound systems or reggae
radio shows. Durations are unknown; some may be under 45 minutes (the freestyle mix and the 90s mixes especially).

| DJ | Title (from URL) | URL | Checked |
|---|---|---|---|
| Maxibaby | 90s Dancehall Mix | maxiwinfi/90s-dancehall-mix-maxibaby | search-result-only |
| djseandiesel | 90s Old School Dancehall Mix | djseandiesel/90s-old-school-dancehall-mix | search-result-only |
| djdrop914 | reggae dancehall mixxx | djdrop914/reggaedancehall-mixxx | search-result-only |
| Tasha Lee | Family Tree Vol 11 Live Mix | nat4sha/family-tree-vol-11-live-mix-tasha-lee-dancehall-baile-jersey | search-result-only |
| Ricky Platinum x Ovadose | Rise & Toast Miami live | rickyplatinumvybzgad/rise-toast-miami-31625-ricky-platinum-x-ovadose-live | search-result-only |
| Kybba | Basshall Mix 6, live at Amaze Amsterdam | dj-kybba/kybba-x-basshall-mix-6-live-set-at-amaze-amsterdam | search-result-only |
| DJ Polish | No Talking Freestyle Mix | polishxl/djpolish-no-talking-freestyle-mix | search-result-only |

Unsure: "dj" names are taken from URL slugs where the page name was not seen.

### latin: salsa, cumbia, reggaeton, bachata (5 entries, DJs' own accounts)
DJ RubyTunes (`soundcloud.com/djrubytunes`): not found by search (the name returned nothing). Not listed.

| DJ | Title (from URL) | URL | Checked |
|---|---|---|---|
| yisus_musica | Latin House DJ Set 2026 Beach | yisus_musica/latin-house-dj-set-2026-beach | search-result-only |
| Jose Fajardo | live, Marina Beach Club Valencia 04/07/2025 | josefajardo/jose-fajardo-live-marina-beach-club-valencia-04072025 | search-result-only |
| DJ Juan | Homenaje a Bacca 3.0 | juan-esteban-799245024/homenaje-a-bacca-3-0-dj-juan | search-result-only |
| DJ Feminasty | Seleccion Somos Salsa Parte 2 | djfeminasty/seleccion-somos-salsa-parte-2 | search-result-only |
| DJ Whitallen | Latin House Mix 2 | djwhitallen/latin-house-mix-2 | search-result-only |

Unsure: no reggaeton or bachata entry. Durations not seen. Salsa and Latin house are covered; cumbia only in set79 track lists.

### stoop: Universal Hip Hop Radio (0 entries)
What the account publishes: NOT FOUND. No `soundcloud.com/uhhmradio` page could be reached, and search returned no SoundCloud
uploads for the station. Live365 says the station is run by the Universal Hip Hop Museum and streams there.
Nothing can be said about whether its SoundCloud uploads are music mixes or talk. Needs a check on SoundCloud by someone with access.

### hiphop: new hip hop station (2 entries, DJ accounts)
Only two found, and both are weak matches. The first is a guest mix on Pluralized (a music show account). The second is on
Operator Radio, with a set79 tracklist that opens with MF Doom, Madlib and Kendrick Lamar tracks. Neither has a duration.
Not found: Boom Bap Mondays (Twitch, not SoundCloud); DJ Kefian (Brooklyn Radio, not SoundCloud); DJ Gemini (Serato).

| DJ | Title (from URL) | URL | Checked |
|---|---|---|---|
| Josh Tweek | Pluralized Guest Mix 07 | pluralmusik/pluralized-guest-mix-07-josh-tweek | search-result-only |
| Chris Delgado | (from URL) | operator-radio/chris-delgado | search-result-only |

## Not found / to check on SoundCloud

- Boiler Room: no official `soundcloud.com/boilerroom` track URLs seen.
- Resident Advisor: no SoundCloud episode URL seen (account `resident-advisor` is the likely official one).
- Rinse FM, Dekmantel, Lot Radio durations are not seen. Lot Radio and Dekmantel entries need a check of length.
- SilverStarSound, RubyTunes, Universal Hip Hop Radio: accounts not reached.
- Every entry's title, DJ name and duration must be read from SoundCloud before the `checked` value can change.

## Note on the network

`soundcloud.com` failed DNS from this session. The session notes say it has to be allowed in the session's network
settings before pages can be opened. This run did not try any other route to SoundCloud.

## Lead's correction and final pool (22 Nov, afternoon)

The research lane reported that soundcloud.com could not be reached. That was a wrong test (a request that did not go
through the session's proxy). SoundCloud answers from here: account pages list their ten newest tracks with durations
without scripts, and every track page gives its title, uploader and duration.

`src/audio/sc/mixes.json` was rebuilt by the lead from SoundCloud itself. Every entry's own page was opened; only mixes
of 45 minutes or more are kept; `minutes` is the length the page gave. The lane's unverified entries were dropped except
the five Dekmantel ones, which were opened and confirmed.

| Station | Account opened | Mixes | Different DJs | Note |
|---|---|---|---|---|
| weird (The Lot Radio) | thelotradio | 10 | 10 | the ten newest shows, 18 and 19 Nov 2026 |
| sc (Resident Advisor) | resident-advisor | 7 | 7 | RA Podcast 1063 to 1065 and four RA Live sets; the EX. (RA Exchange) uploads are interviews and are left out |
| bkhouse (Boiler Room) | platform (Boiler Room's account name) | 9 | 9 | Osaka and Los Angeles sets |
| dublab (Dekmantel) | dkmntl | 5 | 5 | four festival sets and Dekmantel Mix 490; the account's track list page shows nothing without scripts, so no more were found: SHORT OF SEVEN |
| flashback (Rinse FM) | rinsefm | 10 | 10 | |
| boogie (Soulection) | soulection | 10 | 1 | ten Soulection Radio shows; it is one host's show with occasional guest takeovers (Swizz Beatz, Icee Red): seven different DJs is not possible from this account |
| yard | silver-star-sound | 9 | 1 | one sound system's weekly juggling shows |
| latin | djrubytunes | 8 | 1 | one DJ; the disco house and dance mixes were left out |
| stoop (Universal Hip Hop Radio) | uhhmradio | 2 | 1 | the account holds only two tracks, both from July 2017: this is why the "hip hop" station played almost nothing |
| hiphop (new) | nine DJs' own accounts | 11 | 9 | found by web search, each page opened; three shows of PF Cuttin's EastNYRadio (East New York, Brooklyn) plus eight other DJs |

Not checked: that each mix plays in the embedded widget for a listener who is not signed in (some uploaders restrict
embedding), and whether an uploader's mix is itself licensed: these are other people's DJ mixes played through
SoundCloud's own player with credit and a link, as the stations already did.
The account pages show only the ten newest uploads, so the pools will go stale as uploaders remove tracks; the list
script (`scratchpad/scmix/list.py`, `verify.py`) rebuilds them in a few minutes.
