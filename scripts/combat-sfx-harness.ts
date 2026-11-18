// Browser-side offline render of the combat sounds (bundled by scripts/combat-sfx-render.mjs).
import { CombatSfx } from '../src/game/combat/sfx';

const SR = 44100;
type Name = 'whoosh' | 'punch' | 'punchHeavy' | 'thud' | 'carThud' | 'glass' | 'crack' | 'tick' | 'click' | 'reload' | 'pickup' | 'throwAway';
const SECONDS: Record<Name, number> = { whoosh: 0.6, punch: 0.6, punchHeavy: 0.6, thud: 0.6, carThud: 0.7, glass: 0.9, crack: 1.2, tick: 0.5, click: 0.5, reload: 1.8, pickup: 0.8, throwAway: 0.6 };

function wav(x: Float32Array): string {
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), true);
  const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

async function render(name: Name, trim = 1): Promise<{ name: string; wav: string; peakDb: number; raw: number[] }> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * SECONDS[name]), SR);
  const sfx = new CombatSfx(() => ({ ctx: ctx as unknown as AudioContext, dest: ctx.destination }));
  if (name === 'punchHeavy') sfx.punch(true); else if (name === 'punch') sfx.punch(false);
  else (sfx as unknown as Record<string, () => void>)[name]();
  const buf = await ctx.startRendering();
  const x = buf.getChannelData(0).slice();
  if (trim !== 1) for (let i = 0; i < x.length; i++) x[i] *= trim;
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  return { name, wav: wav(x), peakDb: 20 * Math.log10(pk + 1e-9), raw: [] };
}

(window as unknown as { combatSfx: unknown }).combatSfx = {
  names: Object.keys(SECONDS) as Name[],
  render,
};
