/**
 * Geometry simplification for the phone tier. The world generators merge everything into one mesh per (cell, material),
 * so the cheapest way to cut triangles and draw calls on a phone is to drop whole classes of small, hard-to-read detail
 * rather than thinning them: fire escapes, rooftop tanks, scaffolding, wires, trash bags, iron fences, manholes and grates.
 *
 * Meshes are switched off through a camera layer (not `visible`), so the distance culler, which owns `visible` for the prop
 * cells, can never bring them back, and a later switch to a higher tier restores them exactly.
 */
import * as THREE from 'three';

/** Mesh names (see the generators: `buildings:<material>:<variant>`, `props:<kind>`, ...) that the phone tier does not draw. */
export const PHONE_HIDDEN_MESH = /^(buildings:(metalDark|waterTank|scaffold|corrugatedSteel|sf:stickers|sf:flat|castIronFence|chainlinkFence|party-wall-decal)|props:(bags|wires|metalDark|scaffold|cone)|furniture:(trash|hydrant)|cellar-plates|manholes|storm-grates|skid-marks|gutters|metal-details)/;

/** Facade trim meshes of the building cells: thin material groups that ChunkCuller stops drawing beyond the tier's `buildingTrimDist` (a draw call per cell each, a few pixels wide out there). */
export const TRIM_MESH = /^buildings:(window|awning|sf:awning|cornice|stoop|rollGate|storefrontGlass|sf:sign|sf:board|sign:|graffiti|chainlinkRail)/;

/** Layer the hidden meshes live on (the cameras only draw layer 0). */
export const HIDDEN_LAYER = 5;

/** Shows (`on` = false) or hides (`on` = true) the phone-hidden mesh classes under `root`. Returns the number of meshes switched. */
export function setPhoneDetailHidden(root: THREE.Object3D, hidden: boolean): number {
  let n = 0;
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || !PHONE_HIDDEN_MESH.test(o.name)) return;
    const isHidden = o.layers.isEnabled(HIDDEN_LAYER);
    if (hidden === isHidden) return;
    o.layers.set(hidden ? HIDDEN_LAYER : 0);
    n++;
  });
  return n;
}
