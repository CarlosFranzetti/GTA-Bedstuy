/**
 * RADIO4: what each station's announcer says when it names the DJ of the mix on air. Original lines, in each announcer's own voice
 * (see src/audio/voice/cast.ts and shows/djs.ts). Slots: {dj} (the name exactly as in mixes.json) and {station}.
 * Rules (owner rules 4 and 9): nothing about the DJ beyond their name and that this is their set: no facts, quotes, venues, dates,
 * praise that claims knowledge, and no pronouns or verbs that must agree with the name (it may be a show title or two people).
 *   intro   the set is starting (only used when the listener hears the start)
 *   mid     "you are listening to ..." (also the first line for a listener who joins mid-set)
 *   thanks  the set is nearly over
 */
export type DjLineKind = 'intro' | 'mid' | 'thanks';
export interface DjLinePool { intro: readonly string[]; mid: readonly string[]; thanks: readonly string[] }

export const DJ_LINES: Record<string, DjLinePool> = {
  bkhouse: {
    intro: [
      'Settle in, family. The next set on {station} is {dj}.',
      '{dj} on the decks, starting now. Find your spot on the floor.',
      'Shoulders down, knees soft. This is {dj}, right here on {station}.',
      'The floor is open and the set belongs to {dj}.',
      'New set, new blend. From here on {station}, it is {dj}.',
      'Here we go, family. {dj}, on the decks, on {station}.',
    ],
    mid: [
      'Deja Fontaine on {station}. You are listening to {dj}.',
      'Quick reminder, family: this set is {dj}. Do not stop dancing to read it.',
      'That blend was {dj}, still going, still on {station}.',
      'You are on {station}, and the decks belong to {dj}.',
      'In case you just came in off the street: {dj}, on {station}.',
      'Keep your feet moving. You are listening to {dj}.',
    ],
    thanks: [
      'This set is winding down. Thank you, {dj}. The floor says thanks too.',
      'A few minutes left, family. Thank you, {dj}, for the set.',
      'Before the last blend: thank you, {dj}. Lovely work on {station}.',
      'Give it up for {dj}. The set is nearly done, so stay on the floor.',
      'Thank you, {dj}. We will not let go until the last note.',
      'The set is almost over. Our thanks to {dj}, from everybody on {station}.',
    ],
  },
  dublab: {
    intro: [
      'The next set on {station} is {dj}. [pause 0.4] Mind the ceiling.',
      'The decks now belong to {dj}. [pause 0.4] The shelves have been warned.',
      'Set starting on {station}: {dj}. [pause 0.4] Find something heavy to stand next to.',
      'Now beginning, {dj}. [pause 0.4] The low end has been informed.',
      'Odell Reverb, {station}. [pause 0.4] The set that starts now is {dj}.',
      '{dj}, from the top. [pause 0.4] Check your glassware.',
    ],
    mid: [
      'You are listening to {dj}. [pause 0.4] This is {station}.',
      'Still {dj} on {station}. [pause 0.4] The ceiling is holding.',
      'A reminder from the booth: this set is {dj}.',
      '{station}. [pause 0.4] The set in your floorboards is {dj}.',
      'Odell Reverb here. [pause 0.4] The decks belong to {dj} for now.',
      'You tuned in to {dj}. [pause 0.4] Good timing. The bass was waiting.',
    ],
    thanks: [
      'The set is winding down. [pause 0.4] Thank you, {dj}.',
      'A few minutes left on {station}. [pause 0.4] Our thanks to {dj}.',
      'Thank you, {dj}. [pause 0.4] The glass is intact. Mostly.',
      'Before the end: thank you, {dj}, for the low end.',
      'This set is nearly done. [pause 0.4] Thanks to {dj}, from {station}.',
      '{dj}, thank you. [pause 0.4] The floorboards are still ringing.',
    ],
  },
  hiphop: {
    intro: [
      'It is starting! The next set on {station} is {dj}! Stoop, stand up!',
      'Big Tayo on {station}! Give it up for {dj}, starting right now!',
      'New set, no sitting down! {dj}, on {station}!',
      'Here we go! On the decks, {dj}, and it is going down on {station}!',
      'Everybody up! This one belongs to {dj}!',
      '{dj}, from the top! Let me hear you, {station}!',
    ],
    mid: [
      'You are locked into {station}! This set is {dj}!',
      'Big Tayo checking in! You are listening to {dj}!',
      'Quick reminder from the stoop: {dj}, on {station}!',
      'Just came in? You got {dj}, right here on {station}!',
      'Keep it right here! The decks belong to {dj}!',
      'Say it with your whole chest! {dj}, on {station}!',
    ],
    thanks: [
      'This set is winding down! Big ups to {dj}!',
      'A few minutes left! Thank you, {dj}, from the whole stoop!',
      'Give it up for {dj}! The set is almost over, so stay tuned to {station}!',
      'Before it ends, I got to say it: thank you, {dj}!',
      'Thank you, {dj}! The stoop felt that!',
      'The set is nearly done! Respect to {dj}, from {station}!',
    ],
  },
  boogie: {
    intro: [
      'Velvet Lou on {station}. A new set begins, and the decks belong to {dj}.',
      'Straighten your collar, baby. This is {dj}, starting now.',
      'The mirror ball turns, and the set begins. {dj}, on {station}.',
      'Slide right in. {dj}, from the top.',
      'A fresh set on {station}, baby. This is {dj}.',
      'The floor is polished. From here, it is {dj}.',
    ],
    mid: [
      'You are listening to {dj}, on {station}. Keep it smooth.',
      'Velvet Lou, checking in. This set is {dj}.',
      'In case you stepped in late, baby: {dj}, on {station}.',
      'The mirror ball says {dj}. I just read it out.',
      'This is {station}, and the decks belong to {dj}.',
      'Stay on the floor. You are listening to {dj}.',
    ],
    thanks: [
      'The set is winding down, baby. Thank you, {dj}.',
      'A few minutes left. Our thanks to {dj}, from {station}.',
      'Thank you, {dj}. The jacket is still pressed.',
      'Before the last song: thank you, {dj}. Lovely set.',
      'The mirror ball is slowing down. Thanks to {dj}.',
      'This set is almost over. Thank you, {dj}, from the floor.',
    ],
  },
  weird: {
    intro: [
      'A new set on {station}. [pause 0.5] It begins with {dj}.',
      '{dj}. [pause 0.5] Starting now. I have no further information.',
      'The next set is {dj}. [pause 0.5] It does not begin so much as arrive.',
      'Wren Calloway, {station}. [pause 0.4] Here is {dj}.',
      'Something begins now. [pause 0.5] The name on it is {dj}.',
      'Lights down. [pause 0.4] {dj}, on {station}.',
    ],
    mid: [
      'You are listening to {dj}. [pause 0.5] On {station}.',
      'Still {dj}. [pause 0.5] Still {station}. Still here.',
      'A reminder, in case the room has changed: this set is {dj}.',
      'Wren Calloway. [pause 0.4] The decks belong to {dj} for now.',
      'You came in mid-sentence. [pause 0.4] The sentence is {dj}.',
      '{station}. [pause 0.5] The set you are inside is {dj}.',
    ],
    thanks: [
      'The set is winding down. [pause 0.5] Thank you, {dj}.',
      'A little time left. [pause 0.4] Our thanks to {dj}.',
      'Thank you, {dj}. [pause 0.5] The room remembers.',
      'Before it ends: thank you, {dj}, from {station}.',
      'This set is nearly over. [pause 0.5] Thanks to {dj}.',
      '{dj}. [pause 0.4] Thank you. The air is still moving.',
    ],
  },
  yard: {
    intro: [
      'Auntie Pearl on {station}! A new set is starting, and the sound is {dj}!',
      'Come, come! {dj} on the sound, starting now!',
      'Pull it up! The next set is {dj}, right here on {station}!',
      'The set begins! {dj}, on {station}! Somebody check the rice!',
      'Here we go, family! The decks belong to {dj}!',
      'Wheel it, wheel it! {dj}, from the top!',
    ],
    mid: [
      'You are listening to {dj}, on {station}!',
      'Auntie Pearl checking in! This set is {dj}!',
      'Just come in? You got {dj} on {station}!',
      'Hold on to your plate! The sound is {dj}!',
      'Keep it right here on {station}! {dj} on the decks!',
      'A little reminder, my dear: {dj}.',
    ],
    thanks: [
      'This set is winding down! Thank you, {dj}!',
      'A few minutes left, my dear! Thanks to {dj}, from {station}!',
      'Thank you, {dj}! The whole yard says thanks!',
      'Before it ends, thank you, {dj}!',
      'The set is nearly done! Big thanks to {dj}!',
      'Thank you, {dj}! Now who is fixing the plates?',
    ],
  },
  flashback: {
    intro: [
      'Rewind! A new set on {station}, and it is {dj}!',
      'Tommy Tapedeck here! The next set is {dj}, and the tape is rolling!',
      '{dj}, from the top! Press play, everybody!',
      'New side starting! {dj}, on {station}!',
      'The tape is cued. This is {dj}, right now.',
      'Hit record in your head! {dj}, on {station}!',
    ],
    mid: [
      'You are listening to {dj}, on {station}!',
      'Tommy Tapedeck, checking in! This set is {dj}!',
      'Just tuned in? The tape says {dj}!',
      'Do not touch that dial! This is {dj}, on {station}!',
      'Reminder from the tape deck: {dj}!',
      'You are inside the set by {dj}, on {station}!',
    ],
    thanks: [
      'This side is winding down! Thank you, {dj}!',
      'A few minutes left on the tape! Thanks to {dj}!',
      'Thank you, {dj}! Be kind, rewind!',
      'Before the tape runs out: thank you, {dj}, from {station}!',
      'The set is nearly over! Our thanks to {dj}!',
      'Thank you, {dj}! That one goes in the collection!',
    ],
  },
  latin: {
    intro: [
      'Ven, ven! A new set on {station}, and it is {dj}!',
      'Lucho Ventura here! The decks go to {dj}, starting now! Dale!',
      'Knees ready! The next set is {dj}!',
      'The floor is open! {dj}, on {station}!',
      'Find your partner! This is {dj}, from the top!',
      'Empieza el set! {dj}, on {station}!',
    ],
    mid: [
      'You are listening to {dj}, on {station}!',
      'Lucho Ventura, checking in! This set is {dj}!',
      'Just came in? Welcome! This is {dj}, on {station}!',
      'Keep moving! The decks belong to {dj}!',
      'Quick reminder: {dj}, right here on {station}!',
      'Do not stop now! You are listening to {dj}!',
    ],
    thanks: [
      'This set is winding down! Gracias, {dj}!',
      'A few minutes left! Thank you, {dj}, from {station}!',
      'Thank you, {dj}! The floor is still warm!',
      'Before it ends: gracias, {dj}!',
      'The set is nearly over! Thanks to {dj}!',
      'Gracias, {dj}! Dale, one more turn!',
    ],
  },
  sc: {
    intro: [
      'Cass Meridian on {station}. A new set begins: {dj}.',
      'Credits, as promised: the set that starts now is {dj}.',
      'Next on {station}. {dj}. I will not talk over the first minute.',
      'The set that begins now is {dj}. Seamless, I hope.',
      'A new set on {station}. The name on it is {dj}.',
      'Starting now: {dj}. Credits will be repeated, as is tradition.',
    ],
    mid: [
      'A credit, for the record: you are listening to {dj}, on {station}.',
      'Cass Meridian. This set is {dj}.',
      'In case you came in late: {dj}, on {station}.',
      'For the liner notes: the decks belong to {dj}.',
      'This is {station}. The set in progress is {dj}.',
      'Reminder, with credit: {dj}.',
    ],
    thanks: [
      'This set is winding down. Thank you, {dj}.',
      'A few minutes left. Credit and thanks to {dj}.',
      'Thank you, {dj}, for the transitions.',
      'For the record, before the end: thank you, {dj}, from {station}.',
      'The set is nearly over. Our thanks to {dj}.',
      'Thank you, {dj}. The liner notes are updated.',
    ],
  },
};

export function djLinePool(stationId: string, kind: DjLineKind): readonly string[] {
  return DJ_LINES[stationId]?.[kind] ?? [];
}
