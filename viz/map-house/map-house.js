import { startHeightReporting, scheduleHeight } from '../_shared/embed-height.js';
import { applyBranding } from '../_shared/branding.js';
import { loadSummary, siteUrl } from '../_shared/data.js';
import { renderFooter, renderError } from '../_shared/notices.js';
import { createTooltip } from '../_shared/tooltip.js';
import { fillFor, raceTooltipBlock, statusText } from '../_shared/races.js';
import { fmtInt, esc } from '../_shared/format.js';

const app = document.getElementById('app');
const FIPS_ABBR = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"};
const STATE_NAME = {"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming"};

let summary, topo, tip, byGeoid = new Map(), features = [], zoomed = null, svg, g, zoom, projPath, W = 0, H = 0;

function pos(ev) { const r = document.body.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }

function tally() {
  const races = (summary.races || []).filter(r => r.chamber === 'house');
  const c = { D: 0, R: 0, O: 0 }, l = { D: 0, R: 0, O: 0 };
  races.forEach(r => {
    if (r.called) c[r.called.party === 'D' || r.called.party === 'R' ? r.called.party : 'O']++;
    else if (r.leader && r.total_votes > 0) l[r.leader.party === 'D' || r.leader.party === 'R' ? r.leader.party : 'O']++;
  });
  const ch = (summary.chambers && summary.chambers.house) || {};
  const total = ch.up || races.length || 435;
  const undecided = total - c.D - c.R - c.O;
  return { c, l, undecided, maj: ch.majority || 218 };
}

function draw() {
  const wrap = document.getElementById('mapwrap');
  W = Math.max(280, Math.floor(wrap.clientWidth)); H = Math.round(W * 600 / 960);
  const proj = d3.geoAlbersUsa().fitSize([W, H], { type: 'FeatureCollection', features });
  projPath = d3.geoPath(proj);
  wrap.innerHTML = '';
  svg = d3.select(wrap).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img')
    .attr('aria-label', 'Mappa dei 435 distretti della Camera: usa il menu "Zoom su uno stato" o la lista per i dettagli');
  g = svg.append('g');
  g.selectAll('path.dist').data(features).join('path').attr('class', 'dist').attr('d', projPath)
    .attr('fill', f => fillFor(byGeoid.get(f.id)))
    .on('mouseenter', (ev, f) => showTip(ev, f)).on('mousemove', (ev) => tip.move(...pos(ev))).on('mouseleave', () => tip.hide())
    .on('click', (ev, f) => { ev.stopPropagation(); if (zoomed) { showTip(ev, f); } else { zoomTo(FIPS_ABBR[f.id.slice(0, 2)]); } });
  // bordi degli stati più marcati di quelli dei distretti
  const states = topojson.mesh(topo, topo.objects.districts, (a, b) => a === b || a.id.slice(0, 2) !== b.id.slice(0, 2));
  g.append('path').attr('class', 'st-border').attr('d', projPath(states));
  zoom = d3.zoom().scaleExtent([1, 12])
    .filter(ev => ev.type === 'wheel' ? (ev.ctrlKey || ev.metaKey) : (ev.type.startsWith('touch') ? ev.touches && ev.touches.length >= 2 : !ev.button))
    .on('zoom', (ev) => { g.attr('transform', ev.transform); });
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('click', () => tip.hide());
  if (zoomed) zoomTo(zoomed, false);
}

function showTip(ev, f) {
  const r = byGeoid.get(f.id); const st = FIPS_ABBR[f.id.slice(0, 2)];
  if (!r) { tip.show(`<div class="t-kicker"><span>${st} · CAMERA</span></div><div class="t-muted">Nessuna gara abbinata</div>`, ...pos(ev)); return; }
  const pr = r.percent_reporting == null ? 0 : Math.round(r.percent_reporting);
  const h = `<div class="t-kicker"><span>${st} · CAMERA</span><span class="num">${pr}% scrutinato</span></div>` + raceTooltipBlock(r);
  tip.show(h, ...pos(ev));
}

function zoomTo(abbr, animate = true) {
  if (!abbr) return;
  const fips = Object.keys(FIPS_ABBR).find(k => FIPS_ABBR[k] === abbr);
  const fs = features.filter(f => f.id.startsWith(fips));
  if (!fs.length) return;
  zoomed = abbr;
  const b = projPath.bounds({ type: 'FeatureCollection', features: fs });
  const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1], x = (b[0][0] + b[1][0]) / 2, y = (b[0][1] + b[1][1]) / 2;
  const k = Math.max(1, Math.min(12, 0.9 / Math.max(dx / W, dy / H)));
  const t = d3.zoomIdentity.translate(W / 2 - k * x, H / 2 - k * y).scale(k);
  (animate ? svg.transition().duration(500) : svg).call(zoom.transform, t);
  document.getElementById('reset').hidden = false;
  document.getElementById('zsel').value = abbr;
  tip.hide(); scheduleHeight();
}

function resetZoom() {
  zoomed = null;
  svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
  document.getElementById('reset').hidden = true;
  document.getElementById('zsel').value = '';
  tip.hide();
}

function renderTally() {
  const t = tally();
  document.getElementById('tally').innerHTML = `
    <div class="side"><span class="lbl dem-text">Democratici</span><span class="big num dem-text">${fmtInt(t.c.D)}</span><span class="small num">${t.l.D ? fmtInt(t.l.D) + ' in testa' : '&nbsp;'}</span></div>
    <div class="mid"><b class="num">${fmtInt(t.undecided)}</b> non assegnati · <b class="num">${fmtInt(t.maj)}</b> per il controllo</div>
    <div class="side r"><span class="lbl rep-text">Repubblicani</span><span class="big num rep-text">${fmtInt(t.c.R)}</span><span class="small num">${t.l.R ? fmtInt(t.l.R) + ' in testa' : '&nbsp;'}</span></div>`;
}

async function main() {
  startHeightReporting();
  await applyBranding();
  try {
    summary = await loadSummary();
    topo = await (await fetch(siteUrl('assets/geo/districts.json'))).json();
  } catch (e) { renderError(app, 'Dati non disponibili'); return; }
  const fc = topojson.feature(topo, topo.objects.districts);
  features = fc.features.map(f => { f.id = String(f.id || f.properties.GEOID); return f; });
  (summary.races || []).filter(r => r.chamber === 'house').forEach(r => byGeoid.set(r.geoid, r));
  app.innerHTML = `
    <div class="mh-head"><h1>Camera: i 435 distretti</h1>
      <div class="mh-ctl">
        <label class="sr-only" for="zsel">Zoom su uno stato</label>
        <select id="zsel"><option value="">Zoom su uno stato</option>${Object.values(FIPS_ABBR).sort((a, b) => STATE_NAME[a].localeCompare(STATE_NAME[b])).map(a => `<option value="${a}">${STATE_NAME[a]}</option>`).join('')}</select>
        <button class="reset" id="reset" type="button" hidden>Reimposta</button></div></div>
    <div id="mapwrap" class="map-wrap"></div>
    <p class="hint">Tocca o clicca uno stato per ingrandirlo. Con il mouse, Ctrl (o Cmd) + rotella per lo zoom.</p>
    <div id="tally" class="tally" aria-live="polite"></div>
    <div class="legend" aria-label="Legenda">
      <span class="grp">Democratici <i class="d1"></i><i class="d2"></i><i class="d3"></i></span>
      <span class="grp">Repubblicani <i class="r1"></i><i class="r2"></i><i class="r3"></i></span>
      <span class="grp"><i class="dc"></i><i class="rc"></i> Assegnato</span>
      <span class="grp"><i class="n"></i> Senza voti</span></div>
    <div id="foot"></div>`;
  tip = createTooltip();
  draw(); renderTally();
  renderFooter(document.getElementById('foot'), summary, { showAutoNote: true });
  document.getElementById('reset').addEventListener('click', resetZoom);
  document.getElementById('zsel').addEventListener('change', (e) => { e.target.value ? zoomTo(e.target.value) : resetZoom(); });
  let lastW = 0;
  new ResizeObserver(() => { const w = document.getElementById('mapwrap').clientWidth; if (Math.abs(w - lastW) > 1) { lastW = w; draw(); scheduleHeight(); } }).observe(document.getElementById('mapwrap'));
  document.addEventListener('click', () => tip.hide());
}
main();
