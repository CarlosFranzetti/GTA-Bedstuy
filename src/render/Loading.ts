/** Boot loading overlay: progress bar + step list. Pure DOM (no stylesheet needed); safe to use before the game exists. */

export type StepState = 'pending' | 'active' | 'done' | 'skipped';

export interface LoadingStep { id: string; label: string; }

export const BOOT_STEPS: readonly LoadingStep[] = [
  { id: 'materials', label: 'Materials' },
  { id: 'textures', label: 'Textures' },
  { id: 'world', label: 'World' },
  { id: 'entities', label: 'Entities' },
  { id: 'lights', label: 'Lights & shadows' },
  { id: 'shaders', label: 'Compiling shaders' },
];

/** Fraction complete (0..1) given step states; the active step counts as half done. */
export function loadingProgress(states: readonly StepState[]): number {
  if (states.length === 0) return 1;
  let s = 0;
  for (const st of states) s += st === 'done' || st === 'skipped' ? 1 : st === 'active' ? 0.5 : 0;
  return s / states.length;
}

/** Resolves with `p`'s value, or `fallback` after `ms` (never rejects). */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

/** Lets the browser paint (rAF then a macrotask), so the overlay updates between long synchronous build steps. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => setTimeout(resolve, 0);
    if (typeof requestAnimationFrame === 'function' && (typeof document === 'undefined' || !document.hidden)) requestAnimationFrame(done);
    else done();
  });
}

const MARK: Record<StepState, string> = { pending: '○', active: '◐', done: '●', skipped: '–' };

export class LoadingScreen {
  readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly note: HTMLElement;
  private readonly rows = new Map<string, { row: HTMLElement; mark: HTMLElement; label: string }>();
  private readonly states = new Map<string, StepState>();

  constructor(parent: HTMLElement, steps: readonly LoadingStep[] = BOOT_STEPS, private readonly doc: Document = document) {
    const d = this.doc;
    const root = d.createElement('div');
    root.id = 'loading';
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-label', 'Loading');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', '100');
    Object.assign(root.style, {
      position: 'fixed', inset: '0', zIndex: '1000', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '18px', background: '#0b0b10', color: '#e8e6e1', transition: 'opacity 0.5s ease',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = d.createElement('div');
    title.textContent = 'GTA Bed-Stuy';
    Object.assign(title.style, { fontSize: '28px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' });
    root.appendChild(title);

    const track = d.createElement('div');
    Object.assign(track.style, { width: 'min(360px, 80vw)', height: '6px', borderRadius: '3px', background: '#26262f', overflow: 'hidden' });
    this.bar = d.createElement('div');
    Object.assign(this.bar.style, { width: '0%', height: '100%', background: '#e8b23c', transition: 'width 0.25s ease' });
    track.appendChild(this.bar);
    root.appendChild(track);

    const list = d.createElement('div');
    Object.assign(list.style, { display: 'grid', gap: '4px', fontSize: '13px', minWidth: 'min(260px, 70vw)' });
    for (const s of steps) {
      const row = d.createElement('div');
      Object.assign(row.style, { display: 'flex', gap: '10px', opacity: '0.45' });
      const mark = d.createElement('span');
      mark.style.width = '1em';
      const text = d.createElement('span');
      text.textContent = s.label;
      row.append(mark, text);
      list.appendChild(row);
      this.rows.set(s.id, { row, mark, label: s.label });
      this.set(s.id, 'pending');
    }
    root.appendChild(list);

    this.note = d.createElement('div');
    Object.assign(this.note.style, { fontSize: '12px', color: '#c9a24a', minHeight: '1.2em' });
    root.appendChild(this.note);

    parent.appendChild(root);
    this.root = root;
    this.refresh();
  }

  /** Mark a step as the one in progress. */
  begin(id: string): void { this.set(id, 'active'); }
  done(id: string): void { this.set(id, 'done'); }
  skip(id: string, why = ''): void { this.set(id, 'skipped'); if (why) this.warn(why); }
  /** Show a non-fatal warning line (e.g. texture timeout). */
  warn(text: string): void { this.note.textContent = text; }
  get progress(): number { return loadingProgress([...this.states.values()]); }
  stateOf(id: string): StepState | undefined { return this.states.get(id); }

  private set(id: string, st: StepState): void {
    const r = this.rows.get(id);
    if (!r) return;
    this.states.set(id, st);
    r.mark.textContent = MARK[st];
    r.row.style.opacity = st === 'pending' ? '0.45' : '1';
    r.row.style.color = st === 'done' ? '#9ad29a' : st === 'skipped' ? '#c9a24a' : '';
    this.refresh();
  }

  private refresh(): void {
    const pct = Math.round(this.progress * 100);
    this.bar.style.width = `${pct}%`;
    this.root.setAttribute('aria-valuenow', String(pct));
  }

  /** Fade out and remove. Resolves once removed. */
  hide(fadeMs = 500): Promise<void> {
    return new Promise((resolve) => {
      this.root.style.pointerEvents = 'none';
      this.root.style.opacity = '0';
      setTimeout(() => { this.root.remove(); resolve(); }, fadeMs);
    });
  }
}
