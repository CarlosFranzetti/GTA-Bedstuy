# RADIO4 (24 Nov 2026): announcers name the DJ at the start, now and then, and at the end

Owner: "mention the DJ names a few times during the set: once at the beginning and once near the end thanking the DJ. Other than that no more than once every 30 to 40 minutes, except those two."
Status: in progress; see the end of the file for what is done. Nothing here was HEARD.

## Design
- `src/audio/sc/djMentions.ts` (pure): `planDjMentions({lengthMin, joinedAtS, seed, hasDj, lastMentionAtS?})` returns timed mentions (set position, seconds): intro (or "listening" when joined after the first minute), mid-set mentions, thanks.
  `DjMentionTracker` fires each planned mention once (`due(pos)` then `ack`), never twice after a seek, drops missed ones.
- `src/audio/sc/djLines.ts`: 6+ lines per station for intro, mid, thanks. Slots {dj} {station} only. No claim about the DJ beyond the name and that it is their set.
- Glue: `DjMentionRunner` (in djMentions.ts) reads `ScStation.djClock`, asks `Announcer.djMention(text)`; RadioDirector calls it in `update`.
- Rules: no mention with no DJ name; none while off, paused or another station is tuned; retune restarts.
