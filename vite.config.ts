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

export default defineConfig({
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  plugins: hosted ? [] : [viteSingleFile()],
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
    testTimeout: 30_000,
  },
});
