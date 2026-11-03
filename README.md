# Midterm USA 2026 – dataviz live per Radar (QN Media)

Sistema di dataviz per le elezioni di midterm USA del 3 novembre 2026. D3 e TopoJSON in vanilla JavaScript (copie locali in `vendor/`), pubblicati su GitHub Pages.
Nessun servizio a pagamento, nessuna chiave API. **Nessuna pagina chiama civicAPI dal browser**: lo fa solo uno script server-side, e le dataviz leggono i JSON statici.

Fonte dei dati: **civicAPI (civicapi.org)** – attribuzione obbligatoria, presente in ogni dataviz. I risultati sono **non ufficiali**.

## Come funziona

```
civicAPI ──► scripts/fetch_results.py (GitHub Action ogni 30 minuti) ──► data/*.json ──► GitHub Pages ──► iframe nel sito QN
```

- `.github/workflows/update.yml` parte ogni 30 minuti; lo script decide se è il momento (`config/schedule.json`):
  nessun aggiornamento automatico prima delle **07:00 italiane del 4 novembre** (06:00 UTC); poi ogni 30 minuti fino al 6 novembre 00:00 UTC; poi una volta al giorno.
- Richieste a civicAPI per giro: 2 ricerche (Senato, governatori) + 1 per tutta la Camera (la gara aggregata `87524` contiene i 435 distretti) + il dettaglio solo per le gare chiave
  (`config/key_races.json`, più quelle con margine sotto i 5 punti e almeno il 20% di scrutinio) e per quelle candidate all'assegnazione automatica. User-Agent `RadarQN-midterms-2026`, backoff su 429/5xx.
- Lo stato tra un giro e l'altro (`data/normalized.json`, `timeline.json`…) si recupera dal sito Pages già pubblicato. Una volta al giorno uno snapshot va sul branch `archive`.
- Il deploy è via Actions (`upload-pages-artifact` + `deploy-pages`): non crea commit a ogni giro. Verificato nella [documentazione ufficiale dei limiti di GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): il limite morbido di 10 build all'ora **non si applica** a chi pubblica con un workflow personalizzato di GitHub Actions (restano 1 GB di sito, 100 GB al mese di banda e timeout di 10 minuti per il deploy).
- Dati vecchi o errori: mai sovrascrivere gli ultimi dati buoni. Se un giro fallisce `meta.status = "stale"` e le dataviz mostrano un avviso dopo 75 minuti.

### Assegnazione delle gare
Il campo `winner` di civicAPI **non** si usa (registrato solo come `civicapi_winner`). Una gara è "assegnata" solo:
1. **a mano**, se compare in `config/calls.json`;
2. **in automatico**, con la regola prudente di `config/auto_calls.json`: scrutinio ≥ 80%, vantaggio > 1,5 × voti stimati ancora da contare, dato civicAPI non più vecchio di 3 ore,
   gara non contestata, nessuna assegnazione in caso di più vincitori (ballottaggi), in Georgia sotto il 50% (ballottaggio 1 dicembre), in Alaska/Maine sotto il 50% delle prime preferenze.
   Le gare con un solo candidato sono assegnate dopo la chiusura dei seggi ("senza avversari").
Altrimenti lo stato è "in testa". Ogni assegnazione e revoca è in `data/calls_log.json`. Il manuale vince sempre; `hold` sospende l'automatico.

## Aggiornare le config dal sito di GitHub (senza terminale)
Ogni modifica a `config/**` fa ripartire il workflow in modalità `rebuild` (non chiama civicAPI): le assegnazioni appaiono in un paio di minuti.

1. Apri il file su GitHub (es. `config/calls.json`) → icona matita → modifica → **Commit changes** (direttamente su `main`).
2. `config/calls.json` – assegnazioni manuali. Esempio:
   ```json
   {
     "calls": [
       { "race_id": "87527", "winner": "Nome Cognome", "method": "manual", "note": "fonte" }
     ],
     "hold": ["87000"]
   }
   ```
   `race_id` è nel file `data/summary.json` (campo `id`; per la Camera è l'id del distretto). `winner` deve coincidere con il nome del candidato nel dato.
   Il file è validato a ogni giro: se è sbagliato si usa l'ultima versione valida e l'errore compare nei log e in `data/quality.json`.
3. `config/key_races.json` – gare con il dettaglio per contea: liste di sigle per `senate` e `governor`, e `house` come `"AZ-01"` (per gli stati con un solo distretto: `"WY-AL"`). In alternativa gli id in `race_ids`.
4. `config/baseline.json` – seggi non in palio e soglie (218 Camera, 51 Senato). `config/branding.json` – tutti i colori e il font in un solo punto.

## Lanciare un giro a mano
GitHub → **Actions** → workflow **update** → **Run workflow** → modalità:
- `normal` – giro normale (da dispatch il calendario viene ignorato);
- `force` – ignora il calendario e aggiorna;
- `rebuild` – rigenera i JSON da ultimo dato e config, senza chiamare civicAPI;
- `discover` – esplorazione di civicAPI (salva le risposte grezze sul branch `discovery`).

Dopo i giri manuali una copia dei dati è sul branch `data-preview`.

## Se civicAPI è giù
Non serve fare nulla: i giri falliti non toccano gli ultimi dati buoni (status `stale`, avviso nelle dataviz dopo 75 minuti) e si riprova al giro successivo.
Dopo errori 429/5xx lo script fa backoff e rinuncia; non insiste. Controlla lo stato su `https://civicapi.org/api/v2/status`. Per assegnare comunque le gare: `config/calls.json`.

## Sviluppo e test
```bash
python scripts/fetch_results.py --selftest                         # test interni (nessuna rete)
python tests/make_fixture.py night 7                                # serata simulata (voti inventati)
python scripts/fetch_results.py --dry-run --force --fixture tests/fixtures/night_sim.json
python scripts/fetch_results.py --force --fixture tests/fixtures/night_sim.json   # scrive in data/
node tests/browser/run.js                                           # test Playwright su 8 larghezze + integrazione
```
Screenshot dei test in `tests/screenshots/`. Struttura: `viz/` (embed e `_shared/`), `embed/parent.js`, `assets/geo/`, `vendor/`, `config/`, `scripts/`, `tests/`, `docs/`.

## Documentazione
- [Snippet iframe e note per il team QN](docs/embed.md)
- [Esplorazione di civicAPI](docs/discovery.md) · [Geodati](docs/geo-sources.md)
- `STATUS.md` – stato dei lavori, scelte prese, passaggi manuali.

## Note
- Font: **Inter** (display=swap). Tabelle e numeri con cifre tabulari.
- Orari di chiusura dei seggi in `config/polls_close.json`: valori consueti, da verificare; il dettaglio della gara ha la precedenza quando disponibile.
- `config/baseline.json`: i valori del mockup sono coerenti con le gare aggregate di civicAPI e col calendario elettorale, ma **non** sono stati confrontati con senate.gov o NGA (siti non raggiungibili dall'ambiente di sviluppo).
