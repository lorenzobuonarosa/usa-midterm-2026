#!/usr/bin/env python3
"""Esplorazione di civicAPI (Fase 0): esegue le richieste di un piano e salva le risposte grezze.

Uso: python scripts/discover.py --plan discovery/plan.json --out discovery/out
Il piano è una lista di {"name": ..., "path": "/race/search", "params": {...}}.
Rispetta il vincolo di carico basso: una richiesta alla volta, pausa tra le richieste,
User-Agent generico, nessun nuovo tentativo su 429/5xx (un solo backoff breve).
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request, urllib.error

BASE = "https://civicapi.org/api/v2"
UA = "RadarQN-midterms-2026"


def fetch(path, params, timeout=180):
    url = path if path.startswith("http") else BASE + path
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            return r.status, dict(r.headers), body, url, time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read() or b"", url, time.time() - t0
    except Exception as e:  # rete, timeout, ecc.
        return 0, {}, str(e).encode(), url, time.time() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", default="discovery/plan.json")
    ap.add_argument("--out", default="discovery/out")
    ap.add_argument("--pause", type=float, default=1.0)
    a = ap.parse_args()
    plan = json.load(open(a.plan, encoding="utf-8"))
    os.makedirs(a.out, exist_ok=True)
    index = []
    for item in plan:
        name = item["name"]
        st, hdr, body, url, dt = fetch(item["path"], item.get("params"))
        if st in (429,) or st >= 500:
            print(f"[{name}] {st}, attendo 20 s e riprovo una volta", file=sys.stderr)
            time.sleep(20)
            st, hdr, body, url, dt = fetch(item["path"], item.get("params"))
        ext = "json"
        try:
            parsed = json.loads(body)
            text = json.dumps(parsed, ensure_ascii=False)
        except Exception:
            ext = "txt"
            text = body.decode("utf-8", "replace")
        with open(os.path.join(a.out, f"{name}.{ext}"), "w", encoding="utf-8") as f:
            f.write(text)
        index.append({"name": name, "url": url, "status": st, "bytes": len(body), "seconds": round(dt, 2),
                      "content_type": hdr.get("Content-Type") or hdr.get("content-type"), "file": f"{name}.{ext}"})
        print(f"[{name}] {st} {len(body)} B {dt:.1f}s", flush=True)
        if st == 429 or st >= 500:
            print("Errore persistente: mi fermo qui per non insistere.", file=sys.stderr)
            break
        time.sleep(a.pause)
    json.dump(index, open(os.path.join(a.out, "_index.json"), "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
