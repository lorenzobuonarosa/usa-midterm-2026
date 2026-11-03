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


def check(cond, msg):
    print(("  ok  " if cond else "  FAIL"), msg)
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
    last = parse_iso("2026-11-04T06:00:00Z")
    due, mode, why, w = decide(parse_iso("2026-11-04T05:59:00Z"), SCHED, None, False)
    check(not due and mode == "pre_count", "prima delle 06:00Z nessun aggiornamento automatico")
    due, mode, why, w = decide(parse_iso("2026-11-04T05:59:00Z"), SCHED, None, True)
    check(due, "giro manuale ammesso prima dell'avvio")
    due, *_ = decide(parse_iso("2026-11-04T06:30:00Z"), SCHED, last, False)
    check(due, "ogni 30 minuti nella finestra della notte")
    due, *_ = decide(parse_iso("2026-11-04T06:10:00Z"), SCHED, last, False)
    check(not due, "salta se troppo presto")
    due, *_ = decide(parse_iso("2026-11-07T10:00:00Z"), SCHED, parse_iso("2026-11-07T09:55:00Z"), False)
    check(not due, "dopo il 6 novembre: una volta al giorno")
    print("\nEsito:", "TUTTO OK" if not FAILS else f"{len(FAILS)} test falliti")
    return 0 if not FAILS else 1


if __name__ == "__main__":
    sys.exit(run())
