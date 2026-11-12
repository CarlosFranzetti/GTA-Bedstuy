/** Single source for the key help text (loading screen lines, pause-menu Controls rows). */
export const CONTROLS_LINES = [
  'WASD move',
  'Shift sprint (the default on foot is a jog)',
  'Alt or Caps Lock: walk (half-tilt a stick on a pad)',
  'Space jump (brake in a car)',
  'F enter/exit car',
  'V camera view (tap twice: swap last two)',
  'B or middle mouse: swap shoulder',
  'C look back',
  'H horn',
  'E radio',
  'mouse look',
  'touch: left stick, drag right to look, JUMP, VIEW',
  'gamepad: sticks, RT/LT drive, A enter/exit, B jump, Select view, RB shoulder',
];

export const KEYBOARD_ROWS: Array<[string, string]> = [
  ['WASD', 'Move / drive'], ['Mouse', 'Look'], ['Shift', 'Sprint / handbrake'], ['Alt / Caps Lock', 'Walk (hold, or toggle with Caps Lock)'], ['Space', 'Jump on foot / brake in a car'], ['F', 'Enter / exit car'],
  ['V', 'Camera view (tap twice to swap the last two)'], ['B / Middle mouse', 'Swap over-the-shoulder side'], ['C', 'Look back (hold)'],
  ['H', 'Horn'], ['E', 'Next radio station'], ['P', 'Phone'], ['M', 'Map'], ['N', 'Point at HOME / WAX DELI'], ['Alt+Enter', 'Full screen'], ['Esc', 'Pause'],
];
export const TOUCH_ROWS: Array<[string, string]> = [
  ['Left stick', 'Move / drive'], ['Drag right side', 'Look'], ['CAR', 'Enter / exit car'], ['RUN / BRAKE', 'Sprint on foot, brake in a car (half-push the stick to walk)'], ['JUMP', 'Jump (on foot)'],
  ['VIEW', 'Cycle camera view'], ['HORN', 'Horn'], ['RADIO', 'Next station'], ['PHONE / MAP', 'Open the phone or the map'], ['II', 'Pause'],
];
export const GAMEPAD_ROWS: Array<[string, string]> = [
  ['Left stick', 'Move / steer'], ['Right stick', 'Look'], ['RT / LT', 'Throttle / brake'], ['A', 'Enter / exit car'], ['B / Circle', 'Jump (on foot)'],
  ['X / Square', 'Sprint / handbrake'], ['Half-tilt left stick', 'Walk'], ['Y / Triangle', 'Next radio station'], ['LB', 'Horn'], ['RB', 'Swap shoulder'], ['Select / Back', 'Camera view'], ['R3', 'Look back'], ['Start', 'Pause'],
];
