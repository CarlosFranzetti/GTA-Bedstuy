import './story.css';
import { setStoryPanelClass } from './panelClass';
import type { PanelManager } from '../PanelManager';
import type { SceneFrame, SceneMeter } from '@/game/story/scenes';

/**
 * SceneCard (SCENEUI): draws the Pedro story's reply-picker scenes. It reads `bridge.scene?.frame()` (who, line, options, secondsLeft, phase,
 * optional meters) and sends the player's pick back with `bridge.choose(n)`. DOM only, no three.js.
 *
 * Input: keys 1 to 9, up and down (W and S) with Enter, Space or F, a click or tap on a reply, the pad's face buttons A, B, X, Y for replies 1 to 4.
 * It is a PanelManager panel (`scene`) while a scene is talking, so the game input gate closes and the mouse is free; it adds NO Esc handler.
 * Esc does nothing while a scene is live (silence is an answer: the soft timer ends it) and dismisses the closing line.
 * During a brawl phase the card hides and the panel closes, so the fight can be played; it comes back when the scene talks or ends.
 *
 * The closing line: `StoryBridge.update` ends a scene in the same step its outcome is set, so the host calls `showEnding(frame)` with the last frame
 * (wire.ts does this); the card holds it for a few seconds, or until a key, click or tap. A warm date's frame carries `cut`: the card goes to a dark
 * cut with the line, never a picture.
 */
export interface SceneSource { readonly scene: { frame(): SceneFrame } | null; choose(key: number): void }
export interface SceneCardOptions {
  panels?: Pick<PanelManager, 'register' | 'sync'>;
  /** The pad list (default `navigator.getGamepads`). */
  pads?: () => ArrayLike<Gamepad | null | undefined>;
  /** Seconds the closing line stays (default 4.5). */
  endingSeconds?: number;
  /** Seconds a reply takes in full (the bar's scale; default 10 = scenes.REPLY_SECONDS). */
  replySeconds?: number;
}

const PAD_FACE = [0, 1, 2, 3]; // A, B, X, Y -> replies 1 to 4

export class SceneCard {
  readonly root: HTMLElement;
  private readonly doc: Document;
  private readonly card: HTMLElement;
  private readonly who: HTMLElement;
  private readonly line: HTMLElement;
  private readonly meters: HTMLElement;
  private readonly opts: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly timerFill: HTMLElement;
  private readonly hint: HTMLElement;
  private frame: SceneFrame | null = null;
  private sig = '';
  private lastTalk = '';
  private sel = 0;
  private ending: { frame: SceneFrame; left: number } | null = null;
  private open = false;
  private held: boolean[] = [];
  private readonly off: Array<() => void> = [];
  private readonly endingSeconds: number;
  private readonly replySeconds: number;
  /** Counted for tests. */
  picks = 0;

  constructor(parent: HTMLElement, private readonly src: SceneSource, private readonly o: SceneCardOptions = {}) {
    this.doc = parent.ownerDocument;
    const d = this.doc;
    this.endingSeconds = o.endingSeconds ?? 4.5;
    this.replySeconds = o.replySeconds ?? 10;
    const el = (tag: string, cls: string): HTMLElement => { const e = d.createElement(tag); e.className = cls; return e; };
    this.root = el('div', 'scene-root'); this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-live', 'polite');
    this.card = el('div', 'scene-card');
    this.who = el('div', 'scene-who'); this.line = el('p', 'scene-line'); this.meters = el('div', 'scene-meters');
    this.opts = el('div', 'scene-opts'); this.timer = el('div', 'scene-timer'); this.timerFill = el('i', 'scene-timer-fill'); this.timer.appendChild(this.timerFill);
    this.hint = el('div', 'scene-hint');
    this.card.append(this.who, this.line, this.meters, this.opts, this.timer, this.hint);
    this.root.appendChild(this.card);
    this.root.addEventListener('click', (e) => { if (this.ending && !(e.target as Element | null)?.closest('.scene-opt')) this.dismissEnding(); });
    parent.appendChild(this.root);
    const w = d.defaultView;
    if (w) {
      const onKey = (e: KeyboardEvent): void => this.onKey(e);
      w.addEventListener('keydown', onKey, true);
      this.off.push(() => w.removeEventListener('keydown', onKey, true));
    }
    o.panels?.register({ id: 'scene', isOpen: () => this.isOpen, back: () => this.back(), close: () => this.close() });
  }

  get isOpen(): boolean { return this.open; }
  get showingEnding(): boolean { return this.ending !== null; }
  /** The selected reply (0-based), for the pad and keyboard. */
  get selected(): number { return this.sel; }

  /** Once per step, after `bridge.update`. */
  update(dt: number): void {
    this.pollPad();
    if (this.ending) {
      this.ending.left -= dt;
      if (this.ending.left <= 0) { this.dismissEnding(); }
      else return;
    }
    const f = this.src.scene?.frame() ?? null;
    if (!f || f.phase === 'brawl') { this.setOpen(false); this.frame = null; this.sig = ''; return; }
    this.frame = f;
    this.render(f);
    this.setOpen(true);
    this.timerFill.style.width = `${f.phase === 'talk' ? Math.max(0, Math.min(1, f.secondsLeft / this.replySeconds)) * 100 : 0}%`;
    this.timer.classList.toggle('low', f.secondsLeft <= 3);
  }

  /** Show the last frame of a scene that just ended (only when it says something new). Called by wire.ts. */
  showEnding(f: SceneFrame): void {
    if (f.phase !== 'ended' && !f.cut) return;
    if (!f.line || (f.line === this.lastTalk && !f.cut)) return;
    this.ending = { frame: f, left: this.endingSeconds };
    this.frame = null; this.sig = '';
    this.render({ ...f, options: [] });
    this.setOpen(true);
    this.timerFill.style.width = '0%';
  }

  /** Reply `n` (1-based). Returns true when it was sent. */
  pick(n: number): boolean {
    const f = this.frame;
    if (this.ending) { this.dismissEnding(); return true; }
    if (!f || f.phase !== 'talk') return false;
    const opt = f.options.find((x) => x.key === n);
    if (!opt || opt.disabled) return false;
    this.picks++;
    this.src.choose(n);
    // the pick may have ended the scene this very step: show what the scene says now
    const after = this.src.scene?.frame() ?? null;
    if (after && after.phase === 'talk') { this.frame = after; this.sel = 0; this.render(after); }
    return true;
  }

  back(): void { if (this.ending) this.dismissEnding(); }
  close(): void { if (this.ending) this.dismissEnding(); }

  dispose(): void { for (const f of this.off.splice(0)) f(); this.root.remove(); this.setOpen(false); }

  // ---------------------------------------------------------------------------------------------------------------

  private dismissEnding(): void {
    this.ending = null; this.sig = '';
    if (!this.src.scene) this.setOpen(false);
  }

  private setOpen(on: boolean): void {
    if (on === this.open) return;
    this.open = on;
    this.root.hidden = !on;
    setStoryPanelClass(this.doc, 'scene-open', on);
    this.o.panels?.sync();
  }

  private render(f: SceneFrame): void {
    const sig = JSON.stringify([f.who, f.line, f.options, f.phase, f.cut ?? '', (f.meters ?? []).map((m) => [m.label, Math.round(m.value * 10), m.max])]);
    this.root.classList.toggle('cut', !!f.cut);
    this.root.classList.toggle('ending', f.phase === 'ended');
    if (sig === this.sig) return;
    this.sig = sig;
    if (f.phase === 'talk') this.lastTalk = f.line;
    this.who.textContent = f.who;
    this.line.textContent = f.line;
    this.root.setAttribute('aria-label', f.who);
    this.meters.replaceChildren(...(f.meters ?? []).map((m) => this.meterEl(m)));
    this.meters.hidden = !f.meters?.length || !!f.cut;
    const d = this.doc;
    this.opts.replaceChildren(...f.options.map((o, i) => {
      const b = d.createElement('button');
      b.type = 'button'; b.className = 'scene-opt';
      b.disabled = !!o.disabled;
      b.dataset.key = String(o.key);
      const k = d.createElement('span'); k.className = 'scene-key'; k.textContent = String(o.key);
      const t = d.createElement('span'); t.className = 'scene-text'; t.textContent = o.text;
      b.append(k, t);
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.pick(o.key); });
      b.addEventListener('pointerenter', () => { this.sel = i; this.markSel(); });
      return b;
    }));
    this.opts.hidden = f.options.length === 0;
    this.timer.hidden = f.phase !== 'talk';
    this.sel = Math.min(this.sel, Math.max(0, f.options.length - 1));
    this.markSel();
    this.hint.textContent = f.phase === 'talk'
      ? (f.options.length ? `Press 1 to ${Math.min(9, f.options.length)}, or tap a reply. No answer is an answer.` : '')
      : 'Space or tap to go on.';
  }

  private meterEl(m: SceneMeter): HTMLElement {
    const d = this.doc;
    const row = d.createElement('div'); row.className = `scene-meter ${m.tone}`;
    const lab = d.createElement('span'); lab.className = 'scene-meter-label'; lab.textContent = m.label;
    const bar = d.createElement('span'); bar.className = 'scene-meter-bar';
    const fill = d.createElement('i');
    const share = m.max > 0 ? Math.max(0, Math.min(1, m.value / m.max)) : 0;
    fill.style.width = `${Math.round(share * 100)}%`;
    bar.setAttribute('role', 'meter'); bar.setAttribute('aria-label', m.label); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(m.max)); bar.setAttribute('aria-valuenow', String(Math.max(0, Math.round(m.value))));
    bar.appendChild(fill); row.append(lab, bar);
    return row;
  }

  private markSel(): void {
    [...this.opts.children].forEach((c, i) => c.classList.toggle('sel', i === this.sel));
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.open || e.repeat) return;
    const code = e.code, key = e.key;
    const digit = /^(Digit|Numpad)([1-9])$/.exec(code)?.[2] ?? (/^[1-9]$/.test(key) ? key : null);
    const eat = (): void => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (this.ending) {
      if (digit || code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || code === 'KeyF') { eat(); this.dismissEnding(); }
      return;
    }
    const f = this.frame;
    if (!f || f.phase !== 'talk') return;
    if (digit) { eat(); this.pick(Number(digit)); return; }
    const n = f.options.length;
    if (code === 'ArrowDown' || code === 'KeyS') { eat(); this.sel = (this.sel + 1) % Math.max(1, n); this.markSel(); }
    else if (code === 'ArrowUp' || code === 'KeyW') { eat(); this.sel = (this.sel + n - 1) % Math.max(1, n); this.markSel(); }
    else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyF') { eat(); const o = f.options[this.sel]; if (o) this.pick(o.key); }
  }

  /** Face buttons, edge only: a button already held when the card opens is ignored until released. */
  private pollPad(): void {
    let pads: ArrayLike<Gamepad | null | undefined> = [];
    try { pads = this.o.pads ? this.o.pads() : (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []); } catch { pads = []; }
    const pad = [...Array.from(pads)].find((p) => !!p);
    const down = PAD_FACE.map((i) => !!pad?.buttons?.[i]?.pressed);
    const fresh = down.map((v, i) => v && !this.held[i]);
    this.held = down;
    if (!this.open) return;
    const i = fresh.indexOf(true);
    if (i >= 0) this.pick(i + 1);
  }
}
