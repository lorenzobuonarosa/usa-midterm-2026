"""Costruisce i file di risposte simulate (fixture) per --fixture, a partire dalle risposte reali salvate in tests/fixtures/.
  python tests/make_fixture.py precount   -> tests/fixtures/night_precount.json (struttura reale, 0 voti)
  python tests/make_fixture.py night [seed] -> tests/fixtures/night_sim.json (serata simulata: voti inventati con un generatore casuale)
"""
import json, os, random, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(HERE, "fixtures")
D = dict(country="US", startDate="2026-11-03", endDate="2026-11-03")


def key(path, **params):
    return path + "?" + urllib.parse.urlencode(sorted(params.items()))


def load(n):
    return json.load(open(os.path.join(F, n)))


def base():
    sen, gov, house = load("senate_nov3.json"), load("gov_nov3.json"), load("house_agg_87524.json")
    return {
        key("/race/search", type="US Senate", limit=200, **D): sen,
        key("/race/search", type="Governor", limit=200, **D): gov,
        "/race/87524": house,
    }


def simulate(fx, seed, hours_old=0.5, pr_range=(60, 100)):
    """Inventa voti: ogni gara riceve percentuale di scrutinio casuale e voti per candidato (primi due più forti)."""
    rnd = random.Random(seed)

    def fill(cands, pr, total):
        w = [rnd.random() ** 2 + (0.6 if i < 2 else 0.02) for i in range(len(cands))]
        s = sum(w)
        for c, x in zip(cands, w):
            c["votes"] = int(total * x / s)
        t = sum(c["votes"] for c in cands) or 1
        for c in cands:
            c["percent"] = round(100.0 * c["votes"] / t, 2)

    for k, v in list(fx.items()):
        if k.startswith("/race/search"):
            for r in v["races"]:
                if r["province"] == "US" or not str(r["election_date"]).startswith("2026-11-03"):
                    continue
                pr = rnd.randint(*pr_range)
                r["percent_reporting"] = pr
                fill(r["candidates"], pr, rnd.randint(300_000, 5_000_000))
        elif k == "/race/87524":
            for slug, reg in v["region_results"].items():
                pr = rnd.randint(*pr_range)
                reg["percent_reporting"] = pr
                fill(reg["candidates"], pr, rnd.randint(150_000, 450_000))
    # dettagli per ogni gara: last_updated (alcuni vecchi), is_disputed (pochi), polls_close
    import datetime as dt
    now = dt.datetime.now(dt.timezone.utc)
    def det(rid, pr, cands):
        age = 5 if rnd.random() < 0.1 else 0.4
        return {"election_name": "sim", "last_updated": (now - dt.timedelta(hours=age)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "is_disputed": rnd.random() < 0.03, "polls_close": "2026-11-04T01:00:00.000Z", "percent_reporting": pr + 0.3,
                "candidates": cands, "region_results": {}, "test_data": True}
    for k, v in list(fx.items()):
        if k.startswith("/race/search"):
            for r in v["races"]:
                if r["province"] != "US":
                    fx[f"/race/{r['id']}"] = det(r["id"], r["percent_reporting"], r["candidates"])
        elif k == "/race/87524":
            for slug, reg in v["region_results"].items():
                fx[f"/race/{reg['election_id']}"] = det(reg["election_id"], reg["percent_reporting"], reg["candidates"])
    return fx


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "precount"
    fx = base()
    name = "night_precount.json"
    if mode == "night":
        fx = simulate(fx, int(sys.argv[2]) if len(sys.argv) > 2 else 7)
        name = "night_sim.json"
    json.dump(fx, open(os.path.join(F, name), "w"))
    print("scritto", name, os.path.getsize(os.path.join(F, name)), "byte")
