# STATUS – Radar QN midterm 2026

Ultimo aggiornamento: 3 novembre 2026, ~17:30 (ora italiana). Sito: https://lorenzobuonarosa.github.io/usa-midterm-2026/

## Fatto e verificato
- **Pages**: deploy via Actions funzionante (nessuna impostazione da rifare). Verifica con richiesta reale dal runner: `viz/_test/` risponde 200, **nessun `X-Frame-Options`**, `cache-control: max-age=600`.
- **Esplorazione civicAPI** (3 giri su GitHub Actions, perché il proxy dell'ambiente blocca civicapi.org): filtri data = `startDate`/`endDate`; Senato 35 (33 + 2 speciali FL e OH), governatori 36, Camera 435 (dentro la gara aggregata `87524`, una sola richiesta). Dettaglio in `docs/discovery.md`.
- **Pipeline** (`scripts/fetch_results.py`, `scripts/radar/`): giro reale con `--force` riuscito su civicAPI (435/35/36 gare, 435 su 435 distretti abbinati, confronto con le aggregate di civicAPI coerente). Test interni: 32/32 (`--selftest`), compresi: 80 contee con `winner` sbagliato corrette sulla gara 83266, somma contee = totale statale, regola automatica (tutte le condizioni), revoca, freschezza, manuale/hold, Georgia, Alaska/Maine, calendario.
- **Serata simulata** (voti inventati, `tests/make_fixture.py night`): pipeline completa senza errori.
- **Geodati**: confini ufficiali Census TIGER2026 del 120° Congresso (435 distretti, 905 KB, 435/435 GEOID). Stati con mappe cambiate: AL, CA, FL, LA, MO, NC, OH, TN, TX, UT (`docs/geo-sources.md`). Nessun ripiego a cartogramma necessario.
- **Dataviz** `balance`, `map-states`, `house-list`, `map-house`, `viz/all`: test con Chromium headless su 1200/1000/999/768/470/469/375/320 px: **182/182 controlli** (nessuno scroll orizzontale, `postMessage` di altezza coerente con l'altezza reale, tooltip dentro l'iframe, nessun errore in console, nessun 100vh) più integrazione con due iframe e un solo `parent.js` (cambio scheda, riga espansa, "Mostra altri 25", filtro). Screenshot in `tests/screenshots/`. I test locali usano dati simulati.

## Fatto ma non verificato
- **Sito pubblicato con dati reali**: la prova `smoke` (Chromium sul sito vero, branch `smoke`) a **1200 px** è passata: 4 embed caricati, altezze coerenti, nessun errore, 435/35/36. A 768 e 375 px la prova era caduta per un timeout dello script (non del sito); lo script è corretto ma l'esito pulito non l'ho letto. Lorenzo ha controllato a mano `/viz/all/`: ok.
- **Backtest** della regola automatica (workflow `backtest`, branch `backtest` → `docs/auto_calls_backtest.md`): solo gare di giugno/maggio; vedi il file se presente.
- **Cron e calendario**: il workflow gira ogni 15 minuti; lo script decide (`config/schedule.json`): nessun giro automatico prima delle 23:00 UTC del 3 novembre (**mezzanotte italiana**); poi **ogni 15 minuti fino alle 07:00 UTC (08:00 italiane)**; poi **ogni 30 minuti** fino al 6 novembre 00:00 UTC; poi una volta al giorno. Verificato con test di calendario; il primo giro pianificato vero sarà quello di mezzanotte (GitHub può ritardare i cron di diversi minuti).
- Incorporamento nel sito QN (lo verifichi tu con la pagina di prova).

## Lista dei distretti su mobile: scroll e altezza fissa (3 novembre, sera)
- Sotto i 500 px: vista a **10 righe**; area dei risultati con altezza massima fissa (830 px) che scorre in verticale e orizzontale; intestazione della tabella fissa; "Mostra altri 10" aggiunge righe dentro l'area (altezza dell'embed stabile, 1.410-1.450 px).
- **Scroll di riserva** in tutti gli embed: se l'iframe è più basso del contenuto (altezza fissa nel CMS, script assente, indirizzo aperto direttamente) l'embed diventa scorrevole. Prima, con `html`/`body` su `overflow: hidden`, la parte sotto era irraggiungibile.
- `parent.js` rispetta l'attributo `data-radar-fixed-height`. Snippet e altezze in `docs/embed.md`.
- Verificato con gesti touch emulati (pagina, dentro la tabella, a fine corsa, orizzontale). **Non** provato su un telefono vero.

## Irrobustimento ai formati inattesi (3 novembre, sera)
- Numeri come stringhe o con separatori (`"1,234"`, `"1.234.567"`, `"45,5%"`), valori nulli, `winner: "false"`, candidati o gare non validi: letti con parser tolleranti (`to_int`, `to_float`, `to_bool` in `scripts/radar/util.py`).
- Una gara illeggibile viene scartata e si tiene il suo dato precedente (voce `gare_scartate_formato_inatteso` in `quality.json`); un errore su una gara non ferma più il giro. Lo stesso per i dettagli di contea e per le assegnazioni (un'assegnazione esistente non si toglie per un errore di lettura).
- Errore inatteso nel giro: il job **non fallisce** (exit 0), i dati precedenti restano, `meta.status = "stale"` e annotazione `::error::` nel log; il sito resta pubblicato.
- Test: 40 controlli interni, compreso un giro completo con dati sporchi iniettati in decine di gare.

## Modifiche al frontend richieste da Lorenzo (3 novembre, pomeriggio)
- Tabella dei distretti: sotto i 500 px scorre in orizzontale in un contenitore (820 px sotto i 500, 700 px tra 500 e 999) con avviso "Scorri la tabella in orizzontale".
- Contorno completo al passaggio (stato in `map-states`, distretto in `map-house`) con un tracciato sovrapposto (`.hover-outline`), non più bordo del singolo poligono.
- `map-house`: tolti i bordi marcati degli stati; confini dei distretti più visibili (0,6 px). Per ripristinare i bordi degli stati vedi la storia git del commit 778a9db.
- Più spazio sotto mappe e legende (margini in `map-states.css`, `map-house.css`, `.notice` in `_shared/base.css`).

## Manca / non fatto
- Nessun embed disegna le contee (non richiesto): i dati per contea delle gare chiave sono in `data/races/<id>.json`.
- `config/key_races.json` è **parziale**: CBS non era raggiungibile. Senato: le 11 gare indicate da CBS (non 9); Camera: ~30 dei 42 distretti, ricostruiti da riepiloghi di ricerca. Le gare con margine < 5 punti e ≥ 20% di scrutinio si aggiungono comunque in automatico (max 100).
- `baseline.json` **non** verificato con senate.gov / NGA (non raggiungibili). I valori del mockup coincidono con le gare aggregate di civicAPI (Senato D 34 con gli Ind., R 31; governatori D 6, R 8) e con il calendario elettorale.
- `config/polls_close.json`: orari consueti di chiusura per stato, da verificare (il dettaglio della gara ha la precedenza).

## Problemi aperti
1. **Regola "dato non più vecchio di 3 ore"**: una gara finita smette di aggiornare `last_updated`, quindi dopo 3 ore dalla fine non può più essere assegnata in automatico (all'avvio delle 07:00 italiane = 01:00 ET molte gare dell'Est saranno già "vecchie"). Un'assegnazione già fatta **non** viene revocata per la sola età del dato (scelta mia, vedi sotto). Soglie non toccate.
2. **Missouri**: il Census ha la nuova mappa, ma alcune fonti riportano contestazioni sulla sua entrata in vigore: da controllare prima di pubblicare la mappa dei distretti.
3. Le Action pianificate possono ritardare di diversi minuti; con la cache di Pages (10 min) il ritardo percepito può arrivare a 10-20 minuti oltre i 30.
4. Node 20 è dichiarato deprecato dalle azioni `actions/*@v4` (solo un avviso nei log).

## Scelte prese al posto di Lorenzo
- **Font: Inter** (cifre tabulari native).
- Lavoro direttamente su `main` (autorizzato). Branch di servizio: `discovery`, `discovery-geo`, `geo-build`, `data-preview`, `smoke`, `backtest`, `archive` (creati solo da workflow).
- **Camera dalla gara aggregata 87524** (una richiesta per 435 distretti); id della gara di distretto = `election_id`.
- Revoca dell'assegnazione automatica: per scrutinio/margine/leader/contestazione/più vincitori/GA/AK-ME; **non** per la sola età del dato (altrimenti una gara chiusa e corretta verrebbe revocata dopo 3 ore).
- Le gare senza avversari sono contate tra le assegnazioni automatiche (nota "Include N assegnazioni automatiche").
- `runoff_possible` in Georgia solo con scrutinio ≥ 50% (sotto, il flag sarebbe rumore), ma l'assegnazione automatica è comunque bloccata se nessuno supera il 50%.
- Write-in esclusi dall'elenco candidati (i loro voti restano nel totale).
- Cartogramma non necessario: ho confini ufficiali per tutti gli stati.
- Il campo `calls.json` accetta `race_id` come stringa o numero; il nome del vincitore deve coincidere con quello nel dato.
- Pagine di servizio senza collegamenti: `viz/_test/`, `viz/_test/host.html`.
- Branch `data-preview`: copia pubblica dei JSON dopo ogni giro manuale (solo per controllo).

## Da fare per Lorenzo alle 11
1. Compilare `config/calls.json` per le gare combattute (dal sito di GitHub: matita → Commit; in 2 minuti le assegnazioni compaiono).
2. Controllare `config/baseline.json` (Senato 32 D + 2 Ind + 31 R non in palio; governatori 6 D + 8 R) con senate.gov e NGA.
3. Controllare le assegnazioni automatiche in `data/calls_log.json` (`https://lorenzobuonarosa.github.io/usa-midterm-2026/data/calls_log.json`) e, se serve, mettere in `hold` le gare dubbie.
4. Completare `config/key_races.json` con la lista completa CBS (42 distretti).
5. Verificare la mappa del Missouri e gli orari in `config/polls_close.json`.
6. Dire a me/al team quando fermare il polling giornaliero (dopo il 6 novembre).

## Cose da sapere
- Pagina di prova per il CMS: `https://lorenzobuonarosa.github.io/usa-midterm-2026/viz/_test/`; snippet pronti in `docs/embed.md` (nota `frame-src` per il team QN).
- Per rigenerare i dati a mano: Actions → update → Run workflow → `force`.
