// Test con browser headless (Playwright): larghezze, scroll orizzontale, altezza via postMessage, tooltip, console.
// Uso: node tests/browser/run.js [porta]   (serve la cartella del repository)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'tests', 'screenshots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.topojson': 'application/json', '.svg': 'image/svg+xml' };
const WIDTHS = [1200, 1000, 999, 768, 470, 469, 375, 320];
const EMBEDS = ['balance', 'map-states', 'house-list', 'map-house'];
const results = []; let failures = 0;

function serve(port) {
  return new Promise(res => {
    const s = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('404'); }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(port, () => res(s));
  });
}
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); if (!cond) failures++; console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? ' – ' + extra : '')); };

async function inFrame(page) { const h = await page.$('#f1'); return h.contentFrame(); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const port = +process.argv[2] || 8123;
  const server = await serve(port);
  const browser = await chromium.launch();
  for (const embed of EMBEDS) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      const tag = `${embed}@${w}`;
      await page.goto(`http://localhost:${port}/tests/browser/host.html?src=/viz/${embed}/index.html`);
      const fr = await inFrame(page);
      await fr.waitForFunction(() => document.body.innerText.length > 80 && !/Caricamento/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(900);
      // 1) nessuno scroll orizzontale (documento dell'embed e pagina ospite)
      const sc = await fr.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      ok(`${tag}: nessuno scroll orizzontale`, sc.sw <= sc.cw + 1, `scrollWidth ${sc.sw} / ${sc.cw}`);
      // 2) altezza inviata e coerente con l'altezza reale
      const msgs = await page.evaluate(() => window.__msgs);
      const real = await fr.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
      const ifh = await page.evaluate(() => Math.round(document.getElementById('f1').getBoundingClientRect().height));
      ok(`${tag}: postMessage di altezza inviato`, msgs.length > 0, `${msgs.length} messaggi`);
      ok(`${tag}: altezza iframe = altezza contenuto`, msgs.length && Math.abs(ifh - real) <= 2 && Math.abs(msgs[msgs.length - 1].h - real) <= 2, `iframe ${ifh}, contenuto ${real}`);
      ok(`${tag}: nessun 100vh (altezza non legata alla finestra)`, await fr.evaluate(() => { const s = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules].map(r => r.cssText); } catch (e) { return []; } }).join(' '); return !/100vh|100vw/.test(s); }));
      // 3) tooltip dentro l'area dell'iframe
      let tipSel = null;
      if (embed === 'map-states') tipSel = 'path.st';
      if (embed === 'map-house') tipSel = 'path.dist';
      if (tipSel) {
        const box = await fr.evaluate((sel) => { const els = [...document.querySelectorAll(sel)]; const e = els[Math.floor(els.length / 2)]; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, tipSel);
        const frameEl = await (await page.$('#f1')).boundingBox();
        await page.mouse.move(frameEl.x + box.x, frameEl.y + box.y);
        await page.waitForTimeout(250);
        const tb = await fr.evaluate(() => { const t = document.querySelector('.tip'); if (!t || t.style.display === 'none') return null; const r = t.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, W: document.documentElement.clientWidth, H: document.body.getBoundingClientRect().height }; });
        ok(`${tag}: tooltip visibile e dentro l'iframe`, tb && tb.l >= -0.5 && tb.t >= -0.5 && tb.r <= tb.W + 0.5 && tb.b <= tb.H + 0.5, tb ? JSON.stringify(tb) : 'nessun tooltip');
      }
      ok(`${tag}: nessun errore in console`, errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.screenshot({ path: path.join(SHOTS, `${embed}-${w}.png`), fullPage: true });
      await ctx.close();
    }
  }
  // ---- Integrazione: due iframe affiancati, parent.js una sola volta, altezze dopo interazioni
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await ctx.newPage(); const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${port}/tests/browser/host2.html`); await page.waitForTimeout(2500);
    const hs = async () => page.evaluate(() => ({ a: Math.round(document.getElementById('a').getBoundingClientRect().height), b: Math.round(document.getElementById('b').getBoundingClientRect().height) }));
    const real = async (id) => (await (await page.$('#' + id)).contentFrame()).evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
    let h = await hs();
    ok('integrazione: altezze iniziali corrette (due iframe)', Math.abs(h.a - await real('a')) <= 2 && Math.abs(h.b - await real('b')) <= 2, JSON.stringify(h));
    const fa = await (await page.$('#a')).contentFrame(), fb = await (await page.$('#b')).contentFrame();
    const before = h.a; await fa.click('button[data-k="governor"]'); await page.waitForTimeout(700);
    h = await hs(); ok('integrazione: cambio scheda (Senato -> Governatori) mantiene altezza coerente', Math.abs(h.a - await real('a')) <= 2, JSON.stringify(h));
    const b0 = h.b; await fb.click('button[data-xp]'); await page.waitForTimeout(500);
    h = await hs(); ok('integrazione: apertura riga espansa cambia l\'altezza e resta coerente', h.b !== b0 && Math.abs(h.b - await real('b')) <= 2, `${b0} -> ${h.b}`);
    const b1 = h.b; await fb.click('#more'); await page.waitForTimeout(500);
    h = await hs(); ok('integrazione: "Mostra altri 25" aumenta l\'altezza e resta coerente', h.b > b1 && Math.abs(h.b - await real('b')) <= 2, `${b1} -> ${h.b}`);
    await fb.fill('#q', 'texas'); await page.waitForTimeout(500);
    h = await hs(); ok('integrazione: filtro di ricerca riduce l\'altezza e resta coerente', h.b < b1 && Math.abs(h.b - await real('b')) <= 2, `${b1} -> ${h.b}`);
    ok('integrazione: nessun errore in console', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: path.join(SHOTS, 'integrazione-due-iframe.png'), fullPage: true });
    await ctx.close();
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(SHOTS, '_risultati.json'), JSON.stringify({ failures, results }, null, 1));
  console.log(`\n${results.length - failures}/${results.length} controlli superati`);
  process.exit(failures ? 1 : 0);
})();
