import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

/**
 * Two builds from one codebase (docs/swarm/PRD.md section 2.3):
 *  - default (`npm run build`, `npm run artifact`): everything inlined into dist/index.html (single-file artifact).
 *  - hosted  (`VITE_HOSTED=1`, `npm run build:hosted`): normal multi-file output with hashed assets, three.js in its own
 *    chunk, textures emitted as files (served and cached by the host) instead of base64 data URIs.
 */
const hosted = process.env.VITE_HOSTED === '1';

/** Installable web app (Chrome "Install", Safari "Add to Dock"): manifest + meta tags, hosted build only. The single-file artifact page is rebuilt from its title / styles / body by scripts/make-artifact.mjs and cannot carry them. */
const webAppTags = {
  name: 'gta-bedstuy-webapp-tags',
  transformIndexHtml: () => [
    { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' as const },
    { tag: 'meta', attrs: { name: 'theme-color', content: '#0b0b10' }, injectTo: 'head' as const },
    { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' as const },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' as const },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }, injectTo: 'head' as const },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Bed-Stuy' }, injectTo: 'head' as const },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }, injectTo: 'head' as const },
    { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: './icons/icon.svg' }, injectTo: 'head' as const },
  ],
};

/**
 * Lite single-file artifact (ENGINE, 11 Nov; docs/swarm/plans/stage14.md Phase 0): the world normal maps
 * (src/assets/textures/*_normal.jpg, ~3.5 MB as base64) are replaced by a 1x1 flat normal (128,128,255) in the single-file
 * build only. Hosted and native builds keep every map. What the artifact loses: brick, asphalt and roof surface relief
 * (the phone tier already strips normal maps at runtime).
 */
const FLAT_NORMAL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaPgPAAODAgAApfuJAAAAAElFTkSuQmCC';
const liteArtifactTextures = {
  name: 'gta-bedstuy-lite-artifact-textures',
  enforce: 'pre' as const,
  load(id: string) {
    if (/[\\/]src[\\/]assets[\\/]textures[\\/][a-z_]+_normal\.jpg$/.test(id.split('?')[0])) return `export default ${JSON.stringify(FLAT_NORMAL)};`;
    return null;
  },
};

export default defineConfig({
  // ra-nyc DJ-set API: same-origin proxy in dev and `vite preview` (the hosted build has the same rewrite in vercel.json)
  server: { proxy: { '/ra-api': { target: 'https://ra-nyc.vercel.app', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/ra-api/, '/api') } } },
  preview: { proxy: { '/ra-api': { target: 'https://ra-nyc.vercel.app', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/ra-api/, '/api') } } },
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  plugins: hosted ? [webAppTags] : [liteArtifactTextures, viteSingleFile()],
  build: hosted
    ? {
        target: 'es2022',
        assetsInlineLimit: 4096,
        cssCodeSplit: true,
        reportCompressedSize: false,
        chunkSizeWarningLimit: 1500,
        rolldownOptions: {
          output: {
            codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 10 }] },
            entryFileNames: 'assets/[name]-[hash].js',
            chunkFileNames: 'assets/[name]-[hash].js',
            assetFileNames: 'assets/[name]-[hash][extname]',
          },
        },
      }
    : { target: 'es2022', assetsInlineLimit: 100_000_000, cssCodeSplit: false, reportCompressedSize: false },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup-missions.ts'],
    testTimeout: 30_000,
  },
});
