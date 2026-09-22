import { defineConfig } from 'tsup';

// The repo is unpublished (CI-only): tsup exists to (a) give the `build` CI gate a
// real bundle to compile, and (b) produce the `dist/bin/screenshots.js` the
// screenshots reusable workflow runs after checking this repo out at its pinned
// SHA. `playwright` is left external so the runtime resolves the installed browser
// driver from node_modules rather than bundling it.
export default defineConfig({
  entry: ['src/index.ts', 'src/bin/screenshots.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  external: ['playwright'],
});
