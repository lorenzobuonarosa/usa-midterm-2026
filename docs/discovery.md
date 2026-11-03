# Fase 0 – Esplorazione di civicAPI

Verificato il 3 novembre 2026 con richieste reali eseguite da GitHub Actions (modalità `discover`, risposte grezze salvate sul branch `discovery`),
perché il proxy dell'ambiente di sviluppo blocca `civicapi.org` con un 403 di policy. User-Agent usato: `RadarQN-midterms-2026`.
Tre giri, circa 60 richieste in tutto.

## Come funziona la ricerca

`GET https://civicapi.org/api/v2/race/search` – parametri documentati nella pagina ufficiale
([API documentation](https://www.civicapi.org/api-documentation)) e verificati:

| Parametro | Note |
|---|---|
| `startDate`, `endDate` | `YYYY-MM-DD`: **sono questi i filtri per data**. `electionDate`, `election_date`, `date`, `year`, `electionYear`, `after`, `date_from`… sono ignorati. |
| `country`, `province`, `district`, `election_type`, `query`, `limit` | `limit` massimo 50.000. `count` nella risposta è il numero di gare **restituite**, non il totale. |
| `type` | Non documentato ma funziona: `US Senate`, `US House`, `Governor`, `President`, `Senate` (senato statale). |

- **La ricerca è lenta**: 15-35 secondi a richiesta (anche con `limit=3`). Il dettaglio `GET /race/{id}` risponde in 0,1-2,5 s. Il client usa un timeout di 180 s e fa pochissime ricerche.
- `election_type` nella ricerca è l'"ambito": i governatori di novembre sono `Statewide`, le generali del Senato `General`, le primarie `Primary`.
  Nel dettaglio il campo `election_type` è invece la carica (`Governor`) e l'ambito è in `election_scope`.
- `GET /status` → `{"status":"ok"}`. Non esistono `getElectionDates`/`election/dates`/`elections` con questi percorsi (404); `/getElectionDates` e `/getElectionYears` rispondono.
  Il 3 novembre 2026 risultano 37.126 gare in totale (comprese quelle locali e statali).

## Gare del 3 novembre 2026

Ricerca `type=<tipo>&country=US&startDate=2026-11-03&endDate=2026-11-03&limit=200`:

| Camera | Trovate | Attese | Note |
|---|---|---|---|
| Senato (`US Senate`) | 35 gare + 1 aggregata | 35 (33 regolari + 2 speciali) | Le speciali sono **Florida** (`Florida US Senate Special`) e **Ohio** (`Ohio US Senate Special General`). Le speciali si riconoscono dal nome (`Special`). |
| Governatori (`Governor`) | 36 + 3 territori (GU, MP, VI) + 1 aggregata | 36 | I territori si escludono (la pipeline tiene solo i 50 stati e DC). |
| Camera (`US House`) | 435 | 435 | **Non compaiono nella ricerca**: sono dentro la gara aggregata `87524` (vedi sotto). Nessuna gara per DC/PR. |

Nessuna differenza rispetto alle attese.

### La Camera: una sola richiesta per tutti i distretti

`GET /race/87524` ("United States House of Representatives") contiene `region_results`: 435 voci indicizzate per slug (`al-01`, `ak-al`, `de-al`, `wy-al`…).
Ogni voce ha `name`, `percent_reporting`, `candidates[]` (con `incumbent`, `party`, `votes`, `percent`, `winner`) e **`election_id`**, cioè l'id della gara del singolo distretto,
che si può chiamare con `GET /race/{election_id}` per `last_updated`, `is_disputed`, `polls_close` e il dettaglio per contea.
La pipeline usa quindi **una richiesta** per tutta la Camera (circa 290 KB) e il dettaglio solo per le gare chiave o candidate all'assegnazione automatica.
Gli at-large (AK, DE, ND, SD, VT, WY) hanno slug `xx-al`. Anche i distretti hanno `percent_reporting` intero.

### Gare aggregate di civicAPI (solo controllo, mai per assegnare)

| Id | Gara | Seggi iniziali |
|---|---|---|
| 87528 | Senato | Democratici 34 (compresi i 2 indipendenti), Repubblicani 31 |
| 87535 | Governatori | Repubblicani 8, Democratici 6 |
| 87524 | Camera | 0 / 0 |

Coincidono con `config/baseline.json` (Senato non in palio D 32 + Ind 2 = 34, R 31; governatori D 6, R 8): è una conferma indipendente dei valori del mockup,
ma **non** una verifica con senate.gov o NGA. Il confronto è registrato in `data/quality.json` (`aggregate_check`).

## Dati di test

- `testdata` esiste come **flag senza valore su `GET /race/{id}`** (es. `/race/87524?testdata`): restituisce dati casuali (nel nostro test: 54% di scrutinio sulla Camera, vincitori già assegnati).
  **Non** funziona sulla ricerca (il parametro è ignorato). Le risposte di test sono in `tests/fixtures/house_agg_87524_testdata.json`.
- La serata simulata dei test (`tests/make_fixture.py night`) parte dalle gare reali e inventa i voti con un generatore casuale, perché la ricerca non ha una modalità di test.

## Dettaglio della gara

`GET /race/{id}` aggiunge: `polls_open`, `polls_close`, `last_updated`, `is_disputed`, `percent_reporting` con decimali (la ricerca lo arrotonda), `test_data`, `round`,
`region_results` (contee: chiave = slug, con `fips` a 5 cifre che combacia con `us-atlas`) e `candidates[]` con `incumbent`, `advanced`, `major_candidate`.
Parametri: `?precinct` (include i dati per sezione, pesanti), `?light`, `?generateMap`, `?data=csv`.

Controlli sulle gare di prova: la somma dei voti delle 159 contee coincide col totale statale (83266 e 69257);
il ricalcolo del vincitore dai voti corregge **80 contee** della gara 83266 (il `winner` di contea indicava il vincitore statale).

## Cronologia (per il backtest, facoltativo)

- `GET /race/{id}/history` → `{"id", "count", "timestamps":[…]}` (83266: 34 istantanee, 16-17 giugno).
- `GET /race/{id}/history/{timestamp}[?light]` → istantanea del dettaglio a quell'ora. Lo storico esiste solo per le gare tracciate dopo l'introduzione della funzione.

## Cose da sapere

- L'aggregata della Camera aveva `last_updated` del 23 ottobre: per il criterio di freschezza dell'assegnazione automatica si usa il `last_updated` del **dettaglio del singolo distretto**.
- Una gara conclusa smette di aggiornare `last_updated`. La regola "dato non più vecchio di 3 ore" blocca quindi **nuove** assegnazioni automatiche su gare finite da più di 3 ore
  (vedi `STATUS.md`, "Scelte prese al posto di Lorenzo").
- Il carico complessivo per giro: 2 ricerche (Senato, governatori), 1 richiesta per la Camera, più i dettagli (gare chiave e candidate all'assegnazione automatica con dati cambiati).
