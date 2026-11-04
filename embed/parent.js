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

  // ---- Tema: gli embed seguono il tema della pagina ospite (anche se scelto con l'interruttore del sito, non solo quello del dispositivo).
  // Il tema si ricava dal colore di sfondo effettivo attorno all'iframe (funziona con qualsiasi sistema di temi) e si invia via postMessage.
  function lum(c) {
    var m = String(c).match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    if (m.length > 3 && Number(m[3]) < 0.5) return null; // trasparente
    return (0.2126 * Number(m[0]) + 0.7152 * Number(m[1]) + 0.0722 * Number(m[2])) / 255;
  }
  function hostTheme(frame) {
    var el = frame;
    while (el && el.nodeType === 1) {
      var l = lum(getComputedStyle(el).backgroundColor);
      if (l !== null) return l < 0.45 ? 'dark' : 'light';
      el = el.parentElement;
    }
    var cs = getComputedStyle(document.documentElement).colorScheme || '';
    if (/\bdark\b/.test(cs) && !/\blight\b/.test(cs)) return 'dark';
    return 'light';
  }
  var sent = [];
  function sendTheme(frame, force) {
    var idx = Array.prototype.indexOf.call(document.getElementsByTagName('iframe'), frame);
    var t = hostTheme(frame);
    if (!force && sent[idx] === t) return;
    sent[idx] = t;
    try { frame.contentWindow.postMessage({ source: 'radar-midterm-host', type: 'theme', theme: t }, origin); } catch (e) {}
  }
  function radarFrames() {
    var all = document.getElementsByTagName('iframe'), out = [];
    for (var i = 0; i < all.length; i++) {
      try { if (new URL(all[i].src, document.baseURI).origin === origin) out.push(all[i]); } catch (e) {}
    }
    return out;
  }
  function checkThemes(force) { radarFrames().forEach(function (f) { sendTheme(f, force); }); }
  setInterval(checkThemes, 1500);
  try { if (window.MutationObserver) { var mo = new MutationObserver(function () { checkThemes(); });
    mo.observe(document.documentElement, { attributes: true }); if (document.body) mo.observe(document.body, { attributes: true }); } } catch (e) {}
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { setTimeout(checkThemes, 50); }); } catch (e) {}

  window.addEventListener('message', function (event) {
    if (event.origin !== origin) return;
    var d = event.data;
    if (d && d.source === 'radar-midterm' && d.type === 'hello') {
      var fr = radarFrames().filter(function (f) { return f.contentWindow === event.source; })[0];
      if (fr) sendTheme(fr, true);
      return;
    }
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
