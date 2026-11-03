#!/usr/bin/env python3
"""Sonda i file ufficiali dei distretti (Census) e salva un rapporto. Esegue solo richieste HEAD/GET leggere."""
import json, sys, urllib.request, urllib.error, os
UA = "RadarQN-midterms-2026"
URLS = [
  "https://www2.census.gov/geo/tiger/GENZ2026/shp/cb_2026_us_cd120_20m.zip",
  "https://www2.census.gov/geo/tiger/GENZ2026/shp/cb_2026_us_cd120_500k.zip",
  "https://www2.census.gov/geo/tiger/GENZ2026/",
  "https://www2.census.gov/geo/tiger/TIGER2026/CD/",
  "https://www2.census.gov/geo/tiger/TIGER2026/",
  "https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_20m.zip",
  "https://www2.census.gov/geo/tiger/TIGER2025/CD/",
  "https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.120th_Congress.html",
]
out = []
for u in URLS:
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read(400000)
            out.append({"url": u, "status": r.status, "length": r.headers.get("Content-Length"), "type": r.headers.get("Content-Type"),
                        "head": body[:6000].decode("utf-8", "replace") if "html" in (r.headers.get("Content-Type") or "") else ""})
    except urllib.error.HTTPError as e:
        out.append({"url": u, "status": e.code})
    except Exception as e:
        out.append({"url": u, "status": 0, "error": str(e)})
os.makedirs("discovery/geo", exist_ok=True)
json.dump(out, open("discovery/geo/probe.json", "w"), indent=1)
print(json.dumps([{k: v for k, v in o.items() if k != "head"} for o in out], indent=1))
