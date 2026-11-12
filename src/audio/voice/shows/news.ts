/**
 * Show 7: WBSY News at the Top, the police blotter and bulletin that reacts to the player.
 * Lines with `when` air only when the live state matches (wanted level, a completed mission, rain, night, STORY bulletins).
 * Slots: {stars} {starsWord} {mission} {bulletin} {street} {time} {weather}.
 */
import type { Show, ScriptLine } from '../types';
const t = (rows: Array<[string, string, ScriptLine['when']?]>): ScriptLine[] => rows.map(([who, text, when]) => ({ who, text, ...(when ? { when } : {}) }));

export const NEWS_AT_THE_TOP: Show = {
  id: 'news-top', title: 'WBSY News at the Top', kind: 'news', host: 'dana',
  lines: t([
    ['trent', `[sfx sting] This is WBSY Talk, the voice of the neighborhood. News at the top of the hour.`],
    ['dana', `Good {daypart}. [beat] I'm Dana Okafor. It's {time} on {street}, and {weather}.`],
    ['dana', `Our top story: [breath] police are looking for a person described as a menace, [breath] a hazard, [breath] and quite possibly, [pause 0.4] a mood. Officers say the suspect is wanted in connection with a series of incidents, and has been, [breath] in the words of one officer, [breath] very hard to keep up with.`, 'wanted'],
    ['dana', `Dispatch is reporting a wanted level of {stars} {starsWord}. A department spokesperson said, quote, [breath] we are doing everything we can, [breath] unquote, [pause 0.5] and then asked who was asking.`, 'wanted'],
    ['dana', `Officers advise residents not to approach the suspect, [pause 0.4] and not to hold the door either. Witnesses say the suspect left the scene in a hurry and took the long way around, which is not a crime but certainly seemed like one.`, 'wanted'],
    ['dana', `On a quieter note, police say there are no active incidents near {street}. A spokesperson called it, quote, [breath] suspiciously peaceful, [breath] unquote, [pause 0.4] and said the department would be monitoring the situation, if it developed any.`, 'calm'],
    ['dana', `The precinct blotter reads like this: a man reported his bicycle stolen, then reported it found, [breath] then reported it stolen again, [pause 0.5] by the same person. [beat] Police are calling it a [em] pattern.`],
    ['dana', `A woman on Hart Street called to report a suspicious pigeon. Officers arrived to find a pigeon, [breath] a woman, [breath] and a very well-organized pile of bread. [beat] No charges were filed. [pause 0.6] [punch] Bread has been seized.`],
    ['dana', `Meanwhile, the city has announced a new initiative called Safe Streets Forward. It will include forty new cameras, [breath] twelve new committees, [breath] and one new pothole, [pause 0.5] which was the result of installing the cameras.`],
    ['dana', `Word from our story desk. [beat] {bulletin}`, 'bulletin'],
    ['dana', `In local news, a mission was recently reported complete: {mission}. Neighbors say it was the sort of thing that is easier to do than to explain, [pause 0.4] and that is how you know it was done properly.`, 'mission'],
    ['dana', `Police declined to comment on {mission}, saying only that it was, quote, handled, unquote, [pause 0.4] which is a word they use when they mean it was not.`, 'mission'],
    ['dana', `It's raining on {street}, and the city reminds residents that umbrellas are not a suitable defense against a building's runoff.`, 'rain'],
    ['dana', `It's late, and the department asks residents to keep their voices down. In other news, [pause 0.5] the department is also not asleep.`, 'night'],
    ['dana', `On the housing beat, a developer announced plans for a luxury tower at a site previously occupied by a luxury garage, [breath] and before that a regular garage, [pause 0.5] and before that, [pause 0.5] a lot of people.`],
    ['dana', `City Hall says it is committed to affordability. Asked what the number was, City Hall said, quote, [breath] a number. [beat] Asked which number, [pause 0.4] City Hall hung up.`],
    ['dana', `In weather, we're told: {weather}. If that changes, we'll have a bulletin. [pause 0.4] If it doesn't, [pause 0.3] we'll have a bulletin about that.`],
    ['dana', `And finally, a note from a spokesperson for the sanitation department. Pickup is delayed on {street}. The department asks that you be patient, and that you keep your trash inside. Pigeons are watching.`],
    ['dana', `We turn now to traffic. Drivers on {street} report delays of anywhere between ten minutes [pause 0.3] and the rest of your natural life. The department blames construction. Construction blames the department. [beat] A double-parked van blames both.`],
    ['dana', `In sports, the Throop Avenue stoop league finished its season last night. The final score was disputed, as is tradition, and the trophy, [breath] a bowling trophy with the bowling man removed, [breath] is being held in escrow by [em] a grandmother.`],
    ['dana', `Joining us now by phone is a spokesperson for the landlords' association, Hollis Crane. Mr. Crane, residents say rents are rising too quickly.`],
    ['hollis', `Dana, thank you. The association rejects the word rising. Rents are, [breath] at most, [breath] ascending.`],
    ['dana', `[beat] Ascending to what?`],
    ['hollis', `A more sustainable tier of community. Per the lease, I cannot say more, [pause 0.4] and also I would prefer not to.`],
    ['dana', `[pause 0.4] Mr. Crane, thank you for your honesty, [pause 0.4] by which I mean your time.`],
    ['dana', `One more thing, [pause 0.6] the bread has been returned to the pigeon. [pause 0.5] Officers say it was the right call.`],
    ['dana', `A consumer alert. The city reminds residents that a person claiming to be from the water department is not from the water department. The water department does not ring doorbells. [beat] The water department does not exist in person. [pause 0.6] It is only a feeling.`],
    ['dana', `And a reminder from the library: books are overdue. The library will not call you. [beat] The library will wait. [pause 0.4] The library has all the time in the world, [pause 0.4] and so, one hopes, do you.`],
    ['dana', `That is the news. Lock your doors, [breath] hug your neighbors, [breath] and for the love of all that is holy, [pause 0.5] do not feed the meters.`],
    ['trent', `This has been WBSY News at the Top. Brought to you by someone who cannot be named for legal reasons.`],
  ]),
};
