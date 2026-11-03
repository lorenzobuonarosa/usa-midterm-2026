"""Dettaglio per contea: ricalcolo del vincitore dai voti (il campo winner di civicAPI per contea è inaffidabile)."""
from collections import defaultdict
from .normalize import party_code, is_write_in


def process_detail(detail):
    """Restituisce (counties, check). counties: lista con vincitore e margine ricalcolati."""
    rr = detail.get("region_results") or {}
    counties = []
    sums = defaultdict(int)
    corrected = 0
    for slug, reg in rr.items():
        raw = reg.get("candidates") or []
        cands = [{"name": c.get("name"), "party": party_code(c.get("party")), "votes": int(c.get("votes") or 0),
                  "percent": float(c.get("percent") or 0), "api_winner": bool(c.get("winner"))} for c in raw]
        for c in raw:
            sums[c.get("name")] += int(c.get("votes") or 0)
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
    state_votes = {c.get("name"): int(c.get("votes") or 0) for c in (detail.get("candidates") or [])}
    diffs = {n: sums.get(n, 0) - v for n, v in state_votes.items() if sums.get(n, 0) != v}
    check = {"counties": len(counties), "winner_flags_corrected": corrected, "sum_matches_state": not diffs and bool(counties),
             "sum_diffs": diffs}
    return counties, check
