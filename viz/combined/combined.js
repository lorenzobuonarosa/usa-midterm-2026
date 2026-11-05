// Dataviz unica: un selettore (Camera / Senato / Governatori) e, per ogni vista, gli embed esistenti
// (equilibrio, mappa, lista) in iframe della stessa origine, in modalità combinata (?combo=1: senza piè di pagina né titoli doppi).
// Gli iframe si adattano al contenuto con lo stesso postMessage di altezza degli altri embed; l'altezza totale è
// comunicata alla pagina ospite come per ogni embed (con parent.js) oppure l'embed scorre al suo interno (altezza fissa).
import { startHeightReporting, scheduleHeight } from '../_shared/embed-height.js';
import { applyBranding } from '../_shared/branding.js';
import { loadSummary } from '../_shared/data.js';
import { renderFooter, renderError } from '../_shared/notices.js';

const app = document.getElementById('app');
const QS = new URLSearchParams(location.search);

const VIEWS = [
  { key: 'house', label: 'Camera', slug: ['camera', 'house'], frames: [
    { path: '../balance/', q: 'panel=house', title: 'Camera: equilibrio e totali' },
    { path: '../map-house/', q: '', title: 'Mappa dei 435 distretti della Camera' },
    { path: '../house-list/', q: '', title: 'Camera: risultati per distretto' }] },
  { key: 'senate', label: 'Senato', slug: ['senato', 'senate'], frames: [
    { path: '../balance/', q: 'panel=senate', title: 'Senato: equilibrio e totali' },
    { path: '../map-states/', q: 'tab=senate', title: 'Mappa degli stati: Senato' }] },
  { key: 'governors', label: 'Governatori', slug: ['governatori', 'governors'], frames: [
    { path: '../balance/', q: 'panel=governors', title: 'Governatori: equilibrio e totali' },
    { path: '../map-states/', q: 'tab=governor', title: 'Mappa degli stati: governatori' }] }
];

let current = (VIEWS.find(v => v.slug.includes((QS.get('view') || '').toLowerCase())) || VIEWS[0]).key;
const built = new Set();

const themeParam = (() => { const t = QS.get('theme'); return t === 'dark' || t === 'light' ? t : null; })();

function frameUrl(f) {
  const p = new URLSearchParams(f.q); p.set('combo', '1');
  if (themeParam) p.set('theme', themeParam);
  return `${f.path}?${p.toString()}`;
}

function allFrames() { return [...app.querySelectorAll('.cb-panel iframe')]; }

function buildPanel(v) {
  const el = app.querySelector(`#panel-${v.key}`);
  el.innerHTML = v.frames.map(f => `<iframe src="${frameUrl(f)}" title="${f.title}" style="height:320px"></iframe>`).join('');
  built.add(v.key);
}

function select(key, focus = false) {
  current = key;
  VIEWS.forEach(v => {
    const b = app.querySelector(`#tab-${v.key}`), p = app.querySelector(`#panel-${v.key}`);
    b.setAttribute('aria-selected', String(v.key === key)); b.tabIndex = v.key === key ? 0 : -1;
    p.hidden = v.key !== key;
    if (v.key === key && !built.has(key)) buildPanel(v);
    if (v.key === key && focus) b.focus();
  });
  scheduleHeight();
}

// Tema: gli iframe seguono il tema della pagina unica (che a sua volta segue la pagina ospite o il dispositivo)
function currentTheme() { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || t === 'light' ? t : null; }
function sendTheme(win) { const t = currentTheme(); if (t && win) try { win.postMessage({ source: 'radar-midterm-host', type: 'theme', theme: t }, '*'); } catch (e) { /* niente */ } }

function onMessage(ev) {
  const d = ev.data;
  if (!d || d.source !== 'radar-midterm') return;
  const fr = allFrames().find(f => f.contentWindow === ev.source);
  if (!fr) return;
  if (d.type === 'hello') { sendTheme(ev.source); return; }
  if (d.type === 'height') {
    const h = Math.ceil(Number(d.height));
    if (isFinite(h) && h > 0 && h < 100000) { fr.style.height = h + 'px'; scheduleHeight(); }
  }
}

async function main() {
  startHeightReporting();
  await applyBranding();
  let summary;
  try { summary = await loadSummary(); } catch (e) { renderError(app); return; }
  app.innerHTML = `
    <div class="cb-bar"><div class="cb-tabs" role="tablist" aria-label="Scegli cosa vedere">
      ${VIEWS.map(v => `<button type="button" role="tab" id="tab-${v.key}" aria-controls="panel-${v.key}" aria-selected="false" tabindex="-1">${v.label}</button>`).join('')}
    </div></div>
    ${VIEWS.map(v => `<section class="cb-panel" id="panel-${v.key}" role="tabpanel" aria-labelledby="tab-${v.key}" hidden></section>`).join('')}
    <div class="cb-foot" id="foot"></div>`;
  renderFooter(document.getElementById('foot'), summary, { showAutoNote: true });
  window.addEventListener('message', onMessage);
  new MutationObserver(() => allFrames().forEach(f => sendTheme(f.contentWindow))).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const tabs = app.querySelector('.cb-tabs');
  tabs.addEventListener('click', (e) => { const b = e.target.closest('button[role="tab"]'); if (b) select(b.id.replace('tab-', '')); });
  tabs.addEventListener('keydown', (e) => {
    const i = VIEWS.findIndex(v => v.key === current);
    if (e.key === 'ArrowRight') { e.preventDefault(); select(VIEWS[(i + 1) % VIEWS.length].key, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); select(VIEWS[(i + VIEWS.length - 1) % VIEWS.length].key, true); }
    else if (e.key === 'Home') { e.preventDefault(); select(VIEWS[0].key, true); }
    else if (e.key === 'End') { e.preventDefault(); select(VIEWS[VIEWS.length - 1].key, true); }
  });
  select(current);
}
main();
