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

// ------------------------------------------------------------------------------------------------ four street-tree forms (ROADS)

export interface TreeForm {
  name: 'plane' | 'honeylocust' | 'pinoak' | 'pear';
  /** trunk thickness and height multipliers (instance matrix only) */
  trunkW: number;
  trunkH: number;
  /** canopy cloud y squash: flat honey locust 0.62, columnar pear 1.3 */
  squash: number;
  /** cloud centres in the tree's local frame as [x, y, z, radius factor] (before the species canopy multiplier); at most 3, as before */
  clouds: ReadonlyArray<readonly [number, number, number, number]>;
  /** the last lobe is left out of this share of the trees (the old model dropped its third cloud 40 % of the time) */
  dropLast: number;
}

/**
 * One form per street-tree species of the census, so a block of planes, a row of honey locusts, a pin oak and a callery pear no
 * longer read as one tree: broad three-lobed plane, airy flat-topped honey locust, tall stacked oval pin oak, narrow upright pear.
 * They share one trunk mesh and one 48-triangle cloud mesh: the form lives in the instance matrices, so draws and triangles stay as they were.
 * Seasonal neutral: mid-summer green only.
 */
export const TREE_FORMS: readonly TreeForm[] = [
  { name: 'plane', trunkW: 1.3, trunkH: 1.1, squash: 0.86, dropLast: 0.4, clouds: [[0, 4.5, 0, 1.12], [1.0, 3.95, 0.65, 0.88], [-0.9, 4.05, -0.8, 0.84]] },
  { name: 'honeylocust', trunkW: 0.85, trunkH: 0.95, squash: 0.6, dropLast: 0.4, clouds: [[0, 4.3, 0, 0.8], [1.3, 3.8, 0.25, 0.64], [-1.2, 3.9, 0.55, 0.62]] },
  { name: 'pinoak', trunkW: 1.0, trunkH: 1.2, squash: 1.12, dropLast: 0, clouds: [[0, 5.5, 0, 0.55], [0.15, 4.55, 0.1, 0.82], [-0.2, 3.65, 0.05, 1.0]] },
  { name: 'pear', trunkW: 0.7, trunkH: 0.92, squash: 1.35, dropLast: 0, clouds: [[0, 4.6, 0, 0.78], [0.05, 3.75, 0.1, 0.72]] },
];

/** census species class -> form (planetree, maple and the unlisted species broad; ginkgo airy; linden and oak ovoid; pear and ornamentals narrow) */
const FORM_OF_SPECIES: readonly number[] = [0, 0, 1, 3, 2, 0, 1, 2, 3];
export const treeFormOf = (species: number): TreeForm => TREE_FORMS[FORM_OF_SPECIES[species] ?? 0];

export interface TreeParts {
  /** non-uniform scale of the trunk mesh in the tree's frame */
  trunk: readonly [number, number, number];
  /** cloud placements in the tree's frame: x, y, z, radius, y squash */
  clouds: ReadonlyArray<readonly [number, number, number, number, number]>;
}

/**
 * Trunk scale and canopy clouds of one tree. `R` is the cloud radius the caller used to draw (1.2 to 1.6 times the species
 * canopy); `u1` decides whether the last lobe is drawn, `u2` jitters the lobes.
 */
export function treePartsFor(style: TreeStyle, R: number, u1: number, u2: number): TreeParts {
  const f = treeFormOf(style.species);
  const tw = f.trunkW, th = f.trunkH;
  const clouds: Array<[number, number, number, number, number]> = [];
  f.clouds.forEach(([x, y, z, r], i) => {
    // the last lobe of a broad tree comes and goes; every lobe shifts a little so two planes never match
    if (i === f.clouds.length - 1 && u1 < f.dropLast) return;
    const j = (u2 * 7.31 + i * 1.7) % 1;
    clouds.push([x + (j - 0.5) * 0.35, y * th, z + (((j * 5.3) % 1) - 0.5) * 0.35, R * r, f.squash * (0.92 + 0.16 * ((j * 3.7) % 1))]);
  });
  return { trunk: [tw, th, tw], clouds };
}
