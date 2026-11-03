// Carica config/branding.json e lo applica come variabili CSS; carica il font con display=swap.
import { siteUrl } from './data.js';

const MAP = {
  dem: '--c-dem', demText: '--c-dem-text', demTint1: '--c-dem-1', demTint2: '--c-dem-2', demTint3: '--c-dem-3',
  rep: '--c-rep', repText: '--c-rep-text', repTint1: '--c-rep-1', repTint2: '--c-rep-2', repTint3: '--c-rep-3',
  ind: '--c-ind', indText: '--c-ind-text', other: '--c-other', none: '--c-none', border: '--c-border',
  borderStrong: '--c-border-strong', text: '--c-text', textMuted: '--c-muted', bg: '--c-bg', warn: '--c-warn',
  warnBg: '--c-warn-bg', accent: '--c-accent'
};

export let branding = null;

export async function applyBranding() {
  try {
    const r = await fetch(siteUrl('config/branding.json'), { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    branding = await r.json();
  } catch (e) { return null; } // si usano i valori predefiniti del CSS
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(branding.colors || {})) if (MAP[k]) root.setProperty(MAP[k], v);
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
