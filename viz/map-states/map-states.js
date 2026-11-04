import { startHeightReporting, scheduleHeight } from '../_shared/embed-height.js';
import { applyBranding } from '../_shared/branding.js';
import { loadSummary, loadJSON } from '../_shared/data.js';
import { renderFooter, renderError } from '../_shared/notices.js';
import { createTooltip } from '../_shared/tooltip.js';
import { fillFor, hasVotes, raceTooltipBlock, statusText } from '../_shared/races.js';
import { esc } from '../_shared/format.js';

const app = document.getElementById('app');
const TABS = [{ key: 'senate', label: 'Senato', kicker: 'SENATO' }, { key: 'governor', label: 'Governatori', kicker: 'GOVERNATORI' }];
const FIPS_ABBR = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"};
const STATE_NAMES = {};
let summary, topo, tab = 'senate', tip, features, selected = null;

function racesFor(key, st) { return (summary.races || []).filter(r => r.chamber === key && r.state === st); }

function primaryRace(rs) {
  // per la colorazione: la gara con più voti scrutinati
  return rs.slice().sort((a, b) => (b.total_votes || 0) - (a.total_votes || 0))[0];
}

function draw() {
  const wrap = document.getElementById('mapwrap');
  const W = Math.max(280, Math.floor(wrap.clientWidth));
  const H = Math.round(W * 600 / 960);
  const proj = d3.geoAlbersUsa().fitSize([W, H], { type: 'FeatureCollection', features });
  const path = d3.geoPath(proj);
  const small = W < 470;
  const minDim = small ? 22 : 16, minMax = small ? 44 : 28;
  wrap.innerHTML = '';
  const svg = d3.select(wrap).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'group').attr('aria-label', 'Mappa degli stati USA');
  const g = svg.append('g');
  const hl = svg.append('path').attr('class', 'hover-outline');  // contorno completo dello stato sotto il puntatore
  const labels = svg.append('g');
  features.forEach(f => {
    const st = FIPS_ABBR[f.id]; const rs = racesFor(tab, st); const r = primaryRace(rs);
    const p = g.append('path').attr('class', 'st').attr('d', path(f)).attr('fill', rs.length ? fillFor(r) : 'var(--c-none)')
      .attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', `${STATE_NAMES[f.id]}: ${rs.length ? rs.map(x => `${x.name}, ${statusText(x)}`).join('; ') : 'nessuna gara in palio'}`);
    const outline = () => hl.attr('d', path(f)).style('display', 'block');
    const clear = () => hl.style('display', 'none');
    const show = (ev) => { outline(); showTip(f, rs, ev, p.node()); };
    p.on('mouseenter', show).on('mousemove', (ev) => tip.move(...pos(ev)))
      .on('mouseleave', () => { tip.hide(); clear(); })
      .on('focus', (ev) => { outline(); const b = p.node().getBoundingClientRect(); showTip(f, rs, { clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }); })
      .on('blur', () => { tip.hide(); clear(); })
      .on('click', (ev) => { ev.stopPropagation(); showTip(f, rs, ev); })
      .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); const b = p.node().getBoundingClientRect(); showTip(f, rs, { clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }); } });
    // sigla solo dove c'è spazio
    const b = path.bounds(f); const w = b[1][0] - b[0][0], h = b[1][1] - b[0][1];
    if (Math.min(w, h) >= minDim && Math.max(w, h) >= minMax) {
      const c = path.centroid(f);
      if (isFinite(c[0])) {
        const dark = r && r.called;
        const t = labels.append('text').attr('class', 'st-label' + (dark ? ' on-dark' : '')).attr('x', c[0]).attr('y', c[1]).text(st);
        if (r && r.called) labels.append('text').attr('class', 'st-check').attr('x', c[0]).attr('y', c[1] + 11).text(r.called.method === 'manual' ? '✓' : '✓*').style('fill', 'var(--c-on-solid)');
      }
    }
  });
  svg.on('click', () => { tip.hide(); hl.style('display', 'none'); });
}

function pos(ev) {
  const r = document.body.getBoundingClientRect();
  return [ev.clientX - r.left, ev.clientY - r.top];
}

function showTip(f, rs, ev) {
  const st = FIPS_ABBR[f.id]; const tab_ = TABS.find(t => t.key === tab);
  let h = `<div class="t-kicker"><span>${st} · ${tab_.kicker}</span><span class="num">${rs.length ? pctText(rs) : ''}</span></div>`;
  h += `<div class="t-title">${esc(STATE_NAMES[f.id])}</div>`;
  if (!rs.length) h += `<div class="t-muted">Nessuna gara in palio nel 2026</div>`;
  // il nome dello stato è già il titolo: la gara si descrive solo se serve a distinguerla (speciale / ordinaria), mai ripetendo "Florida … Florida US Senate"
  else rs.forEach(r => { h += raceTooltipBlock(r, { showName: false, label: r.special ? 'Elezione speciale' : (rs.length > 1 ? 'Elezione ordinaria' : '') }); });
  tip.show(h, ...pos(ev));
}
const pctText = (rs) => { const r = primaryRace(rs); const p = r.percent_reporting; return (p == null ? 0 : Math.round(p)) + '% scrutinato'; };

function renderNote() {
  const rcv = tab === 'senate' ? ['AK', 'ME'] : ['AK'];
  document.getElementById('mapnote').innerHTML = 'Tinta più intensa = margine più ampio. ' + rcv.map(a => `<span class="badge">${a}</span>`).join(' ') +
    ' voto ordinato per preferenze (prime preferenze): i conteggi sono solo prime preferenze.';
}

function renderTabs() {
  const el = document.getElementById('tabs');
  el.innerHTML = TABS.map(t => `<button role="tab" type="button" aria-selected="${t.key === tab}" data-k="${t.key}">${t.label}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.k; renderTabs(); renderNote(); draw(); tip.hide(); scheduleHeight(); }));
}

async function main() {
  startHeightReporting();
  await applyBranding();
  try {
    summary = await loadSummary();
    topo = await (await fetch(new URL('../../assets/geo/states.json', import.meta.url))).json();
  } catch (e) { renderError(app); return; }
  const fc = topojson.feature(topo, topo.objects.states);
  features = fc.features;
  features.forEach(f => { STATE_NAMES[f.id] = f.properties.name; });
  app.innerHTML = `
    <div id="tabs" class="tabs" role="tablist" aria-label="Scheda"></div>
    <div id="mapwrap" class="map-wrap"></div>
    <div class="legend" aria-label="Legenda">
      <span class="grp">Democratici <i class="d1"></i><i class="d2"></i><i class="d3"></i></span>
      <span class="grp">Repubblicani <i class="r1"></i><i class="r2"></i><i class="r3"></i></span>
      <span class="grp"><i class="dc"></i><i class="rc"></i> Assegnata ✓ (* automatica)</span>
      <span class="grp"><i class="n"></i> Non in palio o senza voti</span>
    </div>
    <p class="map-note" id="mapnote"></p>
    <div id="foot"></div>`;
  tip = createTooltip();
  renderTabs(); renderNote(); draw();
  renderFooter(document.getElementById('foot'), summary, { showAutoNote: true });
  let lastW = 0;
  new ResizeObserver(() => { const w = document.getElementById('mapwrap').clientWidth; if (Math.abs(w - lastW) > 1) { lastW = w; draw(); scheduleHeight(); } }).observe(document.getElementById('mapwrap'));
  document.addEventListener('click', () => tip.hide());
}
main();
