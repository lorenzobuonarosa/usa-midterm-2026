"""Costruzione di summary.json, quality.json, timeline.json dai dati normalizzati."""
from .constants import EXPECTED, STATES
from .util import iso

ATTRIBUTION = "Fonte: civicAPI (civicapi.org)"
DISCLAIMER = "Risultati non ufficiali"
CH_KEY = {"house": "house", "senate": "senate", "governor": "governors"}


def _empty():
    return {"D": 0, "R": 0, "I": 0, "O": 0}


def chambers_summary(races, baseline):
    out = {}
    for ch, bkey in CH_KEY.items():
        b = baseline.get(bkey, {})
        rs = [r for r in races if r["chamber"] == ch]
        called, leading = _empty(), _empty()
        auto = 0
        for r in rs:
            if r.get("called"):
                called[r["called"].get("party") or "O"] += 1
                if r["called"]["method"] in ("auto", "unopposed"):
                    auto += 1
            elif r["status"] in ("leading", "counting", "runoff_possible") and r.get("leader"):
                leading[r["leader"]["party"]] += 1
        up = b.get("up", EXPECTED.get(ch))
        used = sum(called.values()) + sum(leading.values())
        entry = {"seats": b.get("seats"), "up": up, "majority": b.get("majority"),
                 "not_up": {k: b.get("not_up", {}).get(k, 0) for k in ("D", "R", "I")},
                 "called": called, "leading": leading, "open": max(0, up - used), "auto_calls": auto,
                 "races_found": len(rs)}
        if b.get("tie_note"):
            entry["tie_note"] = b["tie_note"]
        out[bkey] = entry
    # chiavi attese dal frontend: house, senate, governors
    return {"house": out["house"], "senate": out["senate"], "governors": out["governors"]}


def race_out(r, polls_close):
    return {k: r.get(k) for k in ("id", "chamber", "state", "state_name", "district", "geoid", "name", "special", "region", "rcv")} | {
        "polls_close": polls_close, "percent_reporting": r.get("percent_reporting"), "total_votes": r.get("total_votes"),
        "status": r.get("status"), "leader": r.get("leader"), "margin_pct": r.get("margin_pct"), "margin_votes": r.get("margin_votes"),
        "candidates": [{k: c.get(k) for k in ("name", "party", "votes", "percent", "incumbent")} for c in r["candidates"]],
        "called": r.get("called"), "civicapi_winner": r.get("civicapi_winner"), "flags": r.get("flags", []),
        "unopposed": r.get("unopposed", False)}


def build_summary(races, cfg, meta_extra, polls_close_for):
    summary = {
        "meta": {**meta_extra, "auto_updates_from": cfg["schedule"]["auto_updates_from"], "attribution": ATTRIBUTION, "disclaimer": DISCLAIMER},
        "chambers": chambers_summary(races, cfg["baseline"]),
        "races": [race_out(r, polls_close_for(r)) for r in sorted(races, key=lambda r: (r["chamber"], r["state"], r.get("district") or "", r["id"]))],
    }
    return summary


def timeline_row(summary):
    row = {"t": summary["meta"]["fetched_at"]}
    for k, c in summary["chambers"].items():
        row[k] = {"called": c["called"], "leading": c["leading"], "open": c["open"]}
    return row


def build_quality(races, expected_found, district_keys, checks):
    q = {"generated_at": None, "checks": list(checks)}
    found = {ch: sum(1 for r in races if r["chamber"] == ch and not r.get("special_extra")) for ch in EXPECTED}
    for ch, exp in EXPECTED.items():
        q["checks"].append({"name": f"gare_trovate_{ch}", "status": "ok" if found[ch] == exp else "warn",
                            "detail": f"trovate {found[ch]}, attese {exp}"})
    geo = set(district_keys.get("geoids", []))
    hg = {r["geoid"] for r in races if r["chamber"] == "house"}
    if geo:
        miss_geo = sorted(hg - geo); miss_api = sorted(geo - hg)
        q["checks"].append({"name": "abbinamento_distretti", "status": "ok" if not miss_geo and not miss_api else "warn",
                            "detail": f"{len(hg & geo)} su {len(geo)} distretti abbinati",
                            "senza_geometria": miss_geo, "senza_gara": miss_api})
    return q
