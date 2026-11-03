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
  // ---- Mobile: vista a 10 righe, area scorrevole, scroll di riserva, altezza fissa
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage(); const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${port}/viz/house-list/index.html`); await page.waitForTimeout(2200);
    await page.click('button[data-view="table"]'); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const w = document.querySelector('.tbl-wrap'); return { rows: document.querySelectorAll('table.hl tbody tr').length, h: w.clientHeight, sw: w.scrollWidth, cw: w.clientWidth, htmlOv: getComputedStyle(document.documentElement).overflowY, doc: document.body.getBoundingClientRect().height, vh: innerHeight }; });
    ok('mobile: tabella a 10 righe iniziali', m.rows === 10, JSON.stringify(m));
    ok('mobile: area dei risultati con altezza massima fissa (<= 830 px)', m.h <= 831);
    ok('mobile: la tabella scorre in orizzontale dentro il contenitore', m.sw > m.cw);
    ok('mobile: aperta direttamente, la pagina è scorrevole (scroll di riserva)', m.htmlOv === 'auto' && m.doc > m.vh);
    await page.click('#more'); await page.waitForTimeout(300);
    ok('mobile: "Mostra altri 10" aggiunge 10 righe', (await page.evaluate(() => document.querySelectorAll('table.hl tbody tr').length)) === 20);
    ok('mobile: nessun errore in console', errors.length === 0, errors.join('|'));
    await ctx.close();
    // iframe ad altezza fissa senza parent.js: il contenuto resta raggiungibile
    const c2 = await browser.newContext({ viewport: { width: 375, height: 900 }, hasTouch: true, isMobile: true });
    const p2 = await c2.newPage();
    await p2.route('**/host_fixed.html', r => r.fulfill({ contentType: 'text/html', body: '<style>body{margin:0}iframe{width:100%;border:0;display:block}</style><iframe id=a style="height:700px" src="/viz/house-list/index.html"></iframe><iframe id=b data-radar-fixed-height style="height:640px" src="/viz/house-list/index.html"></iframe><iframe id=c style="height:300px" src="/viz/balance/index.html"></iframe><script src="/embed/parent.js"></script>' }));
    await p2.goto(`http://localhost:${port}/host_fixed.html`); await p2.waitForTimeout(3800);
    const hs = await p2.evaluate(() => ['a', 'b', 'c'].map(i => Math.round(document.getElementById(i).getBoundingClientRect().height)));
    ok('data-radar-fixed-height: l\'iframe resta a 640 px', hs[1] === 640, JSON.stringify(hs));
    ok('senza l\'attributo l\'altezza si adatta al contenuto', hs[2] !== 300 && hs[0] !== 700, JSON.stringify(hs));
    await c2.close();
    const c3 = await browser.newContext({ viewport: { width: 375, height: 900 }, hasTouch: true, isMobile: true });
    const p3 = await c3.newPage();
    await p3.setContent(`<style>body{margin:0}iframe{width:100%;border:0;display:block;height:700px}</style><iframe id="f" src="http://localhost:${port}/viz/house-list/index.html"></iframe>`);
    await p3.waitForTimeout(3500);
    const fr = await (await p3.$('#f')).contentFrame();
    const fx = await fr.evaluate(() => ({ ov: getComputedStyle(document.documentElement).overflowY, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
    ok('iframe fisso 700 px senza script: contenuto scorrevole nell\'iframe', fx.ov === 'auto' && fx.sh > fx.ch, JSON.stringify(fx));
    await c3.close();
  }
  // ---- Suggerimenti nella ricerca della lista
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://localhost:${port}/viz/house-list/index.html`); await page.waitForTimeout(2000);
    await page.click('#q'); await page.keyboard.type('c'); await page.waitForTimeout(250);
    const labels = await page.$$eval('#sug li .sl', e => e.map(x => x.textContent));
    ok('ricerca: "c" suggerisce California (e altri stati) per primi', labels[0] === 'California' && labels.includes('Colorado'), labels.slice(0, 4).join(', '));
    await page.click(`#sug-${labels.indexOf('California')}`); await page.waitForTimeout(300);
    ok('ricerca: scegliere un suggerimento filtra (52 su 435)', /52 su 435/.test(await page.textContent('#matches')));
    await page.fill('#q', ''); await page.keyboard.type('tex'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ok('ricerca: tastiera (freccia + Invio) -> Texas, 38 su 435', /38 su 435/.test(await page.textContent('#matches')));
    ok('ricerca: nessun errore', errors.length === 0, errors.join('|'));
    await ctx.close();
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(SHOTS, '_risultati.json'), JSON.stringify({ failures, results }, null, 1));
  console.log(`\n${results.length - failures}/${results.length} controlli superati`);
  process.exit(failures ? 1 : 0);
})();
