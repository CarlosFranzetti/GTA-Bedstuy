import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LotSource } from '@/world/roadnet/lotStreamReal';
import type { LotTileIndex, LotTileJson } from '@/world/roadnet/lotTiles';

/** the real map's lot tiles read from public/data/real/ (what the browser fetches) */
export function fileLotSource(): LotSource {
  const dir = join(import.meta.dirname, '../../../../public/data/real');
  const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;
  return { index: async () => read<LotTileIndex>('lots-index.json'), tile: async (k) => read<LotTileJson>(`lots-${k}.json`) };
}
