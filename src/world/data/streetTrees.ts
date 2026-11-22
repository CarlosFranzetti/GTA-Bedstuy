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
  /** trunk thickness and height multipliers (instance matrix only); the x / y ratio tells the forms apart in treeTint.ts */
  trunkW: number;
  trunkH: number;
  /** canopy cloud y squash: flat honey locust 0.6, columnar pear 1.35 (the ratio tells the forms apart in treeTint.ts) */
  squash: number;
  /**
   * cloud centres in the tree's local frame as [x, y, z, radius] in metres at model scale 1 and crown factor 1: a main dome,
   * side lobes and a lower skirt overlap so little sky shows through the middle (TREES, 22 Nov)
   */
  clouds: ReadonlyArray<readonly [number, number, number, number]>;
  /** the last lobe is left out of this share of the trees */
  dropLast: number;
}

/**
 * One form per street-tree species of the census, so a block of planes, a row of honey locusts, a pin oak and a callery pear no
 * longer read as one tree: broad round plane (10 to 11 m wide), wide flat-topped honey locust, tall stacked oval pin oak (also used for
 * linden: dense teardrop), small upright pear. Four or five overlapping clouds each, one trunk mesh and one 32-triangle cloud mesh:
 * the form lives in the instance matrices. Seasonal neutral: mid-summer green only.
 */
export const TREE_FORMS: readonly TreeForm[] = [
  { name: 'plane', trunkW: 1.3, trunkH: 1.1, squash: 0.86, dropLast: 0.3, clouds: [[0, 7.0, 0, 3.4], [3.0, 6.1, 1.0, 2.7], [-2.8, 6.3, -1.2, 2.7], [0.8, 6.0, -3.0, 2.5], [-0.6, 5.8, 2.7, 2.5]] },
  { name: 'honeylocust', trunkW: 0.85, trunkH: 0.95, squash: 0.6, dropLast: 0.3, clouds: [[0, 6.1, 0, 2.9], [2.9, 5.6, 0.5, 2.5], [-2.7, 5.7, -0.9, 2.5], [0.4, 5.5, 2.8, 2.3], [-0.4, 5.6, -2.8, 2.2]] },
  { name: 'pinoak', trunkW: 1.0, trunkH: 1.2, squash: 1.12, dropLast: 0, clouds: [[0, 8.3, 0, 2.2], [0.3, 7.0, 0.2, 3.0], [-0.4, 5.9, -0.1, 3.2], [2.0, 6.3, 1.0, 2.0], [-2.0, 6.7, -1.0, 2.0]] },
  { name: 'pear', trunkW: 0.7, trunkH: 0.92, squash: 1.35, dropLast: 0, clouds: [[0, 5.6, 0, 1.7], [0.1, 4.7, 0.1, 1.9], [1.1, 5.1, 0.6, 1.3], [-1.0, 5.2, -0.6, 1.3]] },
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
 * canopy, about 1.4 for a mid-size tree): it sets the crown width, kept between 0.82 and 1.15 of the form's own width unless
 * `free` (park trees pass their own size and get a crown 0.9 m lower: older trees keep their lower limbs). `u1` decides whether the last lobe is drawn, `u2` jitters the lobes.
 */
export function treePartsFor(style: TreeStyle, R: number, u1: number, u2: number, free = false): TreeParts {
  const f = treeFormOf(style.species);
  const tw = f.trunkW, th = f.trunkH;
  const k = free ? R / 1.4 : Math.min(1.15, Math.max(0.82, R / 1.4));
  const clouds: Array<[number, number, number, number, number]> = [];
  f.clouds.forEach(([x, y, z, r], i) => {
    // the last lobe of a broad tree comes and goes; every lobe shifts a little so two planes never match
    if (i === f.clouds.length - 1 && u1 < f.dropLast) return;
    const j = (u2 * 7.31 + i * 1.7) % 1;
    clouds.push([(x + (j - 0.5) * 0.6) * k, (y - (free ? 0.9 : 0) + (((j * 3.1) % 1) - 0.5) * 0.5) * th, (z + (((j * 5.3) % 1) - 0.5) * 0.6) * k, r * k, f.squash * (0.92 + 0.16 * ((j * 3.7) % 1))]);
  });
  return { trunk: [tw, th, tw], clouds };
}
