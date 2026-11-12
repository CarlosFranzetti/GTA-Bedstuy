// "Copy graphics report": plain text a person can paste into a message. Pure formatting (unit tested); main.ts gathers the facts.
export interface GfxFacts {
  app: string;
  versions: Record<string, string>;
  platform: string;
  arch: string;
  angle: string;
  switches: string[];
  fullscreen: boolean;
  displays: Array<{ w: number; h: number; scale: number; hz: number }>;
  gpuDevices: Array<{ vendorId?: number; deviceId?: number; active?: boolean; driverVersion?: string; deviceString?: string }>;
  featureStatus: Record<string, string>;
  page: { renderer?: string; vendor?: string; version?: string; overlay?: string; dpr?: number; innerWidth?: number; innerHeight?: number; error?: string } | null;
}

export function formatGraphicsReport(f: GfxFacts): string {
  const L: string[] = [];
  L.push(`${f.app} graphics report`);
  L.push(`os ${f.platform} ${f.arch} · ${Object.entries(f.versions).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  L.push(`angle backend: ${f.angle} · full screen: ${f.fullscreen ? 'yes' : 'no'} · switches: ${f.switches.join(' ') || '(none)'}`);
  L.push(`displays: ${f.displays.map((d) => `${d.w}x${d.h} @${d.scale}x ${d.hz}Hz`).join(' | ') || '(unknown)'}`);
  if (f.page?.error) L.push(`page: could not read (${f.page.error})`);
  else if (f.page) {
    L.push(`webgl renderer: ${f.page.renderer || '(unknown)'}`);
    L.push(`webgl vendor: ${f.page.vendor || '(unknown)'} · ${f.page.version || ''}`.trim());
    L.push(`window ${f.page.innerWidth}x${f.page.innerHeight} css px · devicePixelRatio ${f.page.dpr}`);
    if (f.page.overlay) L.push('--- game overlay ---', f.page.overlay.trim(), '--- end overlay ---');
    else L.push('(start the app with --debug-gfx to include the game overlay: tier, passes, buffer size)');
  }
  for (const g of f.gpuDevices) {
    L.push(`gpu: ${g.deviceString || '(unnamed)'} · vendor 0x${(g.vendorId ?? 0).toString(16)} device 0x${(g.deviceId ?? 0).toString(16)}${g.driverVersion ? ` · driver ${g.driverVersion}` : ''}${g.active ? ' · active' : ''}`);
  }
  const bad = Object.entries(f.featureStatus).filter(([, v]) => !/^enabled/.test(v));
  L.push(`gpu features not plainly enabled: ${bad.length ? bad.map(([k, v]) => `${k}=${v}`).join(', ') : 'none'}`);
  return L.join('\n');
}
