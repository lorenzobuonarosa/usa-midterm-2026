"""Normalizzazione delle gare civicAPI: partiti, leader, margine, stato, chiavi di collegamento."""
import re
from .constants import STATES, STATE_REGION, AT_LARGE, RCV_STATES, CHAMBER_OF_TYPE, ELECTION_DATE

WRITE_IN = re.compile(r"write[\s-]*in|scattering|none of the above", re.I)


def party_code(p):
    s = (p or "").strip().lower()
    if "democrat" in s:
        return "D"
    if "republican" in s:
        return "R"
    if s in ("independent", "nonpartisan", "no party affiliation", "unaffiliated"):
        return "I"
    return "O"


def is_write_in(c):
    return bool(WRITE_IN.search(c.get("name") or ""))


def parse_district(province, district):
    """'MA-06' -> '06'; unico distretto -> '00'. Restituisce None se non riconosciuto."""
    if province in AT_LARGE:
        return "00"
    m = re.search(r"(\d+)\s*$", str(district or ""))
    if m:
        return m.group(1).zfill(2)
    return None


def geoid(state, dd):
    return STATES[state][1] + dd if state in STATES and dd else None


def rank(cands):
    """Candidati (esclusi write-in) ordinati per voti decrescenti."""
    cs = [c for c in cands if not is_write_in(c)]
    return sorted(cs, key=lambda c: (c.get("votes") or 0), reverse=True)


def normalize_candidates(raw):
    out = []
    for c in raw or []:
        if is_write_in(c):
            continue
        out.append({"name": c.get("name"), "party": party_code(c.get("party")), "party_name": c.get("party"),
                    "votes": int(c.get("votes") or 0), "percent": float(c.get("percent") or 0),
                    "incumbent": bool(c.get("incumbent")) if "incumbent" in c else None,
                    "api_winner": bool(c.get("winner"))})
    out.sort(key=lambda c: c["votes"], reverse=True)
    return out


def display_name(chamber, state, dd, election_name, special):
    sname = STATES[state][0]
    if chamber == "house":
        return f"{sname} at-large" if state in AT_LARGE else f"{sname} {int(dd)}"
    base = election_name or sname
    return base


def normalize_race(raw, now_iso=None):
    """Da risultato di ricerca civicAPI a gara normalizzata (o None se da scartare)."""
    chamber = CHAMBER_OF_TYPE.get(raw.get("type"))
    prov = raw.get("province")
    if not chamber or prov not in STATES:
        return None
    if not str(raw.get("election_date", "")).startswith(ELECTION_DATE):
        return None
    if chamber == "house" and prov == "DC":
        return None  # delegato senza diritto di voto: fuori dai 435
    name_raw = raw.get("election_name") or ""
    special = bool(re.search(r"special", name_raw, re.I))
    dd = parse_district(prov, raw.get("district")) if chamber == "house" else None
    if chamber == "house" and dd is None:
        return None
    cands = normalize_candidates(raw.get("candidates"))
    total = sum(c["votes"] for c in cands) + sum(int(c.get("votes") or 0) for c in (raw.get("candidates") or []) if is_write_in(c))
    pr = raw.get("percent_reporting")
    pr = float(pr) if pr is not None else None
    race = {
        "id": str(raw["id"]), "chamber": chamber, "state": prov, "state_name": STATES[prov][0], "district": dd,
        "geoid": geoid(prov, dd) if chamber == "house" else None,
        "name": display_name(chamber, prov, dd, name_raw, special), "election_name": name_raw, "special": special,
        "region": STATE_REGION.get(prov), "rcv": prov in RCV_STATES and chamber in ("senate", "house", "governor"),
        "percent_reporting": pr, "total_votes": total, "candidates": cands, "flags": [],
        "unopposed": len(cands) == 1,
    }
    race["winners_flagged"] = sum(1 for c in cands if c["api_winner"])
    compute_lead(race)
    return race


def compute_lead(race):
    cs = race["candidates"]
    total = race["total_votes"]
    race["leader"] = None; race["margin_votes"] = None; race["margin_pct"] = None
    if total > 0 and cs and cs[0]["votes"] > 0:
        top = cs[0]
        race["leader"] = {"name": top["name"], "party": top["party"], "percent": top["percent"]}
        second = cs[1]["votes"] if len(cs) > 1 else 0
        race["margin_votes"] = top["votes"] - second
        race["margin_pct"] = round(100.0 * (top["votes"] - second) / total, 2)
    return race


def base_status(race):
    """Stato senza assegnazioni: not_started / counting / leading / runoff_possible."""
    if not race["total_votes"] or race["leader"] is None:
        return "not_started"
    pr = race.get("percent_reporting") or 0
    if race["state"] == "GA" and race["candidates"]:
        top = max(c["percent"] for c in race["candidates"])
        if top <= 50 and pr >= 50:
            return "runoff_possible"
    return "leading" if pr > 0 else "counting"


HOUSE_SLUG = re.compile(r"^([a-z]{2})-(\d+|al)$")


def normalize_house_region(slug, reg):
    """La Camera del 3 novembre è UNA gara aggregata (id 87524) con 435 regioni (una per distretto).
    Ogni regione ha `election_id`: è l'id della gara del singolo distretto, che usiamo come id della gara."""
    m = HOUSE_SLUG.match(slug or "")
    if not m or reg.get("election_id") is None:
        return None
    st = m.group(1).upper()
    if st not in STATES or st == "DC":
        return None
    dd = "00" if (m.group(2) == "al" or st in AT_LARGE) else m.group(2).zfill(2)
    cands = normalize_candidates(reg.get("candidates"))
    raw = reg.get("candidates") or []
    total = sum(int(c.get("votes") or 0) for c in raw)
    pr = reg.get("percent_reporting")
    race = {
        "id": str(reg["election_id"]), "chamber": "house", "state": st, "state_name": STATES[st][0], "district": dd,
        "geoid": geoid(st, dd), "name": display_name("house", st, dd, reg.get("name"), False), "election_name": reg.get("name"),
        "special": False, "region": STATE_REGION.get(st), "rcv": st in RCV_STATES,
        "percent_reporting": float(pr) if pr is not None else None, "total_votes": total, "candidates": cands, "flags": [],
        "unopposed": len(cands) == 1,
    }
    race["winners_flagged"] = sum(1 for c in cands if c["api_winner"])
    compute_lead(race)
    return race
