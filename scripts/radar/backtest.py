"""Backtest facoltativo della regola di assegnazione automatica sulle istantanee (race/{id}/history) di gare concluse.

Non modifica mai le soglie (le decide Lorenzo): riporta solo se la regola, applicata com'è, avrebbe assegnato un vincitore sbagliato.
Uso: python scripts/fetch_results.py --backtest   (serve la rete: si lancia nella Action "backtest")
"""
import datetime as dt, json, os
from .client import Client, ApiError
from .normalize import normalize_candidates, compute_lead, party_code
from .calls import eval_auto
from .util import ROOT, read_json, parse_iso, log

RACES = [("83266", "Georgia, governatore, ballottaggio repubblicano (16 giugno)"),
         ("69257", "Georgia, governatore, primaria democratica (19 maggio)")]
MAX_SNAPSHOTS = 60


def run():
    acfg = read_json(os.path.join(ROOT, "config", "auto_calls.json"))
    client = Client(pause=0.5)
    lines = ["# Backtest della regola di assegnazione automatica",
             "",
             f"Generato il {dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC con `python scripts/fetch_results.py --backtest`.",
             "La regola è applicata **com'è** (`config/auto_calls.json`), snapshot per snapshot, con `last_updated` e `is_disputed` presi dall'istantanea.",
             "Nessuna soglia è stata modificata in base ai risultati.", ""]
    for rid, label in RACES:
        lines.append(f"## {rid} – {label}")
        try:
            hist = client.get(f"/race/{rid}/history")
            ts = sorted(hist.get("timestamps", []))
            if len(ts) > MAX_SNAPSHOTS:
                ts = ts[:: max(1, len(ts) // MAX_SNAPSHOTS)] + [ts[-1]]
            snaps = []
            for t in ts:
                s = client.get(f"/race/{rid}/history/{t}", {"light": ""})
                d = s.get("data") or {}
                if d.get("candidates"):
                    snaps.append((t, d))
        except ApiError as e:
            lines += [f"Cronologia non disponibile: {e}", ""]
            continue
        if not snaps:
            lines += ["Nessuna istantanea utilizzabile.", ""]
            continue
        final = snaps[-1][1]
        fc = normalize_candidates(final["candidates"])
        final_winner = fc[0]["name"] if fc else None
        lines += [f"Istantanee usate: {len(snaps)}. Vincitore nell'ultima istantanea: **{final_winner}** ({fc[0]['percent'] if fc else '–'}%).", "",
                  "| Istantanea (UTC) | Scrutinio | Primo | Vantaggio | Regola |", "|---|---|---|---|---|"]
        first_call = None
        for t, d in snaps:
            cands = normalize_candidates(d["candidates"])
            total = sum(c["votes"] for c in cands)
            race = {"id": rid, "state": d.get("province"), "candidates": cands, "total_votes": total, "unopposed": len(cands) == 1,
                    "winners_flagged": sum(1 for c in cands if c["api_winner"]), "percent_reporting": d.get("percent_reporting")}
            compute_lead(race)
            meta = {"last_updated": d.get("last_updated"), "is_disputed": d.get("is_disputed"), "percent_reporting_exact": d.get("percent_reporting"),
                    "polls_close": d.get("polls_close")}
            now = parse_iso(d.get("last_updated")) or parse_iso(t)
            ok, info, why, fresh = eval_auto(race, meta, now, acfg, False)
            verdict = "ASSEGNA" if (ok and fresh) else f"no ({why or 'dato non fresco'})"
            if ok and fresh and first_call is None:
                first_call = (t, info["winner"])
            lead = f"{cands[0]['name']} ({cands[0]['percent']}%)" if cands else "–"
            lines.append(f"| {t} | {d.get('percent_reporting')}% | {lead} | {race['margin_votes']} voti | {verdict} |")
        lines.append("")
        if first_call:
            esito = "CORRETTA" if first_call[1] == final_winner else "**SBAGLIATA**"
            lines.append(f"Prima assegnazione automatica: {first_call[0]} → {first_call[1]} ({esito} rispetto al risultato finale).")
        else:
            lines.append("La regola non avrebbe mai assegnato la gara.")
        lines.append("")
    lines += ["## Limiti", "", "- Solo due gare, due primarie georgiane: non sono un campione rappresentativo per una notte di elezioni generali.",
              "- Le istantanee storiche esistono solo per le gare tracciate dopo l'introduzione della funzione e non c'è riallineamento dopo la certificazione."]
    out = os.path.join(ROOT, "backtest_out")
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "auto_calls_backtest.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0
