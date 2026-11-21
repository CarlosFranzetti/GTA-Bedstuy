/**
 * Single source for the key help text (loading screen lines, pause-menu Controls rows). Built from the binding table, so a
 * rebind changes the help too. Rows are [what you press, what it does].
 */
import { ACTIONS, ACTION_BY_ID, GAME_BINDINGS, PAD_LAYOUT, keyLabel, padButtonName, type ActionId, type Bindings, type PadBtn, type PadKind } from './Bindings';

const ks = (id: ActionId, b: Bindings): string => {
  const keys = b.get(id).filter((k) => b.ctrlSafe || !/^Control/.test(k));
  return keys.length ? keys.map(keyLabel).join(' / ') : 'Unbound';
};

/** Keyboard and mouse rows: the bindable actions by group, then the fixed system keys. */
export function keyboardRows(b: Bindings = GAME_BINDINGS): Array<[string, string]> {
  const rows: Array<[string, string]> = [['Mouse', 'Look']];
  for (const a of ACTIONS) {
    if (a.reserved && a.id !== 'aim') continue; // cover and headlights have no function yet
    const where = a.group === 'In a vehicle' ? ' (in a vehicle)' : a.group === 'On foot' ? ' (on foot)' : '';
    rows.push([ks(a.id, b), `${a.label}${where}`]);
  }
  rows.push(['Esc', 'Pause: opens on the map'], ['Alt+Enter', 'Full screen']);
  return rows;
}

const pb = (btn: PadBtn | undefined, kind: PadKind): string => (btn ? padButtonName(btn, kind) : '');

/** Pad rows, with the button names of the pad connected (Xbox or PlayStation). */
export function gamepadRows(kind: PadKind = GAME_BINDINGS.padKind): Array<[string, string]> {
  const n = (id: ActionId, ctx: 'foot' | 'car'): string => pb(PAD_LAYOUT[id]?.[ctx], kind);
  return [
    ['Left stick', 'Move / steer (half-tilt to walk)'],
    ['Right stick', 'Look'],
    [`${n('attack', 'foot')} / ${n('moveForward', 'car')}`, 'Action on foot / throttle in a vehicle'],
    [`${n('aim', 'foot')} / ${n('brake', 'car')}`, 'Aim (reserved) / brake in a vehicle'],
    [n('sprint', 'foot'), 'Sprint (hold)'],
    [n('jump', 'foot'), 'Jump'],
    [n('enter', 'foot'), 'Enter / exit vehicle'],
    [n('itemNext', 'foot'), 'Next item in hand'],
    [`${n('itemPrev', 'foot')} / ${padButtonName('RIGHT', kind)}`, 'Previous / next item in hand (on foot)'],
    [n('handbrake', 'car'), 'Handbrake in a vehicle; swap shoulder on foot'],
    [`${n('walk', 'foot')}`, 'Walk toggle on foot; horn in a vehicle (hold)'],
    [`${n('radioPrev', 'car')} / ${n('radioNext', 'car')}`, 'Previous / next radio station (in a vehicle)'],
    [n('phone', 'foot'), 'Phone'],
    [n('lookBack', 'foot'), 'Look behind (hold)'],
    [n('camera', 'foot'), 'Camera view'],
    [padButtonName('START', kind), 'Pause'],
  ];
}

export const TOUCH_ROWS: Array<[string, string]> = [
  ['Left side', 'Touch and drag anywhere: a stick appears under your thumb (move on foot, steer in a car; half-push to walk)'], ['Right side', 'Drag anywhere that is not a button to look'], ['ACT', 'Action on foot: punch, throw or shoot (no action from a car yet: the hands icon dims there)'], ['JUMP / RUN', 'Jump; tap RUN to sprint while the stick is held'], ['CAR / EXIT', 'Shows when a car or door is in reach'], ['GAS / BRAKE / HAND', 'In a car: throttle, brake and handbrake'], ['Item icon (top right)', 'Next item in hand'],
  ['VIEW / BACK', 'Cycle camera view; hold to look behind'], ['HORN / RADIO', 'In a car: horn, next station'], ['PHONE / MAP', 'Open the phone or the map'], ['II', 'Pause'],
];

/** Short lines for the title screen. */
export function controlsLines(b: Bindings = GAME_BINDINGS): string[] {
  const k = (id: ActionId): string => ks(id, b);
  const k1 = (id: ActionId): string => ks(id, b).split(' / ')[0];
  return [
    'WASD move',
    `${k('sprint')} sprint (the default on foot is a jog)`,
    `${k('walk')}: walk (Caps Lock toggles)`,
    `${k('jump')} jump, handbrake in a car`,
    `${k('attack')}: punch, throw or shoot`,
    `${k('itemNext')} next item in hand`,
    `${k('enter')} enter/exit vehicle`,
    `${k('camera')} camera view`,
    `${k('lookBack')} look behind`,
    `${k('horn')} horn`,
    `${k1('radioNext')} / ${k1('radioPrev')} radio`,
    `${k('phone')} phone`,
    `${k('map')} map`,
    'mouse look',
    'touch: left stick, drag right to look, JUMP, VIEW',
    'gamepad: sticks, RT/LT drive, Y enter/exit, X jump, A sprint',
  ];
}

export { ACTION_BY_ID };
