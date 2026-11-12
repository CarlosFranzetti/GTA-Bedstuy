/**
 * The hands icons for the HUD: a fist, a bottle, a brick, a pistol, each a small SVG silhouette drawn here (no lettering).
 * Plain strings so the HUD can set them as innerHTML and tests can read them.
 */
import type { HandItem } from './items';

const wrap = (body: string): string =>
  `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" focusable="false" fill="currentColor" stroke="none">${body}</svg>`;

export const HAND_ICONS: Record<HandItem, string> = {
  // a closed fist seen from the side: four knuckles in a row over the curled fingers, thumb across the front, a cuff at the wrist
  fists: wrap(
    '<rect x="10" y="30" width="22" height="10" rx="2" opacity=".55"/>' +
    '<path d="M12 16a4 4 0 0 1 4-4h14a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H16a4 4 0 0 1-4-4z"/>' +
    '<path d="M16 12v9M21 11v10M26 11v10M31 12v9" stroke="#000" stroke-opacity=".45" stroke-width="1.4" fill="none"/>' +
    '<path d="M16 28c0-3 3-4 7-4h8a3 3 0 0 1 0 6h-9a3 3 0 0 1-3 2" fill="#000" fill-opacity=".28"/>' +
    '<rect x="36" y="18" width="5" height="16" rx="1.5" opacity=".8"/>',
  ),
  // a glass bottle: round shoulders, a long neck, a lip, a label band
  bottle: wrap(
    '<path d="M21 5h6v3h-1v8c0 3 6 5 6 11v14a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V27c0-6 6-8 6-11V8h-1z"/>' +
    '<rect x="16" y="29" width="16" height="8" fill="#000" fill-opacity=".3"/>' +
    '<path d="M20 22c0-2 1-3 2-4" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  ),
  // a brick: a slab with three-quarter shading and mortar-hole dimples on the top face
  brick: wrap(
    '<path d="M7 20 14 14h28l-7 6z" opacity=".85"/>' +
    '<rect x="7" y="20" width="28" height="15" rx="1.2"/>' +
    '<path d="M35 20 42 14v15l-7 6z" opacity=".6"/>' +
    '<ellipse cx="19" cy="17" rx="3" ry="1" fill="#000" fill-opacity=".35"/><ellipse cx="29" cy="17" rx="3" ry="1" fill="#000" fill-opacity=".35"/>' +
    '<path d="M7 27.5h28" stroke="#000" stroke-opacity=".25" stroke-width="1"/>',
  ),
  // a pistol in profile, pointing left: slide, barrel, trigger guard, grip
  pistol: wrap(
    '<path d="M5 17h33a2 2 0 0 1 2 2v6H25l-2 4h-5l1 10a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-1.7L10 25H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"/>' +
    '<path d="M24 25v3a4 4 0 0 0 4 4" stroke="currentColor" stroke-width="2" fill="none"/>' +
    '<rect x="9" y="19" width="8" height="2" fill="#000" fill-opacity=".35"/><rect x="31" y="14" width="6" height="3" rx="1"/>',
  ),
};
