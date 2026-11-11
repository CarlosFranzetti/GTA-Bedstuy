/**
 * The recurring cast of "Air Rights". Each has a voice, a motive and a secret (revealed by the mission named in `reveal`).
 * The jokes punch up at power, hypocrisy and jargon; nobody here is a stereotype's punchline. Speaker names are the
 * `name` field; subtitle lines (SubLine.who) and talkTo npc names must be one of these or an `EXTRA_SPEAKERS` entry.
 */
export interface Voice { pitch: number; rate: number }

export interface Character {
  id: string;
  /** The speaker tag shown on subtitles. */
  name: string;
  full: string;
  role: string;
  /** Who they are, in one honest line (heritage, trade, years on the block). */
  bio: string;
  /** What they want. */
  motive: string;
  /** What they are hiding. */
  secret: string;
  /** Mission id where the secret comes out. */
  reveal: string;
  /** Speech-synthesis shaping (pitch 0.1..2, rate 0.1..10), applied by whatever voices the line. */
  voice: Voice;
}

export const CAST: readonly Character[] = [
  {
    id: 'odette', name: 'Ms. Odette', full: 'Odette Brathwaite', role: 'Owner, Wax Deli (record shop)',
    bio: 'Barbados-born, 71, on Throop since 1983. Sells records out of a former deli and still calls the till "the machine".',
    motive: 'Keep the shop open one more winter.', secret: 'She has been hiding the lease notices inside the jazz sleeves for two years and owes far more than she says.',
    reveal: 'back-rent', voice: { pitch: 0.9, rate: 0.9 },
  },
  {
    id: 'sloth', name: 'DJ Sloth', full: 'Kwame Mensah', role: 'Resident DJ, Aftersloth',
    bio: 'Ghanaian-American, 64, played the first night the club opened and has not left a booth voluntarily since.',
    motive: 'Keep the room alive and hand it to someone who will not ruin it.', secret: 'He is deaf in his left ear and going in the right; he plays by feel and has been training Dee to be his ears.',
    reveal: 'last-call-on-throop', voice: { pitch: 0.7, rate: 0.85 },
  },
  {
    id: 'auntie', name: 'Auntie G', full: 'Gloria Pettiford', role: 'Stoop captain, Throop Ave',
    bio: 'Black Southern roots, 68, rent-stabilized since 1991, runs the block like a small, loud government.',
    motive: 'Nobody leaves the block, and nobody says goodbye.', secret: 'She has been quietly binning the buyout letters addressed to her neighbours so that nobody is tempted to leave.',
    reveal: 'smoke-signals', voice: { pitch: 1.1, rate: 1.05 },
  },
  {
    id: 'alvin', name: 'Mr. Alvin', full: 'Alvin Greaves', role: 'Community board gadfly',
    bio: 'Jamaican-born, 74, has spoken at every community board meeting for nineteen years and timed himself at all of them.',
    motive: 'To be the man who stopped it.', secret: 'In March he signed a "cooperation agreement" selling his building\'s air rights to cover his late wife\'s hospital debt.',
    reveal: 'borough-hall-express', voice: { pitch: 0.8, rate: 0.95 },
  },
  {
    id: 'tay', name: 'Tay', full: 'Tavon Ellis', role: 'Your oldest friend',
    bio: 'Black, 30, grew up two doors down. Funny in every situation but his own.',
    motive: 'To stop owing people.', secret: 'He has been giving Hobbs\'s crew the names of tenants who are behind on rent, and he is using pills to stop feeling it.',
    reveal: 'repo-the-repo', voice: { pitch: 0.95, rate: 1.15 },
  },
  {
    id: 'dee', name: 'Dee', full: 'Deandra Okafor-Bell', role: 'Teen producer',
    bio: 'Nigerian-American, 17, makes beats on a phone with a cracked screen and has a better ear than anybody on the block.',
    motive: 'To get paid for her work before someone else does.', secret: 'The "Stoop" jingle in the Parallax ads is her beat; she sold it for $300 to a sync agency.',
    reveal: 'walk-dee-home', voice: { pitch: 1.35, rate: 1.2 },
  },
  {
    id: 'mohammed', name: 'Mohammed', full: 'Mohammed Rahman', role: 'Owner, Troop Deli (bodega)',
    bio: 'Bangladeshi-born, 52, opens at five, closes whenever the last customer finishes the sentence.',
    motive: 'Renew the lease without anyone noticing he asked.', secret: 'His back-room recorder has fourteen months of footage showing Hobbs\'s crew on the block at night. He has told nobody.',
    reveal: 'smoke-signals', voice: { pitch: 0.95, rate: 1.0 },
  },
  {
    id: 'marisol', name: 'Doña Marisol', full: 'Marisol Vega', role: 'Owner, KOSCIUSZ-K-O-MAT (laundromat)',
    bio: 'Dominican, 58, folds sheets like a diplomat and knows every secret on the block by the weight of the laundry.',
    motive: 'Pay off the building loan before it pays her off.', secret: 'Hobbs holds her mortgage, and he has been using her machines to move cash.',
    reveal: 'fleece-vest', voice: { pitch: 1.05, rate: 1.05 },
  },
  {
    id: 'yossi', name: 'Yossi', full: 'Yossi Adler', role: 'Property manager, family office',
    bio: 'Hasidic, 33, reads every document twice and apologises when it is not his fault. His family owns two small buildings and is deep in debt to Parallax.',
    motive: 'To do the right thing without his father finding out how much it costs.', secret: 'He pays his tenants\' repair bills out of his own savings and leaked the shell-company chart.',
    reveal: 'crate-expectations', voice: { pitch: 1.0, rate: 1.1 },
  },
  {
    id: 'kowalski', name: 'Sgt. Kowalski', full: 'Nadine Kowalski', role: 'Police sergeant, eleven days from her pension',
    bio: 'White, 52, has filled in the same form 4,000 times and has opinions about the form.',
    motive: 'Get to the end of the month without a single new problem.', secret: 'She has been "losing" Hobbs\'s complaint paperwork, and she is the one who finally hands you the fire marshal\'s log.',
    reveal: 'smoke-signals', voice: { pitch: 0.85, rate: 1.0 },
  },
  {
    id: 'hallie', name: 'Hallie', full: 'Hallie Moore', role: 'Co-founder, Stillwater Collective (wellness studio)',
    bio: 'White, 31, from Connecticut, means well so hard it has a sound. Runs sound baths in a former tire shop.',
    motive: 'To belong somewhere she did not push anybody out of.', secret: 'The "Community Partner" decal in her window is a Parallax contract, and the contract is a non-renewal.',
    reveal: 'open-house', voice: { pitch: 1.25, rate: 1.0 },
  },
  {
    id: 'bryce', name: 'Bryce', full: 'Bryce Lindqvist', role: 'Co-founder, Stillwater Collective',
    bio: 'White, 33, says "hold space" in conversation. Owns a van with a plant in it.',
    motive: 'To be liked by the block.', secret: 'He read the contract and signed it anyway because the font looked trustworthy.',
    reveal: 'open-house', voice: { pitch: 0.9, rate: 1.1 },
  },
  {
    id: 'hobbs', name: 'Hobbs', full: 'Lyle Hobbs', role: 'Community Liaison, Parallax Living',
    bio: 'Black, 45, grew up three blocks away, carries a tablet and a pair of bolt cutters, and calls both "tools".',
    motive: 'To be the one who brings it down gently, because it is coming down.', secret: 'He believes the buyouts are kinder than waiting for the building to fall down, and for the first time it is no longer completely a lie.',
    reveal: 'last-call-on-throop', voice: { pitch: 0.85, rate: 0.9 },
  },
  {
    id: 'pryce', name: 'Pryce', full: 'Declan Pryce', role: 'CEO, Parallax Living (voice and billboards)',
    bio: 'White, 38, speaks entirely in decks. Never appears in person until the last night.',
    motive: 'A shiny, frictionless block.', secret: 'He has never been below 14th Street after dark.',
    reveal: 'last-call-on-throop', voice: { pitch: 1.0, rate: 1.3 },
  },
];

/** People who speak but are not part of the arc (existing mission givers, walk-ons). */
export const EXTRA_SPEAKERS: readonly string[] = [
  'You', 'Phone', 'Radio', 'Crowd', 'Dispatch', 'Fare', 'Mrs. Okafor', 'Lorraine', 'Big Lou', 'Ms. Pearl', 'Tiana',
  'Kyle', 'Paramedic', 'Clerk', 'Marshal', 'Announcer', 'Hearing Officer', 'Train', 'Doorman', 'Neighbour', 'Passenger',
];

const byName = new Map(CAST.map((c) => [c.name, c]));
export const characterByName = (name: string): Character | undefined => byName.get(name);
export const isSpeaker = (name: string): boolean => byName.has(name) || EXTRA_SPEAKERS.includes(name);
