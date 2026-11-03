/*
 * Radar QN – script per la pagina ospite (sito QN).
 * Ascolta i messaggi di altezza degli embed e imposta SOLO iframe.style.height.
 * Nessuna variabile globale, nessun CSS iniettato.
 * L'origine attesa è quella da cui è servito questo stesso script.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) {
    // caricamento asincrono: cerca lo script per nome file
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (/\/embed\/parent\.js(\?|#|$)/.test(all[i].src || '')) { script = all[i]; break; }
    }
  }
  if (!script || !script.src) return;

  var origin;
  try { origin = new URL(script.src, document.baseURI).origin; } catch (e) { return; }

  window.addEventListener('message', function (event) {
    if (event.origin !== origin) return;
    var d = event.data;
    if (!d || d.source !== 'radar-midterm' || d.type !== 'height') return;
    var h = Math.ceil(Number(d.height));
    if (!isFinite(h) || h <= 0 || h > 100000) return;
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        // altezza fissa voluta dal redattore: l'attributo data-radar-fixed-height sull'iframe disattiva l'adattamento
        if (frames[i].hasAttribute('data-radar-fixed-height')) return;
        frames[i].style.height = h + 'px';
        return;
      }
    }
  });
})();
