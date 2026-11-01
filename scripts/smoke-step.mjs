// Throwaway browser smoke driver: drop a REAL STEP fixture (the occt
// package's own 10mm cube) on the dev server and verify the full browser
// path that neither vitest nor the build exercises — the lazy
// dynamic-import + 7.6 MB wasm fetch, OCCT parse in a page context, the
// model slot landing with correct dims — plus the honest failure path
// on a garbage file. Zero console/HTTP errors is the pass bar (favicon
// 404s are dev-server noise). Must live INSIDE the repo tree for
// playwright-core bare-import resolution (2026-10-25 lesson).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const URL = process.argv[2] ?? 'http://localhost:5173/';
const FIXTURE = require.resolve('occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.stp');

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // Chrome's automatic /favicon.ico 404 never reaches the response
  // listener (browser-internal) and carries no URL in the console text —
  // real asset 404s DO fire the response listener below, which stays
  // strict. (Same noise as every prior smoke; public/ has no favicon.)
  if (/favicon/i.test(m.text())) return;
  if (/^Failed to load resource.*404/.test(m.text())) return;
  errors.push(`console.error: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !/favicon/i.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('div.viewport', { timeout: 10000 });

// real File from the fixture bytes, dropped via DataTransfer (the raster
// smoke's pattern — the loader reads actual bytes, no public/ copy needed)
const dropFile = async (path, name) => {
  const b64 = readFileSync(path).toString('base64');
  await page.evaluate(
    async ({ b64, name }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], name);
      const dt = new DataTransfer();
      dt.items.add(file);
      document.querySelector('div.viewport').dispatchEvent(
        new DragEvent('drop', { bubbles: true, dataTransfer: dt }),
      );
    },
    { b64, name },
  );
};

const t0 = Date.now();
await dropFile(FIXTURE, 'Cube 10x10.stp');
// the Model tab lists the model name + scaled dims once geometry lands
await page.waitForFunction(
  () =>
    document.body.innerText.includes('Cube 10x10') &&
    /loaded · 10\.0 × 10\.0 × 10\.0 mm/.test(document.body.innerText),
  null,
  { timeout: 60000 }, // first drop boots the wasm (dev server, no gzip)
);
console.log(`STEP drop → model loaded (wasm boot + parse + detect): ${Date.now() - t0}ms`);

// failure path: a garbage .step must show the honest import error, not crash
await dropFile(require.resolve('occt-import-js/test/testfiles/cax-if/source.txt'), 'garbage.step');
await page.waitForFunction(
  () => /could not import STEP/.test(document.body.innerText),
  null,
  { timeout: 20000 },
);
console.log('garbage .step → honest error shown');

console.log(errors.length === 0 ? 'SMOKE PASS — zero console/http errors' : `SMOKE FAIL:\n${errors.join('\n')}`);
await browser.close();
process.exit(errors.length === 0 ? 0 : 1);