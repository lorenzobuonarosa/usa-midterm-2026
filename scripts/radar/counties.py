"""Dettaglio per contea: ricalcolo del vincitore dai voti (il campo winner di civicAPI per contea è inaffidabile)."""
from collections import defaultdict
from .normalize import party_code, is_write_in
from .util import to_int, to_float, to_bool


def process_detail(detail):
    """Restituisce (counties, check). counties: lista con vincitore e margine ricalcolati."""
    rr = detail.get("region_results") if isinstance(detail.get("region_results"), dict) else {}
    counties = []
    sums = defaultdict(int)
    corrected = 0
    for slug, reg in rr.items():
        if not isinstance(reg, dict):
            continue
        raw = [c for c in (reg.get("candidates") or []) if isinstance(c, dict)]
        cands = [{"name": c.get("name"), "party": party_code(c.get("party")), "votes": max(0, to_int(c.get("votes"))),
                  "percent": to_float(c.get("percent"), 0.0), "api_winner": to_bool(c.get("winner"))} for c in raw]
        for c in raw:
            sums[c.get("name")] += max(0, to_int(c.get("votes")))
        ranked = sorted([c for c in cands if not is_write_in(c)], key=lambda c: c["votes"], reverse=True)
        total = sum(c["votes"] for c in cands)
        win = None; mv = None; mp = None
        if ranked and ranked[0]["votes"] > 0 and not (len(ranked) > 1 and ranked[0]["votes"] == ranked[1]["votes"]):
            win = {"name": ranked[0]["name"], "party": ranked[0]["party"]}
            second = ranked[1]["votes"] if len(ranked) > 1 else 0
            mv = ranked[0]["votes"] - second
            mp = round(100.0 * mv / total, 2) if total else None
        api = [c["name"] for c in cands if c["api_winner"]]
        if (win and api and win["name"] not in api) or (win is None and api and total > 0):
            corrected += 1
        counties.append({"fips": reg.get("fips"), "slug": slug, "name": reg.get("name"), "type": reg.get("type"),
                         "percent_reporting": reg.get("percent_reporting"), "total_votes": total, "winner": win,
                         "margin_votes": mv, "margin_pct": mp,
                         "candidates": [{k: c[k] for k in ("name", "party", "votes", "percent")} for c in cands]})
    state_votes = {c.get("name"): max(0, to_int(c.get("votes"))) for c in (detail.get("candidates") or []) if isinstance(c, dict)}
    diffs = {n: sums.get(n, 0) - v for n, v in state_votes.items() if sums.get(n, 0) != v}
    check = {"counties": len(counties), "winner_flags_corrected": corrected, "sum_matches_state": not diffs and bool(counties),
             "sum_diffs": diffs}
    return counties, check
