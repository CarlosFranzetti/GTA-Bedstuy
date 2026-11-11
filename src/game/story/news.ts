/**
 * Radio copy that reacts to the story: news bulletins (each unlocked by a mission or a flag) and parody ads that get
 * more ominous as the act advances. Pure data + a selector. The announcer reads them through
 * `BroadcastContext.bulletins` / `.ads` (see StoryDirector.broadcast()).
 *
 * House style: dry, deadpan, aimed at power and jargon. Sober where it has to be (the PSA after the overdose).
 */
import type { StoryState } from './StoryState';
import { F } from './flags';

export interface Bulletin {
  id: string;
  /** Spoken once the mission is complete (and `flag`, if given, is set). */
  after: string;
  flag?: string;
  text: string;
}

export const BULLETINS: readonly Bulletin[] = [
  { id: 'n-bodega', after: 'bodega-run', text: 'A bodega on Throop Avenue delivered three orders while they were still warm. City Hall has asked how it was done and been told: by running.' },
  { id: 'n-notice', after: 'notice-of-intent', text: 'Overnight, paper appeared on doors along Throop Avenue. The paper says it is a Notice of Intent. Asked what the intent is, the paper declined to comment.' },
  { id: 'n-comment', after: 'public-comment', text: 'Community Board Three voted four to three on a rezoning motion after a resident spoke for three minutes and fourteen seconds. The board called the extra fourteen seconds "a courtesy" and "a precedent".' },
  { id: 'n-pressing', after: 'handle-with-care', text: 'A box of test pressings was driven across Bed-Stuy at a speed witnesses called "unusually respectful". The pressing plant confirmed that the box arrived with all of its grooves.' },
  { id: 'n-rent-fixer', after: 'back-rent', flag: F.ODETTE_FIXER, text: 'Parallax Living says it has "partnered" with a Throop Avenue record shop to "stabilise its operations". The record shop said it was not asked. Then it said it was asked politely, which is worse.' },
  { id: 'n-rent-paid', after: 'back-rent', flag: F.ODETTE_PAID, text: 'A Throop Avenue record shop raised its back rent in nickels, a jar of singles and one wristwatch. Neighbours called it the best business plan on the block.' },
  { id: 'n-follow', after: 'fleece-vest', text: 'Residents report seeing a man in a fleece vest at three addresses a week. Parallax Living confirms the vest is "a community-facing garment".' },
  { id: 'n-open', after: 'open-house', text: 'A pop-up leasing office on Pulaski Street offered free oat-milk tastings to anyone willing to read a lease aloud. Nobody read to the end. The oat milk was fine.' },
  { id: 'n-dee', after: 'walk-dee-home', text: 'A jingle in the Parallax Living campaign has been identified by a teenager as her own work. Parallax Living thanked her for her "organic contribution to our brand ecosystem" and did not mention money.' },
  { id: 'n-repo', after: 'repo-the-repo', text: 'A 2004 sedan was reported missing from a private lot and later reported found. Police said the lot had "no cameras by design" and the car had "no brakes by design".' },
  { id: 'n-evict', after: 'crate-expectations', flag: F.ODETTE_EVICTED, text: 'A record shop on Throop Avenue closed its shutter today after thirty-eight years. The marshal arrived at six. The records, by then, were not there.' },
  { id: 'n-health', after: 'night-of-the-narcan', text: 'The health department reminds residents that free overdose-reversal kits are available at pharmacies and many corner stores. Ask for one. Nobody will ask you why.' },
  { id: 'n-fire', after: 'smoke-signals', text: 'A fire on Throop Avenue early this morning displaced nine households. Officials say the cause is under review. Parallax Living said it is "saddened, and available for comment after nine".' },
  { id: 'n-bus', after: 'borough-hall-express', text: 'A city bus arrived at a hearing forty minutes early with thirty-one residents aboard. The bus driver, reached at a diner, said he was not aware he had a bus.' },
  { id: 'n-trust', after: 'last-call-on-throop', flag: F.END_TRUST, text: 'A billboard on Throop Avenue showed tenants\' faces instead of an advertisement for eleven minutes last night. Parallax Living called it "unauthorised content". The block called it the news.' },
  { id: 'n-landlord', after: 'last-call-on-throop', flag: F.END_LANDLORD, text: 'A new owner has taken over three buildings on Throop Avenue. Tenants say the new owner is "a familiar face". Tenants also say the heat is on. Both are being monitored.' },
  { id: 'n-buyout', after: 'last-call-on-throop', flag: F.END_BUYOUT, text: 'Parallax Living completed its acquisition of the Throop Avenue block today and thanked "every neighbour who chose to move forward". Several neighbours were reached by phone. They are moving forward, in different directions.' },
];

/** Parody ads. `act` is the earliest act in which the spot runs. */
export interface RadioAd { id: string; act: 0 | 1 | 2 | 3; text: string }

export const ADS: readonly RadioAd[] = [
  { id: 'a-parallax-1', act: 0, text: 'Parallax Living. Live on a street that used to have a name. Now it has a handle.' },
  { id: 'a-parallax-2', act: 1, text: 'Parallax Living: we are not displacing the neighbourhood. We are re-platforming it.' },
  { id: 'a-stoop', act: 1, text: 'Stoopable, from Parallax Living. The app that makes the sidewalk feel like it is yours. Subscription required.' },
  { id: 'a-stillwater', act: 0, text: 'Stillwater Collective. Sound baths, breathwork, and a very quiet room above a former tire shop. First class is free. The silence is extra.' },
  { id: 'a-kale', act: 0, text: 'Brother Kale\'s Cold Pressed Everything. If it has a stem, we have squeezed it. Nine dollars. No refunds on stems.' },
  { id: 'a-zoomr', act: 1, text: 'Zoomr. Rideshare for people who say "pickup location" with confidence. Your driver is on his way, and so is the surge.' },
  { id: 'a-law', act: 1, text: 'Tenant in trouble? Call Bunch and Bunch. Two lawyers, one cousin, and a very persuasive folding table. Initial consultation free. Final consultation on the stairs.' },
  { id: 'a-pivot', act: 2, text: 'Hardwood Heights Realty. Was it a home? Was it a hardship? Now it is a "highly activated residential opportunity". Call us before it is somebody else\'s.' },
  { id: 'a-clipboard', act: 2, text: 'Clipboards of America. Every great neighbourhood meeting starts with a clipboard. Order yours before the vote.' },
  { id: 'a-grief', act: 3, text: 'Parallax Living. We heard you. We are listening. We have been listening since March. Please stop calling the number on the notice.' },
  { id: 'a-compost', act: 2, text: 'Throop Row Residences. Studios from three-nine, and a compost bin with a view. Lottery application closes the moment we say it does.' },
  { id: 'a-wake', act: 3, text: 'Bright Hereafter Funeral Home reminds you that a plan made now costs less than a plan made later. Parking in the rear. Ask about our Sunday rates.' },
];

/** The act the story is in right now, from the flags. 0 = before the story starts. */
export function currentAct(story: StoryState): 0 | 1 | 2 | 3 {
  if (story.has(F.ACT3)) return 3;
  if (story.has(F.ACT2)) return 2;
  if (story.has(F.ACT1)) return 1;
  return 0;
}

/** Bulletins whose mission is done (and flag set), newest mission last. */
export function unlockedBulletins(done: ReadonlySet<string>, story: StoryState): Bulletin[] {
  return BULLETINS.filter((b) => done.has(b.after) && (b.flag === undefined || story.has(b.flag)));
}

/** Ads that run in the current act. */
export function adsFor(story: StoryState): string[] {
  const act = currentAct(story);
  return ADS.filter((a) => a.act <= act).map((a) => a.text);
}
