/** On-screen controls for phones and tablets: left joystick, right-side look drag, action buttons. */
import { ACTION_VIRTUAL, LOOK_BACK_KEY, type Input } from '@/core/Input';
import './touch.css';

export const STICK_RADIUS = 56;   // px of travel for full deflection
export const DEAD_ZONE = 0.12;

/** Joystick vector from a drag offset: x right, y forward (screen up), clamped to the unit disc with a dead zone. */
export function joystickVector(dx: number, dy: number, radius = STICK_RADIUS): { x: number; y: number } {
  let x = dx / radius, y = -dy / radius;
  const len = Math.hypot(x, y);
  if (len < DEAD_ZONE) return { x: 0, y: 0 };
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}

interface ButtonDef { code: string[]; label: string; hold: boolean; cls: string; }
const BUTTONS: ButtonDef[] = [
  { code: ['KeyF'], label: 'CAR', hold: false, cls: 'tc-btn-car' },
  { code: ['ShiftLeft'], label: 'RUN', hold: true, cls: 'tc-btn-run' },
  { code: ['Space'], label: 'JUMP', hold: false, cls: 'tc-btn-jump' },
  { code: ['KeyH'], label: 'HORN', hold: true, cls: 'tc-btn-horn' },
  { code: ['KeyE'], label: 'RADIO', hold: false, cls: 'tc-btn-radio' },
  { code: [LOOK_BACK_KEY], label: 'LOOK', hold: true, cls: 'tc-btn-look' },
  { code: ['KeyV'], label: 'VIEW', hold: false, cls: 'tc-btn-view' },
  // the action button (punch / throw / shoot by what is in hand); on foot only, set apart from the grid by touch.css
  { code: [ACTION_VIRTUAL], label: 'ACT', hold: true, cls: 'tc-btn-act' },
];

export class TouchControls {
  readonly root: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private runBtn: HTMLButtonElement | null = null;
  private runCodes: string[] = ['ShiftLeft'];

  constructor(parent: HTMLElement, private input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'tc-root';
    parent.classList.add('touch');
    parent.appendChild(this.root);

    // look area: right 60% of the screen
    const look = document.createElement('div');
    look.className = 'tc-look';
    look.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      this.input.setMode('touch');
      this.lookId = e.pointerId; this.lookLast = { x: e.clientX, y: e.clientY };
      try { look.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.addLook((e.clientX - this.lookLast.x) * 2.2, (e.clientY - this.lookLast.y) * 2.2);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = null; };
    look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);
    this.root.appendChild(look);

    // joystick
    const stick = document.createElement('div');
    stick.className = 'tc-stick';
    const knob = document.createElement('div');
    knob.className = 'tc-knob';
    stick.appendChild(knob);
    stick.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      this.input.setMode('touch');
      const r = stick.getBoundingClientRect();
      this.stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      try { stick.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      this.moveStick(e, knob);
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) this.moveStick(e, knob); });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null; this.input.touchAxis.x = 0; this.input.touchAxis.y = 0;
      knob.style.transform = 'translate(0px, 0px)';
    };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
    this.root.appendChild(stick);

    // buttons
    const bar = document.createElement('div');
    bar.className = 'tc-buttons';
    for (const def of BUTTONS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `tc-btn ${def.cls}`; b.textContent = def.label;
      if (def.cls === 'tc-btn-run') this.runBtn = b;
      const codes = (): string[] => (def.cls === 'tc-btn-run' ? this.runCodes : def.code);
      const press = (e: PointerEvent) => {
        e.preventDefault(); b.classList.add('on'); this.input.setMode('touch');
        for (const c of codes()) this.input.setVirtual(c, true);
        if (!def.hold) setTimeout(() => { for (const c of codes()) this.input.setVirtual(c, false); b.classList.remove('on'); }, 120);
      };
      const release = () => { if (def.hold) { for (const c of def.cls === 'tc-btn-run' ? ['Space', 'ShiftLeft'] : def.code) this.input.setVirtual(c, false); b.classList.remove('on'); } };
      b.addEventListener('pointerdown', press);
      b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('pointerleave', release);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      bar.appendChild(b);
    }
    this.root.appendChild(bar);
  }

  /**
   * Driving or on foot. On foot the JUMP button shows and RUN is Shift; driving hides JUMP and the run button becomes
   * BRAKE (Space + Shift handbrake), as before. Called by main.ts when entering / leaving a vehicle.
   */
  setDriving(driving: boolean): void {
    this.root.classList.toggle('tc-driving', driving);
    this.runCodes = driving ? ['Space', 'ShiftLeft'] : ['ShiftLeft'];
    if (this.runBtn) this.runBtn.textContent = driving ? 'BRAKE' : 'RUN';
  }

  private moveStick(e: PointerEvent, knob: HTMLElement): void {
    const dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
    const v = joystickVector(dx, dy);
    this.input.touchAxis.x = v.x; this.input.touchAxis.y = v.y;
    knob.style.transform = `translate(${v.x * STICK_RADIUS}px, ${-v.y * STICK_RADIUS}px)`;
  }
}
