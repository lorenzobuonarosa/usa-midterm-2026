// Utilità condivise sulle gare: colori in base a stato e margine, righe del tooltip, testi di stato
import { fmtInt, fmtPct, esc, STATUS_LABEL } from './format.js';
import { branding } from './branding.js';

export const hasVotes = (r) => r && r.total_votes > 0 && r.status !== 'not_started';

export function band(margin) {
  const b = (branding && branding.marginBands) || { band1: 5, band2: 15 };
  if (margin == null) return 1;
  return margin < b.band1 ? 1 : margin < b.band2 ? 2 : 3;
}

// Restituisce il colore CSS (variabile) per una gara
export function fillFor(r) {
  if (!r) return 'var(--c-none)';
  const called = r.called && r.called.party;
  if (called) return called === 'D' ? 'var(--c-dem)' : called === 'R' ? 'var(--c-rep)' : 'var(--c-ind)';
  if (!hasVotes(r) || !r.leader) return 'var(--c-none)';
  const p = r.leader.party, k = band(r.margin_pct);
  if (p === 'D') return `var(--c-dem-${k})`;
  if (p === 'R') return `var(--c-rep-${k})`;
  return 'var(--c-other)';
}

export function statusText(r) {
  if (!r) return 'Nessuna gara';
  if (r.called) return r.called.method === 'manual' ? 'Assegnata' : (r.called.method === 'unopposed' ? 'Assegnata (senza avversari)' : 'Assegnata automaticamente');
  if (r.status === 'runoff_possible') return 'Possibile ballottaggio';
  if (!hasVotes(r)) return 'In attesa dei risultati';
  return 'In testa';
}

export function partyTag(p) { return `<span class="party-tag party-${p || 'O'}">${p || '?'}</span>`; }

// Blocco HTML di una gara per il tooltip
export function raceTooltipBlock(r, { showName = true, label = '' } = {}) {
  const pr = r.percent_reporting;
  let h = `<div class="t-race">`;
  if (showName) h += `<div class="t-title">${esc(r.name)}${r.rcv ? ' <span class="t-muted">· prime preferenze</span>' : ''}</div>`;
  else { const bits = [label, r.rcv ? 'prime preferenze' : ''].filter(Boolean).join(' · '); if (bits) h += `<div class="t-muted" style="margin-bottom:2px">${esc(bits)}</div>`; }
  if (!hasVotes(r)) {
    h += `<div class="t-muted">Nessun voto scrutinato</div>`;
    (r.candidates || []).slice(0, 8).forEach(c => { h += `<div class="t-row"><span class="nm">${partyTag(c.party)}${esc(c.name)}</span></div>`; });
  } else {
    (r.candidates || []).filter(c => c.votes > 0 || (r.candidates.length <= 6)).slice(0, 6).forEach(c => {
      h += `<div class="t-row"><span class="nm">${partyTag(c.party)}${esc(c.name)}</span><span class="num">${fmtInt(c.votes)} · ${fmtPct(c.percent)}</span></div>`;
    });
    h += `<div class="t-muted" style="margin-top:4px">${statusText(r)}`;
    if (r.called && r.called.method === 'auto') h += ` (${fmtPct(r.called.percent_reporting, 0)} scrutinato, vantaggio di ${fmtInt(r.called.margin_votes)} voti)`;
    if (r.called && r.called.method === 'unopposed') h += '';
    h += `</div>`;
  }
  if (r.flags && r.flags.includes('revocata')) h += `<div class="t-muted">Assegnazione automatica revocata</div>`;
  h += `</div>`;
  return h;
}
