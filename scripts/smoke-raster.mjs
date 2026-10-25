// Throwaway browser smoke driver: load the real OBJECT+coin.stl on the dev
// server, add a waterline op then a raster contour op, and verify generation
// runs clean in the real app (no console errors, summaries present).
// Lesson from 2026-10-25: this script must live INSIDE the repo tree for
// bare-import resolution of playwright-core.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const STL = '/home/alice/reprap/3D Printing/OBJECT+coin.stl';
const URL = process.argv[2] ?? 'http://localhost:5173/';

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  // favicon 404s are dev-server noise, not app errors
  if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(`console.error: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !/favicon/i.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('div.viewport', { timeout: 10000 });

// Drop the coin STL onto the viewport (DataTransfer dispatch — real files,
// so the loader reads actual bytes; vite serves it from public/).
const bytes = readFileSync(STL);
const b64 = bytes.toString('base64');
await page.evaluate(
  async ({ b64 }) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'coin.stl');
    const dt = new DataTransfer();
    dt.items.add(file);
    const vp = document.querySelector('div.viewport');
    vp.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  },
  { b64 },
);

// wait for the model to load + features to detect (spinner-free heuristic:
// the Model tab lists a loaded model name)
await page.waitForFunction(
  () => document.body.innerText.includes('coin.stl') || document.body.innerText.includes('OBJECT'),
  null,
  { timeout: 60000 },
);
const t0 = Date.now();
await page.waitForFunction(
  () => document.body.innerText.match(/loaded|triangles|mesh/i) !== null,
  null,
  { timeout: 120000 },
);
console.log(`model loaded+detect: ${Date.now() - t0}ms`);

// Add a waterline op first (the raster assumes the rough ran — and we want
// the deep-plunge warning NOT to fire on top of a rough). Match the
// GENERATED summary ("N waterline level(s), M passes"), not the hint text.
await page.click('nav.tabs button:has-text("Ops")');
await page.click('section.ops button:has-text("+ Add toolpath")');
await page.selectOption('select.op-kind', 'waterline');
// generation only runs on Recalculate (by design — no auto-recalc effect)
await page.click('section.ops .buttons button:has-text("Recalculate")');
await page.waitForFunction(
  () => /waterline level\(s\), \d+ passes/.test(document.body.innerText),
  null,
  { timeout: 120000 },
);
console.log('waterline summary:', await page.textContent('section.ops .op-body .hint'));

// Add the raster contour op
await page.click('section.ops button:has-text("+ Add toolpath")');
const kindSelects = await page.$$('select.op-kind');
await kindSelects[kindSelects.length - 1].selectOption('rasterContour');
const t1 = Date.now();
await page.click('section.ops .buttons button:has-text("Recalculate")');
await page.waitForFunction(
  () => /raster row\(s\)/.test(document.body.innerText),
  null,
  { timeout: 300000 },
);
console.log(`raster generation: ${Date.now() - t1}ms`);
// print the op summaries
const summaries = await page.$$eval('section.ops .op-body .hint', (els) =>
  els.map((e) => e.textContent),
);
for (const s of summaries) console.log('  summary:', s);

// Row angle: set 90 on the LAST raster op, recalc, expect "rows at 90°".
// NumberField commits on plain onChange, so fill() is enough; find the
// field by its label text inside the LAST expanded op body.
const angleInput = await page.$('section.ops .op-body label:has-text("Row angle") input');
if (angleInput) {
  await angleInput.fill('90');
  await page.click('section.ops .buttons button:has-text("Recalculate")');
  await page.waitForFunction(
    () => /rows at 90°/.test(document.body.innerText),
    null,
    { timeout: 300000 },
  );
  const summaries90 = await page.$$eval('section.ops .op-body .hint', (els) =>
    els.map((e) => e.textContent),
  );
  for (const s of summaries90) if (s && s.includes('rows at 90°')) console.log('  summary@90°:', s);
} else {
  console.log('WARN: Row angle field not found');
}

const stlInfo = await page.evaluate(() => {
  const t = document.body.innerText;
  const m = t.match(/(\d[\d,]*)\s*triangle/i);
  return m ? m[1] : 'n/a';
});
console.log('triangles:', stlInfo);
console.log('console errors:', errors.length === 0 ? 'none' : errors.join(' | '));
await page.screenshot({ path: '/tmp/raster-coin.png' });
console.log('screenshot: /tmp/raster-coin.png');

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
