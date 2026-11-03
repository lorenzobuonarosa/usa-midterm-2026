"""Assegnazione delle gare: manuale (calls.json) e automatica prudente (auto_calls.json).

Il campo `winner` di civicAPI NON si usa per assegnare: è registrato solo come `civicapi_winner`.
"""
from .util import parse_iso, iso
from .normalize import base_status


def remaining_est(race, pr):
    """Voti stimati ancora da contare = voti totali × (100 − %) / %."""
    if not pr:
        return None
    return race["total_votes"] * (100.0 - pr) / pr


def eval_auto(race, meta, now, acfg, stale):
    """Valuta la regola automatica. Restituisce (ok, info, motivo, fresh_ok).
    La freschezza (condizione 3) condiziona le NUOVE assegnazioni, non le revoche."""
    if not acfg.get("enabled", True):
        return False, None, "disattivata", True
    cands = race["candidates"]
    pr = (meta or {}).get("percent_reporting_exact")
    if pr is None:
        pr = race.get("percent_reporting")
    # gare senza avversari
    if race["unopposed"] and acfg.get("unopposed", {}).get("enabled", True):
        pc = (meta or {}).get("polls_close")
        pcd = parse_iso(pc)
        if pcd and now >= pcd:
            c = cands[0]
            return True, {"method": "unopposed", "winner": c["name"], "party": c["party"], "percent_reporting": pr,
                          "margin_votes": c["votes"], "missing_votes_est": 0}, None, True
        return False, None, "senza avversari ma seggi ancora aperti", True
    if race["leader"] is None or len(cands) < 1:
        return False, None, "nessun voto", True
    if not pr or pr < acfg.get("min_percent_reporting", 80):
        return False, None, f"scrutinio sotto {acfg.get('min_percent_reporting', 80)}%", True
    rem = remaining_est(race, pr)
    mv = race["margin_votes"] or 0
    if not (mv > acfg.get("margin_factor", 1.5) * rem):
        return False, None, "vantaggio non oltre 1,5 volte i voti mancanti stimati", True
    if (meta or {}).get("is_disputed"):
        return False, None, "gara contestata", True
    if race["winners_flagged"] > 1:
        return False, None, "più candidati risultano vincitori (ballottaggio/avanzamento)", True
    top_pct = cands[0]["percent"]
    if race["state"] in acfg.get("runoff_states", {}) and top_pct <= acfg["runoff_states"][race["state"]]["threshold_pct"]:
        return False, None, "nessun candidato oltre il 50%: possibile ballottaggio", True
    if race["state"] in acfg.get("rcv_states", []) and top_pct <= acfg.get("rcv_threshold_pct", 50):
        return False, None, "voto ordinato per preferenze: prime preferenze sotto il 50%", True
    lu = parse_iso((meta or {}).get("last_updated"))
    fresh = bool(lu) and (now - lu).total_seconds() <= acfg.get("max_source_age_hours", 3) * 3600 and not stale
    info = {"method": "auto", "winner": cands[0]["name"], "party": cands[0]["party"], "percent_reporting": pr,
            "margin_votes": mv, "missing_votes_est": int(round(rem)), "source_last_updated": (meta or {}).get("last_updated")}
    return True, info, None, fresh


def apply_calls(races, prev_calls, calls_cfg, acfg, metas, now, stale):
    """Applica assegnazioni a `races` (dict id->gara). Restituisce (nuove_assegnazioni, eventi_di_log, conflitti)."""
    new_calls, events, conflicts = {}, [], []
    manual = {str(c["race_id"]): c for c in calls_cfg.get("calls", []) if c.get("race_id") is not None}
    hold = {str(x) for x in calls_cfg.get("hold", [])}
    now_iso = iso(now)

    def ev(kind, race, **kw):
        e = {"ts": now_iso, "event": kind, "race_id": race["id"], "chamber": race["chamber"], "state": race["state"],
             "district": race.get("district"), "name": race["name"]}
        e.update(kw)
        events.append(e)

    for rid, race in races.items():
        prev = prev_calls.get(rid)
        civ = [c["name"] for c in race["candidates"] if c["api_winner"]]
        race["civicapi_winner"] = civ[0] if len(civ) == 1 else (civ or None)
        called = None
        if rid in manual:
            m = manual[rid]
            winner = m.get("winner")
            cand = next((c for c in race["candidates"] if c["name"] == winner), None)
            party = m.get("party") or (cand["party"] if cand else None)
            called = {"method": "manual", "winner": winner, "party": party, "note": m.get("note"),
                      "since": (prev or {}).get("since") if prev and prev.get("method") == "manual" and prev.get("winner") == winner else now_iso,
                      "percent_reporting": race.get("percent_reporting"), "margin_votes": race.get("margin_votes")}
            if not prev or prev.get("method") != "manual" or prev.get("winner") != winner:
                ev("assegnata", race, method="manual", candidate=winner, party=party, percent_reporting=race.get("percent_reporting"),
                   margin_votes=race.get("margin_votes"), missing_votes_est=None)
            if civ and winner not in civ:
                conflicts.append({"race_id": rid, "name": race["name"], "manual": winner, "civicapi": civ})
        elif rid not in hold:
            ok, info, why, fresh = eval_auto(race, metas.get(rid), now, acfg, stale)
            had_auto = prev and prev.get("method") in ("auto", "unopposed")
            if ok and (fresh or had_auto) and (not had_auto or prev.get("winner") == info["winner"]):
                # nuova assegnazione (solo se fresca) oppure conferma di una esistente (la sola età del dato non revoca)
                called = dict(info)
                called["since"] = prev["since"] if had_auto else now_iso
                if not had_auto:
                    ev("assegnata", race, method=info["method"], candidate=info["winner"], party=info["party"],
                       percent_reporting=info["percent_reporting"], margin_votes=info["margin_votes"],
                       missing_votes_est=info["missing_votes_est"])
            elif had_auto:
                # revoca: non soddisfa più le condizioni, o è cambiato il candidato in testa
                reason = why or "cambiato il candidato in testa"
                ev("revocata", race, method=prev["method"], candidate=prev.get("winner"), party=prev.get("party"),
                   percent_reporting=race.get("percent_reporting"), margin_votes=race.get("margin_votes"),
                   missing_votes_est=None, reason=reason)
                if "revocata" not in race["flags"]:
                    race["flags"].append("revocata")
        elif prev and prev.get("method") in ("auto", "unopposed"):
            ev("revocata", race, method=prev["method"], candidate=prev.get("winner"), party=prev.get("party"),
               percent_reporting=race.get("percent_reporting"), margin_votes=race.get("margin_votes"),
               missing_votes_est=None, reason="gara in 'hold': automatico sospeso")
            if "revocata" not in race["flags"]:
                race["flags"].append("revocata")
        if called:
            new_calls[rid] = called
            race["called"] = called
            race["status"] = "called"
        else:
            race["called"] = None
            race["status"] = base_status(race)
        if prev and prev.get("method") == "manual" and not called:
            ev("revocata", race, method="manual", candidate=prev.get("winner"), party=prev.get("party"),
               percent_reporting=race.get("percent_reporting"), margin_votes=race.get("margin_votes"),
               missing_votes_est=None, reason="rimossa da calls.json")
    return new_calls, events, conflicts
