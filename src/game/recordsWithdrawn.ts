/**
 * Records that were withdrawn from WAX DELI, and what an old save holding one gets back.
 *
 *  - 21 Nov 2026 (owner's request): 18 of the 28 public-domain 78s (1909 to 1925) left the shop, and the synthesised jazz, dub and trap
 *    loops (wax-05, wax-06, wax-07, wax-10) went with them because the whole shop is dance records now.
 *
 * A save keeps the full record definition, so an old save still holds them. On load they are removed from the collection and the PRICE
 * THE PLAYER PAID (the price stored on the record) is refunded in cash, in full. Nothing else is replaced: the shop has new records to buy.
 */
export const WITHDRAWN_SYNTH_IDS: readonly string[] = ['wax-05', 'wax-06', 'wax-07', 'wax-10'];
export const WITHDRAWN_ARCHIVE_REFS: readonly string[] = [
  'ia-drag', 'ia-pickle', 'ia-banjo', 'ia-rhapsody', 'ia-birmingham', 'ia-crazy', 'ia-gulf', 'ia-chicago', 'ia-everybody', 'ia-strut',
  'ia-advertise', 'ia-glide', 'ia-fisk-swing', 'ia-fisk-slippers', 'ia-bethel', 'ia-southern4', 'ia-ferera', 'ia-hawaiian',
];

interface Held { id: string; kind?: string; ref?: string; price: number }

export function isWithdrawn(r: Pick<Held, 'id' | 'kind' | 'ref'>): boolean {
  if (r.kind === 'procedural') return WITHDRAWN_SYNTH_IDS.includes(r.id);
  if (r.kind === 'archive') return !!r.ref && WITHDRAWN_ARCHIVE_REFS.includes(r.ref);
  return false;
}

/** Splits a saved collection into what stays and the cash refund for what was withdrawn. */
export function splitWithdrawn<T extends Held>(records: readonly T[]): { kept: T[]; refund: number; removed: T[] } {
  const kept: T[] = []; const removed: T[] = []; let refund = 0;
  for (const r of records) {
    if (isWithdrawn(r)) { removed.push(r); refund += Math.max(0, Math.round(r.price)); } else kept.push(r);
  }
  return { kept, refund, removed };
}
