/**
 * Credits of the game, as plain data (the screen in Credits.ts only lays it out). People come from docs/swarm/ORG.md:
 * the chosen full name where the Names table has one, the first name alone otherwise (no last names are invented).
 * Third-party thanks are a short summary of docs/CREDITS.md and name nothing that is not in that file.
 */
export interface CreditPerson { name: string; role: string }
export interface CreditTeam { id: string; title: string; note: string; people: readonly CreditPerson[] }

export const DISCLAIMER = 'a fan tribute · not affiliated with Rockstar Games or Take-Two';
export const OWNER: CreditPerson = { name: 'Carlos Franzetti', role: 'Created and directed by' };
export const STUDIO_LEAD: CreditPerson = { name: 'Fable Hart', role: 'Studio lead' };
export const AI_NOTE = 'Fable Hart and the studio team are AI agents working under Carlos Franzetti’s direction.';

export const DIRECTORS: readonly CreditPerson[] = [
  { name: 'Imani Adeyemi', role: 'Streetscape: world' },
  { name: 'Tomas Inkwell', role: 'Inkwell: art' },
  { name: 'Nia', role: 'Airwaves: sound' },
  { name: 'Greta Voss', role: 'Foundry: engine' },
];

export const TEAMS: readonly CreditTeam[] = [
  { id: 'streetscape', title: 'Streetscape', note: 'map, streets, buildings, environment', people: [
    { name: 'Rafael Stoop', role: 'Buildings and photo textures' },
    { name: 'Chidi Okafor', role: 'Real-map switch and intersections' },
    { name: 'Gus Calloway', role: 'Lot and signal data' },
    { name: 'Noor', role: 'Per-lot colourways and detail atlas' },
    { name: 'Bea', role: 'Street materials, trees, bags' },
  ] },
  { id: 'inkwell', title: 'Inkwell', note: 'characters, cars, interface, controls', people: [
    { name: 'Leila Seamstress', role: 'Characters and clothing' },
    { name: 'Priya Ink', role: 'Menus, HUD, loading posters, credits' },
    { name: 'Kenji Okafor-Lyle', role: 'Car fixes' },
    { name: 'Dmitri Volkov', role: 'Sports cars and handling' },
    { name: 'Sam', role: 'Touch and gamepad controls' },
    { name: 'Zadie Okafor', role: 'Map and phone' },
    { name: 'Ines', role: 'People: bodies, garments, faces' },
    { name: 'Rocco', role: 'Eighteen vehicle types and liveries' },
  ] },
  { id: 'airwaves', title: 'Airwaves', note: 'radio, voices, effects, music', people: [
    { name: 'Jules Okonkwo-Reyes', role: 'Radio stations' },
    { name: 'Andre', role: 'Sound effects' },
    { name: 'Mei Vance', role: 'Neural voices and the DJ cast' },
    { name: 'Cal', role: 'SoundCloud playback' },
    { name: 'Otis "Crate" Digger', role: 'Title and loading music' },
  ] },
  { id: 'engine', title: 'Foundry', note: 'stability, performance, platforms, QA', people: [
    { name: 'Omar Quill', role: 'Sim and traffic tests' },
    { name: 'Lena "Hashmark"', role: 'Performance and levels of detail' },
    { name: 'Hana', role: 'Flicker hunting' },
    { name: 'Viktor', role: 'Mac and Windows builds' },
    { name: 'Ash', role: 'Playtests and defect tables' },
    { name: 'Theo Greenwave', role: 'Exit, unstick and traffic AI' },
    { name: 'June Crosswalk', role: 'Crowds and crosswalks' },
    { name: 'Wren', role: 'Story: Air Rights' },
  ] },
];

/** Third-party sources, short, in the order of docs/CREDITS.md. */
export const THANKS: ReadonlyArray<{ title: string; text: string }> = [
  { title: 'Textures', text: 'CC0 texture sets from ambientCG and Poly Haven' },
  { title: 'Models', text: 'Kenney Car Kit and Quaternius characters (CC0)' },
  { title: 'People', text: 'MakeHuman base mesh and rig data (CC0)' },
  { title: 'Map data', text: 'NYC Open Data: MapPLUTO and Building Footprints' },
  { title: 'Voices', text: 'Kokoro-82M on-device neural voices' },
  { title: 'Radio', text: 'Boiler Room, Dekmantel, Resident Advisor, Mixmag, FACT, Rinse FM, Soulection, The Lot Radio, dublab, KEXP 90.3, Radio Paradise, WFMU 91.1, SomaFM and WNYC 93.9 FM: the DJs and stations whose own public streams the radio plays' },
];

/** Every person, in roll order. */
export function allPeople(): CreditPerson[] {
  return [OWNER, STUDIO_LEAD, ...DIRECTORS, ...TEAMS.flatMap((t) => t.people)];
}
