/**
 * Shared junction contract for the real-map workers (WP2 signals, WP3 sidewalks/crosswalks, WP4 meshes, WP5, WP10).
 * All distances are measured along a leg from the node (Derived.legs[i]), i.e. `cut` is the start of the plain ribbon.
 *   crosswalk band: from cut + CROSSWALK_START to cut + CROSSWALK_START + CROSSWALK_WIDTH (centre cut + 2.0)
 *   vehicle stop line: at cut + STOP_LINE
 */
export const CROSSWALK_START = 0.5;
export const CROSSWALK_WIDTH = 3;
export const STOP_LINE = 4.5;
/** distance along the leg from the node to the crosswalk centre line, given the leg cut */
export const crosswalkCentre = (cut: number): number => cut + CROSSWALK_START + CROSSWALK_WIDTH / 2;
