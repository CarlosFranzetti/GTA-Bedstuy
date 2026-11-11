/**
 * Announcer scripts. Everything the eight station announcers can say is written here, as plain data:
 *
 *  - ids      station ID, spoken on tune-in after the jingle.     {station} {freq}
 *  - intros   spoken as a new set starts.                         {dj} {title} {station}
 *  - blind    the same when the set's title is not known yet.     {station}
 *  - outros   spoken as a set ends, before the intro.             {prevDj} {prevTitle}
 *  - hours    the clock and the weather.                          {time} {street} {weather}
 *  - idents   20+ short one-liners per station, used at most once per eight minutes.
 *
 * All text is original; no real station, DJ or brand is named. Placeholders are filled by `fillScript`.
 */
import type { ScStationId } from '../radio';

export interface StationScript {
  ids: readonly string[];
  intros: readonly string[];
  blind: readonly string[];
  outros: readonly string[];
  hours: readonly string[];
  idents: readonly string[];
}

export const SCRIPTS: Record<ScStationId, StationScript> = {
  bkhouse: {
    ids: [
      "You're locked to {station}, {freq} Bed-Stuy.",
      '{station}, {freq}. Deep house for the whole block.',
      "This is {station}. Stay right here, family.",
    ],
    intros: [
      'Up next, a set from {dj}: {title}.',
      'Settle in. {dj} is up with {title}.',
      'Here comes {dj}, and the set is called {title}. Take your time with it.',
    ],
    blind: ['Next up on {station}, a long one. Take your shoes off.', 'Another set coming in. Let it breathe.'],
    outros: ['That was {prevDj}, with {prevTitle}.', '{prevDj}, everybody. {prevTitle}. Beautiful.', 'We just heard {prevTitle} from {prevDj}.'],
    hours: ['{time} on {street}, {weather}. Perfect hour for a slow build.', "It's {time}. {weather} out on {street}. Stay inside the groove.", '{time}, {street}, {weather}. Dance anyway.'],
    idents: [
      'Deep house, all day, from the second floor up.',
      'If you can feel the kick in the floorboards, you are in the right place.',
      'Garage on the left, soul on the right, you in the middle.',
      'Long blends only. We do not do rushed.',
      'Shout out to every window that is open right now.',
      'Four on the floor and one on the stoop.',
      'Somebody on Throop just said "this is my song". They are right.',
      'Keep your hands up. Or in your pockets. Both are fine.',
      'No skipping on this station. We only do arrivals.',
      'This is the sound of a Tuesday that decided to be Saturday.',
      'Warm bass, cold drink, open window. That is the whole recipe.',
      'We take requests by vibe only.',
      'The best part of the set is the part you did not see coming.',
      'Brownstone steps, brownstone sound.',
      'Good music is just patience with a beat.',
      'Hey, you. Yes, you with the headphones. Turn us up.',
      'Piano stabs for the people.',
      'Sunrise is for the dedicated. Streetlights are for the rest of us.',
      'We keep the house open late. All the way late.',
      'Say hi to your neighbor. Then say hi to the bassline.',
      'Smooth transitions, rough week. We got you.',
      'From Bed-Stuy to your ears, no stops in between.',
    ],
  },
  dublab: {
    ids: [
      'This is {station}. {freq}. Low frequencies only.',
      "You are tuned to {station}, {freq}. Mind the bass.",
      '{station}. {freq}. Stay close to the speaker.',
    ],
    intros: [
      'Next. A set from {dj}. It is called {title}. Brace.',
      '{dj}. {title}. Press play on your chest.',
      'Now arriving: {title}, by {dj}. Please stand clear of the sub.',
    ],
    blind: ['Another set. Heavier. Probably.', 'Something new is loading. It will be low.'],
    outros: ['That was {prevDj}. {prevTitle}. Echo, echo, echo.', '{prevTitle}, from {prevDj}. The room is still vibrating.', 'And that was {prevDj}.'],
    hours: ['{time}. {street}. {weather}. The bass does not care.', "It is {time} on {street}. {weather}. Time is a loop anyway.", '{time}. {weather}. Stay low.'],
    idents: [
      'Dub is just space with opinions.',
      'Techno is a clock that learned to dance.',
      'If your cup is moving across the table, that is intentional.',
      'Reverb is not an effect. It is a lifestyle.',
      'Listening closely. Listening very closely.',
      'The speaker stack says hello.',
      'No vocals were harmed in the making of this hour.',
      'A bass line is just a rumor your floor believes.',
      'Delay: because once is never enough. Because once is never enough.',
      'We are sorry about your ceiling.',
      'Dubstep: the slow motion of an earthquake that likes you.',
      'Minimal does not mean small. It means careful.',
      'The kick drum is the only honest friend.',
      'Weather report: heavy low end, spreading east.',
      'Your neighbors just discovered subwoofers. Welcome them.',
      'Silence is a good frequency too. We rent it by the second.',
      'Please do not feed the sub.',
      'Space, patience and a bassline. That is the lab.',
      'This station is powered by the humming of a very old refrigerator.',
      'Every loop is a small room. Walk around in it.',
      'No lyrics. Lots of feelings.',
      'The lab is open. Safety goggles are optional. Earplugs are not.',
    ],
  },
  stoop: {
    ids: [
      "Yo, you're on {station}, {freq}. Straight off the stoop!",
      '{station}! {freq}! Hip hop, trap, and everything in between!',
      "It's {station}. {freq}. Don't touch that dial. Touch it just to turn it up.",
    ],
    intros: [
      'Up next, a set from {dj}: {title}. Let us go!',
      'Big one coming. {dj}, with {title}!',
      'Run it back, {dj} is up with {title}. Stoop approved.',
    ],
    blind: ['Next set loading and I can already tell it is heavy.', 'New set, new energy. Hold on.'],
    outros: ['That was {prevDj} with {prevTitle}. Say less.', '{prevDj}, with {prevTitle}. We saw all of that.', '{prevTitle}, from {prevDj}. Somebody call their mom.'],
    hours: ['{time} on {street}, {weather}. The block is awake!', "It's {time}. {weather} on {street}. Perfect for a cypher.", '{time}, {weather}, {street}. Stay on the stoop!'],
    idents: [
      'Stoop Radio, where the ceiling is the sky.',
      'Boom bap for the early birds, trap for the night owls.',
      'We do not do intros. We do arrivals.',
      'Ayo, somebody check the bodega, I need a chopped cheese of sound.',
      'Bars on bars on bars.',
      'Run the bass back. Run the bass back.',
      'This is for the block that raised you.',
      'Hi-hats are the heartbeat. 808s are the breathing.',
      'Free sample of confidence, courtesy of this station.',
      'Nobody leaves the stoop until the beat finishes.',
      'Rap is just poetry in better sneakers.',
      'Name one thing better than a loop that hits. I will wait.',
      'Shout out to every corner with a good speaker.',
      'It is a cypher, not a competition. Mostly.',
      'The mic is hot, the snare is hotter.',
      'If you hear this song and do not nod, check your neck.',
      'Trap, drill, boom bap, whatever. Still the stoop.',
      'We came for the beat and stayed for the commentary.',
      'Crates, tapes, and a laptop on its last two percent.',
      'This one is for the summer. And the other three seasons.',
      'Turn it up till the bus driver nods.',
      'One more block. One more beat. Let us go.',
    ],
  },
  boogie: {
    ids: [
      "You're listening to {station}, {freq}. The mirror ball never sleeps.",
      '{station}, {freq}. Disco, boogie, funk. In that order. Or not.',
      "This is {station}. Put your good shoes on, baby.",
    ],
    intros: [
      'Up next, a set from {dj}: {title}. Smooth.',
      'Dim the lights. {dj} is bringing {title}.',
      'Put on something nice. {dj}. {title}.',
    ],
    blind: ['Another groove is on its way. Dim the lights.', 'The next one is going to be slinky.'],
    outros: ['That was {prevDj}, with {prevTitle}. Mmm.', '{prevTitle}, by {prevDj}. Absolutely. Legal.', 'We just heard {prevDj}. {prevTitle}. Class.'],
    hours: ['{time}, {street}. {weather}. A fine hour for a pair of loafers.', "It's {time}, baby. {weather} on {street}. The floor is ready.", '{time}. {weather}. Lovely.'],
    idents: [
      'The groove is not optional. It is in the lease.',
      'Funk first. Questions later.',
      'Mirror ball on, worries off.',
      'Disco is just joy with a good tailor.',
      'We play the bass line like it owes us money.',
      'A little boogie never hurt a Tuesday.',
      'Strings, congas, and a very confident hi-hat.',
      'If the groove is wrong, the groove is wrong. This one is right.',
      'Collars up. Stress down.',
      'The only dress code is movement.',
      'Every good song has a bass line you could marry.',
      'Our motto: another chorus, please.',
      'Soul in the basement, glitter on the stairs.',
      'Ladies, gentlemen, and everyone who owns a good jacket.',
      'The elevator music of a much better building.',
      'Pour something cold. Slide into the next track.',
      'Boogie down, but with posture.',
      'This is the sound of someone doing the hustle on purpose.',
      'We believe in clapping on the two and the four.',
      'A groove is a promise. We keep ours.',
      'Floor is open. Shoes are optional. Rhythm is mandatory.',
      'Midnight is just another word for "more bass".',
    ],
  },
  weird: {
    ids: [
      'This is {station}. {freq}. Hello. Or whatever hour it is.',
      "You're on {station}, {freq}. Stay for the strange parts.",
      '{station}. {freq}. Quietly.',
    ],
    intros: [
      'Next, a set from {dj}. It is called {title}. Listen closely.',
      '{dj}, with {title}. Do not worry about what it is.',
      'Something is arriving: {title}, by {dj}.',
    ],
    blind: ['Another set is drifting in. We do not know what it is yet.', 'Something is about to happen.'],
    outros: ['That was {prevDj}, with {prevTitle}. Or maybe it was a dream.', '{prevTitle}, by {prevDj}. Thank you, ceiling.', 'We heard {prevDj}. {prevTitle}. Strange. Good.'],
    hours: ['{time} on {street}. {weather}. The hour does not matter, but there it is.', "It's {time}. {weather}. {street} keeps its secrets.", '{time}. {weather}. Time, as always, is a suggestion.'],
    idents: [
      'Jazz is a conversation that forgot to end.',
      'Everything is better with one extra synthesizer.',
      'If it sounds like an accident, it is probably a masterpiece.',
      'We play the music in between the music.',
      'Noise is just music that has not been introduced yet.',
      'Thank you for staying awake. Or asleep. Both count.',
      'The clock is a rumor.',
      'Ambient: a room made of sound, with no furniture.',
      'Sometimes a saxophone is just a very honest cloud.',
      'This hour is brought to you by a loose cable.',
      'Please do not adjust your ears.',
      'Free jazz, free time, free parking in your mind.',
      'Somewhere, a modular synth just learned to dream.',
      'We have no schedule. We have a feeling.',
      'The psychedelic part starts when you stop trying.',
      'A very small orchestra lives inside this radio.',
      'Hello to the people who are awake for no reason.',
      'No beat is also a beat.',
      'This is a gentle reminder that you are made of music, mostly.',
      'Keep your window cracked for the sound to get out.',
      'Experimental means we did not check first.',
      'If you hear footsteps in the mix, they are probably ours.',
    ],
  },
  yard: {
    ids: [
      "You're on {station}, {freq}. Welcome to the yard!",
      '{station}, {freq}. Reggae, dancehall, and afrobeats. Come in, come in.',
      "It's {station}, baby. {freq}. Pull up a chair.",
    ],
    intros: [
      'Up next, a set from {dj}: {title}. Turn it up!',
      'Here comes {dj} with {title}. Eat something first.',
      '{dj} is on the sound system, and the set is called {title}. Lovely.',
    ],
    blind: ['The next set is coming up, so hold your plate.', 'More music is on the way. Do not leave the table.'],
    outros: ['That was {prevDj}, with {prevTitle}. Nice and easy.', '{prevTitle}, from {prevDj}. Big up, big up.', 'We heard {prevDj}. {prevTitle}. Call your mother.'],
    hours: ['{time} on {street}. {weather}. Plenty of time for another plate.', "It's {time}, {weather}. {street} is cooking.", '{time}. {weather} on {street}. Come inside, come inside.'],
    idents: [
      'Turn it up, the neighbors already know the words.',
      'Reggae on the radio, curry on the stove.',
      'Dancehall for the dancers, riddim for the rest.',
      'Afrobeats, because the day needs a drum.',
      'Eat something. I said eat something.',
      'The sound system is the family. The family is the sound system.',
      'Call your auntie. Then call your other auntie.',
      'A good bassline is a hug from the floor.',
      'Everything is irie when the speaker is loud enough.',
      'We were not asked to lower the volume. We checked.',
      'Cookout rules: nobody sits near the speaker, everybody dances near the speaker.',
      'Respect the riddim. Respect the cooks.',
      'Sunshine in the voice, thunder in the bass.',
      'Soca for Saturday, calypso for always.',
      'If you cannot dance, wave. If you cannot wave, nod. We accept nods.',
      'This one goes out to whoever is washing dishes right now.',
      'We keep the yard open until the plantains run out.',
      'Pull up, pull up, pull up.',
      'Warm up the pot. Warm up the speakers. Warm up the dance floor.',
      'Strong bass, soft heart.',
      'Island time is a state of mind, but the station is on the avenue.',
      'Drums talk. We just translate.',
    ],
  },
  flashback: {
    ids: [
      "You're locked to {station}, {freq}! Pull up, pull up!",
      '{station}, {freq}! Bass, grime and garage with the aerial taped to the window!',
      "It's {station}! {freq}! Wheel it up!",
    ],
    intros: [
      'Up next, a set from {dj}: {title}. Pull it up!',
      'Rewind! {dj} is on with {title}.',
      'Bring the bass, because it is {dj} with {title}.',
    ],
    blind: ['Another show is loading. Hold the aerial steady!', 'Next up: a mystery set. Press play and duck.'],
    outros: ['That was {prevDj} with {prevTitle}! Wheel!', '{prevTitle}, from {prevDj}! Rewind, rewind!', 'We just heard {prevDj}. {prevTitle}. Serious.'],
    hours: ["It's {time} on {street}! {weather}! Time to pull up!", '{time}. {weather} out on {street}. Proper hour for a dubplate.', "{time}, {street}, {weather}! Let's go!"],
    idents: [
      'Pirate signal, brick-sized aerial, no apologies.',
      'We are rewinding. Please hold. Ssssswwwwt.',
      'Bass first, questions later.',
      'Two-step on the left, grime on the right.',
      'Eight bars, sixteen bars, whatever fits the stairwell.',
      'This one goes out to every speaker that rattles a window.',
      'Garage is just house in a nice jacket.',
      'Dubplates only. Well, mostly dubplates.',
      'If the bass does not move your tea, turn it up.',
      'Wheel it up. That is the whole policy.',
      'Sub-bass is a love language.',
      'Pull up to the corner, pull up to the sound.',
      'A mic, a deck, a very long extension lead.',
      'Rewind is a form of respect.',
      'We do not do quiet. We do tasteful loud.',
      'Late-night signal, early-morning bass.',
      'The kettle is on and so is the sub.',
      'Shout the whole crew. Shout the cousins too.',
      'Fast bars, slow tea.',
      'Every good set has a moment where the room goes quiet and then does not.',
      'You do not find this station. It finds your aerial.',
      'Mind the speaker stack, it has opinions.',
    ],
  },
  latin: {
    ids: [
      "You're on {station}, {freq}. Pa'lante!",
      '{station}, {freq}. Salsa, reggaeton, cumbia and whatever the stoop is playing.',
      "It's {station}, {freq}. Turn it up, ven, ven.",
    ],
    intros: [
      'Up next, a set from {dj}: {title}. Dale!',
      'Ven acá, {dj} is up with {title}.',
      'Here comes {dj}, and the set is called {title}. Move your hips a little.',
    ],
    blind: ['Another set is coming in. Keep dancing, we will find the name.', 'A new mix is loading. Hold your partner.'],
    outros: ['That was {prevDj}, with {prevTitle}. Que rico.', '{prevTitle}, from {prevDj}. Gracias, gracias.', 'We just heard {prevDj}. {prevTitle}. Wow.'],
    hours: ["It's {time} on {street}, {weather}. Perfect for a long dance.", '{time}. {weather} out on {street}. Nobody sits down.', '{time}, {street}, {weather}. Baila.'],
    idents: [
      'Salsa in the kitchen, reggaeton in the hallway.',
      'The clave is the clock on this station.',
      'Cumbia travels well. So does this signal.',
      'Four flights up and the bass still arrives first.',
      'Dancing in the doorway counts as dancing.',
      'If the abuela is dancing, the song is good.',
      'Maracas are just a very polite shout.',
      'Bachata for the bodega line.',
      'Windows open, volume up, plans cancelled.',
      'The trumpet enters like it owns the block.',
      'Mambo on the stoop, merengue on the fire escape.',
      'Everybody has a cousin who can really dance.',
      'We do not take requests, we take dances.',
      'Congas first, conversation second.',
      'This is the sound of a block party with a roof.',
      'Reggaeton does not ask permission.',
      'A good beat travels farther than a good excuse.',
      'Salsa is just math that smiles.',
      'Cafecito in one hand, rhythm in the other.',
      'Feel the downbeat in your knees.',
      'Dale una vuelta, then another.',
      'Keep your feet moving and your shoes comfortable.',
    ],
  },
  sc: {
    ids: [
      "You're listening to {station}, {freq}. Any set, anywhere.",
      '{station}, {freq}. Whatever the city played last night.',
      'This is {station}. {freq}. Sit back.',
    ],
    intros: [
      'Up next, a set from {dj}: {title}.',
      'Next: {dj}, with {title}. Mind the transition.',
      'Here is {dj} with a set called {title}.',
    ],
    blind: ['Next set loading. Listen for the blend.', 'Another set coming up.'],
    outros: ['That was {prevDj}, with {prevTitle}.', 'You heard {prevTitle}, by {prevDj}.', '{prevDj}. {prevTitle}. Credits in the usual place.'],
    hours: ['{time} on {street}. {weather}. A good time for a long set.', "It's {time}. {weather} out on {street}.", '{time}. {weather}. {street}.'],
    idents: [
      'Sets, not songs. That is the whole idea.',
      'We read the credits out loud. Somebody has to.',
      'Every set here was somebody else\'s Saturday.',
      'A long set is a short vacation.',
      'Forty-five minutes minimum. That is the rule.',
      'The best transitions are the ones you miss.',
      'Radio SC: the city, played back.',
      'Rooms and clubs and kitchens, all compressed into your speaker.',
      'You are hearing a set somebody practiced for weeks.',
      'The title is the first track of the set.',
      'Keep it moving, keep it close.',
      'Listen for the moment the room changes.',
      'If it is in New York and it has a booth, we may have it.',
      'Every DJ has a signature. Ours is the fade.',
      'Underground does not mean quiet.',
      'Four hours of sleep and one great mix.',
      'Soundcloud mixes, streamed through the official player. Nothing downloaded. Everything respected.',
      'Genres are just directions. We take all of them.',
      'The beat goes on. So does the set.',
      'No filler. Just fillers between the best parts.',
      'A set is a story with a kick drum.',
      'We bring the mix. You bring the headphones.',
    ],
  },
};

/* ---------- time and weather ---------- */

export type WeatherKind = 'dry' | 'rain' | 'wet' | 'drying';

const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];

function hourWord(h: number): string {
  return HOUR_WORDS[((h % 12) + 12) % 12];
}

function period(h: number): string {
  if (h >= 5 && h < 12) return 'in the morning';
  if (h >= 12 && h < 17) return 'in the afternoon';
  if (h >= 17 && h < 21) return 'in the evening';
  return 'at night';
}

const MIN_WORDS: Record<number, string> = { 5: 'five', 10: 'ten', 15: 'fifteen', 20: 'twenty', 25: 'twenty-five' };

/** Spoken clock time at five-minute resolution: "ten past midnight", "a quarter to six in the evening". */
export function spokenTime(hour: number, minute: number): string {
  let h = Math.floor(((hour % 24) + 24) % 24);
  let m = Math.round((((minute % 60) + 60) % 60) / 5) * 5;
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  const named = (hh: number): string | null => (hh === 0 ? 'midnight' : hh === 12 ? 'noon' : null);
  if (m === 0) {
    const n = named(h);
    return n ?? `${hourWord(h)} o'clock ${period(h)}`;
  }
  const to = m > 30;
  const target = to ? (h + 1) % 24 : h;
  const away = to ? 60 - m : m;
  const lead = away === 30 ? 'half past' : away === 15 ? (to ? 'a quarter to' : 'a quarter past') : `${MIN_WORDS[away]} ${to ? 'to' : 'past'}`;
  const n = named(target);
  return n ? `${lead} ${n}` : `${lead} ${hourWord(target)} ${period(target)}`;
}

/** "light rain", "steady rain", "heavy rain", "wet streets", "drying out", "clear" (a clear night after dark). */
export function weatherPhrase(kind: WeatherKind, rain = 0, night = false): string {
  switch (kind) {
    case 'rain': return rain < 0.35 ? 'light rain' : rain < 0.7 ? 'steady rain' : 'heavy rain';
    case 'wet': return 'wet streets';
    case 'drying': return 'drying out';
    default: return night ? 'a clear night' : 'clear skies';
  }
}

/** "Throop Ave" -> "Throop"; empty falls back to Throop. */
export function shortStreet(name: string | undefined): string {
  const t = (name ?? '').replace(/\b(avenue|ave|street|st|place|pl|boulevard|blvd|road|rd)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
  return t || 'Throop';
}

/** Replaces `{key}` placeholders; unknown keys are left out. */
export function fillScript(tpl: string, vars: Record<string, string | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '').replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
