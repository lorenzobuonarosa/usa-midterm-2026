"""Test interni della pipeline (nessuna rete). Uso: python scripts/fetch_results.py --selftest"""
import copy, json, os, sys, datetime as dt
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from radar.normalize import normalize_race, party_code, parse_district
from radar.counties import process_detail
from radar.calls import apply_calls, eval_auto
from radar.schedule import decide
from radar.util import parse_iso, read_json

FAILS = []


def check(cond, msg, extra=""):
    print(("  ok  " if cond else "  FAIL"), msg, ("| " + extra) if (extra and not cond) else "")
    if not cond:
        FAILS.append(msg)


ACFG = read_json(os.path.join(ROOT, "config", "auto_calls.json"))
SCHED = read_json(os.path.join(ROOT, "config", "schedule.json"))
NOW = dt.datetime(2026, 11, 4, 7, 0, tzinfo=dt.timezone.utc)


def mk(rid="1", typ="US Senate", prov="GA", dist=None, cands=None, pr=90, name="Georgia US Senate", date="2026-11-03T05:00:00.000Z"):
    cands = cands or [("A", "Democratic", 600), ("B", "Republican", 380)]
    tot = sum(c[2] for c in cands)
    return {"id": rid, "type": typ, "province": prov, "district": dist, "election_name": name, "election_type": "General",
            "election_date": date, "percent_reporting": pr,
            "candidates": [{"name": n, "party": p, "votes": v, "percent": round(100 * v / tot, 2) if tot else 0, "winner": False} for n, p, v in cands]}


def meta(age_h=0.5, disputed=False, pr=None):
    lu = (NOW - dt.timedelta(hours=age_h)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"last_updated": lu, "is_disputed": disputed, "percent_reporting_exact": pr, "polls_close": "2026-11-04T01:00:00Z"}


def call(race, m, prev=None, cfg=None, calls_cfg=None, stale=False):
    races = {race["id"]: race}
    nc, ev, cf = apply_calls(races, prev or {}, calls_cfg or {"calls": [], "hold": []}, cfg or ACFG, {race["id"]: m}, NOW, stale)
    return race, nc, ev


def run():
    print("Selftest pipeline")
    # --- normalizzazione
    check(party_code("Democratic-Farmer-Labor") == "D" and party_code("Republican") == "R" and party_code("Libertarian") == "O" and party_code("Independent") == "I", "partiti normalizzati")
    check(parse_district("MA", "MA-06") == "06" and parse_district("AK", "AK-AL") == "00", "distretti: numero e unico distretto")
    r = normalize_race(mk(typ="Governor", prov="GU"))
    check(r is None, "territori esclusi (GU)")
    check(normalize_race(mk(date="2026-06-16T05:00:00.000Z")) is None, "gare di altre date scartate")
    check(normalize_race(mk(typ="US House", prov="DC", dist="DC-00")) is None, "delegato DC fuori dai 435")
    # --- contee sulla gara 83266
    d = json.load(open(os.path.join(ROOT, "tests", "fixtures", "race_83266.json")))
    counties, chk = process_detail(d)
    check(chk["counties"] == 159 and chk["winner_flags_corrected"] == 80, f"83266: 80 contee con winner sbagliato corrette (trovate {chk['winner_flags_corrected']})")
    check(chk["sum_matches_state"], "83266: la somma delle contee coincide col totale statale")
    d2 = json.load(open(os.path.join(ROOT, "tests", "fixtures", "race_69257.json")))
    c2, chk2 = process_detail(d2)
    check(chk2["sum_matches_state"] and chk2["counties"] == 159, "69257: somma contee = totale statale")
    # --- assegnazione automatica
    base = normalize_race(mk())  # 60% vs 38%, pr 90 -> mancanti stimati = 980*10/90 = 109 voti; vantaggio 220
    r, nc, ev = call(base, meta())
    check(r["status"] == "called" and r["called"]["method"] == "auto", "assegna: pr 90, vantaggio > 1,5x mancanti, dato fresco")
    r, nc, ev = call(normalize_race(mk(pr=79)), meta())
    check(r["status"] != "called", "non assegna sotto l'80% di scrutinio")
    r, nc, ev = call(normalize_race(mk(cands=[("A", "Democratic", 520), ("B", "Republican", 480)], pr=85)), meta())
    check(r["status"] != "called", "non assegna se il vantaggio non supera 1,5x i voti mancanti")
    r, nc, ev = call(normalize_race(mk()), meta(age_h=4))
    check(r["status"] != "called", "dato fermo da più di 3 ore: nessuna NUOVA assegnazione")
    r, nc, ev = call(normalize_race(mk()), meta(), stale=True)
    check(r["status"] != "called", "meta.status stale: nessuna assegnazione")
    r, nc, ev = call(normalize_race(mk()), meta(disputed=True))
    check(r["status"] != "called", "gara contestata: nessuna assegnazione")
    x = mk(); x["candidates"][0]["winner"] = True; x["candidates"][1]["winner"] = True
    r, nc, ev = call(normalize_race(x), meta())
    check(r["status"] != "called", "più vincitori flaggati: nessuna assegnazione")
    r, nc, ev = call(normalize_race(mk(prov="GA", cands=[("A", "Democratic", 480), ("B", "Republican", 300), ("C", "Libertarian", 220)], pr=95)), meta())
    check(r["status"] != "called", "Georgia sotto il 50%: nessuna assegnazione (ballottaggio)")
    check(r["status"] == "runoff_possible", "Georgia sotto il 50%: stato runoff_possible")
    r, nc, ev = call(normalize_race(mk(prov="ME", cands=[("A", "Democratic", 480), ("B", "Republican", 300), ("C", "Independent", 220)], pr=95, name="Maine US Senate")), meta())
    check(r["status"] != "called", "Maine sotto il 50% di prime preferenze: nessuna assegnazione")
    # 0 voti -> mai 'in testa'
    r, nc, ev = call(normalize_race(mk(cands=[("A", "Democratic", 0), ("B", "Republican", 0)], pr=0)), meta())
    check(r["status"] == "not_started" and r["leader"] is None, "0 voti: not_started, nessun leader")
    # senza avversari
    r, nc, ev = call(normalize_race(mk(cands=[("A", "Democratic", 0)], pr=0, name="X")), meta())
    check(r["status"] == "called" and r["called"]["method"] == "unopposed", "senza avversari: assegnata dopo la chiusura dei seggi")
    # --- revoca
    r1, nc1, _ = call(normalize_race(mk()), meta())
    flip = normalize_race(mk(cands=[("A", "Democratic", 500), ("B", "Republican", 480)], pr=92))
    r2, nc2, ev2 = call(flip, meta(), prev=nc1)
    check(r2["status"] != "called" and "revocata" in r2["flags"] and any(e["event"] == "revocata" for e in ev2), "revoca: margine crollato -> flag 'revocata' e log")
    lead = normalize_race(mk(cands=[("A", "Democratic", 380), ("B", "Republican", 600)], pr=92))
    r3, nc3, ev3 = call(lead, meta(), prev=nc1)
    check(r3["status"] != "called" or r3["called"]["winner"] != "A", "revoca/ricalcolo: il candidato in testa è cambiato")
    # dato fermo non revoca una assegnazione corretta già esistente
    r4, nc4, ev4 = call(normalize_race(mk()), meta(age_h=5), prev=nc1)
    check(r4["status"] == "called" and not ev4, "dato fermo da ore: un'assegnazione corretta esistente non viene revocata")
    # --- manuale e hold
    r, nc, ev = call(normalize_race(mk(cands=[("A", "Democratic", 400), ("B", "Republican", 380)], pr=30)), meta(), calls_cfg={"calls": [{"race_id": "1", "winner": "B", "method": "manual"}], "hold": []})
    check(r["status"] == "called" and r["called"]["method"] == "manual" and r["called"]["party"] == "R", "manuale: vince sempre, anche con scrutinio basso")
    r, nc, ev = call(normalize_race(mk()), meta(), calls_cfg={"calls": [], "hold": ["1"]})
    check(r["status"] != "called", "hold: automatico sospeso")
    x = mk(); x["candidates"][0]["winner"] = True
    rr = normalize_race(x)
    races = {"1": rr}
    nc, ev, cf = apply_calls(races, {}, {"calls": [{"race_id": "1", "winner": "B"}], "hold": []}, ACFG, {"1": meta()}, NOW, False)
    check(len(cf) == 1, "conflitto calls.json vs flag civicAPI segnalato")
    check(rr["civicapi_winner"] == "A", "flag winner di civicAPI registrato come civicapi_winner")
    # --- calendario
    # calendario: dalle 23:00Z (mezzanotte italiana) ogni 15 min fino alle 07:00Z (08:00 italiane), poi ogni 30 min, poi una volta al giorno
    last = parse_iso("2026-11-03T23:00:00Z")
    due, mode, why, w = decide(parse_iso("2026-11-03T22:59:00Z"), SCHED, None, False)
    check(not due and mode == "pre_count", "prima della mezzanotte italiana nessun aggiornamento automatico")
    due, mode, why, w = decide(parse_iso("2026-11-03T22:59:00Z"), SCHED, None, True)
    check(due, "giro manuale ammesso prima dell'avvio")
    due, mode, *_ = decide(parse_iso("2026-11-03T23:15:00Z"), SCHED, last, False)
    check(due and mode == "notte_ogni_15_minuti", "ogni 15 minuti di notte")
    due, *_ = decide(parse_iso("2026-11-03T23:05:00Z"), SCHED, last, False)
    check(not due, "di notte salta se sono passati solo 5 minuti")
    due, *_ = decide(parse_iso("2026-11-04T06:45:00Z"), SCHED, parse_iso("2026-11-04T06:31:00Z"), False)
    check(due, "alle 07:45 italiane (06:45Z) è ancora a 15 minuti")
    due, mode, *_ = decide(parse_iso("2026-11-04T07:15:00Z"), SCHED, parse_iso("2026-11-04T07:02:00Z"), False)
    check(not due and mode == "dalle_8_ogni_30_minuti", "dopo le 08:00 italiane: a 13 minuti dall'ultimo giro si salta")
    due, *_ = decide(parse_iso("2026-11-04T07:30:00Z"), SCHED, parse_iso("2026-11-04T07:02:00Z"), False)
    check(due, "dopo le 08:00 italiane: ogni 30 minuti")
    due, *_ = decide(parse_iso("2026-11-07T10:00:00Z"), SCHED, parse_iso("2026-11-07T09:55:00Z"), False)
    check(not due, "dopo il 6 novembre: una volta al giorno")
    # --- formati inattesi: numeri come stringhe, virgole, percentuali con %, valori mancanti
    from radar.util import to_int, to_float, to_bool
    from radar.normalize import normalize_house_region
    check(to_int("1,234") == 1234 and to_int("1.234.567") == 1234567 and to_int(" 12 ") == 12 and to_int(None) == 0 and to_int("abc") == 0 and to_int(12.0) == 12 and to_int("—") == 0,
          "to_int: virgole, punti, spazi, None, testo")
    check(to_float("45,5%") == 45.5 and to_float("45.5") == 45.5 and to_float("1,234") == 1234.0 and to_float("") is None and to_float("x", 7) == 7,
          "to_float: virgola decimale, %, vuoto")
    check(to_bool("false") is False and to_bool("true") is True and to_bool(0) is False and to_bool(None) is False, "to_bool: la stringa 'false' è falsa")
    messy = mk(pr="85%", cands=[("A", "Democratic", 600), ("B", "Republican", 380)])
    messy["candidates"][0]["votes"] = "600,000"; messy["candidates"][1]["votes"] = "380,000"; messy["candidates"][0]["percent"] = "61,2%"
    messy["candidates"][0]["winner"] = "false"; messy["candidates"].append(None); messy["candidates"].append({"name": None, "party": None, "votes": None})
    rm = normalize_race(messy)
    check(rm and rm["total_votes"] == 980000 and rm["leader"]["name"] == "A" and rm["percent_reporting"] == 85.0 and rm["winners_flagged"] == 0,
          "gara con voti '600,000', percentuali '61,2%', winner 'false', candidati nulli: letta correttamente")
    check(normalize_race(mk(cands=None, pr=None)) is not None, "gara senza candidati né scrutinio: non solleva eccezioni")
    check(normalize_house_region("al-01", {"election_id": 5, "name": "x", "percent_reporting": "40", "candidates": [{"name": "A", "party": "Democratic", "votes": "1,000"}, "rotto"]}) is not None,
          "distretto con elementi non validi: letto")
    cs, ck = process_detail({"candidates": [{"name": "A", "votes": "10"}], "region_results": {"a": {"fips": "1", "candidates": [{"name": "A", "votes": "1,0", "winner": "false"}]}, "b": None, "c": {"candidates": None}}})
    check(ck["counties"] == 2, "contee con valori sporchi: nessuna eccezione")
    # pipeline intera con dati sporchi iniettati in alcune gare
    import subprocess, tempfile, urllib.parse
    fxp = os.path.join(ROOT, "tests", "fixtures", "night_sim.json")
    if os.path.exists(fxp):
        fx = json.load(open(fxp))
        n = 0
        for k, v in fx.items():
            if k.startswith("/race/search"):
                for r in v["races"][:6]:
                    if r["province"] != "US":
                        r["percent_reporting"] = "78,5%"; r["candidates"][0]["votes"] = "1,2x4"; r["candidates"][1]["percent"] = None; n += 1
                v["races"][7]["candidates"] = "non una lista"
                v["races"].append("stringa al posto di una gara"); v["races"].append({"id": 1})
            elif k == "/race/87524":
                for i, (slug, reg) in enumerate(list(v["region_results"].items())[:30]):
                    if i % 3 == 0: reg["candidates"] = None
                    elif i % 3 == 1: reg["percent_reporting"] = "n/d"; reg["candidates"][0]["votes"] = "1,234"
                    else: v["region_results"][slug] = "rotto"
        tf = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False); json.dump(fx, tf); tf.close()
        out = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "fetch_results.py"), "--dry-run", "--force", "--fixture", tf.name], capture_output=True, text=True)
        check(out.returncode == 0 and "OK:" in out.stdout + out.stderr, "giro completo con dati sporchi iniettati: termina bene (exit 0)", (out.stderr or "")[-200:])
        os.unlink(tf.name)
    print("\nEsito:", "TUTTO OK" if not FAILS else f"{len(FAILS)} test falliti")
    return 0 if not FAILS else 1


if __name__ == "__main__":
    sys.exit(run())
