import { startHeightReporting } from '../_shared/embed-height.js';
import { applyBranding } from '../_shared/branding.js';
import { loadSummary } from '../_shared/data.js';
import { fmtInt } from '../_shared/format.js';
import { renderFooter, renderError } from '../_shared/notices.js';

const app = document.getElementById('app');

// Pannelli: chiave in summary.chambers, titolo, riga "in palio"
const PANELS = [
  { key: 'house', title: 'Camera', up: (c) => `${fmtInt(c.up)} seggi in palio`, ind: false, tick: true },
  { key: 'senate', title: 'Senato', up: (c) => `${fmtInt(c.up)} seggi su ${fmtInt(c.seats)} in palio`, ind: true, tick: true },
  { key: 'governors', title: 'Governatori', up: (c) => `${fmtInt(c.up)} gare su ${fmtInt(c.seats)} in palio`, ind: false, tick: false }
];

const v = (o, k) => (o && Number(o[k])) || 0;

function panel(def, c) {
  const nu = c.not_up || {}, ca = c.called || {}, le = c.leading || {};
  const total = c.seats || 1;
  const dSolid = v(nu, 'D') + v(ca, 'D');
  const rSolid = v(nu, 'R') + v(ca, 'R');
  const iSolid = v(nu, 'I') + v(ca, 'I');
  const dLead = v(le, 'D'), rLead = v(le, 'R'), iLead = v(le, 'I');
  // Numeri consolidati: seggi assegnati (anche non in palio) + seggi in cui il partito è in testa. Corrispondono alla lunghezza colorata della barra.
  const dTot = dSolid + dLead, rTot = rSolid + rLead, iTot = iSolid + iLead;
  const sub = (solid, lead) => lead ? `<span class="small num">di cui ${fmtInt(solid)} assegnati</span>` : '<span class="small">&nbsp;</span>';
  const pct = (n) => (100 * n / total).toFixed(3) + '%';
  const maj = c.majority;
  const label = `${def.title}: democratici ${dTot}${dLead ? ` (${dSolid} assegnati, ${dLead} in testa)` : ''}; repubblicani ${rTot}${rLead ? ` (${rSolid} assegnati, ${rLead} in testa)` : ''}` +
    (def.ind ? `; indipendenti ${iTot}` : '') + (maj ? `; soglia per il controllo ${maj}` : '');
  const auto = c.auto_calls || 0;
  const showAuto = def.key === 'governors' || auto > 0;
  return `
  <section class="panel" aria-labelledby="h-${def.key}">
    <h2 id="h-${def.key}">${def.title}</h2>
    <div class="sub">${def.up(c)}</div>
    <div class="nums">
      <div class="side"><span class="pname dem-text">Democratici</span><span class="big num dem-text">${fmtInt(dTot)}</span>${sub(dSolid, dLead)}</div>
      ${def.ind ? `<div class="mid">Ind. <b class="num">${fmtInt(iTot)}</b></div>` : ''}
      <div class="side r"><span class="pname rep-text">Repubblicani</span><span class="big num rep-text">${fmtInt(rTot)}</span>${sub(rSolid, rLead)}</div>
    </div>
    <div class="bar" role="img" aria-label="${label}">
      <div class="seg d1" style="width:${pct(dSolid)}"></div>
      ${def.ind ? `<div class="seg i1" style="width:${pct(iSolid)}"></div>` : ''}
      ${def.ind && iLead ? `<div class="seg i2" style="width:${pct(iLead)}"></div>` : ''}
      <div class="seg d2" style="width:${pct(dLead)}"></div>
      <div class="grow"></div>
      <div class="seg r2" style="width:${pct(rLead)}"></div>
      <div class="seg r1" style="width:${pct(rSolid)}"></div>
      ${def.tick && maj ? `<div class="tick" style="left:${pct(maj)}"></div>` : ''}
    </div>
    ${def.tick && maj ? `<div class="tick-label"><span style="left:${pct(maj)}">${fmtInt(maj)} per il controllo</span></div>` : ''}
    ${showAuto ? `<p class="note">Include ${fmtInt(auto)} ${auto === 1 ? 'assegnazione automatica basata' : 'assegnazioni automatiche basate'} sui voti scrutinati</p>` : ''}
    ${def.key === 'senate' && c.tie_note ? `<p class="note">${c.tie_note}</p>` : ''}
  </section>`;
}

async function main() {
  startHeightReporting();
  await applyBranding();
  let s;
  try { s = await loadSummary(); } catch (e) { renderError(app); return; }
  const ch = s.chambers;
  if (!ch) { renderError(app); return; }
  const panels = PANELS.filter(p => ch[p.key]).map(p => panel(p, ch[p.key])).join('');
  app.innerHTML = `
    <header class="bal-head">
      <h1>Equilibrio dei poteri</h1>
      <p>I totali sommano i seggi già assegnati (compresi quelli non in palio) e quelli in cui il partito è in testa; sotto ogni totale, il dettaglio degli assegnati.</p>
    </header>
    <div class="bal-grid">${panels}</div>
    <div class="legend" aria-label="Legenda">
      <span class="k"><i class="a"></i>Assegnato</span>
      <span class="k"><i class="l"></i>In testa</span>
      <span class="k"><i class="o"></i>Aperto</span>
    </div>
    <div id="foot"></div>`;
  renderFooter(document.getElementById('foot'), s, { showAutoNote: true });
}
main();
