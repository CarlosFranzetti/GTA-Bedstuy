/**
 * `?debug=gfx` overlay: what the renderer really is (GPU string, tier, DPR, buffer size, active passes, context losses) and one
 * checkbox per pass / LOD system, so a person who sees a glitch on real hardware can switch things off one by one and tell us
 * which one it was. Everything is injected, nothing here touches the scene by itself; main.ts wires the toggles.
 */
import type { GpuProfile } from './GpuProfile';

export interface GfxToggle { id: string; label: string; get(): boolean; set(on: boolean): void }

export interface GfxDebugSource {
  rendererString: string;
  profile: GpuProfile;
  tier: () => string;
  pixelRatio: () => number;
  /** drawing-buffer size in device px */
  bufferSize: () => { w: number; h: number };
  activePasses: () => string[];
  contextLosses?: () => number;
  /** fps and draws, if known */
  stats?: () => Record<string, number>;
  toggles: GfxToggle[];
}

export function gfxDebugRequested(search: string): boolean {
  try { return new URLSearchParams(search).get('debug') === 'gfx'; } catch { return false; }
}

/** Plain-text report lines (also what "Copy report" puts on the clipboard). */
export function describeGfx(s: GfxDebugSource): string[] {
  const b = s.bufferSize();
  const lines = [
    `renderer: ${s.rendererString || '(unknown)'}`,
    `os ${s.profile.os} · gpu ${s.profile.gpu} · profile tier ${s.profile.tier}${s.profile.native ? ' · native app' : ''} (${s.profile.reason})`,
    `tier now: ${s.tier()} · dpr ${s.pixelRatio().toFixed(2)} (device ${typeof devicePixelRatio === 'number' ? devicePixelRatio : '?'}) · buffer ${b.w}x${b.h}`,
    `passes: ${s.activePasses().join(' > ') || '(none)'}`,
    `context losses: ${s.contextLosses?.() ?? 0}`,
  ];
  const st = s.stats?.();
  if (st) lines.push(Object.entries(st).map(([k, v]) => `${k} ${Math.round(v * 10) / 10}`).join(' · '));
  const off = s.toggles.filter((t) => !t.get()).map((t) => t.id);
  lines.push(`switched off: ${off.length ? off.join(', ') : 'nothing'}`);
  return lines;
}

export function mountGfxDebug(parent: HTMLElement, s: GfxDebugSource): { dispose(): void } {
  const root = document.createElement('div');
  root.setAttribute('data-gfx-debug', '');
  root.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;max-width:min(440px,92vw);max-height:92vh;overflow:auto;padding:8px 10px;background:rgba(8,10,14,.86);color:#cfe;font:11px/1.35 ui-monospace,Menlo,monospace;border:1px solid #356;border-radius:6px;pointer-events:auto';
  const pre = document.createElement('pre'); pre.style.cssText = 'margin:0 0 6px;white-space:pre-wrap';
  const list = document.createElement('div'); list.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:2px 10px';
  const copy = document.createElement('button'); copy.textContent = 'Copy report'; copy.style.cssText = 'margin-top:6px;font:inherit';
  const boxes: Array<[GfxToggle, HTMLInputElement]> = [];
  for (const t of s.toggles) {
    const l = document.createElement('label'); l.style.cssText = 'display:flex;gap:4px;align-items:center;cursor:pointer';
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = t.get();
    c.addEventListener('change', () => { t.set(c.checked); refresh(); });
    l.append(c, document.createTextNode(t.label)); list.append(l); boxes.push([t, c]);
  }
  const refresh = (): void => { pre.textContent = describeGfx(s).join('\n'); for (const [t, c] of boxes) c.checked = t.get(); };
  copy.addEventListener('click', () => { try { void navigator.clipboard.writeText(describeGfx(s).join('\n')); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select the text above'; } });
  // keep key presses inside the panel from steering the game
  root.addEventListener('keydown', (e) => e.stopPropagation());
  root.append(pre, list, copy); parent.append(root);
  refresh();
  const timer = setInterval(refresh, 1000);
  return { dispose(): void { clearInterval(timer); root.remove(); } };
}

/** Standard toggle for a boolean flag that lives in the caller's closure. */
export function flagToggle(id: string, label: string, get: () => boolean, set: (on: boolean) => void): GfxToggle { return { id, label, get, set }; }
