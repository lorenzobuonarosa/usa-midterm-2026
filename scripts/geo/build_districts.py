#!/usr/bin/env python3
"""Costruisce assets/geo/districts.json dai confini ufficiali del Census per il 120° Congresso (elezioni 2026).

Fonte: https://www2.census.gov/geo/tiger/TIGER2026/CD/tl_2026_<FIPS>_cd120.zip (TIGER/Line, pubblico dominio).
Confronta anche con TIGER2025 (119° Congresso) per elencare i distretti ridisegnati.
Richiede: mapshaper (npm) e shapely (pip). Si lancia nella Action geo-build (il sandbox non raggiunge census.gov).
"""
import json, os, subprocess, sys, time, urllib.request, zipfile, glob, shutil

UA = "RadarQN-midterms-2026"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from radar.constants import STATES

W = os.path.join(ROOT, "geo_work")
OUT = os.path.join(ROOT, "geo_out")
MS = ["npx", "--no-install", "mapshaper"]
MAX_BYTES = 1_450_000


def sh(cmd, **kw):
    print("$", " ".join(cmd), flush=True)
    return subprocess.run(cmd, check=True, **kw)


def download(url, dest):
    if os.path.exists(dest):
        return True
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
        return True
    except Exception as e:
        print("ERRORE download", url, e, flush=True)
        return False


def fetch_set(kind, year, cd):
    """Scarica e converte in GeoJSON tutti gli stati; restituisce la lista di feature."""
    feats = []
    for ab, (name, fips) in sorted(STATES.items(), key=lambda kv: kv[1][1]):
        z = os.path.join(W, f"{kind}_{fips}.zip")
        url = f"https://www2.census.gov/geo/tiger/TIGER{year}/CD/tl_{year}_{fips}_cd{cd}.zip"
        if not download(url, z):
            continue
        d = os.path.join(W, f"{kind}_{fips}")
        os.makedirs(d, exist_ok=True)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(d)
        shp = glob.glob(os.path.join(d, "*.shp"))[0]
        gj = os.path.join(W, f"{kind}_{fips}.geojson")
        sh(MS + [shp, "-o", gj, "format=geojson"], stdout=subprocess.DEVNULL)
        for f in json.load(open(gj))["features"]:
            p = f["properties"]
            fp = p.get(f"CD{cd}FP")
            if fp in (None, "ZZ") or fips == "11":
                continue
            f["properties"] = {"GEOID": p["GEOID"], "STATEFP": p["STATEFP"], "CDFP": fp}
            feats.append(f)
        time.sleep(0.3)
    return feats


def main():
    os.makedirs(W, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    f120 = fetch_set("cd120", 2026, 120)
    print("distretti cd120:", len(f120))
    gj120 = os.path.join(W, "all120.geojson")
    json.dump({"type": "FeatureCollection", "features": f120}, open(gj120, "w"))
    report = {"cd120_count": len(f120)}
    geoids = sorted(f["properties"]["GEOID"] for f in f120)
    report["geoids_unique"] = len(set(geoids))
    keys = json.load(open(os.path.join(ROOT, "config", "district_keys.json")))["geoids"]
    report["missing_vs_district_keys"] = sorted(set(keys) - set(geoids))
    report["extra_vs_district_keys"] = sorted(set(geoids) - set(keys))
    # confronto con il 119° Congresso (TIGER/Line 2025)
    try:
        f119 = fetch_set("cd119", 2025, 119)
        from shapely.geometry import shape
        a = {f["properties"]["GEOID"]: shape(f["geometry"]).simplify(0.002) for f in f119}
        b = {f["properties"]["GEOID"]: shape(f["geometry"]).simplify(0.002) for f in f120}
        per_state = {}
        for g, geom in b.items():
            old = a.get(g)
            iou = None
            if old is not None:
                try:
                    inter = old.buffer(0).intersection(geom.buffer(0)).area
                    uni = old.buffer(0).union(geom.buffer(0)).area
                    iou = inter / uni if uni else None
                except Exception:
                    iou = None
            st = g[:2]
            s = per_state.setdefault(st, {"districts": 0, "changed": 0, "min_iou": 1.0, "changed_geoids": []})
            s["districts"] += 1
            if iou is not None:
                s["min_iou"] = round(min(s["min_iou"], iou), 3)
                if iou < 0.97:
                    s["changed"] += 1; s["changed_geoids"].append(g)
        report["changes_vs_119"] = {fips: v for fips, v in sorted(per_state.items())}
        report["states_with_changes"] = sorted([fips for fips, v in per_state.items() if v["changed"] > 0])
    except Exception as e:
        report["compare_error"] = str(e)
    # semplificazione con topologia preservata e quantizzazione
    best = None
    for pct in (6, 4, 3, 2, 1.5, 1):
        out = os.path.join(OUT, "districts.json")
        sh(MS + [gj120, "name=districts", "-filter-fields", "GEOID,STATEFP", "-simplify", "visvalingam", f"{pct}%", "keep-shapes",
                 "-o", out, "format=topojson", "quantization=20000", "id-field=GEOID"])
        size = os.path.getsize(out)
        print(f"semplificazione {pct}% -> {size} byte", flush=True)
        best = (pct, size)
        if size <= MAX_BYTES:
            break
    report["simplify_percent"], report["bytes"] = best
    t = json.load(open(os.path.join(OUT, "districts.json")))
    g = t["objects"]["districts"]["geometries"]
    report["topojson_districts"] = len(g)
    json.dump(report, open(os.path.join(OUT, "geo-report.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in report.items() if k != "changes_vs_119"}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
