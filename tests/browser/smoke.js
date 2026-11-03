// Prova sul sito PUBBLICATO (Pages): carica viz/all/ e controlla dati, altezze degli iframe, errori in console.
// Uso: node tests/browser/smoke.js https://<utente>.github.io/<repo> [cartella_screenshot]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = (process.argv[2] || '').replace(/\/$/, '');
const OUT = process.argv[3] || 'smoke_out';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { base: BASE, checks: [] };
  const ok = (n, c, x = '') => { report.checks.push({ n, ok: !!c, x }); console.log((c ? '  ok   ' : '  FAIL ') + n + (x ? ' – ' + x : '')); };
  const browser = await chromium.launch();
  for (const w of [1200, 768, 375]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(e.message));
    const failedReq = []; page.on('requestfailed', r => failedReq.push(r.url()));
    page.on('response', r => { if (r.status() >= 400) failedReq.push(r.status() + ' ' + r.url()); });
    await page.goto(BASE + '/viz/all/', { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);
    for (const f of await page.$$('iframe')) { await f.scrollIntoViewIfNeeded(); await page.waitForTimeout(1200); }
    await page.waitForTimeout(1500);
    const frames = await page.$$('iframe');
    const names = ['balance', 'map-states', 'map-house', 'house-list'];
    for (let i = 0; i < frames.length; i++) {
      const fr = await frames[i].contentFrame();
      const text = await fr.evaluate(() => document.body.innerText);
      const real = await fr.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
      const ih = Math.round((await frames[i].boundingBox()).height);
      ok(`${names[i]}@${w}: contenuto caricato (non "Dati non disponibili")`, text.length > 100 && !/Dati non disponibili/.test(text), text.slice(0, 60).replace(/\n/g, ' '));
      ok(`${names[i]}@${w}: altezza iframe = contenuto`, Math.abs(ih - real) <= 2, `iframe ${ih}, contenuto ${real}`);
      const sw = await fr.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      ok(`${names[i]}@${w}: nessuno scroll orizzontale`, sw);
    }
    const bal = await (await frames[0].contentFrame()).evaluate(() => document.body.innerText);
    ok(`balance@${w}: 435 seggi / 35 su 100 / 36 su 50`, /435 seggi in palio/.test(bal) && /35 seggi su 100/.test(bal) && /36 gare su 50/.test(bal));
    ok(`balance@${w}: fonte e disclaimer`, /Fonte: civicAPI \(civicapi\.org\)/.test(bal) && /Risultati non ufficiali/.test(bal));
    ok(`${w}: nessun errore in console / richieste fallite`, errs.length === 0 && failedReq.length === 0, (errs.concat(failedReq)).slice(0, 3).join(' | '));
    await page.screenshot({ path: path.join(OUT, `all-${w}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const bad = report.checks.filter(c => !c.ok).length;
  console.log(`${report.checks.length - bad}/${report.checks.length} ok`);
  process.exit(bad ? 1 : 0);
})();
