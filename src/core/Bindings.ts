/**
 * The binding table: one place that says which physical key does what, on foot and in a vehicle, and which pad button
 * does the same. The layout follows the GTA V (PC) and GTA IV convention (docs/swarm/tasks/CONTROLS.md); no art or text
 * from any game. Everything that shows a key name (prompts, the pause menu, help lines) reads this table, so a rebind
 * changes them all.
 *
 * Game code keeps reading the old key codes ('KeyF', 'Space', ...). Those are now action ids ("canonical codes"):
 * `Input` resolves a canonical code through this table to the physical keys currently bound to it.
 */

export type Ctx = 'foot' | 'car' | 'both';
export type InputModeName = 'keyboard' | 'touch' | 'gamepad';

export type ActionId =
  | 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight'
  | 'sprint' | 'jump' | 'walk' | 'attack' | 'aim' | 'cover' | 'itemNext' | 'itemPrev'
  | 'enter' | 'phone' | 'map' | 'pointAt' | 'lookBack' | 'camera' | 'shoulder' | 'retry' | 'abandon'
  | 'handbrake' | 'brake' | 'horn' | 'headlights' | 'radioNext' | 'radioPrev';

export interface ActionDef {
  id: ActionId;
  label: string;
  group: 'Movement' | 'On foot' | 'In a vehicle' | 'Anywhere';
  ctx: Ctx;
  /** Codes game code reads for this action (legacy key codes and virtual names). */
  canon: readonly string[];
  /** Default physical codes, at most two (the rebinding screen has two slots). */
  kb: readonly string[];
  /** A binding that exists for the convention but has no game function yet (cover, aim, headlights). */
  reserved?: boolean;
  /** Not offered in the rebinding screen. */
  fixed?: boolean;
}

export const MAX_SLOTS = 2;
/** Pseudo physical codes for the mouse wheel and buttons (Input raises edges for them). */
export const WHEEL_UP = 'WheelUp';
export const WHEEL_DOWN = 'WheelDown';

export const ACTIONS: readonly ActionDef[] = [
  { id: 'moveForward', label: 'Move forward / accelerate', group: 'Movement', ctx: 'both', canon: ['KeyW', 'ArrowUp'], kb: ['KeyW'] },
  { id: 'moveBack', label: 'Move back / brake and reverse', group: 'Movement', ctx: 'both', canon: ['KeyS', 'ArrowDown'], kb: ['KeyS'] },
  { id: 'moveLeft', label: 'Move left / steer left', group: 'Movement', ctx: 'both', canon: ['KeyA', 'ArrowLeft'], kb: ['KeyA'] },
  { id: 'moveRight', label: 'Move right / steer right', group: 'Movement', ctx: 'both', canon: ['KeyD', 'ArrowRight'], kb: ['KeyD'] },
  { id: 'sprint', label: 'Sprint (hold)', group: 'On foot', ctx: 'foot', canon: ['ShiftLeft', 'ShiftRight'], kb: ['ShiftLeft'] },
  { id: 'jump', label: 'Jump', group: 'On foot', ctx: 'foot', canon: ['Space'], kb: ['Space'] },
  { id: 'walk', label: 'Walk (hold; Caps Lock also toggles)', group: 'On foot', ctx: 'foot', canon: ['AltLeft', 'AltRight'], kb: ['AltLeft', 'ControlLeft'] },
  { id: 'attack', label: 'Attack: punch, throw, shoot', group: 'On foot', ctx: 'foot', canon: ['ActionButton'], kb: ['MouseLeft', 'KeyG'] },
  { id: 'aim', label: 'Aim', group: 'On foot', ctx: 'foot', canon: ['AimButton'], kb: ['MouseRight'], reserved: true },
  { id: 'cover', label: 'Take cover', group: 'On foot', ctx: 'foot', canon: ['CoverButton'], kb: ['KeyQ'], reserved: true },
  { id: 'itemNext', label: 'Next item in hand', group: 'On foot', ctx: 'foot', canon: ['ItemNext'], kb: ['Tab', WHEEL_DOWN] },
  { id: 'itemPrev', label: 'Previous item in hand', group: 'On foot', ctx: 'foot', canon: ['ItemPrev'], kb: [WHEEL_UP] },
  { id: 'enter', label: 'Enter / exit vehicle', group: 'Anywhere', ctx: 'both', canon: ['KeyF'], kb: ['KeyF'] },
  { id: 'phone', label: 'Phone', group: 'Anywhere', ctx: 'both', canon: ['KeyP'], kb: ['ArrowUp', 'MouseMiddle'] },
  { id: 'map', label: 'Map', group: 'Anywhere', ctx: 'both', canon: ['MapKey'], kb: ['KeyM'] },
  { id: 'pointAt', label: 'Point at HOME / WAX DELI', group: 'Anywhere', ctx: 'both', canon: ['PointKey'], kb: ['KeyN'] },
  { id: 'lookBack', label: 'Look behind (hold)', group: 'Anywhere', ctx: 'both', canon: ['KeyC'], kb: ['KeyC'] },
  { id: 'camera', label: 'Camera view (tap twice: last two)', group: 'Anywhere', ctx: 'both', canon: ['KeyV'], kb: ['KeyV'] },
  { id: 'shoulder', label: 'Swap shoulder', group: 'Anywhere', ctx: 'both', canon: ['KeyB', 'MouseMiddle'], kb: ['KeyB'] },
  { id: 'retry', label: 'Retry mission (when offered)', group: 'Anywhere', ctx: 'both', canon: ['KeyR'], kb: ['KeyR'] },
  { id: 'abandon', label: 'Abandon mission (when offered)', group: 'Anywhere', ctx: 'both', canon: ['KeyX'], kb: ['KeyX'] },
  { id: 'handbrake', label: 'Handbrake', group: 'In a vehicle', ctx: 'car', canon: ['ShiftLeft', 'ShiftRight'], kb: ['Space'] },
  { id: 'brake', label: 'Hard brake', group: 'In a vehicle', ctx: 'car', canon: ['Space'], kb: [] },
  { id: 'horn', label: 'Horn (hold)', group: 'In a vehicle', ctx: 'car', canon: ['KeyH'], kb: ['KeyG'] },
  { id: 'headlights', label: 'Headlights', group: 'In a vehicle', ctx: 'car', canon: ['Headlights'], kb: ['KeyH'], reserved: true },
  { id: 'radioNext', label: 'Next radio station', group: 'In a vehicle', ctx: 'car', canon: ['KeyE'], kb: ['Period', WHEEL_DOWN] },
  { id: 'radioPrev', label: 'Previous radio station', group: 'In a vehicle', ctx: 'car', canon: ['RadioPrev'], kb: ['Comma', WHEEL_UP] },
];

export const ACTION_BY_ID: ReadonlyMap<ActionId, ActionDef> = new Map(ACTIONS.map((a) => [a.id, a]));

/** Keys the rebinding screen refuses: they belong to the browser or the menus. Backspace / Delete clear a slot. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['Escape', 'F1', 'F3', 'F4', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'ContextMenu', 'Backspace', 'Delete', 'Enter', 'NumpadEnter']);
/** Keys that only work as game keys while the Keyboard Lock API holds them (fullscreen): Ctrl+W closes a tab otherwise. */
export const LOCK_ONLY_KEYS: ReadonlySet<string> = new Set(['ControlLeft', 'ControlRight']);

const ctxOverlap = (a: Ctx, b: Ctx): boolean => a === 'both' || b === 'both' || a === b;

export const BINDINGS_KEY = 'gta-bedstuy.bindings.v1';

function store(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export interface RebindResult { ok: boolean; reason?: string; stolenFrom: ActionId[] }

export class Bindings {
  private keys = new Map<ActionId, string[]>();
  private listeners = new Set<() => void>();
  /** Bumped on every change; Input rebuilds its lookup when it differs. */
  version = 0;
  /** True while fullscreen and the Keyboard Lock API accepted the lock: Ctrl may then be a game key. */
  ctrlSafe = false;
  /** Used for the glyphs shown to a pad player. */
  padKind: PadKind = 'xbox';

  constructor(persist = true) {
    this.resetAll(false);
    if (persist) this.load();
  }

  setPadKind(k: PadKind): void { if (k !== this.padKind) { this.padKind = k; this.changed(); } }
  get(id: ActionId): readonly string[] { return this.keys.get(id) ?? []; }
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private changed(): void { this.version++; for (const l of this.listeners) l(); }

  isDefault(): boolean { return ACTIONS.every((a) => sameList(this.get(a.id), a.kb)); }

  /** Actions in a context that overlaps `id`'s that already use `code`. */
  conflicts(id: ActionId, code: string): ActionId[] {
    const me = ACTION_BY_ID.get(id);
    if (!me) return [];
    return ACTIONS.filter((a) => a.id !== id && ctxOverlap(a.ctx, me.ctx) && this.get(a.id).includes(code)).map((a) => a.id);
  }

  /** Put `code` in slot `slot` of `id`. A key another action in the same context used is taken from it (reported in `stolenFrom`). */
  rebind(id: ActionId, slot: number, code: string): RebindResult {
    const def = ACTION_BY_ID.get(id);
    if (!def || def.fixed) return { ok: false, reason: 'This action cannot be changed.', stolenFrom: [] };
    if (LOCK_ONLY_KEYS.has(code) && !this.ctrlSafe) return { ok: false, reason: 'Ctrl can only be a game key in full screen (Alt+Enter): otherwise Ctrl+W closes the tab.', stolenFrom: [] };
    if (RESERVED_KEYS.has(code)) return { ok: false, reason: `${keyLabel(code)} cannot be used here.`, stolenFrom: [] };
    if (slot < 0 || slot >= MAX_SLOTS) return { ok: false, reason: 'No such slot.', stolenFrom: [] };
    const stolenFrom = this.conflicts(id, code);
    for (const other of stolenFrom) this.keys.set(other, this.get(other).filter((k) => k !== code));
    const next = [...this.get(id)];
    const was = next.indexOf(code);
    if (was >= 0 && was !== slot) next.splice(was, 1); // the key moves from its other slot
    if (slot >= next.length) next.push(code); else next[slot] = code;
    this.keys.set(id, next.slice(0, MAX_SLOTS));
    this.save();
    this.changed();
    return { ok: true, stolenFrom };
  }

  clearSlot(id: ActionId, slot: number): void {
    const cur = [...this.get(id)];
    if (slot >= cur.length) return;
    cur.splice(slot, 1);
    this.keys.set(id, cur);
    this.save();
    this.changed();
  }

  reset(id: ActionId): void {
    const def = ACTION_BY_ID.get(id);
    if (!def) return;
    this.keys.set(id, [...def.kb]);
    this.save();
    this.changed();
  }

  resetAll(notify = true): void {
    for (const a of ACTIONS) this.keys.set(a.id, [...a.kb]);
    if (notify) { this.save(); this.changed(); }
  }

  /** Actions with no key at all (shown in red in the rebinding screen; the game cannot do them from the keyboard). */
  unbound(): ActionId[] {
    return ACTIONS.filter((a) => !a.reserved && !a.fixed && this.get(a.id).length === 0 && a.kb.length > 0).map((a) => a.id);
  }

  private save(): void {
    const s = store();
    if (!s) return;
    try {
      const diff: Record<string, string[]> = {};
      for (const a of ACTIONS) if (!sameList(this.get(a.id), a.kb)) diff[a.id] = [...this.get(a.id)];
      if (Object.keys(diff).length === 0) s.removeItem(BINDINGS_KEY);
      else s.setItem(BINDINGS_KEY, JSON.stringify({ v: 1, keys: diff }));
    } catch { /* storage full or blocked */ }
  }

  private load(): void {
    const s = store();
    if (!s) return;
    try {
      const raw = s.getItem(BINDINGS_KEY);
      if (!raw) return;
      this.applySaved(JSON.parse(raw));
    } catch { /* corrupt: keep defaults */ }
  }

  /** Accepts only known ids and plausible codes; ignores the rest (a save from another build must not break input). */
  applySaved(raw: unknown): void {
    const keys = (raw as { keys?: Record<string, unknown> } | null)?.keys;
    if (!keys || typeof keys !== 'object') return;
    for (const a of ACTIONS) {
      const v = keys[a.id];
      if (!Array.isArray(v)) continue;
      const list = v.filter((k): k is string => typeof k === 'string' && /^[A-Za-z0-9]{1,24}$/.test(k) && !RESERVED_KEYS.has(k)).slice(0, MAX_SLOTS);
      this.keys.set(a.id, [...new Set(list)]);
    }
    this.version++;
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** The one shared table the game, prompts and menus use. Tests make their own with `new Bindings(false)`. */
export const GAME_BINDINGS = new Bindings();

// ---------------------------------------------------------------------------------------------------------------------
// Names for keys and pad buttons
// ---------------------------------------------------------------------------------------------------------------------

const KEY_NAMES: Record<string, string> = {
  Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', AltLeft: 'Alt', AltRight: 'Right Alt', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Tab: 'Tab', CapsLock: 'Caps Lock', Enter: 'Enter', Backspace: 'Backspace',
  Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\',
  MouseLeft: 'Left click', MouseRight: 'Right click', MouseMiddle: 'Middle click', Mouse4: 'Mouse 4', Mouse5: 'Mouse 5', WheelUp: 'Wheel up', WheelDown: 'Wheel down',
  PageUp: 'Page Up', PageDown: 'Page Down', Home: 'Home', End: 'End', Insert: 'Insert', Delete: 'Delete',
};

export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

export type PadKind = 'xbox' | 'playstation' | 'generic';
export type PadBtn = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'L3' | 'R3' | 'BACK' | 'START' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'LS' | 'RS';

const PAD_NAMES: Record<PadKind, Record<PadBtn, string>> = {
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', L3: 'L3', R3: 'R3', BACK: 'View', START: 'Menu', UP: 'D-pad up', DOWN: 'D-pad down', LEFT: 'D-pad left', RIGHT: 'D-pad right', LS: 'Left stick', RS: 'Right stick' },
  playstation: { A: 'Cross', B: 'Circle', X: 'Square', Y: 'Triangle', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', L3: 'L3', R3: 'R3', BACK: 'Select', START: 'Options', UP: 'D-pad up', DOWN: 'D-pad down', LEFT: 'D-pad left', RIGHT: 'D-pad right', LS: 'Left stick', RS: 'Right stick' },
  generic: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', L3: 'L3', R3: 'R3', BACK: 'Back', START: 'Start', UP: 'D-pad up', DOWN: 'D-pad down', LEFT: 'D-pad left', RIGHT: 'D-pad right', LS: 'Left stick', RS: 'Right stick' },
};

export function padButtonName(btn: PadBtn, kind: PadKind): string { return PAD_NAMES[kind][btn]; }

/** Decide the pad family from `Gamepad.id` (Chromium: "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"). */
export function detectPadKind(id: string | undefined): PadKind {
  const s = (id ?? '').toLowerCase();
  if (/playstation|dualshock|dualsense|054c|sony/.test(s)) return 'playstation';
  if (/xbox|xinput|045e|microsoft|x-box/.test(s)) return 'xbox';
  return s ? 'generic' : 'xbox';
}

/** Pad button for each action by context (the GTA V layout). Gamepad.ts drives the game from the same names. */
export const PAD_LAYOUT: Partial<Record<ActionId, { foot?: PadBtn; car?: PadBtn }>> = {
  moveForward: { foot: 'LS', car: 'RT' },
  moveBack: { foot: 'LS', car: 'LT' },
  moveLeft: { foot: 'LS', car: 'LS' },
  moveRight: { foot: 'LS', car: 'LS' },
  sprint: { foot: 'A' },
  jump: { foot: 'X' },
  walk: { foot: 'L3' },
  attack: { foot: 'RT' },
  aim: { foot: 'LT' },
  cover: { foot: 'RB' },
  itemNext: { foot: 'LB' },
  itemPrev: { foot: 'LEFT' },
  enter: { foot: 'Y', car: 'Y' },
  phone: { foot: 'UP', car: 'UP' },
  lookBack: { foot: 'R3', car: 'R3' },
  camera: { foot: 'BACK', car: 'BACK' },
  shoulder: { foot: 'RB' },
  handbrake: { car: 'RB' },
  brake: { car: 'LT' },
  horn: { car: 'L3' },
  radioNext: { car: 'RIGHT' },
  radioPrev: { car: 'LEFT' },
};

export interface GlyphEnv { mode: InputModeName; inVehicle?: boolean; bindings?: Bindings }

/** Touch button captions for the actions the on-screen controls offer. */
const TOUCH_GLYPH: Partial<Record<ActionId, string>> = { enter: 'CAR', jump: 'JUMP', sprint: 'RUN', attack: 'ACT', handbrake: 'HAND', brake: 'BRAKE', horn: 'HORN', radioNext: 'RADIO', camera: 'VIEW', lookBack: 'BACK', phone: 'PHONE', map: 'MAP' };

/**
 * The text a prompt shows for `id` on the device in use: "F" on a keyboard, "Y" or "Triangle" on a pad, "CAR" on a phone.
 * The first key bound to the action is shown; an action with no key shows "Unbound".
 */
export function glyphFor(id: ActionId, env: GlyphEnv): string {
  const b = env.bindings ?? GAME_BINDINGS;
  if (env.mode === 'touch') return TOUCH_GLYPH[id] ?? 'TAP';
  if (env.mode === 'gamepad') {
    const p = PAD_LAYOUT[id];
    const btn = p ? (env.inVehicle ? p.car ?? p.foot : p.foot ?? p.car) : undefined;
    return btn ? padButtonName(btn, b.padKind) : 'Unbound';
  }
  const k = b.get(id).filter((c) => !LOCK_ONLY_KEYS.has(c) || b.ctrlSafe)[0];
  return k ? keyLabel(k) : 'Unbound';
}

/** "F" or "Left click / G": every key bound to the action, for help rows. */
export function keysText(id: ActionId, bindings: Bindings = GAME_BINDINGS): string {
  const ks = bindings.get(id);
  return ks.length ? ks.map(keyLabel).join(' / ') : 'Unbound';
}

/** Is this physical key one of the keys bound to `id`? For UI that listens to raw key events (map, phone, mission pointer). */
export function codeBound(id: ActionId, code: string, bindings: Bindings = GAME_BINDINGS): boolean {
  return bindings.get(id).includes(code) && (!LOCK_ONLY_KEYS.has(code) || bindings.ctrlSafe);
}
