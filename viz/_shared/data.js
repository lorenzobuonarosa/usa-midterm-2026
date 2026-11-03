// Caricamento dei JSON statici. Le dataviz leggono SOLO questi file: nessuna chiamata a civicAPI dal browser.
export const SITE_ROOT = new URL('../../', import.meta.url);

export function siteUrl(path) { return new URL(path, SITE_ROOT).href; }

let version = '';

// summary.json va sempre riconvalidato (cache: 'no-cache'); gli altri file usano ?v=<fetched_at>
export async function loadSummary() {
  const r = await fetch(siteUrl('data/summary.json'), { cache: 'no-cache' });
  if (!r.ok) throw new Error('summary ' + r.status);
  const s = await r.json();
  version = (s.meta && s.meta.fetched_at) || '';
  return s;
}

export async function loadJSON(path, { versioned = true } = {}) {
  let url = siteUrl(path);
  if (versioned && version) url += (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(version);
  const r = await fetch(url);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

export function loadText(path) {
  return fetch(siteUrl(path)).then(r => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.text(); });
}
