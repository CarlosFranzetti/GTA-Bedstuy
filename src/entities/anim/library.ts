import { CORE_PACK_B64 } from './corePack';
import { decodeBase64, decodePack, type Clip } from './clipPack';

/**
 * The clip library. The core pack is bundled in every build (about 20 kB as text; the single-file build carries nothing more).
 * The street pack (extra walk styles, phone and second idle, stumble, sit down and stand up) is a file next to the page and is
 * fetched only where a file can be served: the hosted and native builds. Without it everything keeps working with the core clips
 * and the procedural poses.
 */
export class ClipLibrary {
  private readonly clips = new Map<string, Clip>();
  streetLoaded = false;

  constructor(core: Clip[] = []) { for (const c of core) this.clips.set(c.name, c); }

  static fromCore(): ClipLibrary { return new ClipLibrary(decodePack(decodeBase64(CORE_PACK_B64))); }

  get(name: string): Clip | undefined { return this.clips.get(name); }
  has(name: string): boolean { return this.clips.has(name); }
  get names(): string[] { return [...this.clips.keys()]; }
  add(clips: Clip[]): void { for (const c of clips) this.clips.set(c.name, c); }

  /** Fetch the street pack. Resolves true when it loaded; any failure (offline, single-file page, 404) leaves the library as it was. */
  async loadStreet(url = streetUrl(), fetchFn: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined): Promise<boolean> {
    if (this.streetLoaded) return true;
    if (!url || !fetchFn) return false;
    try {
      const res = await fetchFn(url);
      if (!res.ok) return false;
      this.add(decodePack(new Uint8Array(await res.arrayBuffer())));
      this.streetLoaded = true;
      return true;
    } catch { return false; }
  }
}

/** Where the street pack lives, or '' in the single-file build (no file to fetch there). */
export function streetUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    if (env?.VITE_HOSTED !== '1') return '';
    return `${env.BASE_URL ?? './'}anim/street.bin`;
  } catch { return ''; }
}

let shared: ClipLibrary | null = null;
/** The one library every character uses (decoded on first use). */
export function clipLibrary(): ClipLibrary {
  if (!shared) { shared = ClipLibrary.fromCore(); void shared.loadStreet(); } // hosted and native: the street pack arrives a moment later
  return shared;
}
/** Test seam: replace or reset the shared library. */
export function setClipLibrary(lib: ClipLibrary | null): void { shared = lib; }
