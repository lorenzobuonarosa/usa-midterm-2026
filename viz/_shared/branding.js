// Carica config/branding.json e lo applica come variabili CSS; carica il font con display=swap.
import { siteUrl } from './data.js';

const MAP = {
  dem: '--c-dem', demText: '--c-dem-text', demTint1: '--c-dem-1', demTint2: '--c-dem-2', demTint3: '--c-dem-3',
  rep: '--c-rep', repText: '--c-rep-text', repTint1: '--c-rep-1', repTint2: '--c-rep-2', repTint3: '--c-rep-3',
  ind: '--c-ind', indText: '--c-ind-text', other: '--c-other', none: '--c-none', border: '--c-border',
  borderStrong: '--c-border-strong', text: '--c-text', textMuted: '--c-muted', bg: '--c-bg', warn: '--c-warn',
  warnBg: '--c-warn-bg', accent: '--c-accent',
  surface: '--c-surface', star: '--c-star', halo: '--c-halo', onAccent: '--c-on-accent', onSolid: '--c-on-solid', warnBorder: '--c-warn-border'
};

export let branding = null;

// Tema dalla pagina ospite (embed/parent.js): segue l'interruttore del tema del sito. Con ?theme= nell'indirizzo resta quello forzato.
let themeForced = false;
try { const t = new URLSearchParams(location.search).get('theme'); themeForced = t === 'dark' || t === 'light'; } catch (e) { /* niente */ }
if (!themeForced && window.parent !== window) {
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window.parent || !d || d.source !== 'radar-midterm-host' || d.type !== 'theme') return;
    if (d.theme === 'dark' || d.theme === 'light') document.documentElement.setAttribute('data-theme', d.theme);
  });
  try { window.parent.postMessage({ source: 'radar-midterm', type: 'hello' }, '*'); } catch (e) { /* nessun genitore */ }
}

// Tema: segue il tema del sistema/browser del lettore (prefers-color-scheme); ?theme=dark o ?theme=light lo forza.
function applyThemeOverride() {
  try {
    const t = new URLSearchParams(location.search).get('theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* nessun override */ }
}

const decl = (o) => Object.entries(o || {}).filter(([k]) => MAP[k]).map(([k, v]) => `${MAP[k]}:${v}`).join(';');

export async function applyBranding() {
  applyThemeOverride();
  try {
    const r = await fetch(siteUrl('config/branding.json'), { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    branding = await r.json();
  } catch (e) { return null; } // si usano i valori predefiniti del CSS (chiaro e scuro)
  // I colori diventano regole CSS (non stili inline) così il tema scuro può sovrascriverli con le media query.
  const light = decl(branding.colors), dark = decl(branding.colorsDark);
  let css = light ? `:root{${light}}` : '';
  if (dark) css += `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}:root[data-theme="dark"]{${dark}}`;
  if (css) { const st = document.createElement('style'); st.setAttribute('data-brand-colors', '1'); st.textContent = css; document.head.appendChild(st); }
  const root = document.documentElement.style;
  if (branding.font) {
    root.setProperty('--font', `'${branding.font.family}', ${branding.font.fallback}`);
    if (branding.font.googleCss && !document.querySelector('link[data-brand-font]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = branding.font.googleCss; l.setAttribute('data-brand-font', '1');
      document.head.appendChild(l);
    }
  }
  return branding;
}

export function colorOf(party, band = 3) {
  const s = getComputedStyle(document.documentElement);
  const g = (n) => s.getPropertyValue(n).trim();
  if (party === 'D') return g(`--c-dem-${band}`);
  if (party === 'R') return g(`--c-rep-${band}`);
  if (party === 'I') return g('--c-ind');
  return g('--c-other');
}
