# TALK2: "The Group Chat 99.9" talk script

Lane TALK2 (writer: Wren Okoye). File: `src/audio/talk/script-groupchat.json`, station id `groupchat`. Same schema as `script.json`
(`title`, `station`, `totalSeconds`, `segments[]` with `id`, `kind`, `speaker`, `voice`, `text`, `seconds`). Wired into the dial by RADIO3.
Test: `tests/unit/audio/groupchat-script.test.ts`.

## Conventions copied from script.json
- Voices: `host` (low, Odessa), `sidekick` (high, Linden), `announcer` (fast: producer, ads, jingles, news, time checks),
  `caller1..3` (pitch shifts by number: 3 lowest, 2 highest, 1 middle). Field reporters are `kind: host` with a caller voice
  so they sound different from both hosts.
- Kinds: `jingle` (station ident), `sting` (short spoken bumper or time check, plays the segment sting), `ad` (speaker is the
  invented business), `news` (the tiny news desk), `caller` (speaker is "Name from Street").
- `seconds` is `estimateSeconds` (2.6 words a second plus 0.8). Text uses numbers as words, no symbols, "A I" spaced so the
  voice says the letters, no stage directions.
- Short lines: nearly all under 35 words, none over 60 (the old script runs to 130).

## Cast (all invented)
- Odessa Pruitt (host voice): born on Hancock Street, auntie-energy realist, 31 years of "I told you so".
- Linden Aldous (sidekick): four years here, says "we", sourdough phase, four dating apps, a "guy".
- Pat, the producer (announcer voice): heard only as interruptions; the hosts suspect Pat is software. Pat apologises a lot.
- Marisol Gale, weather: takes it personally. Reggie Sutphin, transit: emotional, "a man speaking slowly".
- Cal Merriweather, money: has lost everything four times, calm. Ash Coldwater, techno scene: flat, all in black.
- Sunbeam Willow, house scene: hugging, space cadet. Dex, the whole underground: has not slept since Thursday.
- Callers: Desiree from Halsey, Mr. Abernathy from Macon (blames the mayor for eggs), Tasha from Lewis (credits the mayor for
  everything), Big Reuben from Quincy, Wendell from Lewis (the laundromat sock), Tamika from Jefferson (his podcast has four
  listeners), Priya from Putnam (her cousin Marcus's startup), Miss Clarice from Jefferson.

## Running jokes
- Cousin Marcus: A I startup in an aunt's basement ("headquarters"), then a coin, then a landlord's tool. Always "call your mother".
- Pat might be a machine (bagel, "I do not require food", apologies, "I will log a request"). Pays off in the last A I segment.
- Thirty seconds and a bell (every political call). The disclaimer grows longer every time it plays (five readings).
- Wrong time checks. The G train as a rumour. The sourdough phase. Wendell's sock and Thursday routine.
- The "guy" and the dealer on the other line: it is always an art dealer, or a plumber, or something else; never a product.

## Rundown (about 41 minutes, one looping day)
See the show list in the JSON ids: `morn` Morning Scroll, `bell` Thirty Seconds and a Bell, `money` Money Chat, `land` Landmarks of
Questionable Importance, `clin` The Clinic, then the rest as written. Final numbers are in the report and the test.

## What I checked (and could not)
- Parses with `parseScript`; test checks unique ids, kinds, voices, segment length, total minutes and a list of words that
  must not appear (slurs, real brands, real places and people that would break rule 4, drug product names).
- Politics: the president and the mayor are named a handful of times, only as style jokes (the sign and the promise) and
  through the callers. No quote is attributed to either, no claim about them, nothing evergreen-breaking. I could not read today's news.
- Real names avoided: landmarks, clubs, DJs, apps, coins, brands and the transit authority. Line letters and the word
  "G train" are used. No real station names.
- Not heard on a device. The voices are the browser's speech synthesis; two spots to listen for: "A I" read as letters, and "Ding ding ding".
