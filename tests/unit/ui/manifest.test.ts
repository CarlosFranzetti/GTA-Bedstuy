import { describe, it, expect } from 'vitest';
import manifestText from '../../../public/manifest.webmanifest?raw';
import viteConfig from '../../../vite.config.ts?raw';
import indexHtml from '../../../index.html?raw';

const manifest = JSON.parse(manifestText);
const iconFiles = import.meta.glob('../../../public/icons/*', { query: '?url', import: 'default', eager: false });
const hasFile = (src: string): boolean => Object.keys(iconFiles).some((k) => k.endsWith(`/public/${src}`));

describe('web app manifest', () => {
  it('has the fields an installable app needs', () => {
    for (const k of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']) expect(manifest[k], k).toBeTruthy();
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.display_override).toEqual(['fullscreen', 'standalone']);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('lists 192 and 512 icons, any and maskable, and every file exists', () => {
    const has = (size: string, purpose: string) => manifest.icons.some((i: { sizes: string; purpose?: string; type: string }) => i.sizes === size && (i.purpose ?? 'any') === purpose && i.type === 'image/png');
    for (const s of ['192x192', '512x512']) { expect(has(s, 'any'), `any ${s}`).toBe(true); expect(has(s, 'maskable'), `maskable ${s}`).toBe(true); }
    for (const i of manifest.icons) expect(hasFile(i.src), i.src).toBe(true);
    expect(hasFile('icons/apple-touch-icon.png')).toBe(true);
  });
  it('is only linked from the hosted build (the single-file artifact cannot carry it)', () => {
    expect(viteConfig).toMatch(/plugins: hosted \? \[webAppTags\]/);
    expect(indexHtml).not.toMatch(/manifest/);
  });
});
