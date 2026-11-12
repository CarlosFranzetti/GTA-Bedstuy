/**
 * Overheard: what the people of the block say to each other as you walk past. Nine groups, twenty lines each, plus lines that only
 * start once a mission is done. Pure data and a picker (no DOM, no three.js).
 *
 * The rules, in the order they matter:
 *  - These are PEOPLE, not types. Every line is something a person might actually say on a Tuesday: a family joke, a grievance,
 *    a recipe, a kid's logic. The joke is never the group. Where a line pokes at anything it pokes at money, forms, jargon and
 *    landlords, or at the speaker's own small vanity.
 *  - No accent spelling, no dialect caricature, no religion as a punchline, no slurs, no real brands, people or shops.
 *  - A group's `personas` only choose WHICH voice reads a line (see audio/voice/peds/groups.ts: a voice group is a voice, not a
 *    claim about who the ped is). Nothing here ties a group to a skin, an outfit or an accent.
 *
 * Host wiring (FOR FABLE, not done here): a ped that would say a 'chat' bark can instead say `pickOverheard(...)`; emit it as the
 * `text` of the existing `pedBark` event with `kind: 'chat'`. See docs/reference/STORY.md.
 */
import type { Persona } from '@/audio/voice/peds/groups';

export type OverheardGroup =
  | 'stoop-elders' | 'caribbean' | 'latino' | 'hasidic' | 'south-asian' | 'newcomers' | 'young' | 'workers' | 'kids';

export interface OverheardGroupInfo {
  id: OverheardGroup;
  /** Plain description for the doc and the tests. */
  who: string;
  /** Voice personas that may read these lines (a hint for the picker; any voice that shares one will do). */
  personas: readonly Persona[];
  lines: readonly string[];
}

export const OVERHEARD: readonly OverheardGroupInfo[] = [
  {
    id: 'stoop-elders', who: 'Long-time Black families and stoop elders', personas: ['auntie', 'stoop', 'uncle', 'church'],
    lines: [
      'I paid that rent in 1994 and I will pay it in heaven if I have to.',
      'Baby, sit down. You look like you have been standing since Tuesday.',
      'That used to be Mr. Dillard\'s. Then a hardware store. Then a hardware store with a mustache.',
      'I knew his mama. I knew his grandmama. I know exactly what he is about to say.',
      'They want my stoop for a photograph. I want my stoop for sitting.',
      'Did you eat? Do not say yes if it is a lie, I will know.',
      'Forty years on this block and nobody asked what I thought until they wanted my building.',
      'That boy can sing. He just will not do it in front of people, so he does it in the stairwell.',
      'They put a bike lane where Miss Eula\'s garden was, and nobody even said a word.',
      'Sunday dinner is at four. Four means four. Four means four-thirty. But I will say four.',
      'He asked me if I rent. I said no, I stay.',
      'I do not need the app. I need the super to answer his phone.',
      'Her hair looks nice. Do not say it too loud, she will get ideas.',
      'I raised three children in 4B and one of them is a judge, so do not tell me this building has no future.',
      'That man with the clipboard has been looking at my window for ten minutes. Let him. It is a good window.',
      'My knees know it is going to rain. My knees have a better forecast than the news.',
      'We had a block party in eighty-six that went on till the police came to dance.',
      'That is not a cafe, baby. That is a living room with a price.',
      'I told the young lady at the bank: honey, I was balancing checkbooks before you were a rumor.',
      'Every one of those new buildings has a doorman. Who is he guarding it from? Us? We live here.',
    ],
  },
  {
    id: 'caribbean', who: 'Caribbean families (Jamaican, Barbadian, Haitian, Trinidadian and more)', personas: ['auntie', 'deli', 'uncle', 'church'],
    lines: [
      'The patties are fresh at eleven. After eleven they are a memory.',
      'My sister is coming from Port of Spain on Thursday with two suitcases and one pot.',
      'I told him: if the bread is not hot, do not call it a bakery.',
      'Ginger beer should make you cough a little. That is how you know it is honest.',
      'In Kingston you would not say it like that. Here nobody even looks up.',
      'She sent me a voice note for eleven minutes. Eleven. And the whole thing was hello.',
      'We went home last Christmas and the mango tree was bigger than my cousin.',
      'Cricket is on at the cousins\' house. Do not go if you hate being right about it.',
      'The sorrel is on the stove. Do not touch it, do not breathe on it, do not ask.',
      'Mama says a landlord is only a landlord until you cook for him. Then he is a problem.',
      'We were here before the bakery had a hashtag.',
      'Grandmother says the hurricane was not that bad. It only took the roof.',
      'I am not late. The bus is late, and I am loyal to the bus.',
      'He said he would be here at two. It is four. He is a man of his word, just not that word.',
      'The barber and the pastor talk for two hours and nobody is sure who is cutting.',
      'A good soup takes all day. A bad soup takes all day too, but you pretend.',
      'He sells coconut water from a cart and he has an engineering degree. Both are true.',
      'My daughter wants to go to college in the sun. I said, there is sun here. She said, not the same sun.',
      'Church starts at ten. Church starts. Then church starts.',
      'Do not tell Auntie the rent went up. Let her have one more Sunday.',
    ],
  },
  {
    id: 'latino', who: 'Latino neighbours (Dominican, Puerto Rican, Mexican, Ecuadorian and more)', personas: ['auntie', 'deli', 'seller', 'uncle', 'young'],
    lines: [
      'My mother puts plantains in everything. Everything. Last week it was a birthday card.',
      'The laundromat has been Doña Marisol\'s longer than I have had knees.',
      'He says he is fixing the dryer. He has been fixing the dryer since the Olympics.',
      'The whole family on the stoop till midnight. Domino table, speaker, one child asleep on the speaker.',
      'Do not call the landlord. Call my cousin. My cousin knows the landlord\'s cousin.',
      'The rent is the rent, but the coffee is free, and that is why we stay.',
      'My brother DJs weddings. The wedding is never ready. The DJ is always ready.',
      'I sent money home again. Home sent me a photo of a cow. We are even.',
      'You want to understand this block? Stand outside the bodega at seven. Everyone buys the same coffee and a different excuse.',
      'I am from three places. People keep asking which is the real one. I say: dinner.',
      'That building had a courtyard once. Then it had a plan.',
      'She says the stove works. The stove works if you say please.',
      'The domino tournament starts at six. It ends when someone\'s grandmother says it ends.',
      'They put a juice bar where my uncle had his barbershop. The juice bar has a waiting list. For juice.',
      'I worked two jobs and still paid for my daughter\'s fifteenth birthday party. The cake had three floors.',
      'Do not worry about the language. We all talk with our hands.',
      'He is the only man on this block who can park the truck in one try, and he never lets us forget it.',
      'The tamales are four dollars. The story is free. The story is long.',
      'Thirty-one years in this building and nobody knocked to ask if I needed anything. Until they wanted the apartment.',
      'My daughter says I should get the app. I said the app can come to Sunday dinner first.',
    ],
  },
  {
    id: 'hasidic', who: 'Hasidic neighbours in the north of the neighbourhood', personas: ['commuter', 'deli', 'uncle', 'auntie'],
    lines: [
      'I need it by Thursday. Friday I am cooking.',
      'My uncle has the new building on the corner. He says the permit is the longest book he has ever read.',
      'My grandson explained the internet to me. I explained patience to him. We are both still working on it.',
      'Tell him the invoice is net thirty, not net whenever you feel like it.',
      'We have been on this street longer than the sign says it has been a neighbourhood.',
      'The bus was full, the stroller was fuller, and everyone made room anyway. That is a good morning.',
      'My father reads every contract twice. Then he reads it a third time, out loud, to the contract.',
      'I have a spreadsheet for the family dinner. The spreadsheet has more feelings than I do.',
      'She runs the fabric shop like a small government, and everyone is happier for it.',
      'My neighbour brought soup when my wife was ill. Three weeks of soup. I still owe her a soup.',
      'He builds beautiful kitchens. He eats at his mother\'s.',
      'A good printer is a friend for life. A bad printer is a lesson.',
      'The city sent three inspectors for one stair. The stair is fine. The inspectors are lost.',
      'The children asked why the street is so quiet. I told them it is resting.',
      'We have rented this corner for twenty years. The new owner called us a legacy tenant. We called him late.',
      'We need a bigger table. We always need a bigger table.',
      'My cousin drives for the car service. He knows every shortcut and refuses to share any.',
      'Ask Rivka. She knows the form, the clerk, and the clerk\'s mother.',
      'The walk is long, but the street is friendly. You get used to everyone knowing where you are going.',
      'My son wants to be an engineer. I said, fine, start with the stair.',
    ],
  },
  {
    id: 'south-asian', who: 'South Asian shopkeepers and families (Bangladeshi, Pakistani, Indian, Indo-Guyanese and more)', personas: ['deli', 'seller', 'uncle', 'auntie'],
    lines: [
      'Open at five, close when the last customer finishes the sentence.',
      'Chai is on. Complaints are welcome. Complaints are also on.',
      'No, brother, I do not sell lottery tickets. I sell hope with a barcode.',
      'The wholesaler says prices are going up. The wholesaler says that every Monday.',
      'My daughter is going to be a doctor. She told me this when she was four. She has not changed her mind.',
      'I fixed his phone and he told me his whole divorce. That is the real service.',
      'We got a letter from the landlord. It had a typo in my name. At least he is consistent.',
      'Three cousins, one shop, one register, zero arguments. Okay, three arguments.',
      'The cab was late, the bus was slow, the train was a story.',
      'He says the app is cheaper. The app does not know my customers\' children\'s names.',
      'On Fridays the whole block comes by. On Saturdays the whole block owes me.',
      'I am sending money home for the roof. The roof is two months. The rain is five.',
      'He asked if I would sell the shop. I said I would sell him a sandwich.',
      'Tell your mother the samosas are ready. Tell her they are not for her brother.',
      'Twenty-four years behind this counter. I know who needs a cigarette and who needs a conversation.',
      'The new place across the street has a menu with no prices. Brave.',
      'My uncle drove a cab for thirty years. He says the whole city fits in the back seat.',
      'She wants to open a bakery. I said sure, start with the rent.',
      'Everyone says the block has changed. It has only changed if the owner leaves. I stayed.',
      'Brother, the card machine is down. Today we are a cash-and-friendship business.',
    ],
  },
  {
    id: 'newcomers', who: 'Newcomers of every kind (remote workers, founders, wellness people, couples with a stroller)', personas: ['dev', 'commuter', 'young'],
    lines: [
      'I am not displacing anyone. I am co-existing very actively.',
      'We found a loft with original character. The character is a leak.',
      'My landlord says the heat is seasonal. I say the heat is a rumour.',
      'I moved here for authenticity. Where is it. I checked the oat milk.',
      'Can we get a quieter neighbourhood? I want the hum, but at a lower hum.',
      'I work from a cafe. The cafe works from me.',
      'Our start-up is a marketplace for marketplaces. We are pre-revenue and pre-sleep.',
      'I said hello to my neighbour. She said, I know who you are. I am not sure it was a compliment.',
      'My partner wants a dog, a garden and a stoop. We have a window and a cactus.',
      'The woman downstairs brought me a casserole. I think I was the one who got welcomed.',
      'We did a sound bath in a former tire shop. It was beautiful. A man outside said bless you and I think he meant it.',
      'I am learning the block\'s names for things. It is not the bodega. It is Mohammed\'s.',
      'Our co-working space costs more than the apartment I grew up in.',
      'I have a plant that needs more care than I do.',
      'I asked for a flat white. He said, we have coffee. I was so happy.',
      'They said the building was in transition. So are we all. Some of us on a lease.',
      'I did not know the stoop was a place you had to be invited to sit on.',
      'I want to be a good neighbour and I do not know the rules. Is there a form?',
      'My rent went up four hundred. I assumed it was a typo. It was a lifestyle.',
      'I read the lease out loud twice. It is still a lease.',
    ],
  },
  {
    id: 'young', who: 'Teenagers and people in their twenties', personas: ['young', 'rider', 'messenger'],
    lines: [
      'He said he is outside. He has been outside for twenty minutes. Which outside.',
      'I am not stressed, I am just walking fast for no reason.',
      'My phone is at four percent and my life is at two.',
      'I made a beat on the train. It is called Doors Closing. It is mostly doors.',
      'She said we are just friends. I said cool. I am on my third lap of the block.',
      'I got the job. I start Monday. Do not tell my dad, he will make it a speech.',
      'I am not late, the clock is wrong.',
      'My little cousin explained the economy to me with building blocks. I understood it better.',
      'Everybody is doing a podcast. Nobody is doing the dishes.',
      'I am saving for my own place. At this rate I will be saving for my kid\'s place.',
      'He is not shy. He just loves the sound of nobody asking him anything.',
      'We practised for the talent show. The talent was mostly practice.',
      'My teacher said I write like I talk. I said thank you. She said it was not a compliment. I said I know.',
      'I am tired in a way sleep does not fix. It is rent.',
      'The block used to be so loud. Now it is loud in a different font.',
      'I do not want a phone call. I want a voice note. I want to listen at my own speed.',
      'We keep saying we will leave Brooklyn. Then we get a slice and forget.',
      'Her braids took six hours and I would do it again. Not the six hours. The braids.',
      'I am learning the saxophone. The neighbours are learning patience. We are all growing.',
      'My friend got a record deal. A real one. He is still on the same bus, which I respect.',
    ],
  },
  {
    id: 'workers', who: 'Delivery riders, nurses, bus drivers and the night shift', personas: ['rider', 'messenger', 'commuter', 'deli'],
    lines: [
      'Three orders, two flights of stairs, one dog with opinions.',
      'Night shift ends at seven. Day shift starts at seven. We wave at each other like ships.',
      'The bus is eight minutes away. It has been eight minutes away since Tuesday.',
      'I deliver to the same building every night. Nobody has said thank you. I am going to try going first.',
      'I clock out, I breathe out, I wave at the pigeon. Same pigeon.',
      'Rain means better tips and worse everything else.',
      'My feet hurt in places I did not know had feet.',
      'I have seen the whole block at four a.m. It is the nicest it ever looks.',
      'She works doubles and then sings in the choir. I do not know when she sleeps. Neither does she.',
      'The order says ring twice. Nobody told the building it is a doorbell.',
      'People think the el is loud. The el is the lullaby.',
      'I drove the route for twenty-two years. I could do it with my eyes closed. Do not ask how I know.',
      'One more run, then I am a person again.',
      'They ask me to rate the customer. I gave him five. He said hello.',
      'I am a nurse, so when you say I am fine, I am already counting.',
      'The electric bike is faster than the car. The car does not know.',
      'Double-parked, hazards on, back in a minute. That is a language.',
      'Eighteen deliveries. Four flights. One birthday cake that survived.',
      'I love this block at five a.m. Nobody asks me for anything. The bakery smells like a hug.',
      'Cold coffee, warm heart, expired meter.',
    ],
  },
  {
    id: 'kids', who: 'Children', personas: ['kid'],
    lines: [
      'I am not telling you where the cat is. It is a secret between me and the cat.',
      'When I grow up I am going to decide what the pigeons eat.',
      'My grandma says if I eat all my greens I will grow. I ate all my greens. Look at me.',
      'I can hold my breath through the whole tunnel. The whole tunnel.',
      'The stoop is lava. The sidewalk is lava. The street is a different lava.',
      'I am not tired. I am lying down very loudly.',
      'That man has a very big dog and a very small dog and they are both mad.',
      'My teacher said we live on a block. But I live in an apartment. Where is the block?',
      'I have a secret handshake. It is different every day.',
      'Can we get a pigeon? Can we get a pigeon named Gerald?',
      'I counted nineteen cars. Then I lost count because one was yellow.',
      'I am going to be a baker, a scientist and a bus.',
      'Mama says I have to wear a coat. I said it is not cold. She said it is not cold yet.',
      'My shoes light up when I stomp. Watch. Watch. Watch.',
      'Everybody on this street knows my name. It is kind of annoying.',
      'I found a coin. It is a quarter. It is mine. I am going to buy the sky.',
      'Why does the train go so high? Is it scared of the ground?',
      'I am the boss of the stoop today. The stoop does not know.',
      'I am not whining. I am advocating.',
      'My brother is eleven and he knows everything. Ask him.',
    ],
  },
];

/** Lines that only begin once the player has finished a mission (and, where given, set a flag): the block reacting to what you did. */
export interface ReactiveLine { group: OverheardGroup; after: string; flag?: string; text: string }

export const OVERHEARD_REACTIVE: readonly ReactiveLine[] = [
  { group: 'newcomers', after: 'moisture-event', text: 'Our heat is seasonal. I asked which season. They said transitional.' },
  { group: 'newcomers', after: 'founder-mode', text: 'Did you hear BlockBlock pivoted again? I am in the dog one.' },
  { group: 'hasidic', after: 'red-tape-relay', text: 'Rivka got the record shop its three stamps. The clerk asked her to teach the class.' },
  { group: 'south-asian', after: 'carbon-copy', text: 'They changed the batteries in half the building. Half. The other half we are doing ourselves.' },
  { group: 'stoop-elders', after: 'the-binder', text: 'That woman with the binder knows more than the city does. And she carries it herself.' },
  { group: 'workers', after: 'gavel-to-gavel', text: 'I hear the board got moved by a kick drum. I would have paid to see that.' },
  { group: 'stoop-elders', after: 'pigeon-post', text: 'Those birds came home. Somebody ought to write that down.' },
  { group: 'young', after: 'van-man', text: 'The van rated my stoop an eight. I am not even on the lease.' },
  { group: 'newcomers', after: 'silent-retreat', text: 'My friend left the silent thing early. He has been talking for two days. It is lovely.' },
  { group: 'caribbean', after: 'slow-roll', text: 'That was the proper way to say goodbye. Twelve miles an hour. Forty on foot. A whole life.' },
  { group: 'stoop-elders', after: 'crate-expectations', text: 'Thirty-eight years that shop stood there. I bought my first record in it.' },
  { group: 'latino', after: 'smoke-signals', text: 'My cousin lived on the fourth floor of that building. The fourth floor is on my couch now.' },
  { group: 'stoop-elders', after: 'smoke-signals', text: 'Nine families. Nine. And a man in a fleece vest said he was saddened.' },
  { group: 'workers', after: 'last-call-on-throop', flag: 'ending.trust', text: 'I saw the faces on the billboard. I know four of them. The nurse on three, the baker, the man with the cart.' },
  { group: 'young', after: 'last-call-on-throop', flag: 'ending.buyout', text: 'Everybody is moving forward. In different directions. Mostly Queens.' },
  { group: 'south-asian', after: 'last-call-on-throop', flag: 'ending.landlord', text: 'The new landlord says the heat is on. The heat is on. I am suspicious of how nice it is.' },
];

export const OVERHEARD_GROUPS: readonly OverheardGroup[] = OVERHEARD.map((g) => g.id);

export interface OverheardContext {
  /** Missions finished so far (ids). */
  done: ReadonlySet<string>;
  /** Story flag test (StoryState.has). */
  has?: (flag: string) => boolean;
}

export interface OverheardPick { group: OverheardGroup; text: string; personas: readonly Persona[]; reactive: boolean }

const recent: string[] = [];

/**
 * One overheard line. `rnd` is any 0..1 source (Rng.next). Reactive lines the player has unlocked are favoured one time in four, a
 * line is never repeated within the last twelve, and `group` pins the group (a ped's own).
 */
export function pickOverheard(rnd: () => number, ctx: OverheardContext, group?: OverheardGroup): OverheardPick {
  const has = ctx.has ?? (() => false);
  const reactive = OVERHEARD_REACTIVE.filter((l) => ctx.done.has(l.after) && (l.flag === undefined || has(l.flag)) && (group === undefined || l.group === group));
  const fresh = (t: string): boolean => !recent.includes(t);
  const remember = (t: string): void => { recent.push(t); if (recent.length > 12) recent.shift(); };
  const info = (id: OverheardGroup): OverheardGroupInfo => OVERHEARD.find((g) => g.id === id)!;
  const live = reactive.filter((l) => fresh(l.text));
  if (live.length > 0 && rnd() < 0.25) {
    const l = live[Math.floor(rnd() * live.length) % live.length];
    remember(l.text);
    return { group: l.group, text: l.text, personas: info(l.group).personas, reactive: true };
  }
  const g = group ? info(group) : OVERHEARD[Math.floor(rnd() * OVERHEARD.length) % OVERHEARD.length];
  let text = g.lines[Math.floor(rnd() * g.lines.length) % g.lines.length];
  for (let i = 0; i < 6 && !fresh(text); i++) text = g.lines[Math.floor(rnd() * g.lines.length) % g.lines.length];
  remember(text);
  return { group: g.id, text, personas: g.personas, reactive: false };
}
