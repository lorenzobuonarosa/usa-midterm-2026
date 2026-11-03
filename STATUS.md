# STATUS – Radar QN midterm 2026

Ultimo aggiornamento: 2026-11-03 16:45 (ora italiana)

## Fatto e verificato
- Repository clonato; accessi controllati (vedi sotto).
- `vendor/` con D3 7.9.0 e topojson-client 3.1.0 (copie locali).

## Fatto ma non verificato
- `embed/parent.js`, `viz/_shared/embed-height.js`, `viz/_test/`, `.github/workflows/update.yml` (primo deploy in corso).
- `scripts/discover.py` e `discovery/plan.json` (giro 1 di esplorazione).

## Manca
- Pipeline dati, frontend, test, documentazione (tutte le fasi 0-4).

## Problemi aperti
- `civicapi.org` bloccato dal proxy dell'ambiente (403): esplorazione tramite GitHub Action (branch `discovery`).
- `*.github.io`, `www2.census.gov`, `cdn.jsdelivr.net`, `unpkg.com` bloccati dal proxy: non posso verificare Pages dal sandbox.
- Token `gh` non valido: si usano i tool GitHub MCP e `git`.

## Scelte prese al posto di Lorenzo
- Font: Inter.
- Lavoro direttamente su `main` (autorizzato).

## Da fare per Lorenzo alle 11
- Compilare `config/calls.json` per le gare combattute.
- Controllare `config/baseline.json`.
- Controllare le assegnazioni automatiche in `data/calls_log.json`.
