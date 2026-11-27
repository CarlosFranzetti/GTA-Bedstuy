import './story.css';
import type { FlyerResult, PromoPed, PromoTemper } from '@/game/story/promo';

/**
 * The flyer hand-out (SCENEUI): while a promotion night is open and flyers are left, the nearest ADULT pedestrian within reach gets a small
 * prompt ("F  Hand a flyer to someone"); F calls `bridge.handFlyer(nightId, ped)`. A minor (`isMinor`) is never a target: no prompt, no call, and
 * `Promotion.handFlyer` refuses one anyway. People who are down, fleeing, sitting or already asked are skipped. DOM only.
 */
export interface FlyerPed {
  readonly id: string | number;
  readonly isMinor: boolean;
  readonly state?: string;
  readonly body: { pos: { x: number; z: number } };
  readonly vitals: { temper: PromoTemper };
}
export interface FlyerSink { handFlyer(nightId: string, ped: PromoPed): FlyerResult }
export interface FlyerNightView { flyersLeft: number; asked: ReadonlyArray<number | string> }

export const FLYER_REACH_M = 2.6;
const SKIP_STATES = new Set(['down', 'fleeing', 'sitting']);

/** The nearest approachable adult, or null. Pure: tested without a DOM. */
export function pickFlyerTarget(pos: { x: number; z: number }, peds: readonly FlyerPed[], night: FlyerNightView | null, reach = FLYER_REACH_M): FlyerPed | null {
  if (!night || night.flyersLeft <= 0) return null;
  let best: FlyerPed | null = null, bd = reach * reach;
  for (const p of peds) {
    if (p.isMinor) continue;
    if (p.state && SKIP_STATES.has(p.state)) continue;
    if (night.asked.includes(p.id)) continue;
    const dx = p.body.pos.x - pos.x, dz = p.body.pos.z - pos.z, d = dx * dx + dz * dz;
    if (d <= bd) { bd = d; best = p; }
  }
  return best;
}

export class FlyerPrompt {
  readonly el: HTMLElement;
  private target: FlyerPed | null = null;
  private night: string | null = null;
  private doc: Document;

  constructor(parent: HTMLElement, private readonly sink: FlyerSink, private readonly nightView: (id: string) => FlyerNightView | null) {
    this.doc = parent.ownerDocument;
    this.el = this.doc.createElement('div');
    this.el.className = 'flyer-prompt'; this.el.hidden = true; this.el.setAttribute('role', 'status');
    parent.appendChild(this.el);
  }

  get visible(): boolean { return !this.el.hidden; }
  get current(): FlyerPed | null { return this.target; }

  /** Once per step. `nightId` null (no night open) or `blocked` (a panel is up) hides the prompt. */
  update(playerPos: { x: number; z: number }, peds: readonly FlyerPed[], nightId: string | null, blocked = false): void {
    this.night = nightId;
    const view = nightId && !blocked ? this.nightView(nightId) : null;
    this.target = view ? pickFlyerTarget(playerPos, peds, view) : null;
    const on = this.target !== null;
    if (on !== !this.el.hidden) {
      this.el.hidden = !on;
      if (on) { const left = view?.flyersLeft ?? 0; this.el.textContent = `F  Hand a flyer (${left} left)`; }
    } else if (on) {
      this.el.textContent = `F  Hand a flyer (${view?.flyersLeft ?? 0} left)`;
    }
  }

  /** The F key. Returns the result, or null when nobody is in reach (the key then belongs to something else). */
  press(): FlyerResult | null {
    const p = this.target, n = this.night;
    if (!p || !n || p.isMinor) return null;
    const r = this.sink.handFlyer(n, { id: p.id, isMinor: p.isMinor, temperament: p.vitals.temper });
    this.target = null; this.el.hidden = true;
    return r;
  }

  dispose(): void { this.el.remove(); }
}
