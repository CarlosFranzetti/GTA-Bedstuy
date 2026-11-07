import './mission.css';
import { angleDiff, headingFromVec, type Vec2 } from '@/core/Math2';
import type { MissionHudState, MissionMarker } from '@/game/missions/types';
import { cycleNavTarget, getNavTarget } from '@/game/missions/NavTargets';

const TOAST_MS = 4200;
const LOW_SECONDS = 15;
/** Distance readout steps (m): the text only changes when the rounded value does. */
const POINTER_STEP_M = 5;
/** Arrow rotation is quantised to this many degrees so the DOM is not rewritten every frame. */
const POINTER_ANGLE_STEP = 3;

function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** m:ss for a whole number of seconds. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatCash(n: number): string {
  return `$${Math.max(0, Math.round(Number.isFinite(n) ? n : 0)).toLocaleString('en-US')}`;
}

/**
 * Mission overlay inside the shared HUD root: objective text + timer top-left, cash counter top-right, toast for
 * started/complete/failed and the retry prompt. `update(mission.hud)` is cheap and writes the DOM only on change.
 * Works on a detached root.
 */
export const HOME_HINT = 'Your place is the green awning on Throop Ave (press N to point at it)';

export class MissionHud {
  private readonly doc: Document;
  /** Left column that stacks the mission panel and the Goal/Offer pointer so the two can never overlap. */
  private readonly col: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly objEl: HTMLElement;
  private readonly metaEl: HTMLElement;
  private readonly stepEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly barEl: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly carryEl: HTMLElement;
  private readonly cashEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly retryEl: HTMLElement;
  private readonly pointerEl: HTMLElement;
  private readonly pointerArrow: HTMLElement;
  private readonly pointerText: HTMLElement;
  private router: ((from: Vec2, to: Vec2) => Vec2) | null = null;
  private readonly onKey: (e: KeyboardEvent) => void;
  private lastStatus: MissionHudState['status'] = 'idle';
  private inside = false;
  private lastPointerText = '';
  private lastPointerAngle = Number.NaN;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private seenToast = 0;
  private cashShown = 0;
  private cashTarget = 0;
  private lastTimer = -1;
  private lastBar = -1;

  constructor(root: HTMLElement) {
    this.doc = root.ownerDocument;
    this.col = this.make('div', 'msn-col');
    this.panel = this.make('div', 'msn-panel');
    this.panel.hidden = true;
    this.titleEl = this.make('div', 'msn-title');
    this.objEl = this.make('div', 'msn-objective');
    this.metaEl = this.make('div', 'msn-meta');
    this.stepEl = this.make('span', 'msn-step');
    this.timerEl = this.make('span', 'msn-timer');
    this.timerEl.hidden = true;
    this.metaEl.append(this.stepEl, this.timerEl);
    this.barEl = this.make('div', 'msn-bar');
    this.barEl.hidden = true;
    this.barFill = this.doc.createElement('i');
    this.barEl.appendChild(this.barFill);
    this.carryEl = this.make('div', 'msn-carry');
    this.carryEl.hidden = true;
    this.panel.append(this.titleEl, this.objEl, this.metaEl, this.barEl, this.carryEl);

    this.cashEl = this.make('div', 'msn-cash');
    this.cashEl.hidden = true;
    this.toastEl = this.make('div', 'msn-toast');
    this.toastEl.hidden = true;
    this.toastEl.setAttribute('role', 'status');
    this.retryEl = this.make('div', 'msn-retry');
    this.retryEl.hidden = true;

    this.pointerEl = this.make('div', 'msn-pointer');
    this.pointerEl.hidden = true;
    this.pointerArrow = this.make('span', 'msn-pointer-arrow');
    this.pointerArrow.textContent = '\u2191';
    this.pointerArrow.setAttribute('aria-hidden', 'true');
    this.pointerText = this.make('span', 'msn-pointer-text');
    this.pointerEl.append(this.pointerArrow, this.pointerText);

    this.col.append(this.panel, this.pointerEl);
    root.append(this.col, this.cashEl, this.toastEl, this.retryEl);

    // Idle pointer: N (or a tap on the chip) cycles Offer -> HOME -> WAX DELI -> Offer (see game/missions/NavTargets).
    this.pointerEl.style.pointerEvents = 'auto';
    this.pointerEl.title = 'Press N (or tap) to point at HOME or WAX DELI';
    this.pointerEl.addEventListener('click', () => { if (this.lastStatus === 'idle') cycleNavTarget(); });
    this.onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyN' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || this.lastStatus !== 'idle' || this.inside) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (this.doc.body?.classList.contains('ui-panel-open')) return;
      cycleNavTarget();
    };
    this.doc.addEventListener('keydown', this.onKey);
  }

  private make(tag: string, cls: string): HTMLElement {
    const el = this.doc.createElement(tag);
    el.className = cls;
    return el;
  }

  /** @param dt seconds since the last call (drives the cash count-up). */
  update(s: Readonly<MissionHudState>, dt = 1 / 60): void {
    this.lastStatus = s.status;
    this.inside = s.inside === true;
    const show = s.status === 'active' || s.status === 'failed';
    this.panel.hidden = !show;
    if (show) {
      setText(this.titleEl, s.status === 'failed' ? `${s.title} · failed` : s.title);
      setText(this.objEl, s.objective);
      setText(this.stepEl, s.steps > 1 ? `${s.step}/${s.steps}` : '');

      const running = s.status === 'active' && s.timeLeft >= 0;
      this.timerEl.hidden = !running;
      if (running) {
        const whole = Math.ceil(s.timeLeft);
        if (whole !== this.lastTimer) {
          this.lastTimer = whole;
          setText(this.timerEl, formatClock(s.timeLeft));
          this.timerEl.classList.toggle('low', s.timeLeft <= LOW_SECONDS);
        }
      } else this.lastTimer = -1;

      const bar = s.status === 'active' && s.progress >= 0;
      this.barEl.hidden = !bar;
      if (bar) {
        const pct = Math.round(Math.min(1, s.progress) * 100);
        if (pct !== this.lastBar) { this.lastBar = pct; this.barFill.style.width = `${pct}%`; }
      } else this.lastBar = -1;

      this.carryEl.hidden = s.carrying === '';
      setText(this.carryEl, s.carrying);
    }

    this.retryEl.hidden = !(s.status === 'failed' && s.retryPrompt !== '');
    setText(this.retryEl, s.retryPrompt);

    this.updateCash(s.cash, dt);

    if (s.toastSeq !== this.seenToast) {
      this.seenToast = s.toastSeq;
      if (s.toast !== '') this.showToast(s.toast, s.toastKind);
    }
  }

  /**
   * Route the arrow around building blocks (see game/missions/PointerRoute). Optional: without it the arrow points
   * straight at the goal.
   */
  setRouter(router: ((from: Vec2, to: Vec2) => Vec2) | null): void { this.router = router; }

  /**
   * One arrow for what to do next. Idle: 'Offer: <title>  85 m' at the nearest giver that can start right now.
   * During a mission: 'Goal: <objective>  40 m' at the nearest objective marker. Hidden while a mission has failed
   * and when there is nothing to point at, so a stale arrow can never outlive its mission. The arrow turns relative
   * to where the SCREEN faces (pass the camera yaw; heading 0 = north = -z, like the minimap) and, with a router, bends
   * around building blocks along the sidewalk; the distance text is always the straight distance. Call every frame
   * after update().
   */
  updatePointer(markers: readonly MissionMarker[], playerPos: Vec2, heading: number): void {
    let best: MissionMarker | null = null;
    let bestD = Infinity;
    const active = this.lastStatus === 'active';
    const nav = !active && this.lastStatus === 'idle' ? getNavTarget() : null;
    if (nav) {
      best = { id: `nav:${nav.id}`, kind: 'giver', x: nav.x, z: nav.z, radius: nav.radius, color: '#7cd6a0', label: nav.label };
      bestD = Math.hypot(nav.x - playerPos.x, nav.z - playerPos.z);
    } else if (active || this.lastStatus === 'idle') {
      const want = active ? 'objective' : 'giver';
      for (const m of markers) {
        if (m.kind !== want) continue;
        const d = Math.hypot(m.x - playerPos.x, m.z - playerPos.z);
        if (d < bestD) { bestD = d; best = m; }
      }
    }
    if (!best || !Number.isFinite(bestD)) {
      this.pointerEl.hidden = true;
      this.lastPointerText = '';
      return;
    }
    this.pointerEl.hidden = false;
    this.pointerEl.dataset.dist = bestD.toFixed(1); // exact metres to the target, for the playtest state and tests
    this.pointerEl.dataset.kind = best.kind;
    const prefix = active ? 'Goal' : nav ? 'Nav' : 'Offer';
    // Interiors are built 3 km off the map, so the straight distance to a street marker is meaningless in there.
    // "inside" is a where-it-is hint; for an objective that is to leave, it would contradict itself ("Head back outside  inside").
    const leaving = /\b(outside|leave|exit)\b/i.test(best.label);
    const text = this.inside ? (leaving ? `${prefix}: ${best.label}` : `${prefix}: ${best.label}  inside`) : bestD < best.radius + 2 ? `${prefix}: ${best.label}  here` : `${prefix}: ${best.label}  ${Math.round(bestD / POINTER_STEP_M) * POINTER_STEP_M} m`;
    if (text !== this.lastPointerText) { this.lastPointerText = text; this.pointerText.textContent = text; }
    this.pointerArrow.style.visibility = this.inside ? 'hidden' : '';
    if (this.inside) return;
    const aim = this.router && bestD >= best.radius + 2 ? this.router(playerPos, best) : best;
    const rel = angleDiff(heading, headingFromVec({ x: aim.x - playerPos.x, z: aim.z - playerPos.z }));
    const deg = Math.round((rel * 180 / Math.PI) / POINTER_ANGLE_STEP) * POINTER_ANGLE_STEP;
    if (deg !== this.lastPointerAngle) { this.lastPointerAngle = deg; this.pointerArrow.style.transform = `rotate(${deg}deg)`; }
  }

  private updateCash(target: number, dt: number): void {
    if (target !== this.cashTarget) {
      if (target > this.cashTarget) { this.cashEl.classList.remove('bump'); void this.cashEl.offsetWidth; this.cashEl.classList.add('bump'); }
      this.cashTarget = target;
    }
    if (this.cashShown !== this.cashTarget) {
      const diff = this.cashTarget - this.cashShown;
      const step = Math.max(1, Math.abs(diff) * Math.min(1, dt * 6));
      this.cashShown = Math.abs(diff) <= step ? this.cashTarget : this.cashShown + Math.sign(diff) * step;
    }
    this.cashEl.hidden = this.cashShown <= 0 && this.cashTarget <= 0;
    setText(this.cashEl, formatCash(this.cashShown));
  }

  showToast(message: string, kind: 'info' | 'good' | 'bad' = 'info', ms = TOAST_MS): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.dataset.kind = kind;
    this.toastEl.hidden = false;
    this.toastEl.classList.remove('out');
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.add('out');
      this.toastTimer = setTimeout(() => { this.toastEl.hidden = true; this.toastTimer = null; }, 300);
    }, ms);
  }

  /**
   * One-time toast at the first spawn so a new player knows where HOME is (H7: nobody found it). Remembered in
   * localStorage; returns true when it was shown. main.ts calls this once after the first frame.
   */
  showHomeHint(): boolean {
    const KEY = 'gta-bedstuy.homeHint.v1';
    try { if (localStorage.getItem(KEY)) return false; } catch { /* private mode: show it every run */ }
    this.showToast(HOME_HINT, 'info', 9000);
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    return true;
  }

  dispose(): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.doc.removeEventListener('keydown', this.onKey);
    this.col.remove(); this.cashEl.remove(); this.toastEl.remove(); this.retryEl.remove();
  }
}
