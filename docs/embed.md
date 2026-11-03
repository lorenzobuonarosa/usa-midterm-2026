# Incorporare le dataviz nel sito QN

Base: `https://lorenzobuonarosa.github.io/usa-midterm-2026/`

Ogni dataviz è una pagina HTML autonoma. L'altezza dell'iframe segue il contenuto: la pagina figlia la comunica con `postMessage`
e lo script `embed/parent.js` (da caricare **una sola volta per pagina**, anche con più iframe) imposta solo `iframe.style.height`.
Senza JavaScript l'iframe resta usabile con l'altezza minima indicata.

## Snippet da incollare nel CMS

### 1. Equilibrio dei poteri (Camera, Senato, governatori)
```html
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/balance/" title="Midterm USA 2026: equilibrio dei poteri tra Camera, Senato e governatori" loading="lazy" style="width:100%;border:0;display:block;min-height:420px"></iframe>
```

### 2. Mappa degli stati (schede Senato e Governatori)
```html
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/map-states/" title="Midterm USA 2026: mappa degli stati, Senato e governatori" loading="lazy" style="width:100%;border:0;display:block;min-height:520px"></iframe>
```

### 3. Mappa dei 435 distretti della Camera
```html
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/map-house/" title="Midterm USA 2026: mappa dei 435 distretti della Camera" loading="lazy" style="width:100%;border:0;display:block;min-height:520px"></iframe>
```

### 4. Lista dei distretti (tabella e schede, filtri)
```html
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/house-list/" title="Midterm USA 2026: risultati per distretto della Camera" loading="lazy" style="width:100%;border:0;display:block;min-height:520px"></iframe>
```

### Lo script (una sola riga per pagina, dopo gli iframe)
```html
<script src="https://lorenzobuonarosa.github.io/usa-midterm-2026/embed/parent.js"></script>
```

Tutte e quattro insieme, per provare: `https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/all/`.
Pagina di prova con altezza variabile (non collegata da altre pagine): `…/viz/_test/`.

## Cosa fa `parent.js`
- IIFE senza globali, nessun CSS iniettato.
- Accetta solo messaggi con `event.origin` uguale all'origine da cui è servito lo script stesso, con forma `{source: 'radar-midterm', type: 'height', height: <intero>}`.
- Trova l'iframe confrontando `event.source` con `iframe.contentWindow` e imposta solo `iframe.style.height`.

## Nota per il team di sviluppo QN
- Il sito deve consentire l'origine `https://lorenzobuonarosa.github.io` nella policy **`frame-src`** (o `child-src`) della Content-Security-Policy, e `script-src` per `parent.js`.
- **Verificato con una richiesta reale a deploy fatto** (3 novembre 2026, dal runner GitHub): `https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/_test/` risponde `200` e
  **non** invia `X-Frame-Options` né `Content-Security-Policy: frame-ancestors`. Intestazioni rilevanti: `access-control-allow-origin: *`, `cache-control: max-age=600`.
  L'esito è nel log del job `deploy` (step "Verifica intestazioni della pagina pubblicata").
- Gli embed non chiamano mai civicAPI: leggono solo i JSON statici del sito.

## Ritardi da mettere in conto
Le Action pianificate di GitHub possono partire con **diversi minuti di ritardo** e la cache di GitHub Pages (`max-age=600`) ne aggiunge altri (i JSON sono richiesti con `?v=<orario dell'aggiornamento>`,
e `summary.json` con riconvalida, ma la rete di distribuzione può comunque servire una copia fino a 10 minuti).
Il ritardo percepito può quindi arrivare a **10-20 minuti oltre la cadenza di 30**. Ogni dataviz mostra "aggiornati alle HH:MM" (ora italiana) e un avviso se il dato ha più di 75 minuti.
