/**
 * Bundles the Electron main process and preload script with esbuild.
 * Output is CommonJS (.cjs) because package.json sets "type": "module".
 */
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info'
};

await rm('dist-electron', { recursive: true, force: true });

await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs'
});

await build({
  ...shared,
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.cjs'
});

console.log('electron bundles written to dist-electron/');
