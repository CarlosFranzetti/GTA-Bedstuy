/** Full-screen black fade used when entering and leaving interiors. */
export class FadeOverlay {
  readonly el: HTMLElement | null;
  constructor(parent: HTMLElement | null = typeof document === 'undefined' ? null : document.body) {
    if (!parent) { this.el = null; return; }
    const el = parent.ownerDocument.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:25;';
    parent.appendChild(el);
    this.el = el;
  }
  set(alpha: number): void { if (this.el) this.el.style.opacity = String(Math.min(1, Math.max(0, alpha))); }
  dispose(): void { this.el?.remove(); }
}
