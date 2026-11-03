import { startHeightReporting } from '../_shared/embed-height.js';
import { applyBranding } from '../_shared/branding.js';
import { loadSummary } from '../_shared/data.js';
import { fmtInt, fmtPct, fmtTime, esc } from '../_shared/format.js';
import { renderFooter, renderError } from '../_shared/notices.js';
import { hasVotes, statusText } from '../_shared/races.js';

const app = document.getElementById('app');
const MOBILE_MAX = 499;                       // sotto i 500 px: vista a 10 righe con area scorrevole
const pageSize = () => (window.innerWidth <= MOBILE_MAX ? 10 : 25);
const REGIONS = { northeast: 'Nord-est', midwest: 'Medio Ovest', south: 'Sud', west: 'Ovest' };
const REGION_OF = {
  northeast: 'CT ME MA NH RI VT NJ NY PA', midwest: 'IL IN MI OH WI IA KS MN MO NE ND SD',
  south: 'DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX', west: 'AZ CO ID MT NV NM UT WY AK CA HI OR WA'
};
const regionOfState = {};
Object.entries(REGION_OF).forEach(([k, v]) => v.split(' ').forEach(s => { regionOfState[s] = k; }));

// --- stella "Le tue sfide": localStorage in try/catch, ripiego in memoria (dentro un iframe può non essere disponibile)
const memStore = new Set();
const LS_KEY = 'radar-midterm-house-stars';
function loadStars() {
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); v.forEach(x => memStore.add(x)); } catch (e) { /* ripiego in memoria */ }
}
function saveStars() { try { localStorage.setItem(LS_KEY, JSON.stringify([...memStore])); } catch (e) { /* ripiego in memoria */ } }

let races = [], summary, view = 'table', shown = pageSize(), expanded = new Set();
const f = { q: '', region: '', sort: 'district', margin: '', rep: '', lead: '', chip: 'all' };

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const label = (r) => esc((r.name || `${r.state} ${r.district}`).replace(/at-large/i, '(collegio unico)'));
const cand = (r, p) => (r.candidates || []).filter(c => p === 'O' ? (c.party !== 'D' && c.party !== 'R') : c.party === p);
const leadParty = (r) => (r.called && r.called.party) || (hasVotes(r) && r.leader ? r.leader.party : null);
const isClose = (r) => r.flags && r.flags.includes('key') || (hasVotes(r) && r.percent_reporting > 0 && r.margin_pct != null && r.margin_pct < 5);

function candNames(r, p) {
  const cs = cand(r, p);
  if (!cs.length) return '<span class="wait">–</span>';
  return cs.map(c => `<div>${esc(c.name)}${hasVotes(r) ? ` <span class="wait num">${fmtPct(c.percent)}</span>` : ''}</div>`).join('');
}

function leadCell(r) {
  if (r.called) {
    const who = r.called.winner || (r.leader && r.leader.name) || '';
    const m = r.margin_pct != null ? ` <span class="mg num">+${fmtPct(r.margin_pct)}</span>` : '';
    return `<span class="lead party-${r.called.party || 'O'}">${esc(who)}</span> <span class="tag called">Eletto${r.called.method === 'auto' ? ' · auto' : r.called.method === 'unopposed' ? ' · senza avversari' : ''}</span>${m}`;
  }
  if (!hasVotes(r) || !r.leader) return '<span class="wait">In attesa dei risultati</span>';
  return `<span class="lead party-${r.leader.party || 'O'}">${esc(r.leader.name)}</span> <span class="tag">In testa</span> <span class="mg num">+${fmtPct(r.margin_pct)}</span>`;
}

function filtered() {
  const q = norm(f.q).trim();
  let out = races.filter(r => {
    if (q) {
      const hay = norm(`${r.name} ${r.state} ${(r.candidates || []).map(c => c.name).join(' ')}`);
      if (!q.split(/\s+/).every(t => hay.includes(t))) return false;
    }
    if (f.region && regionOfState[r.state] !== f.region) return false;
    if (f.margin) {
      if (!hasVotes(r) || r.margin_pct == null) return false;
      const m = r.margin_pct;
      if (f.margin === 'lt2' && !(m < 2)) return false;
      if (f.margin === '2-5' && !(m >= 2 && m < 5)) return false;
      if (f.margin === '5-10' && !(m >= 5 && m < 10)) return false;
      if (f.margin === 'gt10' && !(m >= 10)) return false;
    }
    if (f.rep) {
      const p = r.percent_reporting || 0;
      if (f.rep === '0' && p > 0) return false;
      if (f.rep === 'lt50' && !(p > 0 && p < 50)) return false;
      if (f.rep === '50-90' && !(p >= 50 && p <= 90)) return false;
      if (f.rep === 'gt90' && !(p > 90)) return false;
    }
    if (f.lead) {
      const lp = leadParty(r);
      if (f.lead === 'O' ? (!lp || lp === 'D' || lp === 'R') : lp !== f.lead) return false;
    }
    if (f.chip === 'close' && !isClose(r)) return false;
    if (f.chip === 'called' && !r.called) return false;
    if (f.chip === 'open' && r.called) return false;
    if (f.chip === 'mine' && !memStore.has(r.id)) return false;
    return true;
  });
  const by = f.sort;
  const key = {
    district: (r) => `${r.state_name || r.state}${String(r.district).padStart(3, '0')}`,
    margin: (r) => (hasVotes(r) && r.margin_pct != null ? r.margin_pct : 999),
    reporting: (r) => -(r.percent_reporting || 0),
    close: (r) => r.polls_close || '9999'
  }[by];
  out.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
  return out;
}

function detail(r) {
  const cs = (r.candidates || []).slice().sort((a, b) => (b.votes || 0) - (a.votes || 0));
  return `<ul>${cs.map(c => `<li><span><span class="party-tag party-${c.party || 'O'}">${c.party || '?'}</span>${esc(c.name)}</span><span class="num">${hasVotes(r) ? `${fmtInt(c.votes)} · ${fmtPct(c.percent)}` : '–'}</span></li>`).join('')}</ul>
  <div class="pm">Chiusura dei seggi: ${r.polls_close ? fmtTime(r.polls_close) + ' (ora italiana)' : 'non disponibile'}</div>`;
}

function starBtn(r) {
  const on = memStore.has(r.id);
  return `<button class="star" type="button" data-star="${esc(r.id)}" aria-pressed="${on}" aria-label="${on ? 'Rimuovi dalle tue sfide' : 'Aggiungi alle tue sfide'}: ${label(r)}">${on ? '★' : '☆'}</button>`;
}
function xpBtn(r) {
  const on = expanded.has(r.id);
  return `<button class="xp" type="button" data-xp="${esc(r.id)}" aria-expanded="${on}" aria-label="Dettagli: ${label(r)}">▾</button>`;
}

function renderTable(list) {
  const rows = list.map(r => {
    const open = expanded.has(r.id);
    return `<tr>
      <td class="c-dist"><div class="dist">${starBtn(r)}<span class="nm">${label(r)}</span>${xpBtn(r)}</div></td>
      <td class="num">${hasVotes(r) ? fmtPct(r.percent_reporting, 0) : '–'}</td>
      <td>${candNames(r, 'D')}</td><td>${candNames(r, 'R')}</td><td class="c-oth">${candNames(r, 'O')}</td>
      <td>${leadCell(r)}</td></tr>${open ? `<tr class="detail"><td colspan="6">${detail(r)}</td></tr>` : ''}`;
  }).join('');
  return `<p class="scroll-hint">Scorri la tabella in orizzontale →</p><div class="tbl-wrap" tabindex="0" role="region" aria-label="Tabella dei distretti, scorribile in orizzontale"><table class="hl"><colgroup><col style="width:23%"><col style="width:12%"><col style="width:17%"><col style="width:17%"><col class="c-oth" style="width:12%"><col style="width:19%"></colgroup>
  <thead><tr><th scope="col">Distretto</th><th scope="col">Scrutinato</th><th scope="col" class="d">Democratico</th><th scope="col" class="r">Repubblicano</th><th scope="col" class="o c-oth">Altri</th><th scope="col">In testa / Eletto</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderCards(list) {
  return `<div class="cards">${list.map(r => `<article class="card">
    <div class="top">${starBtn(r)}<strong>${label(r)}</strong>${xpBtn(r)}</div>
    <div class="row"><span class="k wait">Scrutinato</span><span class="v num">${hasVotes(r) ? fmtPct(r.percent_reporting, 0) : '–'}</span></div>
    <div class="row"><span class="k dem-text">Democratico</span><span class="v">${candNames(r, 'D')}</span></div>
    <div class="row"><span class="k rep-text">Repubblicano</span><span class="v">${candNames(r, 'R')}</span></div>
    ${cand(r, 'O').length ? `<div class="row"><span class="k ind-text">Altri</span><span class="v">${candNames(r, 'O')}</span></div>` : ''}
    <div class="row"><span class="k wait">In testa</span><span class="v">${leadCell(r)}</span></div>
    ${expanded.has(r.id) ? `<div class="detail">${detail(r)}</div>` : ''}
  </article>`).join('')}</div>`;
}

function renderResults() {
  const list = filtered();
  document.getElementById('matches').textContent = `Corrispondenze: ${fmtInt(list.length)} su ${fmtInt(races.length)}`;
  const part = list.slice(0, shown);
  const el = document.getElementById('results');
  // "Le tue sfide": si riempie contrassegnando i distretti con la stellina ☆
  const mineHint = f.chip === 'mine'
    ? `<p class="mine-hint">${memStore.size ? `Stai vedendo i distretti che hai contrassegnato con la stellina ★ (${fmtInt(memStore.size)}). Tocca la stella accanto a un distretto per aggiungerlo o toglierlo.` : 'Per usare «Le tue sfide» tocca la stellina ☆ accanto a un distretto: i distretti contrassegnati compariranno qui.'}</p>`
    : '';
  if (!list.length) { el.innerHTML = mineHint + (f.chip === 'mine' && !memStore.size ? '' : '<div class="empty">Nessun distretto corrisponde ai filtri.</div>'); return; }
  let h = mineHint + (view === 'cards' ? renderCards(part) : renderTable(part));
  if (list.length > shown) h += `<button class="more" type="button" id="more">Mostra altri ${Math.min(pageSize(), list.length - shown)}</button>`;
  el.innerHTML = h;
}

// ---- Suggerimenti nel campo di ricerca (es. "c" -> California, Colorado, Connecticut…)
let sugActive = -1, sugItems = [];
function buildSuggestions(qRaw) {
  const q = norm(qRaw).trim();
  if (!q) return [];
  const out = [], seen = new Set();
  const add = (it) => { const k = it.type + '|' + it.value; if (!seen.has(k) && out.length < 8) { seen.add(k); out.push(it); } };
  // stati: nome che inizia con q, poi parola del nome che inizia con q (es. "york" -> New York), poi sigla uguale a q
  const sts = new Map();
  races.forEach(r => { const s = sts.get(r.state) || { abbr: r.state, name: r.state_name || r.state, n: 0 }; s.n++; sts.set(r.state, s); });
  const arr = [...sts.values()].sort((a, b) => a.name.localeCompare(b.name));
  arr.filter(s => norm(s.name).startsWith(q)).forEach(s => add({ type: 'stato', value: s.name, label: s.name, sub: `Stato · ${s.n} ${s.n === 1 ? 'distretto' : 'distretti'}` }));
  arr.filter(s => norm(s.name).split(/\s+/).some(w => w.startsWith(q))).forEach(s => add({ type: 'stato', value: s.name, label: s.name, sub: `Stato · ${s.n} ${s.n === 1 ? 'distretto' : 'distretti'}` }));
  arr.filter(s => s.abbr.toLowerCase() === q).forEach(s => add({ type: 'stato', value: s.name, label: s.name, sub: `Stato · ${s.abbr}` }));
  // candidati: una parola del nome inizia con q
  const names = new Map();
  races.forEach(r => (r.candidates || []).forEach(c => {
    if (!c.name || names.has(c.name)) return;
    if (norm(c.name).split(/[\s.,-]+/).some(w => w.startsWith(q))) names.set(c.name, { c, r });
  }));
  [...names.values()].sort((a, b) => a.c.name.localeCompare(b.c.name)).slice(0, 6)
    .forEach(({ c, r }) => add({ type: 'candidato', value: c.name, label: c.name, sub: `Candidato · ${r.name.replace(/at-large/i, '(collegio unico)')} · ${c.party || '?'}` }));
  return out;
}
function boldPrefix(label, qRaw) {
  const q = norm(qRaw).trim(); const n = norm(label);
  const m = q ? n.match(new RegExp('(^|[\\s.,-])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : null;  // inizio di parola
  const i = m ? m.index + m[1].length : -1;
  if (i < 0 || !q) return esc(label);
  return esc(label.slice(0, i)) + '<b>' + esc(label.slice(i, i + q.length)) + '</b>' + esc(label.slice(i + q.length));
}
function bindSuggest(reset) {
  const input = document.getElementById('q'), ul = document.getElementById('sug');
  const close = () => { ul.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); sugActive = -1; };
  const render = () => {
    sugItems = buildSuggestions(input.value); sugActive = -1;
    if (!sugItems.length) { close(); return; }
    ul.innerHTML = sugItems.map((s, i) => `<li role="option" id="sug-${i}" data-i="${i}" aria-selected="false"><span class="sl">${boldPrefix(s.label, input.value)}</span><span class="ss">${esc(s.sub)}</span></li>`).join('');
    ul.hidden = false; input.setAttribute('aria-expanded', 'true');
  };
  const setActive = (i) => {
    ul.querySelectorAll('li').forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    sugActive = i;
    if (i >= 0) { input.setAttribute('aria-activedescendant', 'sug-' + i); const li = document.getElementById('sug-' + i); if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  };
  const choose = (i) => { const s = sugItems[i]; if (!s) return; input.value = s.value; f.q = s.value; close(); reset(); input.focus(); };
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value) render(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (ul.hidden) render(); if (sugItems.length) setActive((sugActive + 1) % sugItems.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (sugItems.length) setActive((sugActive - 1 + sugItems.length) % sugItems.length); }
    else if (e.key === 'Enter') { if (sugActive >= 0 && !ul.hidden) { e.preventDefault(); choose(sugActive); } else close(); }
    else if (e.key === 'Escape') { if (!ul.hidden) { e.preventDefault(); close(); } }
  });
  // pointerdown: funziona con mouse e tocco e non fa perdere il focus al campo prima della scelta
  ul.addEventListener('pointerdown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
}

function shell() {
  const opt = (v, t, cur) => `<option value="${v}"${cur === v ? ' selected' : ''}>${t}</option>`;
  const small = window.innerWidth < 470;
  return `
  <div class="hl-head"><h1>Risultati per distretto<span class="cnt num">${races.length}</span></h1>
    <div class="view-toggle" role="group" aria-label="Visualizzazione">
      <button type="button" data-view="table" aria-pressed="${view === 'table'}">Tabella</button>
      <button type="button" data-view="cards" aria-pressed="${view === 'cards'}">Schede</button></div></div>
  <details class="filters" id="filters"${small ? '' : ' open'}>
    <summary>Filtri e ordinamento</summary>
    <div class="f-grid">
      <label class="field f-search">Cerca<input id="q" type="search" placeholder="Distretto, stato o candidato" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sug"><ul id="sug" class="sug" role="listbox" aria-label="Suggerimenti" hidden></ul></label>
      <label class="field">Regione<select id="region">${opt('', 'Tutte', '')}${Object.entries(REGIONS).map(([k, v]) => opt(k, v, '')).join('')}</select></label>
      <label class="field">Ordina per<select id="sort">${opt('district', 'Distretto', 'district')}${opt('margin', 'Margine', '')}${opt('reporting', 'Scrutinio', '')}${opt('close', 'Chiusura dei seggi', '')}</select></label>
      <label class="field">Margine (punti)<select id="margin">${opt('', 'Tutti', '')}${opt('lt2', 'Meno di 2', '')}${opt('2-5', '2-5', '')}${opt('5-10', '5-10', '')}${opt('gt10', 'Oltre 10', '')}</select></label>
      <label class="field">Sezioni scrutinate<select id="rep">${opt('', 'Tutte', '')}${opt('0', '0%', '')}${opt('lt50', 'Sotto il 50%', '')}${opt('50-90', '50-90%', '')}${opt('gt90', 'Oltre il 90%', '')}</select></label>
      <label class="field">Partito in testa<select id="lead">${opt('', 'Tutti', '')}${opt('D', 'Democratico', '')}${opt('R', 'Repubblicano', '')}${opt('O', 'Altri', '')}</select></label>
    </div>
  </details>
  <div class="chips" id="chips" role="group" aria-label="Filtri rapidi">
    ${[['all', 'Tutte'], ['close', 'Sfide combattute'], ['called', 'Eletto'], ['open', 'Non assegnato'], ['mine', 'Le tue sfide']].map(([k, t]) => `<button class="chip" type="button" data-chip="${k}" aria-pressed="${f.chip === k}"${k === 'mine' ? ' title="Contrassegna i distretti con la stellina ☆ per vederli qui"' : ''}>${t}</button>`).join('')}
    <span class="matches" id="matches" aria-live="polite"></span></div>
  <div class="results" id="results"></div><div id="foot"></div>`;
}

function bind() {
  const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
  const reset = () => { shown = pageSize(); renderResults(); };
  on('q', 'input', (e) => { f.q = e.target.value; reset(); });
  bindSuggest(reset);
  ['region', 'sort', 'margin', 'rep', 'lead'].forEach(id => on(id, 'change', (e) => { f[id] = e.target.value; reset(); }));
  app.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.view) { view = t.dataset.view; app.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view))); renderResults(); }
    else if (t.dataset.chip) { f.chip = t.dataset.chip; app.querySelectorAll('[data-chip]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.chip === f.chip))); reset(); }
    else if (t.dataset.star) { const id = t.dataset.star; memStore.has(id) ? memStore.delete(id) : memStore.add(id); saveStars(); renderResults(); const nb = app.querySelector(`[data-star="${CSS.escape(id)}"]`); if (nb) nb.focus(); }
    else if (t.dataset.xp) { const id = t.dataset.xp; expanded.has(id) ? expanded.delete(id) : expanded.add(id); renderResults(); const nb = app.querySelector(`[data-xp="${CSS.escape(id)}"]`); if (nb) nb.focus(); }
    else if (t.id === 'more') { shown += pageSize(); renderResults(); }
  });
}

async function main() {
  startHeightReporting();
  await applyBranding();
  loadStars();
  try { summary = await loadSummary(); } catch (e) { renderError(app); return; }
  races = (summary.races || []).filter(r => r.chamber === 'house');
  if (!races.length) { renderError(app); return; }
  if (window.innerWidth < 470) view = 'cards';
  app.innerHTML = shell();
  bind(); renderResults();
  // se la larghezza attraversa la soglia dei 500 px si ricalcola la pagina (10 su mobile, 25 altrove)
  let wasMobile = window.innerWidth <= MOBILE_MAX;
  window.addEventListener('resize', () => { const m = window.innerWidth <= MOBILE_MAX; if (m !== wasMobile) { wasMobile = m; shown = pageSize(); renderResults(); } });
  renderFooter(document.getElementById('foot'), summary, { showAutoNote: true });
}
main();
