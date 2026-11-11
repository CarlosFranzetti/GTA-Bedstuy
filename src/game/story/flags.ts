/**
 * Story flag names, in one place (missions, news, the director, the docs and the tests all read them).
 * Branch flags are set by `fork` objectives; milestone flags by `setFlags` on a mission.
 */
export const F = {
  ACT1: 'story.act1', ACT2: 'story.act2', ACT3: 'story.act3', DONE: 'story.done',
  /** Fork A (Back Rent): took the fixer's envelope vs. paid Odette from your own crate. */
  ODETTE_FIXER: 'odette.fixerCash', ODETTE_PAID: 'odette.paid',
  /** Fork B (Repo the Repo): gave Tay's car back vs. sold it to the fixer's lot. */
  TAY_RETURNED: 'tay.returned', TAY_SOLD: 'tay.sold',
  TAY_ALIVE: 'tay.revived',
  /** Fork C (Borough Hall Express): said it on the bus vs. kept it for the hearing. */
  ALVIN_EXPOSED: 'alvin.exposed', ALVIN_SPARED: 'alvin.spared',
  /** Evidence gathered along the way (each makes one ending stronger). */
  FOOTAGE: 'evidence.footage', FIRE_LOG: 'evidence.fireLog', NORTH_DEED: 'evidence.northDeed', DEE_BEAT: 'dee.beatKnown',
  /** Fork D (Last Call): the ending. */
  END_TRUST: 'ending.trust', END_LANDLORD: 'ending.landlord', END_BUYOUT: 'ending.buyout',
  /** Side-effects the radio and the posters read. */
  ODETTE_EVICTED: 'odette.evicted', AUNTIE_BURNED: 'auntie.burned',
} as const;

/** Which way each choice leans: the epilogue and the news read the totals. */
export const ALIGN: Record<string, 'hustle' | 'loyalty' | 'sellout'> = {
  [F.ODETTE_FIXER]: 'hustle', [F.ODETTE_PAID]: 'loyalty',
  [F.TAY_RETURNED]: 'loyalty', [F.TAY_SOLD]: 'hustle',
  [F.ALVIN_EXPOSED]: 'loyalty', [F.ALVIN_SPARED]: 'hustle',
  [F.END_TRUST]: 'loyalty', [F.END_LANDLORD]: 'hustle', [F.END_BUYOUT]: 'sellout',
};
