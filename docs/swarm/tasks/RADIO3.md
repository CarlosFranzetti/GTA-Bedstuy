# RADIO3 (22 Nov 2026): seven mixes per SoundCloud station, hip hop, live pools, second talk station

Status: in progress. Nothing here was HEARD: nobody on this team can listen, and the SoundCloud widget is mocked in tests.

## Owner report (22 Nov, after playing the live game)
"each SoundCloud radio station should have more than one DJ mix ... 7 DJs per radio station"; "the other streaming stations (rock, etc.) can it be more random??";
"as far as the hip hop station I heard zero hip hop. Please add hip hop station."; a humorous talk station is written by TALK2.

## Why a station felt like one mix (read from the code, not heard)
- Every SoundCloud station was ONE account URL (`.../<account>/tracks`) loaded into the widget. A station = one brand's feed.
- The random pick (`ScStation.randomStart`) ran once per source per session. After it the widget walked the account in feed order
  (FINISH does nothing while the account has more sounds), so after the first mix it is "next track of the same account".
- Tuning away and back resumed the same mix (virtual clock), and a mix was never entered mid-way (`applyPlayback` seeks only for single tracks, and
  an account counts as a set), so every tune-in began at 0:00 of a feed-ordered sound.
- Only the first pick preferred 45 minute sets; short sounds, trailers and interviews of the account were fair game later.
## Why hip hop played none
- `stoop` = the `uhhmradio` account feed. It is a radio-show brand; its feed holds shows, interviews and promos, and the random pick has no genre test
  (the keyword filter exists only for the RA pool). The owner's single tune-in landed on talk. Not proven by listening; the account page could not be opened from here.
