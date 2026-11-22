/**
 * Turns a step line with tokens into parts the card draws: plain words and key caps. Every key comes from the binding table
 * (`glyphFor`), so a rebind changes the card; a pad shows its own button names and a phone shows the on-screen captions.
 */
import { GAME_BINDINGS, glyphFor, padButtonName, type ActionId, type Bindings } from '@/core/Bindings';
import type { Device } from './types';

export type Part = { kind: 'text'; text: string } | { kind: 'key'; text: string };

export interface ResolveEnv { device: Device; inVehicle: boolean; bindings?: Bindings }

const MOVE_KEYS: readonly ActionId[] = ['moveForward', 'moveLeft', 'moveBack', 'moveRight'];

/** The cap text for a token, or null when it is not a token we know. */
function capsFor(token: string, env: ResolveEnv): string[] | null {
  const b = env.bindings ?? GAME_BINDINGS;
  const g = (id: ActionId): string => glyphFor(id, { mode: env.device, inVehicle: env.inVehicle, bindings: b });
  switch (token) {
    case 'move': return env.device === 'keyboard' ? MOVE_KEYS.map(g) : ['Left stick'];
    case 'look': return env.device === 'gamepad' ? ['Right stick'] : ['mouse'];
    case 'confirm': return env.device === 'gamepad' ? [padButtonName('A', b.padKind)] : ['click'];
    case 'pause': return env.device === 'gamepad' ? [padButtonName('START', b.padKind)] : env.device === 'touch' ? ['PAUSE'] : ['Esc'];
    case 'skipKey': return [env.device === 'gamepad' ? padButtonName('DOWN', b.padKind) : env.device === 'touch' ? 'TAP' : 'Backspace'];
    case 'nextKey': return [env.device === 'gamepad' ? padButtonName('DOWN', b.padKind) : env.device === 'touch' ? 'TAP' : 'Enter'];
    default: return null;
  }
}

/** The text drawn for one token. `unbound` is true when an action has no key at all (the step cannot be done, so the host moves on). */
export function resolveLine(template: string, env: ResolveEnv): { parts: Part[]; unbound: boolean } {
  const parts: Part[] = [];
  let unbound = false;
  const re = /\{(=?)([A-Za-z]+)\}/g;
  let last = 0;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    if (m.index > last) parts.push({ kind: 'text', text: template.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[1] === '=') { parts.push({ kind: 'key', text: m[2] }); continue; }
    const special = capsFor(m[2], env);
    if (special) {
      if (special.includes('Unbound')) unbound = true;
      // "mouse" in "Move the mouse" is a word, not a cap
      if (m[2] === 'look' && env.device !== 'gamepad') parts.push({ kind: 'text', text: 'mouse' });
      else if (m[2] === 'confirm' && env.device !== 'gamepad') parts.push({ kind: 'text', text: 'click' });
      else special.forEach((t, i) => { if (i > 0) parts.push({ kind: 'text', text: ' ' }); parts.push({ kind: 'key', text: t }); });
      continue;
    }
    const cap = glyphFor(m[2] as ActionId, { mode: env.device, inVehicle: env.inVehicle, bindings: env.bindings ?? GAME_BINDINGS });
    if (cap === 'Unbound' || cap === 'TAP') unbound = true;
    parts.push({ kind: 'key', text: cap });
  }
  if (last < template.length) parts.push({ kind: 'text', text: template.slice(last) });
  return { parts, unbound };
}

/** The line as plain text (tests, aria-label): caps in square brackets. */
export function plainText(parts: readonly Part[]): string {
  return parts.map((p) => (p.kind === 'key' ? `[${p.text}]` : p.text)).join('');
}
