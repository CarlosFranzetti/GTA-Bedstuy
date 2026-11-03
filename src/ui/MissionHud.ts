import './mission.css';
import { angleDiff, headingFromVec, type Vec2 } from '@/core/Math2';
import type { MissionHudState, MissionMarker } from '@/game/missions/types';

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
export class MissionHud {
  private readonly doc: Document;
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
  private lastStatus: MissionHudState['status'] = 'idle';
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

    root.append(this.panel, this.cashEl, this.toastEl, this.retryEl, this.pointerEl);
  }

  private make(tag: string, cls: string): HTMLElement {
    const el = this.doc.createElement(tag);
    el.className = cls;
    return el;
  }

  /** @param dt seconds since the last call (drives the cash count-up). */
  update(s: Readonly<MissionHudState>, dt = 1 / 60): void {
    this.lastStatus = s.status;
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
   * While no mission is running, points at the nearest mission giver: 'Mission: <title>  85 m' with an arrow that
   * turns relative to where the SCREEN faces (pass the camera yaw, not the body heading: on foot they differ whenever
   * the player strafes or orbits; heading 0 = north = -z, like the minimap). Call every frame
   * after update(); it hides itself during a mission.
   */
  updatePointer(markers: readonly MissionMarker[], playerPos: Vec2, heading: number): void {
    let best: MissionMarker | null = null;
    let bestD = Infinity;
    if (this.lastStatus !== 'active' && this.lastStatus !== 'failed') {
      for (const m of markers) {
        if (m.kind !== 'giver') continue;
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
    this.pointerEl.dataset.dist = bestD.toFixed(1); // exact metres to the nearest giver, for the playtest state and tests
    const text = bestD < best.radius + 2 ? `Mission: ${best.label}  here` : `Mission: ${best.label}  ${Math.round(bestD / POINTER_STEP_M) * POINTER_STEP_M} m`;
    if (text !== this.lastPointerText) { this.lastPointerText = text; this.pointerText.textContent = text; }
    const rel = angleDiff(heading, headingFromVec({ x: best.x - playerPos.x, z: best.z - playerPos.z }));
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

  dispose(): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.panel.remove(); this.cashEl.remove(); this.toastEl.remove(); this.retryEl.remove(); this.pointerEl.remove();
  }
}
