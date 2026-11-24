# RADIO4 (24 Nov 2026): announcers name the DJ at the start, now and then, and at the end

Owner: "mention the DJ names a few times during the set: once at the beginning and once near the end thanking the DJ. Other than that no more than once every 30 to 40 minutes, except those two."
Status: in progress; see the end of the file for what is done. Nothing here was HEARD.

## Design
- `src/audio/sc/djMentions.ts` (pure): `planDjMentions({lengthMin, joinedAtS, seed, hasDj, lastMentionAtS?})` returns timed mentions (set position, seconds): intro (or "listening" when joined after the first minute), mid-set mentions, thanks.
  `DjMentionTracker` fires each planned mention once (`due(pos)` then `ack`), never twice after a seek, drops missed ones.
- `src/audio/sc/djLines.ts`: 6+ lines per station for intro, mid, thanks. Slots {dj} {station} only. No claim about the DJ beyond the name and that it is their set.
- Glue: `DjMentionRunner` (in djMentions.ts) reads `ScStation.djClock`, asks `Announcer.djMention(text)`; RadioDirector calls it in `update`.
- Rules: no mention with no DJ name; none while off, paused or another station is tuned; retune restarts.

## Done (24 Nov)
- Files: `src/audio/sc/djMentions.ts`, `src/audio/sc/djLines.ts` (9 stations x 6 intro, 6 mid, 6 thanks = 162 lines), `ScStation.djClock` (getter),
  `Announcer.djMention(text)` + `ANNOUNCER_DJ_DUCK` 0.4 (lighter than the 0.22 of a full announcement), `RadioDirector.djMentions` (runner; reset on every retune, radio off and station change; `noteSetAnnounced` when `betweenSets` already named the new DJ).
  No `src/main.ts` change needed.
- Schedule (set position): first mention 20 to 45 s after the listener joined (`intro` if joined in the first 60 s, else `listening`, which uses the mid pool);
  thanks 2 to 3 minutes before the end, over 20 s clear of it; in between seeded 30 to 40 minute gaps, never within 30 minutes of the first mention or the thanks.
  Joined at the start: 45 and 60 minute sets get intro and thanks only; 90 gets one mid, 120 two, 180 three or four.
  (The owner's "a 90 minute set gets one or two" cannot hold with the 30 minute rule on both sides: two would need 90+ minutes between intro and thanks plus a gap.)
- A busy announcer is retried every frame until the grace (90 s, and never past 40 s before the end) runs out; then the mention is dropped, never spoken late.
- Tests: `tests/unit/audio/djMentions.test.ts` (30), whole `tests/unit/audio` green (615).
- NOT verified: nothing heard; the real widget's PLAY_PROGRESS position, the mid-mix seek and `djClock` going non-null only after `startPending` clears were read from code, not run in a browser; the director wiring is covered by no test (runner and announcer are tested separately).
