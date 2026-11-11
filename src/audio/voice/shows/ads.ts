/** Parody commercials. Every brand is invented. 2 to 4 lines each; the `ad` kind plays between segments. */
import type { Show } from '../types';

const ad = (id: string, title: string, lines: Array<[string, string]>): Show => ({
  id, title, kind: 'ad', host: lines[0][0], lines: lines.map(([who, text]) => ({ who, text })),
});

export const ADS: readonly Show[] = [
  ad('ad-silomilk', 'Silo Milk Concentrate', [
    ['trent', 'Tired of milk that came from an animal? [beat] Try Silo, the milk that came from a pitch deck.'],
    ['noelle', 'Silo. Eleven dollars a carton. [pause 0.4] Every sip comes with a lecture about your last carton.'],
    ['trent', 'Silo is not milk. It is a lifestyle with a cap table.'],
  ]),
  ad('ad-flipco', 'FlipCo Instant Offers', [
    ['noelle', 'Your building is worth more than you think. [pause 0.4] Call FlipCo for an instant cash offer.'],
    ['trent', 'We buy houses in any condition. Even the condition of having tenants. [laugh]'],
    ['noelle', 'FlipCo. We send flowers to the funeral. Then a contract. [sfx buzz]'],
  ]),
  ad('ad-kombucha', 'Kombucha Kingdom', [
    ['trent', 'Is your stomach full of bacteria? [beat] Good! Fill it with more of our bacteria!'],
    ['noelle', 'Kombucha Kingdom. Nine dollars a bottle. [pause 0.3] The culture is live. The bodega it replaced is not.'],
  ]),
  ad('ad-coworking', 'Hustle Hive Cowork', [
    ['noelle', 'Your landlord turned your apartment into four of our desks. So come rent one back! Six hundred a month. Bring your own chair.'],
    ['trent', 'Hustle Hive Cowork. Free beer on Fridays, free panic all week. [laugh]'],
    ['noelle', 'Hustle Hive. The hive is full. You are the honey.'],
  ]),
  ad('ad-lawfirm', 'Crane and Crane Tenant Solutions', [
    ['trent', 'Got tenants? [beat] Got a lease with a loophole? [beat] Call Crane and Crane.'],
    ['noelle', 'We evicted one family so politely that they thanked us. Crane and Crane. Per the lease.'],
  ]),
  ad('ad-bank', 'First Neighbour Trust', [
    ['noelle', 'First Neighbour Trust. We care about your community. [pause 0.4] We care about it a lot. Please stop asking how much.'],
    ['trent', 'Open an account today and receive a free tote bag. Overdraft fees are not included in the bag.'],
  ]),
  ad('ad-airhorn', 'Mighty Mouth Airhorns', [
    ['trent', 'Sick of being ignored at the community board? Get a Mighty Mouth Airhorn. [sfx airhorn]'],
    ['noelle', 'Mighty Mouth. Procedure fears it. Landlords fear it more. [pause 0.3] Not for use in church.'],
  ]),
  ad('ad-gym', 'Iron Brownstone Fitness', [
    ['trent', 'Iron Brownstone Fitness. Lift heavy. Think about rent. Lift heavier.'],
    ['noelle', 'First month free. Every month after, mysteriously not free.'],
    ['trent', 'Iron Brownstone. You do not have a gym, you have a membership.'],
  ]),
  ad('ad-psychic', 'Madame Zenobia Reads Your Lease', [
    ['noelle', 'Madame Zenobia sees your future. [pause 0.5] She sees a rent increase.'],
    ['trent', 'Madame Zenobia Reads Your Lease. Palm reading, tarot, and a free reading of Clause Nine. It ends in March.'],
  ]),
  ad('ad-smartfridge', 'FridgeBuddy Premium', [
    ['trent', 'Introducing FridgeBuddy Premium! The refrigerator that judges you!'],
    ['smartspeaker', 'I notice you have eaten cheese at three in the morning. [pause 0.4] I have told your insurance company.'],
    ['trent', 'FridgeBuddy. Now with shame, for the whole family.'],
  ]),
  ad('ad-moving', 'Quick Quit Movers', [
    ['trent', 'Got a notice of intent? [beat] Quick Quit Movers will have you out in under an hour!'],
    ['noelle', 'We pack, we haul, we say we are sorry. Quick Quit Movers. No judgement, only boxes.'],
  ]),
  ad('ad-deli', 'Troop Deli', [
    ['trent', 'Troop Deli. Open twenty-five hours a day. [pause 0.3] Do not ask which hour is the extra one.'],
    ['noelle', 'Bacon, egg and cheese, made by a man who knows your name and your order. The landlord wants us gone. [pause 0.3] The line out the door disagrees.'],
  ]),
  ad('ad-sleep', 'Dream Quota Mattresses', [
    ['noelle', 'Dream Quota. Sleep your way to productivity.'],
    ['trent', 'Our mattress tracks how well you rest, and sends the report to your employer. You are welcome.'],
  ]),
  ad('ad-crypto', 'StoopCoin', [
    ['trent', 'StoopCoin! The currency backed by absolutely nothing! [laugh]'],
    ['noelle', 'Buy now. Your cousin already did. He will not stop talking about it.'],
    ['trent', 'StoopCoin. Past performance is just a story we tell.'],
  ]),
  ad('ad-wellness', 'Breathe Boutique', [
    ['noelle', 'Breathe Boutique. Forty dollars to inhale in a nicer room.'],
    ['trent', 'Free exhale with every membership. [pause 0.3] Exhales not guaranteed.'],
  ]),
  ad('ad-pigeon', 'Pigeon Patrol Pest Services', [
    ['trent', 'Is a pigeon looking at you? [beat] Is it judging your sandwich? [beat] Call Pigeon Patrol!'],
    ['noelle', 'We do not hurt them. We just ask them to reconsider. Pigeon Patrol. Gently firm.'],
  ]),
  ad('ad-delivery', 'Zoomzoom Dinner Drop', [
    ['trent', 'Zoomzoom Dinner Drop. Dinner at your door in thirty minutes or less. [pause 0.3] Or more. We do not control the bridge.'],
    ['noelle', 'Tip your courier. Tip them twice. We kept the first one.'],
  ]),
  ad('ad-consultant', 'Synergy Brownstone Partners', [
    ['noelle', 'Synergy Brownstone Partners. We pivot your block.'],
    ['trent', 'Paper napkins to a mixed-use destination in only seven quarters! Your neighbours will be curated.'],
    ['noelle', 'Synergy. Because change is only scary if you are still here.'],
  ]),
  ad('ad-lottery', 'Lucky Throop Scratchers', [
    ['trent', 'Feeling lucky? [beat] Scratch your way to a better Tuesday with Lucky Throop Scratchers!'],
    ['noelle', 'Play responsibly. Or irresponsibly, but quietly. [laugh]'],
  ]),
  ad('ad-car', 'Barely Better Used Cars', [
    ['trent', 'Barely Better Used Cars! We have a car for every budget, and a story for every dent!'],
    ['noelle', 'The brakes? [pause 0.4] Mostly brakes. Come on down.'],
  ]),
  ad('ad-school', 'Lil Genius Academy', [
    ['noelle', 'Lil Genius Academy. We teach your toddler to code, to meditate and to negotiate.'],
    ['trent', 'Tuition is thirty thousand dollars. Graduation is imaginary. Enroll today!'],
  ]),
  ad('ad-water', 'Source Spring Premium Tap', [
    ['trent', 'Source Spring Premium Tap! Water from your own faucet, in a smaller, fancier bottle!'],
    ['noelle', 'Same water, higher price. Source Spring. Drink the story.'],
  ]),
  ad('ad-insurance', 'Maybe Mutual', [
    ['noelle', 'Maybe Mutual. Maybe we will cover it.'],
    ['trent', 'Maybe we will not. Maybe we will send a letter. Maybe the letter will be about something else.'],
    ['noelle', 'Maybe Mutual. You are in good hands. [pause 0.3] They are somebody else\'s hands.'],
  ]),
  ad('ad-vinyl', 'Groove Cellar Records', [
    ['trent', 'Groove Cellar Records. Dig through the crates, dig through your savings.'],
    ['noelle', 'We buy, sell and trade. Ask about the record you did not know you needed. It is nine hundred dollars.'],
  ]),
  ad('ad-permit', 'Permit Express', [
    ['noelle', 'Need a permit for your permit? Permit Express will stand in line for you.'],
    ['trent', 'Eleven years, if that is what it takes. Our people are patient. Your landlord is more patient. [laugh]'],
    ['noelle', 'Permit Express. We hold your place. Somebody has to.'],
  ]),
  ad('ad-hotline', 'Neighbour Watch Plus', [
    ['trent', 'Neighbour Watch Plus. Because someone is always looking, and you should be the one.'],
    ['noelle', 'Report suspicious activity. Report suspicious inactivity. Report your cat. [laugh]'],
  ]),
];
