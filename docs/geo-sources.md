# Geodati: fonti, licenze, controlli

Tutti i file sono in `assets/geo/` e vengono caricati solo dall'embed che li usa.

| File | Peso | Usato da | Fonte | Licenza |
|---|---|---|---|---|
| `states.json` | 32 KB | `map-states` | [`us-atlas`](https://github.com/topojson/us-atlas) 3.0.1 (dati Census, id = FIPS), 50 stati + DC, semplificato (mapshaper) e quantizzato | ISC (us-atlas), dati Census di pubblico dominio |
| `districts.json` | 905 KB | `map-house` | Census Bureau, **TIGER/Line 2026, 120° Congresso** (`TIGER2026/CD/tl_2026_<FIPS>_cd120.zip`), 435 distretti, semplificato (Visvalingam 6 %, topologia preservata) e quantizzato (20.000) | Pubblico dominio (si cita il Census Bureau) |
| `counties.json` | 634 KB | nessun embed per ora (dettaglio per contea in `data/races/<id>.json`) | `us-atlas` 3.0.1 `counties-10m`, semplificato e quantizzato | come sopra |
| `src/` | – | non pubblicato sul sito | file originali: i due TopoJSON forniti da Lorenzo (`stati_us.topojson`, `cb_2025_us_cd119_20m.topojson`) e gli originali di `us-atlas` | – |

Obiettivi di peso rispettati: stati < 100 KB, distretti ≤ 1,5 MB, contee ≤ 800 KB (non compressi; GitHub Pages serve i file compressi).

## Distretti 2026: come ho scelto i confini

1. Il file fornito (`cb_2025_us_cd119_20m`) è del **119° Congresso**: ha 437 geometrie (435 + DC + Porto Rico) ma **non** contiene le mappe ridisegnate a metà decennio.
2. Il Census ha pubblicato i confini del **120° Congresso** (in vigore per le elezioni 2026) in `TIGER2026/CD/`: li ho scaricati con una GitHub Action (`geo-build`, perché il sandbox non raggiunge census.gov) e processati con `scripts/geo/build_districts.py`.
   La versione cartografica semplificata (`GENZ2026`) non esiste ancora, quindi si parte dai TIGER/Line a piena risoluzione.
3. **Verifica stato per stato** (confronto geometrico TIGER2026-cd120 contro TIGER2025-cd119, indice di sovrapposizione per ogni distretto, soglia 0,97): i distretti cambiati sono in **10 stati** –
   Alabama (4 su 7), California (42 su 52), Florida (18 su 28), Louisiana (6 su 6), Missouri (6 su 8), North Carolina (2 su 14), Ohio (13 su 15), Tennessee (7 su 9), Texas (36 su 38), Utah (4 su 4).
   Il dettaglio per distretto è in `docs/geo-report.json`. Gli altri 40 stati risultano invariati.
   Gli stati con mappe ridisegnate coincidono con quelli riportati da fonti giornalistiche del 2025-2026 per CA, MO, NC, OH, TX, UT, FL, TN, AL (e LA per decisione giudiziaria): fonti consultate
   [Ballotpedia](https://ballotpedia.org/Redistricting_ahead_of_the_2026_elections), [Stateline](https://stateline.org/2026/05/15/the-redistricting-frenzy-is-scrambling-the-midterm-elections-heres-where-things-stand-now/), [Voting Rights Lab](https://votingrightslab.org/2026/08/19/an-emerging-trend-mid-decade-redistricting/).
4. **Da verificare a mano (stato dichiarato dal Census, ma fonti discordanti)**: il **Missouri**. Il file Census ha la nuova mappa; alcune fonti riportano però contestazioni legali sulla sua entrata in vigore per il 2026.
   Se la mappa in vigore fosse quella precedente, i colori andrebbero comunque associati ai distretti giusti per numero, ma i confini disegnati sarebbero quelli sbagliati: controllare prima di pubblicare.
   La Virginia ha mantenuto la mappa precedente (l'emendamento è stato respinto): risulta infatti invariata nel confronto.

## Controlli eseguiti

- 435 distretti nel file, 435 GEOID unici, nessuno mancante o in più rispetto a `config/district_keys.json` (GEOID = FIPS stato + distretto a 2 cifre; `00` per gli stati con un solo distretto: AK, DE, ND, SD, VT, WY).
- Alaska e Hawaii inclusi in coordinate geografiche: la proiezione Albers USA di D3 li sposta in riquadro.
- Abbinamento con civicAPI: **435 su 435** (la pipeline lo ricalcola a ogni giro e scrive gli scarti in `data/quality.json`, voce `abbinamento_distretti`).
- Il Distretto di Columbia e Porto Rico sono esclusi (delegati senza diritto di voto; non fanno parte dei 435).

## Contee e chiavi

- `us-atlas` è del Censimento 2020: il **Connecticut** ha ancora le 8 contee storiche, mentre civicAPI/Census usano le 9 nuove regioni di pianificazione, e in New England i dati sono per town.
  La pipeline controlla a ogni giro, per ogni gara con dettaglio, quante chiavi `fips` di `region_results` si agganciano al TopoJSON (`quality.json`, voce `contee_agganciate_al_topojson`). Dove non si agganciano non si disegna la mappa per contea: si mostra la tabella.
- Nessun embed disegna ancora le contee: i dati ci sono (`data/races/<id>.json`), non è stata richiesta una pagina dedicata.

## Come rigenerare

```bash
# dalla scheda Actions di GitHub: workflow "geo-build" -> Run workflow
# oppure dal terminale del repository (con rete aperta, mapshaper e shapely installati)
python scripts/geo/build_districts.py
```
Il risultato finisce sul branch `geo-build` (cartella `geo/`): copiare `districts.json` in `assets/geo/`.
