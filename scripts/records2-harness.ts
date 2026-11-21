// RECORDS2 lane harness: the real WAX DELI shop UI over the real clips, no 3D world. For screenshots and the end-to-end clip check.
import '@/ui/type.css';
import { ShopUi } from '@/ui/ShopUi';
import { Inventory } from '@/game/Inventory';
import { ARCHIVE_RECORDS } from '@/game/archiveRecords';
import { PROCEDURAL_RECORDS, RecordSource } from '@/game/records';
const q = new URLSearchParams(location.search);
const ac = new AudioContext();
const ctx = { sampleRate: ac.sampleRate, createBuffer: (c: number, l: number, r: number) => ac.createBuffer(c, l, r), decodeAudioData: (d: ArrayBuffer) => ac.decodeAudioData(d) };
const source = new RecordSource(ctx);
const inventory = new Inventory(PROCEDURAL_RECORDS, null); inventory.add(400);
const post = q.get('post');
const shop = new ShopUi(document.getElementById('app')!, {
  inventory, stock: PROCEDURAL_RECORDS, source, preview: null, archive: ARCHIVE_RECORDS,
  post: post === 'empty' ? { tracks: [], onListen: (on) => ((window as unknown as { __listen: boolean }).__listen = on) } : { onListen: (on) => ((window as unknown as { __listen: boolean }).__listen = on) },
});
shop.open();
/** Fetches and decodes one record's clip and reports its length and loudness. */
async function probe(id: string): Promise<{ id: string; seconds: number; channels: number; rms: number; peak: number }> {
  const def = ARCHIVE_RECORDS.find((r) => r.ref === id)!;
  const b = await source.load(def);
  if (!b) throw new Error('clip did not load: ' + id);
  let sum = 0, n = 0, peak = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i += 7) { sum += d[i] * d[i]; n++; peak = Math.max(peak, Math.abs(d[i])); } }
  return { id, seconds: b.duration, channels: b.numberOfChannels, rms: Math.sqrt(sum / n), peak };
}
(window as unknown as { __r2: unknown }).__r2 = { shop, probe, ids: ARCHIVE_RECORDS.map((r) => r.ref) };
