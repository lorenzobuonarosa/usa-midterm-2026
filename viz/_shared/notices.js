// Piè di pagina condiviso: fonte, disclaimer con ora italiana, avviso di dato vecchio, nota sul 4 novembre.
import { fmtTime } from './format.js';

const STALE_MIN = 75;

export function renderFooter(el, summary, { showAutoNote = false } = {}) {
  const m = (summary && summary.meta) || {};
  const now = Date.now();
  const from = m.auto_updates_from ? Date.parse(m.auto_updates_from) : null;
  const before = from && now < from;
  const fetched = m.fetched_at ? Date.parse(m.fetched_at) : null;
  const ageMin = fetched ? (now - fetched) / 60000 : null;
  const stale = !before && (m.status === 'stale' || (ageMin != null && ageMin > STALE_MIN));
  let html = '';
  if (before) {
    html += `<p class="notice">Gli aggiornamenti automatici partono alle 07:00 del 4 novembre.</p>`;
  } else if (stale) {
    html += `<p class="notice warn" role="status">Attenzione: i dati potrebbero non essere aggiornati (ultimo aggiornamento alle ${fmtTime(m.fetched_at)}).</p>`;
  }
  const upd = m.fetched_at ? `Risultati non ufficiali, aggiornati alle ${fmtTime(m.fetched_at)}` : 'Risultati non ufficiali';
  html += `<div class="foot"><p>${upd}.</p>`;
  if (showAutoNote) html += `<p>Le assegnazioni automatiche si basano sui voti scrutinati e non sono proiezioni di AP o di altre testate.</p>`;
  html += `<p>Fonte: civicAPI (civicapi.org)</p></div>`;
  el.innerHTML = html;
}

export function renderError(el, msg = 'Dati non disponibili') {
  el.innerHTML = `<div class="empty" role="alert">${msg}</div>`;
}
