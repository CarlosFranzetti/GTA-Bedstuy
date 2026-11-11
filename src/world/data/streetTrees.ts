/**
 * Street-tree size and species from the NYC Parks 2015 Street Tree Census (NYC Open Data, uvpi-gqnh), keyed by game street id
 * (fetched and aggregated by scripts/fetch-street-trees.mjs into raw/street-trees.json; no coordinates are kept, so the data
 * survives any re-gridding of the map). A tree placed on a street draws a trunk-diameter bin and a species class from that
 * street's real mix; the result scales the shared tree model (instance matrix only, no extra triangles).
 */
import census from './raw/street-trees.json';
import { ENV14_ON } from './env14';

export interface StreetTreeStats { n: number; dbh: number[]; species: number[] }
export interface TreeStyle {
  /** trunk diameter at breast height, inches */
  dbhIn: number;
  /** species class index into SPECIES_CLASSES */
  species: number;
  /** uniform scale for the shared tree model (1 = the model as drawn) */
  scale: number;
  /** multiplier for the canopy cloud radius */
  canopy: number;
}

export const SPECIES_CLASSES = census.speciesClasses as readonly string[];
/** representative trunk diameter (inches) of each census bin */
const BIN_MID = [3, 9, 15, 21, 28];
/** canopy width by species class: planetree and oak are broad, pear and ornamentals small, honeylocust airy */
const CANOPY: readonly number[] = [1, 1.2, 0.95, 0.8, 1.15, 1.1, 0.85, 1, 0.7];

export const STREET_TREE_STATS: Readonly<Record<string, StreetTreeStats>> = census.streets as Record<string, StreetTreeStats>;

/** Model scale for a trunk of `dbhIn` inches: a 3 in sapling is 0.7, a 28 in planetree 1.4. */
export const scaleForDbh = (dbhIn: number): number => Math.min(1.4, Math.max(0.6, 0.6 + 0.03 * dbhIn));

const draw = (counts: readonly number[], u: number): number => {
  const total = counts.reduce((a, b) => a + b, 0);
  let t = u * total;
  for (let i = 0; i < counts.length; i++) { t -= counts[i]; if (t < 0) return i; }
  return counts.length - 1;
};

/** Style for a tree on `streetId`; u1..u3 are uniform randoms. Streets without census data get a mid-size tree of the default mix. */
export function treeStyleFor(streetId: string, u1: number, u2: number, u3: number): TreeStyle {
  const st = STREET_TREE_STATS[streetId];
  if (!ENV14_ON || !st || st.n < 8) return { dbhIn: 10, species: 0, scale: 0.9, canopy: 1 };
  const bin = draw(st.dbh, u1);
  const lo = bin === 0 ? 1 : BIN_MID[bin - 1] + 3, hi = bin === 4 ? 34 : BIN_MID[bin] + 3;
  const dbhIn = Math.round(lo + (hi - lo) * u3);
  const species = draw(st.species, u2);
  return { dbhIn, species, scale: scaleForDbh(dbhIn), canopy: CANOPY[species] ?? 1 };
}
