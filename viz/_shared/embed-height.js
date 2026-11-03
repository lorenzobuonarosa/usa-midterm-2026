// Comunica l'altezza del contenuto alla pagina ospite via postMessage.
// Regole: nessun uso di 100vh; si misura il <body> (altezza dal contenuto),
// si aggrega con requestAnimationFrame, si ignorano variazioni sotto 2 px
// e si invia solo se l'altezza è cambiata.

const SOURCE = 'radar-midterm';
let last = null;
let scheduled = false;

function measure() {
  const b = document.body;
  if (!b) return 0;
  // altezza del body (margini azzerati dal CSS di base) arrotondata per eccesso
  return Math.ceil(b.getBoundingClientRect().height);
}

function send() {
  scheduled = false;
  const h = measure();
  if (!h) return;
  if (last !== null && Math.abs(h - last) < 2) return;
  if (h === last) return;
  last = h;
  fallbackScroll();
  try {
    // '*' perché l'origine della pagina ospite (sito QN) non è nota; il messaggio contiene solo un intero
    window.parent.postMessage({ source: SOURCE, type: 'height', height: h }, '*');
  } catch (e) { /* nessun genitore raggiungibile: non è un errore */ }
}

// Riserva: se l'iframe NON viene adattato dal genitore (altezza fissa nel CMS, script mancante, JavaScript disattivato)
// e il contenuto è più alto della finestra, si abilita lo scorrimento verticale dell'embed, altrimenti la parte
// sotto resterebbe irraggiungibile (html/body hanno overflow hidden). Con l'altezza adattata il contenuto entra
// esattamente e lo scorrimento resta spento. Si valuta dopo 1,5 s dal caricamento per non far comparire barre transitorie.
let fallbackArmed = false;
function fallbackScroll() {
  if (!fallbackArmed) return;
  const h = measure();
  document.documentElement.style.overflowY = (h > window.innerHeight + 2) ? 'auto' : '';
}

export function scheduleHeight() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(send);
}

export function startHeightReporting() {
  const inFrame = window.parent !== window;
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { if (inFrame) scheduleHeight(); fallbackScroll(); }).observe(document.body);
  }
  window.addEventListener('load', () => { if (inFrame) scheduleHeight(); });
  window.addEventListener('resize', () => { if (inFrame) scheduleHeight(); fallbackScroll(); });
  // vale anche aprendo l'embed direttamente in una scheda (fuori da un iframe): senza questo la pagina non scorrerebbe
  setTimeout(() => { fallbackArmed = true; fallbackScroll(); }, 1500);
  if (inFrame) scheduleHeight();
}

// Utile ai test: ultima altezza inviata
export function lastSentHeight() { return last; }
