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
    ['dana', `Good {daypart}. I'm Dana Okafor. It's {time} on {street}, and {weather}.`],
    ['dana', `Our top story: police are looking for a person described as a menace, a hazard, and quite possibly, a mood. Officers say the suspect is wanted in connection with a series of incidents, and has been, in the words of one officer, very hard to keep up with.`, 'wanted'],
    ['dana', `Dispatch is reporting a wanted level of {stars} {starsWord}. A department spokesperson said, quote, we are doing everything we can, unquote, and then asked who was asking.`, 'wanted'],
    ['dana', `Officers advise residents not to approach the suspect, and not to hold the door either. Witnesses say the suspect left the scene in a hurry and took the long way around, which is not a crime but certainly seemed like one.`, 'wanted'],
    ['dana', `On a quieter note, police say there are no active incidents near {street}. A spokesperson called it, quote, suspiciously peaceful, unquote, and said the department would be monitoring the situation, if it developed any.`, 'calm'],
    ['dana', `The precinct blotter reads like this: a man reported his bicycle stolen, then reported it found, then reported it stolen again, by the same person. Police are calling it a pattern.`],
    ['dana', `A woman on Hart Street called to report a suspicious pigeon. Officers arrived to find a pigeon, a woman, and a very well-organized pile of bread. No charges were filed. Bread has been seized.`],
    ['dana', `Meanwhile, the city has announced a new initiative called Safe Streets Forward. It will include forty new cameras, twelve new committees, and one new pothole, which was the result of installing the cameras.`],
    ['dana', `Word from our story desk. {bulletin}`, 'bulletin'],
    ['dana', `In local news, a mission was recently reported complete: {mission}. Neighbors say it was the sort of thing that is easier to do than to explain, and that is how you know it was done properly.`, 'mission'],
    ['dana', `Police declined to comment on {mission}, saying only that it was, quote, handled, unquote, which is a word they use when they mean it was not.`, 'mission'],
    ['dana', `It's raining on {street}, and the city reminds residents that umbrellas are not a suitable defense against a building's runoff.`, 'rain'],
    ['dana', `It's late, and the department asks residents to keep their voices down. In other news, the department is also not asleep.`, 'night'],
    ['dana', `On the housing beat, a developer announced plans for a luxury tower at a site previously occupied by a luxury garage, and before that a regular garage, and before that a lot of people.`],
    ['dana', `City Hall says it is committed to affordability. Asked what the number was, City Hall said, quote, a number. Asked which number, City Hall hung up.`],
    ['dana', `In weather, we're told: {weather}. If that changes, we'll have a bulletin. If it doesn't, we'll have a bulletin about that.`],
    ['dana', `And finally, a note from a spokesperson for the sanitation department. Pickup is delayed on {street}. The department asks that you be patient, and that you keep your trash inside. Pigeons are watching.`],
    ['dana', `That is the news. Lock your doors, hug your neighbors, and for the love of all that is holy, do not feed the meters.`],
    ['trent', `This has been WBSY News at the Top. Brought to you by someone who cannot be named for legal reasons.`],
  ]),
};
