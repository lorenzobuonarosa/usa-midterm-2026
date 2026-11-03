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
  try {
    // '*' perché l'origine della pagina ospite (sito QN) non è nota; il messaggio contiene solo un intero
    window.parent.postMessage({ source: SOURCE, type: 'height', height: h }, '*');
  } catch (e) { /* nessun genitore raggiungibile: non è un errore */ }
}

export function scheduleHeight() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(send);
}

export function startHeightReporting() {
  if (window.parent === window) return; // non in iframe: niente da inviare
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(scheduleHeight);
    ro.observe(document.body);
  }
  window.addEventListener('load', scheduleHeight);
  window.addEventListener('resize', scheduleHeight);
  scheduleHeight();
}

// Utile ai test: ultima altezza inviata
export function lastSentHeight() { return last; }
