/**
 * Music-station DJ copy, one block per SoundCloud station. Templates with slots:
 *   {dj} {title}          the set that is starting (real data from the SoundCloud feed)
 *   {prevDj} {prevTitle}  the set that just ended
 *   {station} {freq}      dial name and spoken frequency
 *   {time} {weather} {street} {hood}   live game state / a neighbourhood name
 * Plain data; src/audio/voice/Scheduler.ts picks lines without repeats.
 */
import type { ScStationId } from '../../radio';

export interface DjCopy {
  who: string;
  idents: readonly string[];
  intros: readonly string[];
  outros: readonly string[];
  blind: readonly string[];
  hours: readonly string[];
  traffic: readonly string[];
  shouts: readonly string[];
}

export const HOODS: readonly string[] = [
  'Throop Avenue', 'Marcus Garvey Boulevard', 'Tompkins Park', 'Hart Street', 'the Pulaski corner', 'Lewis Avenue', 'Kosciuszko Street',
  'Nostrand', 'the Halsey block', 'the Fulton Street crowd', 'Stuyvesant Heights', 'the Marcy stoops',
];

export const DJ_COPY: Record<ScStationId, DjCopy> = {
  bkhouse: {
    who: 'deja',
    idents: ['{station}, {freq}. House music for people who stay on the floor.', 'You are inside {station}. Deep, soulful, four on the floor, family.', 'This is Deja Fontaine and this is {station}. Nobody leaves before the blend.'],
    intros: ['Next up is {dj} with {title}. Find your spot on the floor.', '{dj} is taking the decks with {title}. Shoulders down, family.', 'Here comes {title} from {dj}. Let the kick drum introduce itself.', 'On the decks now, {dj}, with {title}. This one is for the whole room.'],
    outros: ['That was {prevDj} with {prevTitle}. Somebody send that man a glass of water.', 'You just heard {prevTitle} from {prevDj}. Lovely work.', '{prevDj}, thank you for {prevTitle}. The floor says thanks too.'],
    blind: ['No name on this one, family, only a groove. Trust it.', 'The next set came with no label. We dance anyway on {station}.'],
    hours: ['It is {time} on {street}, and {weather}. Perfect for a long blend.', 'Quick check: {time}, {weather}. The rent is still due, the floor is still open.', '{time} on the clock. {weather}. Stay on the floor.'],
    traffic: ['Traffic on {street} is a slow jam. The tow truck is the only one getting paid.', 'If you are on {street} right now, ease off the gas. The groove will wait for you.', 'Drivers on {street}: honking never made a kick drum come faster.'],
    shouts: ['Shout-out to everybody on {hood} who turned this up. I can feel you.', 'Big love to {hood}. Family, you are the reason the speakers are warm.', 'To the dancers on {hood}: your neighbours say hello, and also, a little quieter after midnight.'],
  },
  dublab: {
    who: 'odell',
    idents: ['{station}, {freq}. Low end under glass.', 'This is {station}. The bass is weather. Dress accordingly.', 'Odell Reverb on {station}. Mind the ceiling.'],
    intros: ['{dj} is up with {title}. [pause 0.5] Brace the shelves.', 'Next, {title}, from {dj}. [pause 0.4] The speaker stack has been informed.', 'Now: {dj}. The set is called {title}. [pause 0.4] Find something heavy to stand next to.', '{title}. {dj} at the controls. [pause 0.5] The roommate approves.'],
    outros: ['That was {prevDj}, with {prevTitle}. [pause 0.5] Still ringing in the floorboards.', '{prevTitle} by {prevDj}. [pause 0.4] The glass is intact. Mostly.', '{prevDj}. {prevTitle}. [pause 0.4] A weather event, and a good one.'],
    blind: ['No credit on this one. [pause 0.5] The bass will introduce itself.', 'An unnamed set on {station}. [pause 0.4] Sometimes the low end prefers privacy.'],
    hours: ['The time is {time}. [pause 0.4] {weather}. Neither matters to the sub.', 'It is {time} on {street}. [pause 0.4] {weather}. I measure it in decibels.', '{time}. {weather}. [pause 0.4] The ceiling is holding up.'],
    traffic: ['Traffic on {street} is a slow riddim. [pause 0.4] Everybody is late and nobody is sorry.', '{street} is backed up. [pause 0.4] Somebody double-parked for a bag of ice.', 'Drive carefully on {street}. [pause 0.4] The low end can wait.'],
    shouts: ['Respect to {hood}. [pause 0.4] The neighbours know the frequency.', 'A nod to {hood}. [pause 0.4] You are the reason the windows hum.', 'To everyone near {hood}: [pause 0.4] the rattle is love. The noise complaint is a hobby.'],
  },
  stoop: {
    who: 'tayo',
    idents: ['{station}, {freq}! Straight off the stoop!', 'Big Tayo, {station}, and the stoop is full! Say it with your whole chest!', 'You are locked into {station}! Where lunch is an event and every verse is a block party!'],
    intros: ['Next up, {dj}! The set is {title}! Let me hear you!', '{dj} on the mic with {title}! Stoop, stand up!', 'Here it comes, {title}, from {dj}! No sitting, no excuses!', 'Give it up for {dj}! {title}, right now, on {station}!'],
    outros: ['That was {prevDj} with {prevTitle}! Somebody get that man a patty!', '{prevTitle} from {prevDj}! Absolute heat, no notes!', 'Big ups to {prevDj} for {prevTitle}! The stoop felt that!'],
    blind: ['No name on this one, but it hits! Trust the stoop!', 'Mystery set on {station}! The beat says it is fine, so it is fine!'],
    hours: ['It is {time}, {weather}, and the stoop is open! {street}, let me hear you!', '{time} on the clock! {weather}! Stoops do not close!', 'Time check, {time}! {weather} on {street}! Keep it moving!'],
    traffic: ['{street} is jammed! Some genius parked a moving truck in a bus lane!', 'Traffic on {street}, people! Honk in rhythm or do not honk at all!', 'Anybody stuck on {street}? Turn me up, the city owes you a concert!'],
    shouts: ['Shout-out to {hood}! Y\'all are the loudest block in Brooklyn and I mean that!', 'Big love to {hood}! Somebody up there is cooking, I can smell it through the radio!', '{hood}, stand up! You know who you are, and so does the landlord!'],
  },
  boogie: {
    who: 'lou',
    idents: ['{station}, {freq}. Mirror balls and bass lines, baby.', 'Velvet Lou here, on {station}. The groove is a legal requirement.', 'This is {station}, where every night is Saturday and the jacket is always pressed.'],
    intros: ['Coming up, {dj} with {title}. Keep it rolling, baby.', '{dj} takes the floor with {title}. Straighten your collar.', 'Here is {title}, from {dj}. The mirror ball is already spinning.', 'And now, {dj}. {title}. Slide right in.'],
    outros: ['That was {prevDj} with {prevTitle}. Smooth as a pressed lapel.', '{prevTitle} from {prevDj}. The mirror ball sends its regards.', 'Thank you to {prevDj} for {prevTitle}. Suave, suave, suave.'],
    blind: ['No name on this set, baby, but the groove has a fine reputation.', 'An unlabeled set on {station}. A gentleman never asks.'],
    hours: ['It is {time}, {weather}, and the night is young enough. {street}, look sharp.', '{time} on the clock. {weather}. Perfect for a slow walk down {street}.', 'The time is {time}. {weather}. The groove does not care about the hour, and neither do I.'],
    traffic: ['Traffic on {street} is slow, baby. Slow is a tempo. The pothole has the lead.', 'If {street} has you stuck, you have the best seat in the house.', 'Easy on {street}. Nobody ever got to the party by honking at a bus.'],
    shouts: ['Shout-out to {hood}. You bring the funk, I bring the jacket.', 'Love to everybody on {hood}. May your bass lines be thick and your landlord be vague.', 'To {hood}: stay sharp, stay smooth, stay out of the potholes.'],
  },
  weird: {
    who: 'wren',
    idents: ['This is {station}, {freq}. [pause 0.5] The hour is a rumour.', 'Wren Calloway, on {station}. [pause 0.5] Thank you, ceiling, for listening.', '{station}. [pause 0.5] For the hours nobody else is awake.'],
    intros: ['Next, {dj}. [pause 0.5] The set is called {title}. It sounds like a room remembering something.', '{title}. [pause 0.5] {dj} made it. I have no further information.', 'Listen to {dj} now. [pause 0.5] {title}. [pause 0.4] Shapes will happen.', 'Here is {title}, by {dj}. [pause 0.5] It does not begin so much as it arrives.'],
    outros: ['That was {prevDj}. [pause 0.5] {prevTitle}. I am still somewhere in the middle of it.', '{prevTitle}, from {prevDj}. [pause 0.5] The ceiling is quiet. That is a compliment.', '{prevDj} and {prevTitle}. [pause 0.5] Thank you for the strange, kind noise.'],
    blind: ['No name for this one. [pause 0.5] Names are overrated at this hour.', 'An unlabeled set. [pause 0.5] The weirdest kind, and the best.'],
    hours: ['It is {time}, [pause 0.4] which does not matter. [pause 0.4] {weather}, if you are keeping track.', 'The clock says {time} on {street}. [pause 0.5] {weather}. [pause 0.4] The clock is guessing.', '{time}. [pause 0.5] {weather}. [pause 0.4] I only mention it so you know where you are not.'],
    traffic: ['There is traffic on {street}. [pause 0.5] The cars are all dreaming of the same direction.', '{street} is slow tonight. [pause 0.5] A river of tail lights. Good listening conditions.', 'If you are on {street}, [pause 0.4] you are already in the middle of a composition.'],
    shouts: ['Hello to everyone near {hood}. [pause 0.5] I am glad you are awake too.', 'A small wave to {hood}. [pause 0.5] You are not alone in the dark. The radio is on.', 'To {hood}: [pause 0.5] the lamp in your window is a kind of music.'],
  },
  yard: {
    who: 'pearl',
    idents: ['{station}, {freq}! Sound system on the avenue. Did you eat?', 'Auntie Pearl here on {station}! Turn it up, baby, and call your mother!', 'This is {station}! The cookout never closes and the pot is never empty!'],
    intros: ['Coming up, {dj} with {title}! Turn it up, baby!', '{dj} is on the sound with {title}! Come, come, come!', 'Here is {title}, from {dj}! Somebody go and check the rice!', 'Next on {station}, {dj}! The set is {title}! Hold on to your plate!'],
    outros: ['That was {prevDj} with {prevTitle}! Lord, that had some weight to it!', '{prevTitle} from {prevDj}! Eat something, baby, you earned it!', 'Respect to {prevDj} for {prevTitle}! The yard is happy!'],
    blind: ['No name on this one, but I know a good riddim when I hear one!', 'A set with no label on {station}! Auntie says trust it!'],
    hours: ['It is {time} and {weather} on {street}! Have you eaten? I am asking as a professional!', '{time} on the clock! {weather}! The sound system does not stop for weather!', 'Time check, baby: {time}. {weather}. Call your mother.'],
    traffic: ['{street} is backed up! A delivery van is parked in the lane like it owns the deed!', 'Traffic on {street}! Nobody is moving, so you might as well wine your waist and curse the mayor!', 'If you are stuck on {street}, eat something and turn me up!'],
    shouts: ['Big hello to {hood}! I smell the curry from here!', 'Shout-out to {hood}! Who is cooking? Somebody is always cooking!', 'To everybody on {hood}: turn it up and tell your neighbours to come out!'],
  },
  flashback: {
    who: 'tommy',
    idents: ['{station}, {freq}! Bass, grime and garage! Rewind that!', 'Tommy Tapedeck on {station}, and the aerial says hi!', 'You are locked into {station}! Pull up, pull up!'],
    intros: ['Coming up, {dj} with {title}! Pull it up!', '{dj} is on the decks with {title}! Wheel it, wheel it!', 'Here comes {title} from {dj}! Don\'t touch that dial! Actually, touch it a little.', 'Next! {dj}! {title}! Mind the speaker stack!'],
    outros: ['That was {prevDj} with {prevTitle}! Rewind that! Actually no, we have a schedule!', '{prevTitle} from {prevDj}! Serious business, as they say, once!', 'Thank you {prevDj} for {prevTitle}! The sub says thanks too!'],
    blind: ['No name on this set! Mystery show! Press play and see what happens!', 'An unlabeled set on {station}! Someone forgot the sticker, and I love them for it!'],
    hours: ['It is {time}, {weather}, and the bass is rolling on {street}! Rewind that, I mean carry on!', '{time} on the clock! {weather}! The sub does not care about time!', 'Time check, {time}! {weather}! Volume up, windows shut!'],
    traffic: ['Traffic on {street} is a two-step in a jam! Wait for the drop!', '{street} is slow! Fast forward! Oh, you cannot. Welcome to the city, pal!', 'If you are on {street}, crank me up! It is a pirate signal in there!'],
    shouts: ['Shout-out to {hood}! You are the B-side of Brooklyn and I love it!', 'Big hello to {hood}! Somebody wheel it up for me!', 'To {hood}: stay loud, stay low-end, stay out of the way of the street sweeper!'],
  },
  latin: {
    who: 'lucho',
    idents: ['{station}, {freq}. Salsa, reggaeton and cumbia, mi gente.', 'Lucho Ventura on {station}. Dale, dale.', 'This is {station}. The clave is the clock.'],
    intros: ['Next up is {dj} with {title}. Find your partner.', '{dj} is on with {title}. Ven, ven, ven.', 'Here comes {title} from {dj}. Knees ready.', 'On the decks now, {dj}, with {title}. Dale!'],
    outros: ['That was {prevDj} with {prevTitle}. Que rico.', 'You just heard {prevTitle} from {prevDj}. Gracias.', '{prevDj}, thank you for {prevTitle}. The whole block says thanks.'],
    blind: ['No name on this one, only a clave. Trust it.', 'The next set came with no label. We dance anyway on {station}.'],
    hours: ['It is {time} on {street}, and {weather}. Perfect for a long dance.', 'Quick check: {time}, {weather}. Nobody sits down.', '{time} on the clock. {weather}. Baila.'],
    traffic: ['Traffic on {street} is moving like a slow bolero. Take your time.', 'If you are on {street} right now, ease off the gas. The rhythm will wait.', 'Drivers on {street}: patience is a salsa kind of virtue.'],
    shouts: ['Shout-out to everybody on {hood}. I can hear the pots and pans from here.', 'Big love to {hood}. Mi gente, you are the reason the speakers are warm.', 'To the dancers on {hood}: your neighbours say hello, and also, a little quieter after midnight.'],
  },
  sc: {
    who: 'cass',
    idents: ['This is {station}, {freq}. Whatever the city played last night.', 'Cass Meridian on {station}. Credits, as always.', '{station}. Seamless, I hope.'],
    intros: ['Next, {dj}, with {title}.', 'Now playing: {title}, by {dj}.', '{dj} with a set called {title}. I will not talk over the first minute.', 'Up next, {title}. The decks belong to {dj}.'],
    outros: ['That was {prevTitle}, by {prevDj}.', 'You just heard {prevDj}, with {prevTitle}. Credits, as promised.', '{prevDj}, {prevTitle}. Thank you for the transitions.'],
    blind: ['The next set came without credits. I will find them. Probably.', 'An uncredited set on {station}. The liner notes are on strike.'],
    hours: ['The time is {time} on {street}, and {weather}. For the record.', '{time}. {weather}. Noted for the liner notes.', 'It is {time}. {weather}. Perfect conditions for a smooth transition.'],
    traffic: ['A word on traffic: {street} is slow. The scaffolding has been there longer than the song.', '{street} is congested. A long mix is the only fix.', 'If you are on {street}, the next track is a better route than the one you are on.'],
    shouts: ['A nod to everyone near {hood}. You make the city sound like this.', 'Thank you, {hood}, for being the reason there is a scene.', 'Hello to {hood}. Someone up there is mixing in the bathroom to avoid the noise complaint. Respect.'],
  },
};
