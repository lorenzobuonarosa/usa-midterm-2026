"""Orchestrazione di un giro: fetch (o rebuild), controlli, assegnazioni, scrittura dei JSON."""
import os, random, time, tempfile, shutil
from . import config as cfgmod
from .client import Client, ApiError
from .normalize import normalize_race, normalize_house_region, compute_lead, base_status, party_code
from .counties import process_detail
from .calls import apply_calls, eval_auto
from .build import build_summary, build_quality, timeline_row
from .constants import EXPECTED
from .schedule import decide, jitter
from .util import ROOT, utcnow, iso, parse_iso, read_json, write_json, log

DATA = os.path.join(ROOT, "data")
MAX_TIMELINE = 3000


def resolve_key_ids(races, kcfg):
    ids = {str(x) for x in kcfg.get("race_ids", [])}
    by = {}
    for r in races.values():
        by.setdefault((r["chamber"], r["state"]), []).append(r)
    for st in kcfg.get("senate", []):
        ids |= {r["id"] for r in by.get(("senate", st), [])}
    for st in kcfg.get("governor", []):
        ids |= {r["id"] for r in by.get(("governor", st), [])}
    for key in kcfg.get("house", []):  # es. "AZ-01"
        st, _, d = key.partition("-")
        dd = "00" if st in ("AK", "DE", "ND", "SD", "VT", "WY") else d.zfill(2)
        ids |= {r["id"] for r in races.values() if r["chamber"] == "house" and r["state"] == st and r["district"] == dd}
    return ids & set(races)


def cheap_candidate(race, acfg, polls_close_iso, now):
    """Condizioni 1, 2, 5 (senza bisogno del dettaglio): serve scaricare il dettaglio solo se passano."""
    if race["unopposed"]:
        pc = parse_iso(polls_close_iso)
        return bool(pc and now >= pc)
    pr = race.get("percent_reporting")
    if race["leader"] is None or not pr or pr < acfg.get("min_percent_reporting", 80):
        return False
    rem = race["total_votes"] * (100.0 - pr) / pr
    return (race["margin_votes"] or 0) > acfg.get("margin_factor", 1.5) * rem


def run(args, cfg, issues):
    now = utcnow()
    dry = args.dry_run
    out_dir = tempfile.mkdtemp(prefix="radar-dry-") if dry else DATA
    prev = read_json(os.path.join(DATA, "normalized.json"), {}) or {}
    fstate = read_json(os.path.join(DATA, "fetch_state.json"), {}) or {}
    quality_checks = [{"name": f"config_{i.file}", "status": "fail" if i.fatal else "warn", "detail": str(i)} for i in issues]
    for i in issues:
        log("ERRORE DI CONFIGURAZIONE:", i)
    if any(i.fatal for i in issues):
        log("Config fondamentali non valide: nessun aggiornamento (si tengono i dati precedenti).")
        return 0
    calls_cfg = cfg.get("calls")
    if calls_cfg is None:  # calls.json rotto: si usano le assegnazioni manuali già note, niente perdite silenziose
        calls_cfg = prev.get("calls_cfg_cache") or {"calls": [], "hold": []}
        log("calls.json non valido: uso l'ultima versione valida.")
    acfg = cfg.get("auto_calls") or {"enabled": False}

    manual_run = args.force or os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
    last_ok = parse_iso(fstate.get("last_ok"))
    if args.rebuild:
        return rebuild(args, cfg, prev, fstate, calls_cfg, acfg, out_dir, quality_checks, now)
    due, mode, reason, window = decide(now, cfg["schedule"], last_ok, manual_run)
    log(f"Calendario: {reason} -> {'ESEGUO' if due else 'salto'} (modalità {mode})")
    if not due:
        return 0
    if not manual_run and not args.fixture:
        time.sleep(jitter(cfg["schedule"]))

    ccfg = cfg.get("civicapi") or {}
    fixtures = None
    if args.fixture:
        from .util import read_json as rj
        fixtures = rj(args.fixture, {})
    client = Client(fixtures=fixtures, base=ccfg.get("base", "https://civicapi.org/api/v2"),
                   timeout=ccfg.get("timeout_seconds", 180), pause=ccfg.get("pause_seconds", 0.4))
    try:
        raw, aggregates = fetch_bulk(client, ccfg)
    except ApiError as e:
        return fail_round(fstate, prev, now, f"ricerca in blocco fallita: {e}", out_dir, dry)

    races = {}
    raw_search, raw_house = raw
    for rr in raw_search:
        r = normalize_race(rr)
        if r:
            races[r["id"]] = r
    for slug, reg in raw_house:
        r = normalize_house_region(slug, reg)
        if r:
            races[r["id"]] = r
    mark_extras(races)
    prev_races = prev.get("races", {})
    if len(prev_races) >= 100 and len(races) < 0.8 * len(prev_races):
        return fail_round(fstate, prev, now, f"risposta sospetta: {len(races)} gare contro {len(prev_races)} del giro precedente", out_dir, dry)
    if not races:
        return fail_round(fstate, prev, now, "nessuna gara valida nella risposta", out_dir, dry)
    protect_from_regression(races, prev_races, quality_checks)

    metas = dict(prev.get("metas", {}))
    detail_info = fetch_details(client, races, metas, cfg, acfg, calls_cfg, now, out_dir, quality_checks, ccfg)
    pc_for = lambda r: (metas.get(r["id"], {}) or {}).get("polls_close") or cfg["polls_close"].get("polls_close", {}).get(r["state"])
    for r in races.values():  # orario di chiusura anche per le gare senza dettaglio
        metas.setdefault(r["id"], {}).setdefault("polls_close", cfg["polls_close"].get("polls_close", {}).get(r["state"]))
    return finish(args, cfg, races, metas, aggregates, prev, fstate, calls_cfg, acfg, out_dir, quality_checks, now, mode, client.requests, stale=False, detail_info=detail_info)


def mark_extras(races):
    seen = {}
    for r in sorted(races.values(), key=lambda r: (r["special"], r["id"])):
        if r["chamber"] != "house":
            continue
        if r["geoid"] in seen:
            r["chamber"] = "house_special"; r["special_extra"] = True
        else:
            seen[r["geoid"]] = r["id"]


def protect_from_regression(races, prev_races, checks):
    """Voti o scrutinio in calo, o candidati scomparsi: si tiene il dato precedente (mai sovrascrivere dati buoni)."""
    kept = []
    for rid, r in list(races.items()):
        p = prev_races.get(rid)
        if not p:
            continue
        worse = []
        if r["total_votes"] < p["total_votes"]:
            worse.append(f"voti in calo ({p['total_votes']} -> {r['total_votes']})")
        if r.get("percent_reporting") is not None and p.get("percent_reporting") is not None and r["percent_reporting"] < p["percent_reporting"]:
            worse.append(f"scrutinio in calo ({p['percent_reporting']} -> {r['percent_reporting']})")
        gone = {c["name"] for c in p["candidates"]} - {c["name"] for c in r["candidates"]}
        if gone:
            worse.append("candidati scomparsi: " + ", ".join(sorted(gone)))
        if worse:
            q = dict(p); q["flags"] = list(set(p.get("flags", [])) | {"dato_precedente"})
            races[rid] = q
            kept.append({"race_id": rid, "name": r["name"], "problemi": worse})
            log(f"[{rid}] {r['name']}: {'; '.join(worse)} -> tengo il dato precedente")
    for rid, p in prev_races.items():
        if rid not in races:
            races[rid] = p
            kept.append({"race_id": rid, "name": p["name"], "problemi": ["gara scomparsa dalla risposta"]})
    if kept:
        checks.append({"name": "dati_in_calo_o_mancanti", "status": "warn", "detail": f"{len(kept)} gare: tenuto il dato precedente", "gare": kept[:60]})


def fetch_bulk(client, ccfg):
    """Restituisce (gare grezze già normalizzabili, aggregati di controllo).
    - ricerche per Senato e governatori (una richiesta ciascuna);
    - Camera: UNA sola richiesta alla gara aggregata, con le 435 regioni (distretti)."""
    raw, aggregates, house = [], [], []
    for q in ccfg.get("queries", []):
        if q.get("kind") == "aggregate_house":
            d = client.race(q["race_id"])
            for slug, reg in (d.get("region_results") or {}).items():
                house.append((slug, reg))
            aggregates.append({"type": "US House", "province": "US", "id": q["race_id"], "candidates": d.get("candidates") or []})
            continue
        res = client.search(q["params"])
        items = res.get("races", res if isinstance(res, list) else [])
        for it in items:
            if it.get("province") == "US":
                aggregates.append(it)
            else:
                raw.append(it)
    return (raw, house), aggregates


def fetch_details(client, races, metas, cfg, acfg, calls_cfg, now, out_dir, checks, ccfg):
    key_ids = resolve_key_ids(races, cfg.get("key_races") or {})
    close = sorted((r for r in races.values() if r["margin_pct"] is not None and r["margin_pct"] < 5 and (r.get("percent_reporting") or 0) >= 20),
                   key=lambda r: r["margin_pct"])  # aggiunte automatiche: margine < 5 punti e scrutinio >= 20%
    for r in close[: ccfg.get("max_auto_key_races", 100)]:
        key_ids.add(r["id"])
    manual = {str(c["race_id"]) for c in calls_cfg.get("calls", [])}
    hold = {str(x) for x in calls_cfg.get("hold", [])}
    cands = []
    for r in races.values():
        if r["id"] in manual or r["id"] in hold or r["id"] in key_ids:
            continue
        pc = (cfg["polls_close"].get("polls_close", {}) or {}).get(r["state"])
        if cheap_candidate(r, acfg, pc, now):
            m = metas.get(r["id"]) or {}
            if m.get("stamp") == [r["total_votes"], r.get("percent_reporting")] and m.get("last_updated"):
                continue  # dato invariato dall'ultimo dettaglio: si riusa la cache
            if r["unopposed"]:
                continue
            cands.append(r["id"])
    cap = ccfg.get("max_details_per_run", 450)
    order = sorted(key_ids) + cands
    if len(order) > cap:
        log(f"{len(order)} dettagli richiesti: limito a {cap}")
        order = order[:cap]
    geo_ids = load_county_ids()
    done = 0
    key_summaries = []
    for rid in order:
        try:
            d = client.race(rid)
        except ApiError as e:
            log(f"dettaglio {rid} non disponibile: {e}")
            if client.gave_up:
                break
            continue
        r = races.get(rid)
        metas[rid] = {"last_updated": d.get("last_updated"), "is_disputed": bool(d.get("is_disputed")), "polls_close": d.get("polls_close"),
                      "polls_open": d.get("polls_open"), "percent_reporting_exact": d.get("percent_reporting"), "test_data": d.get("test_data"),
                      "stamp": [r["total_votes"], r.get("percent_reporting")], "fetched_at": iso(now)}
        done += 1
        if rid in key_ids:
            counties, chk = process_detail(d)
            fips_ok = sum(1 for c in counties if c["fips"] in geo_ids) if geo_ids else None
            chk["fips_in_topojson"] = fips_ok
            chk["map_ok"] = bool(counties) and fips_ok == len(counties)
            write_json(os.path.join(out_dir, "races", f"{rid}.json"), {"id": rid, "name": r["name"], "state": r["state"], "updated": d.get("last_updated"),
                                                                       "percent_reporting": d.get("percent_reporting"), "check": chk, "counties": counties})
            key_summaries.append({"race_id": rid, "name": r["name"], **{k: chk[k] for k in ("counties", "winner_flags_corrected", "sum_matches_state", "fips_in_topojson", "map_ok")}})
    if key_summaries:
        bad = [k for k in key_summaries if not k["sum_matches_state"] and k["counties"]]
        nomap = [k for k in key_summaries if k["counties"] and not k["map_ok"]]
        checks.append({"name": "somma_contee_vs_totale", "status": "ok" if not bad else "warn", "detail": f"{len(key_summaries) - len(bad)} su {len(key_summaries)} gare chiave: somma delle contee = totale statale", "gare": bad})
        if nomap:
            checks.append({"name": "contee_agganciate_al_topojson", "status": "warn", "detail": f"{len(nomap)} gare senza mappa per contea (chiavi non agganciate): si mostra la tabella", "gare": nomap})
    return {"details_fetched": done, "key_races": len(key_ids)}


_COUNTY_IDS = None
def load_county_ids():
    global _COUNTY_IDS
    if _COUNTY_IDS is None:
        t = read_json(os.path.join(ROOT, "assets", "geo", "counties.json"), None)
        ids = set()
        if t:
            for o in t.get("objects", {}).values():
                for g in o.get("geometries", []):
                    if g.get("id") is not None:
                        ids.add(str(g["id"]))
        _COUNTY_IDS = ids
    return _COUNTY_IDS


def fail_round(fstate, prev, now, reason, out_dir, dry):
    log("GIRO FALLITO:", reason, "-> tengo i dati precedenti, status = stale")
    fstate = dict(fstate); fstate.update({"last_attempt": iso(now), "last_status": "failed", "error": reason})
    if not dry:
        write_json(os.path.join(DATA, "fetch_state.json"), fstate)
        s = read_json(os.path.join(DATA, "summary.json"), None)
        if s:
            s["meta"]["status"] = "stale"; s["meta"]["last_error"] = reason; s["meta"]["last_attempt"] = iso(now)
            write_json(os.path.join(DATA, "summary.json"), s)
    return 0


def rebuild(args, cfg, prev, fstate, calls_cfg, acfg, out_dir, checks, now):
    if not prev.get("races"):
        log("--rebuild: nessun dato normalizzato precedente (data/normalized.json): niente da ricostruire.")
        return 0
    races = prev["races"]
    for r in races.values():  # si riparte dalle gare senza assegnazioni
        r["flags"] = [f for f in r.get("flags", []) if f != "revocata"] if False else r.get("flags", [])
    fetched = parse_iso(prev.get("fetched_at")) or now
    return finish(args, cfg, races, prev.get("metas", {}), prev.get("aggregates", []), prev, fstate, calls_cfg, acfg, out_dir, checks, fetched,
                  "rebuild", 0, stale=False, detail_info={}, rebuilt=True, real_now=now)


def finish(args, cfg, races, metas, aggregates, prev, fstate, calls_cfg, acfg, out_dir, checks, now, mode, nreq, stale, detail_info, rebuilt=False, real_now=None):
    prev_calls = prev.get("calls", {})
    new_calls, events, conflicts = apply_calls(races, prev_calls, calls_cfg, acfg, metas, now, stale)
    for c in conflicts:
        log(f"CONFLITTO manuale vs civicAPI: [{c['race_id']}] {c['name']}: manuale={c['manual']}, civicAPI={c['civicapi']}")
        events.append({"ts": iso(real_now or now), "event": "conflitto", **c})
    if conflicts:
        checks.append({"name": "conflitti_calls_civicapi", "status": "warn", "detail": f"{len(conflicts)} conflitti tra calls.json e il flag winner di civicAPI", "gare": conflicts})
    for e in events:
        log(f"[assegnazioni] {e['event']}: {e.get('state')} {e.get('name')} -> {e.get('candidate') or e.get('manual')} ({e.get('method')})")
    pcs = cfg["polls_close"].get("polls_close", {})
    pc_for = lambda r: (metas.get(r["id"]) or {}).get("polls_close") or pcs.get(r["state"])
    for r in races.values():
        if r["id"] in resolve_key_ids({r["id"]: r}, {"race_ids": []}):
            pass
    key_ids = resolve_key_ids(races, cfg.get("key_races") or {})
    for r in races.values():
        if r["id"] in key_ids and "key" not in r["flags"]:
            r["flags"].append("key")
    visible = [r for r in races.values() if r["chamber"] in ("house", "senate", "governor")]
    lu = [m.get("last_updated") for m in metas.values() if m and m.get("last_updated")]
    meta = {"fetched_at": iso(now), "source_last_updated": max(lu) if lu else None, "mode": mode, "status": "ok", "requests": nreq}
    if rebuilt:
        meta["rebuilt_at"] = iso(real_now)
        meta["mode"] = (read_json(os.path.join(DATA, "summary.json"), {}) or {}).get("meta", {}).get("mode", "rebuild")
    summary = build_summary(visible, cfg, meta, pc_for)
    quality = build_quality(visible, None, cfg.get("district_keys") or {}, checks)
    quality["generated_at"] = iso(real_now or now)
    quality["aggregate_check"] = aggregate_check(summary, aggregates)
    norm = {"fetched_at": iso(now), "races": races, "metas": metas, "calls": new_calls, "aggregates": aggregates, "calls_cfg_cache": calls_cfg}
    tl = read_json(os.path.join(DATA, "timeline.json"), []) or []
    row = timeline_row(summary)
    if not rebuilt and (not tl or tl[-1]["t"] != row["t"]):
        tl.append(row)
    log_events = read_json(os.path.join(DATA, "calls_log.json"), []) or []
    log_events.extend(events)
    fs = dict(fstate)
    if not rebuilt:
        fs.update({"last_attempt": iso(now), "last_ok": iso(now), "last_status": "ok", "error": None})
    if args.dry_run:
        print_report(summary, quality, events, out_dir)
    write_json(os.path.join(out_dir, "summary.json"), summary)
    write_json(os.path.join(out_dir, "normalized.json"), norm)
    write_json(os.path.join(out_dir, "timeline.json"), tl[-MAX_TIMELINE:])
    write_json(os.path.join(out_dir, "quality.json"), quality, indent=1)
    write_json(os.path.join(out_dir, "calls_log.json"), log_events, indent=1)
    write_json(os.path.join(out_dir, "fetch_state.json"), fs)
    log(f"OK: {len(visible)} gare, {len(new_calls)} assegnate, dettagli: {detail_info}, scritto in {out_dir}")
    return 0


def aggregate_check(summary, aggregates):
    """Confronto con i totali aggregati di civicAPI (solo controllo di coerenza, mai usati per assegnare)."""
    out = []
    for a in aggregates:
        cs = {c.get("party"): c.get("seats") for c in a.get("candidates", []) if c.get("seats") is not None}
        key = {"US Senate": "senate", "Governor": "governors", "US House": "house"}.get(a.get("type"))
        if not key or not cs:
            continue
        ch = summary["chambers"][key]
        mine = {p: ch["not_up"].get(p, 0) + ch["called"].get(p, 0) for p in ("D", "R", "I")}
        out.append({"chamber": key, "civicapi_seats": {k: v for k, v in cs.items() if v}, "nostri_assegnati": mine})
    return out


def print_report(summary, quality, events, out_dir):
    print("== DRY RUN ==  output temporaneo in", out_dir)
    for k, c in summary["chambers"].items():
        print(k, "assegnati", c["called"], "in testa", c["leading"], "aperti", c["open"], "auto", c["auto_calls"], "gare trovate", c["races_found"])
    for ch in quality["checks"]:
        print("  [", ch["status"], "]", ch["name"], "-", ch["detail"])
    print("eventi di assegnazione:", len(events))
