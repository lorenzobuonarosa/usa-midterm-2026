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

## Altezza fissa (per la lista dei distretti su mobile)

Di norma `parent.js` adatta l'altezza dell'iframe al contenuto. Se in redazione serve un'**altezza fissa** (per esempio una colonna di layout che non deve cambiare), aggiungi l'attributo `data-radar-fixed-height` all'iframe: lo script lo lascia com'è.

Sotto i 500 px la lista dei distretti mostra **10 righe alla volta** in un'area con altezza massima fissa (circa 810 px) che scorre in verticale e in orizzontale al suo interno;
"Mostra altri 10" aggiunge righe dentro l'area **senza cambiare l'altezza dell'embed**. Altezze misurate con i filtri chiusi (vista Tabella e vista Schede, 320-414 px di larghezza, anche dopo "Mostra altri 10"): da 1.410 a 1.450 px; a 499 px fino a 1.511 px.

```html
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/house-list/" title="Midterm USA 2026: risultati per distretto della Camera" loading="lazy" data-radar-fixed-height style="width:100%;border:0;display:block;height:1520px"></iframe>
```
- Con il pannello dei filtri aperto il contenuto cresce di circa 440 px: se l'iframe è più basso del contenuto, **l'embed diventa scorrevole al suo interno** (scroll di riserva), quindi nulla resta irraggiungibile.
  Lo stesso vale se si apre l'indirizzo dell'embed direttamente, o se `parent.js` manca o JavaScript è disattivato.
- Su desktop e tablet non serve altezza fissa: lascia l'adattamento automatico (snippet senza l'attributo).
- A fine corsa dell'area scorrevole, il gesto passa alla pagina (niente "trappola" di scroll).

## Senza script, con altezza fissa (nuova piattaforma)
Nessuno `parent.js`: ogni iframe ha un'altezza fissa. Se l'iframe è più basso del contenuto, l'embed scorre al suo interno (nulla resta irraggiungibile).
Senza lo script il tema chiaro/scuro segue solo il dispositivo del lettore (non l'interruttore del sito).
Altezze misurate a 320-1000 px di larghezza (compreso l'avviso "dati non aggiornati", quindi con dati freschi c'è un po' di margine in più).

**Versione A – solo attributi (una sola altezza, sempre sicura):**
```html
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/balance/" title="Midterm USA 2026: equilibrio dei poteri tra Camera, Senato e governatori" loading="lazy" style="width:100%;height:1240px;border:0;display:block"></iframe>
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/map-states/" title="Midterm USA 2026: mappa degli stati, Senato e governatori" loading="lazy" style="width:100%;height:920px;border:0;display:block"></iframe>
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/map-house/" title="Midterm USA 2026: mappa dei 435 distretti della Camera" loading="lazy" style="width:100%;height:1010px;border:0;display:block"></iframe>
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/house-list/" title="Midterm USA 2026: risultati per distretto della Camera" loading="lazy" style="width:100%;height:1520px;border:0;display:block"></iframe>
```
**Versione B – con un blocco `<style>` (altezze diverse su mobile e desktop, meno spazio vuoto):** se la piattaforma accetta `<style>` nell'HTML, incolla una volta il blocco e usa le classi.
```html
<style>
.rq{width:100%;border:0;display:block}
.rq-balance{height:1240px}.rq-states{height:700px}.rq-house{height:800px}.rq-list{height:1520px}
@media (min-width:500px){.rq-balance{height:930px}.rq-states{height:920px}.rq-house{height:1010px}.rq-list{height:2450px}}
</style>
<iframe class="rq rq-balance" src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/balance/" title="Midterm USA 2026: equilibrio dei poteri" loading="lazy"></iframe>
<iframe class="rq rq-states" src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/map-states/" title="Midterm USA 2026: mappa degli stati" loading="lazy"></iframe>
<iframe class="rq rq-house" src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/map-house/" title="Midterm USA 2026: mappa dei distretti della Camera" loading="lazy"></iframe>
<iframe class="rq rq-list" src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/house-list/" title="Midterm USA 2026: risultati per distretto" loading="lazy"></iframe>
```

**Versione C – due misure (mobile / desktop) senza `<style>`, tutto nell'attributo `style`:** sotto i 420 px di larghezza vale l'altezza da telefono, sopra i 500 px quella da desktop, in mezzo una transizione. Usa `clamp()` di CSS (browser moderni).
```html
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/balance/" title="Midterm USA 2026: equilibrio dei poteri" loading="lazy" style="width:100%;border:0;display:block;height:clamp(930px,calc(1240px - 3.9*(100vw - 420px)),1240px)"></iframe>
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/map-states/" title="Midterm USA 2026: mappa degli stati" loading="lazy" style="width:100%;border:0;display:block;height:clamp(700px,calc(700px + 2.75*(100vw - 420px)),920px)"></iframe>
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/map-house/" title="Midterm USA 2026: mappa dei distretti della Camera" loading="lazy" style="width:100%;border:0;display:block;height:clamp(800px,calc(800px + 2.6*(100vw - 420px)),1010px)"></iframe>
<iframe src="https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/house-list/" title="Midterm USA 2026: risultati per distretto" loading="lazy" style="width:100%;border:0;display:block;height:clamp(1520px,calc(1520px + 11.6*(100vw - 420px)),2450px)"></iframe>
```
Misure: telefono 1240 / 700 / 800 / 1520 px; desktop 930 / 920 / 1010 / 2450 px (balance, map-states, map-house, house-list). Verificato a 320-1400 px.

## Tema chiaro / scuro
- **Con `parent.js` nella pagina** (consigliato): gli embed seguono il tema della pagina QN, compreso l'interruttore "Tema del sito" (Sistema / Chiaro / Scuro). `parent.js` guarda il colore di sfondo attorno all'iframe, ricava chiaro o scuro e lo comunica agli iframe via postMessage; il cambio dal vivo si vede entro ~2 secondi.
- **Senza `parent.js`** (o aprendo l'embed da solo): segue il tema del dispositivo (`prefers-color-scheme`).
- **Forzare un tema**: `?theme=dark` o `?theme=light` nell'indirizzo dell'iframe (prevale su tutto).
- Le palette stanno in `config/branding.json` (`colors` = chiaro, `colorsDark` = scuro).

## Cosa fa `parent.js`
- IIFE senza globali, nessun CSS iniettato.
- Accetta solo messaggi con `event.origin` uguale all'origine da cui è servito lo script stesso, con forma `{source: 'radar-midterm', type: 'height', height: <intero>}`.
- Trova l'iframe confrontando `event.source` con `iframe.contentWindow` e imposta solo `iframe.style.height` (tranne sugli iframe con `data-radar-fixed-height`).

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
