/**
 * The tutorial card: a quiet strip low on the screen (top centre on a phone). It never takes the pointer and never blocks input: the
 * whole card is `pointer-events: none`, except the two small buttons a touch screen needs. It rebuilds its DOM only when something it
 * shows has changed.
 */
import { resolveLine, type ResolveEnv } from './resolve';
import type { CardView } from './types';
import './tutorial.css';

export interface CardHandlers { onSkip?: () => void; onNext?: () => void }

export interface CardExtra {
  /** A hint (not the tutorial): no dots, no skip. */
  hint?: boolean;
  /** Bumps when the bindings or the pad family change, so the caps are redrawn. */
  bindingsVersion?: number;
  /** The HUD's contextual prompt pill is up ("F  Enter car"): the card sits above it instead of below. */
  raised?: boolean;
}

export class TutorialCard {
  readonly el: HTMLElement;
  private sig = '';
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private shown = false;

  constructor(private readonly root: HTMLElement, private readonly handlers: CardHandlers = {}, private readonly doc: Document = root.ownerDocument) {
    this.el = this.doc.createElement('div');
    this.el.className = 'tut-card';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  get visible(): boolean { return this.shown; }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.el.classList.remove('on');
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => { if (!this.shown) this.el.hidden = true; }, 220);
  }

  private show(): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.el.hidden = false;
    if (!this.shown) { this.shown = true; void this.el.offsetWidth; this.el.classList.add('on'); }
  }

  /** Draw `view`. Returns true when the line has a key with no binding (the step can never be done). */
  render(view: CardView, env: ResolveEnv, extra: CardExtra = {}): { unbound: boolean } {
    if (!view.visible) { this.hide(); return { unbound: false }; }
    const line = resolveLine(view.text, env);
    const offer = view.stage === 'offer' && !extra.hint && view.kind === 'step';
    const sig = [view.kind, view.id, view.device, view.stage, view.text, view.tick ? 1 : 0, view.index, view.dots.map((d) => (d.done ? 'd' : d.current ? 'c' : 'p')).join(''), extra.hint ? 'h' : '', extra.bindingsVersion ?? 0, env.inVehicle ? 'v' : ''].join('|');
    this.el.classList.toggle('up', !!extra.raised);
    if (sig !== this.sig) { this.sig = sig; this.build(view, env, line.parts, offer, !!extra.hint); }
    this.show();
    return { unbound: line.unbound };
  }

  private build(view: CardView, env: ResolveEnv, parts: ReturnType<typeof resolveLine>['parts'], offer: boolean, hint: boolean): void {
    const d = this.doc;
    const el = this.el;
    el.textContent = '';
    el.dataset.device = view.device;
    el.dataset.stage = view.stage;
    el.dataset.kind = hint ? 'hint' : view.kind;
    el.classList.toggle('tick', view.tick);

    const main = d.createElement('div'); main.className = 'tut-main';
    const mark = d.createElement('i'); mark.className = 'tut-mark'; mark.setAttribute('aria-hidden', 'true');
    const line = d.createElement('p'); line.className = 'tut-line';
    for (const p of parts) {
      if (p.kind === 'text') line.appendChild(d.createTextNode(p.text));
      else { const k = d.createElement('kbd'); k.className = 'tut-key'; k.textContent = p.text; line.appendChild(k); }
    }
    main.append(mark, line);
    el.appendChild(main);

    if (hint) {
      const lab = d.createElement('p'); lab.className = 'tut-why'; lab.textContent = 'Hint. You can turn hints off in Settings.';
      el.appendChild(lab);
      return;
    }
    if (view.kind === 'bye') return;

    const why = d.createElement('p'); why.className = 'tut-why';
    if (offer && env.device !== 'touch') {
      const o = env.device === 'gamepad' ? resolveLine('Taking a while? {skipKey} skips the tutorial.', env) : resolveLine('Taking a while? {nextKey} moves on.', env);
      for (const p of o.parts) {
        if (p.kind === 'text') why.appendChild(d.createTextNode(p.text));
        else { const k = d.createElement('kbd'); k.className = 'tut-key'; k.textContent = p.text; why.appendChild(k); }
      }
    } else why.textContent = view.why;
    el.appendChild(why);

    const foot = d.createElement('div'); foot.className = 'tut-foot';
    const dots = d.createElement('span'); dots.className = 'tut-dots'; dots.setAttribute('aria-hidden', 'true');
    for (const dot of view.dots) { const i = d.createElement('i'); if (dot.done) i.className = 'd'; else if (dot.current) i.className = 'c'; dots.appendChild(i); }
    foot.appendChild(dots);
    if (env.device === 'touch') {
      if (offer) foot.appendChild(this.button('Next', 'tut-btn tut-next', () => this.handlers.onNext?.()));
      foot.appendChild(this.button('Skip tutorial', 'tut-btn tut-skip', () => this.handlers.onSkip?.()));
    } else {
      const sk = d.createElement('span'); sk.className = 'tut-skip';
      sk.appendChild(d.createTextNode('Skip tutorial '));
      for (const p of resolveLine('{skipKey}', env).parts) { const k = d.createElement('kbd'); k.className = 'tut-key'; k.textContent = p.kind === 'key' ? p.text : ''; sk.appendChild(k); }
      foot.appendChild(sk);
    }
    el.appendChild(foot);
  }

  private button(label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label;
    const go = (e: Event): void => { e.preventDefault(); e.stopPropagation(); fn(); };
    b.addEventListener('pointerdown', go);
    b.addEventListener('click', go);
    return b;
  }

  dispose(): void { if (this.hideTimer) clearTimeout(this.hideTimer); this.el.remove(); }
}
