#!/usr/bin/env python3
"""Recupera lo stato dal sito Pages già pubblicato (data/*.json e data/races/*.json), con ripiego pulito se manca."""
import json, os, sys, urllib.request, urllib.error
UA = "RadarQN-midterms-2026"
BASE = sys.argv[1].rstrip("/")
OUT = sys.argv[2] if len(sys.argv) > 2 else "data"
FILES = ["summary.json", "timeline.json", "normalized.json", "calls_log.json", "quality.json", "fetch_state.json"]


def get(path):
    req = urllib.request.Request(f"{BASE}/{path}", headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


os.makedirs(os.path.join(OUT, "races"), exist_ok=True)
for f in FILES:
    try:
        open(os.path.join(OUT, f), "wb").write(get(f"data/{f}"))
        print("ripristinato", f)
    except Exception as e:
        print("stato precedente assente:", f, "-", e)
try:
    idx = json.loads(get("data/races/index.json"))
    open(os.path.join(OUT, "races", "index.json"), "w").write(json.dumps(idx))
    n = 0
    for rid in idx.get("ids", []):
        try:
            open(os.path.join(OUT, "races", f"{rid}.json"), "wb").write(get(f"data/races/{rid}.json")); n += 1
        except Exception as e:
            print("dettaglio gara assente:", rid, e)
    print(f"ripristinati {n} dettagli di gara")
except Exception as e:
    print("nessun indice dei dettagli di gara:", e)
