/**
 * The project has no @types/node (tsconfig `types` is vite/client only, and the browser build must not see Node globals).
 * Tests run under Node through vitest and use a handful of built-ins; declare just those so `tsc --noEmit` stays clean.
 * Add a name here when a test needs another one. Nothing under src/ is affected (this file is only reachable from tests).
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function readFileSync(path: string): { length: number; buffer: ArrayBuffer; byteOffset: number; byteLength: number } & Uint8Array;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function appendFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { size: number; isFile(): boolean; isDirectory(): boolean };
}
declare module 'node:path' {
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export const sep: string;
  export const posix: { sep: string; join(...parts: string[]): string; resolve(...parts: string[]): string; normalize(p: string): string };
}
declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
  memoryUsage(): { rss: number; heapUsed: number; heapTotal: number };
  getBuiltinModule(id: string): unknown;
};
declare const __dirname: string;
interface ImportMeta { readonly dirname: string; readonly filename: string }
