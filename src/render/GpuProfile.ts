/**
 * Device -> default graphics tier. Pure: `classifyGpu` takes the strings a browser exposes (WebGL renderer string, UA, platform,
 * touch points, cores, memory) so it is tested over recorded values. Browser access is isolated in `readGpuInfo`.
 *
 * Rules (FLICKER lane, 11 Nov):
 *  - iPhone / iPad / Android (incl. iPadOS pretending to be a Mac) -> `phone` (reduced world by design).
 *  - Apple Silicon Macs (Chrome/Firefox: "ANGLE Metal Renderer: Apple M4"; Safari only says "Apple GPU" on a Mac without touch) -> `high`,
 *    pixel ratio 1.5 (M1/M2/M3 base) to 1.75 (M4+, Pro/Max/Ultra), SMAA on.
 *  - Windows / Linux through ANGLE D3D11 / GL: discrete NVIDIA RTX, GTX >= 1060, AMD RX >= 5500 and Intel Arc A-series -> `high`;
 *    older discrete (GTX 1050, RX 5xx, MX) and integrated Iris Xe / Arc iGPU / Radeon Graphics -> `medium`;
 *    Intel UHD / HD Graphics and software renderers (SwiftShader, llvmpipe, Basic Render Driver) -> `low`.
 *  - Anything unrecognised on a desktop -> `medium` (the previous default).
 * The tier is only the starting point: ?q=, a saved Menu choice and PerfMonitor's one-way auto drop still win.
 */
import type { Quality } from './Shadows';

export interface GpuInfo {
  /** UNMASKED_RENDERER_WEBGL, or RENDERER when the debug extension is missing */
  renderer: string;
  /** navigator.userAgent */
  userAgent?: string;
  /** navigator.platform */
  platform?: string;
  /** navigator.maxTouchPoints */
  maxTouchPoints?: number;
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** navigator.deviceMemory (GB, Chromium only, capped at 8) */
  memoryGB?: number;
}

export type OsKind = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'other';
export type GpuClass =
  | 'apple-silicon' | 'apple-mobile' | 'nvidia-discrete' | 'nvidia-legacy' | 'amd-discrete' | 'amd-legacy' | 'amd-integrated'
  | 'intel-arc' | 'intel-integrated' | 'intel-legacy' | 'adreno' | 'mali' | 'software' | 'unknown';

export interface GpuProfile {
  os: OsKind;
  gpu: GpuClass;
  /** starting tier */
  tier: Quality;
  /** device pixel ratio ceiling for the profile (only ever lowers the tier's own cap) */
  maxPixelRatio: number;
  /** drawing-buffer width ceiling (px): a 5K display at DPR 2 must not become a 10 MP post chain */
  maxBufferWidth: number;
  /** SMAA is the AA of the chain; canvas MSAA only multisamples the final quad, so it is always off */
  smaa: boolean;
  /** WebGL context attributes to pass to the renderer */
  contextAttributes: { antialias: false; alpha: false; powerPreference: 'high-performance' | 'default' };
  /** why, for logs and the debug overlay */
  reason: string;
}

export function detectOs(i: Pick<GpuInfo, 'userAgent' | 'platform' | 'maxTouchPoints'>): OsKind {
  const ua = i.userAgent ?? '', pf = i.platform ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports a Macintosh UA and platform "MacIntel", but has touch points; no Mac does.
  if (/Mac/i.test(pf + ua) && (i.maxTouchPoints ?? 0) > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Win/i.test(pf) || /Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(pf) || /Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Linux|X11|CrOS/i.test(pf + ua)) return 'linux';
  return 'other';
}

const num = (s: string | undefined): number => (s ? parseInt(s, 10) : NaN);

/** Classify the renderer string (ANGLE wrappers, "Apple M2 Pro", "NVIDIA GeForce RTX 4070", "Adreno (TM) 740"...). */
export function classifyRenderer(raw: string, os: OsKind): { gpu: GpuClass; tier: Quality; reason: string; m?: number; big?: boolean } {
  const r = raw.replace(/\s+/g, ' ').trim();
  if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render|Microsoft Basic|Mesa OffScreen|Lavapipe/i.test(r)) return { gpu: 'software', tier: 'low', reason: 'software rasteriser' };

  const apple = /Apple\s+(M(\d+)(?:\s+(Pro|Max|Ultra))?)\b/i.exec(r);
  if (apple) return { gpu: 'apple-silicon', tier: 'high', reason: apple[1], m: Number(apple[2]), big: !!apple[3] };
  if (/Apple\s+A\d+|Apple GPU/i.test(r)) return { gpu: os === 'mac' ? 'apple-silicon' : 'apple-mobile', tier: os === 'mac' ? 'high' : 'phone', reason: 'Apple GPU (masked model)' };

  if (/Adreno/i.test(r)) {
    const wos = /X\d|X1/i.test(r); // Snapdragon X laptops: "Adreno(TM) X1-85 GPU"
    return wos && os !== 'android' ? { gpu: 'adreno', tier: 'medium', reason: 'Snapdragon X Adreno' } : { gpu: 'adreno', tier: 'phone', reason: 'Adreno' };
  }
  if (/Mali|PowerVR|Immortalis|Videocore/i.test(r)) return { gpu: 'mali', tier: 'phone', reason: 'mobile GPU' };

  if (/NVIDIA|GeForce|Quadro|Tesla/i.test(r)) {
    if (/RTX|\bA\d{3,4}\b|Quadro RTX|Titan/i.test(r)) return { gpu: 'nvidia-discrete', tier: 'high', reason: 'NVIDIA RTX class' };
    const gtx = /GTX\s*(?:TITAN\s*)?(\d{3,4})/i.exec(r);
    if (gtx) {
      const n = num(gtx[1]);
      const strong = (n >= 1060 && n < 1600) || n >= 1660 || (n >= 970 && n < 1000);
      return strong ? { gpu: 'nvidia-discrete', tier: 'high', reason: `GTX ${n}` } : { gpu: 'nvidia-legacy', tier: 'medium', reason: `GTX ${n}` };
    }
    return { gpu: 'nvidia-legacy', tier: 'medium', reason: 'older NVIDIA (MX/GT)' };
  }

  if (/Intel/i.test(r)) {
    if (/Arc\W*\(?TM\)?\W*A\d{3}/i.test(r) || /\bArc\b.*\bA\d{3}\b/i.test(r)) return { gpu: 'intel-arc', tier: 'high', reason: 'Intel Arc discrete' };
    if (/\bArc\b|Iris Xe|Iris\(R\) Xe|Iris Plus|Iris Pro|Iris\(TM\) Plus/i.test(r)) return { gpu: 'intel-integrated', tier: 'medium', reason: 'Intel Iris / Arc iGPU' };
    return { gpu: 'intel-legacy', tier: 'low', reason: 'Intel UHD / HD' };
  }

  if (/AMD|Radeon|ATI/i.test(r)) {
    const rx = /\b(?:RX|PRO W|Pro W|Radeon Pro)\s*(\d{3,4})/i.exec(r);
    if (rx) {
      const n = num(rx[1]);
      return n >= 5500 ? { gpu: 'amd-discrete', tier: 'high', reason: `Radeon RX ${n}` } : { gpu: 'amd-legacy', tier: 'medium', reason: `Radeon RX ${n}` };
    }
    if (/Vega|Radeon\(TM\) Graphics|Radeon Graphics|\d{3}M\b|\bR[3579]\b/i.test(r)) return { gpu: 'amd-integrated', tier: 'medium', reason: 'Radeon iGPU' };
    if (/Radeon (?:Pro|VII)/i.test(r)) return { gpu: 'amd-discrete', tier: 'high', reason: 'Radeon Pro / VII' };
    return { gpu: 'amd-legacy', tier: 'medium', reason: 'older Radeon' };
  }

  return { gpu: 'unknown', tier: 'medium', reason: 'unrecognised renderer' };
}

const STRONG: Pick<GpuProfile, 'maxBufferWidth'> = { maxBufferWidth: 3840 };

export function classifyGpu(info: GpuInfo): GpuProfile {
  const os = detectOs(info);
  const base = { os, smaa: true, contextAttributes: { antialias: false as const, alpha: false as const, powerPreference: 'high-performance' as const } };

  if (os === 'ios' || os === 'android') {
    return { ...base, gpu: /Apple/i.test(info.renderer) ? 'apple-mobile' : /Adreno/i.test(info.renderer) ? 'adreno' : 'mali', tier: 'phone', maxPixelRatio: 1, maxBufferWidth: 720, smaa: false,
      contextAttributes: { ...base.contextAttributes, powerPreference: 'default' }, reason: `${os} handheld: reduced world by design` };
  }

  const c = classifyRenderer(info.renderer, os);
  let tier = c.tier;
  let maxPixelRatio = 1.75;
  let maxBufferWidth = STRONG.maxBufferWidth;
  let reason = `${c.reason} on ${os}`;

  if (c.gpu === 'apple-silicon') {
    // M4 and the Pro / Max / Ultra parts hold 1.75; base M1-M3 start at 1.5 (a Retina 2x post chain is 78% more pixels)
    const strong = c.m !== undefined && (c.m >= 4 || !!c.big);
    maxPixelRatio = c.m === undefined ? ((info.cores ?? 8) >= 10 ? 1.75 : 1.5) : strong ? 1.75 : 1.5;
    if (c.m === undefined && (info.cores ?? 8) < 8) tier = 'medium'; // a masked GPU on a weak 4-core machine is more likely an old Intel Mac
  } else if (c.gpu === 'software') {
    maxPixelRatio = 1; maxBufferWidth = 1280; base.smaa = false;
  } else if (tier === 'high') {
    maxPixelRatio = 1.75;
  } else if (tier === 'medium') {
    maxPixelRatio = c.gpu === 'intel-integrated' || c.gpu === 'amd-integrated' ? 1.25 : 1.5; maxBufferWidth = 2560;
  } else if (tier === 'low') {
    maxPixelRatio = 1; maxBufferWidth = 1920;
  }
  // low-memory / few-core machines never start above medium
  if (tier === 'high' && ((info.memoryGB !== undefined && info.memoryGB < 4) || (info.cores !== undefined && info.cores < 4))) { tier = 'medium'; reason += ' (few cores / little memory)'; }

  return { ...base, smaa: base.smaa && tier !== 'low', gpu: c.gpu, tier, maxPixelRatio, maxBufferWidth, reason };
}

/** Final renderer pixel ratio: the tier's own ratio, further lowered by the profile. */
export function profilePixelRatio(tierRatio: number, p: Pick<GpuProfile, 'maxPixelRatio' | 'maxBufferWidth'>, cssWidth: number): number {
  const byWidth = cssWidth > 0 ? p.maxBufferWidth / cssWidth : Infinity;
  return Math.max(0.25, Math.min(tierRatio, p.maxPixelRatio, byWidth));
}

/** Reads the strings from the live browser. Creates and releases a throwaway WebGL context; never throws. */
export function readGpuInfo(): GpuInfo {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const info: GpuInfo = {
    renderer: '', userAgent: nav?.userAgent, platform: nav?.platform, maxTouchPoints: nav?.maxTouchPoints,
    cores: nav?.hardwareConcurrency, memoryGB: (nav as unknown as { deviceMemory?: number } | undefined)?.deviceMemory,
  };
  try {
    if (typeof document === 'undefined') return info;
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return info;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    info.renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* blocked or unsupported: the empty renderer classifies as unknown -> medium */ }
  return info;
}
