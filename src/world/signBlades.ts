/**
 * Street-name blades on a corner lamppost. Pure layout (no three.js) so it can be unit tested.
 *
 * Every corner carries two blades, one per street meeting there. A blade is a thin board that runs ALONG its street
 * (east-west street: board along x, north-south street: board along z) and carries that street's own `signName`.
 * The two boards used to share the pole's position and cross each other at right angles, so each hid half of the
 * other and a corner read as one mangled sign ("Kosci..." over "...Ave St"). They are now stacked one above the other
 * and each hangs off the pole toward the block, so neither intersects the other and the pole hides no lettering.
 */
export interface SignStreet { signName: string; axis: 'ns' | 'ew' }

export interface SignBlade {
  /** Text painted on the board: the street's own signName. */
  text: string;
  axis: 'ns' | 'ew';
  /** Yaw baked into the board geometry: 0 for an east-west street, PI/2 for a north-south one. */
  yaw: number;
  x: number; y: number; z: number;
}

export interface SignLayout { width: number; height: number; mountY: number; gap: number }

export const SIGN_LAYOUT: SignLayout = { width: 1.2, height: 0.25, mountY: 3, gap: 0.04 };

/**
 * @param base lamppost position
 * @param center block centre (boards hang toward it, i.e. over the sidewalk, never over the road)
 * @param streets the streets meeting at this corner (normally two)
 */
export function planSignBlades(base: { x: number; z: number }, center: { x: number; z: number }, streets: readonly SignStreet[], layout: SignLayout = SIGN_LAYOUT): SignBlade[] {
  const reach = layout.width / 2 + 0.08;
  return streets.map((s, i) => {
    const ew = s.axis === 'ew';
    const toward = Math.sign(ew ? center.x - base.x : center.z - base.z) || 1;
    return {
      text: s.signName,
      axis: s.axis,
      yaw: ew ? 0 : Math.PI / 2,
      x: base.x + (ew ? toward * reach : 0),
      y: layout.mountY - i * (layout.height + layout.gap),
      z: base.z + (ew ? 0 : toward * reach),
    };
  });
}
