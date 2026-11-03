// Formattazione numeri e ora in italiano
const nf = new Intl.NumberFormat('it-IT');
const nf1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const tf = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome', hour12: false });
const df = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });

export const fmtInt = (n) => (n == null || isNaN(n)) ? '–' : nf.format(n);
export const fmtPct = (n, d = 1) => (n == null || isNaN(n)) ? '–' : (d === 0 ? nf0.format(n) : nf1.format(n)) + '%';
export const fmtPts = (n) => (n == null || isNaN(n)) ? '–' : nf1.format(n) + ' punti';
export function fmtTime(iso) { if (!iso) return '–'; const d = new Date(iso); return isNaN(d) ? '–' : tf.format(d); }
export function fmtDateTime(iso) { if (!iso) return '–'; const d = new Date(iso); return isNaN(d) ? '–' : df.format(d) + ', ' + tf.format(d); }
export const PARTY_NAME = { D: 'Democratici', R: 'Repubblicani', I: 'Indipendenti', O: 'Altri' };
export const PARTY_SHORT = { D: 'D', R: 'R', I: 'Ind.', O: 'Altri' };
export const STATUS_LABEL = {
  not_started: 'In attesa dei risultati', counting: 'Scrutinio in corso', leading: 'In testa',
  called: 'Assegnata', runoff_possible: 'Possibile ballottaggio'
};
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
