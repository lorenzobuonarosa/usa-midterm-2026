#!/usr/bin/env python3
"""Sonda i file ufficiali dei distretti (Census) e salva un rapporto. Richieste GET leggere."""
import json, re, sys, urllib.request, urllib.error, os
UA = "RadarQN-midterms-2026"
URLS = [
  "https://www2.census.gov/geo/tiger/TIGER2026/CD/",
  "https://www2.census.gov/geo/tiger/TIGER2026/",
  "https://www2.census.gov/geo/tiger/GENZ2026/",
  "https://www2.census.gov/geo/tiger/",
  "https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.120th_Congress.html",
]
out = []
for u in URLS:
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read(3_000_000).decode("utf-8", "replace")
            rec = {"url": u, "status": r.status, "length": len(body)}
            if "Index of" in body or "<a href" in body and "census.gov/geo" in u:
                rec["links"] = sorted(set(re.findall(r'href="([^"?#/][^"?#]*)"', body)))[:400]
            text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", body, flags=re.S)
            text = re.sub(r"<[^>]+>", " ", text); text = re.sub(r"\s+", " ", text)
            rec["text"] = text[:3500]
            out.append(rec)
    except urllib.error.HTTPError as e:
        out.append({"url": u, "status": e.code})
    except Exception as e:
        out.append({"url": u, "status": 0, "error": str(e)})
os.makedirs("discovery/geo", exist_ok=True)
json.dump(out, open("discovery/geo/probe.json", "w"), indent=1)
print(json.dumps([{k: v for k, v in o.items() if k not in ("text", "links")} for o in out], indent=1))
