"""Calendario di polling: la Action parte ogni 30 minuti, lo script decide se è il momento."""
import random
from .util import parse_iso

TOLERANCE_MIN = 6  # il cron di GitHub può ritardare/anticipare di qualche minuto


def window_for(now, sched):
    for w in sched["windows"]:
        a, b = parse_iso(w["from"]), parse_iso(w.get("to"))
        if now >= a and (b is None or now < b):
            return w
    return None


def decide(now, sched, last_ok, manual=False):
    """Restituisce (due: bool, mode: str, motivo: str, window)."""
    start = parse_iso(sched["auto_updates_from"])
    w = window_for(now, sched)
    if manual:
        return True, "manual", "giro manuale: calendario ignorato", w
    if now < start:
        return False, "pre_count", "prima delle 07:00 italiane del 4 novembre: nessun aggiornamento automatico", None
    if w is None:
        return False, "idle", "fuori da ogni finestra di polling", None
    if last_ok is None:
        return True, w["name"], "nessun fetch precedente", w
    elapsed = (now - last_ok).total_seconds() / 60.0
    if elapsed >= w["every_minutes"] - TOLERANCE_MIN:
        return True, w["name"], f"{elapsed:.0f} min dall'ultimo giro riuscito", w
    return False, w["name"], f"troppo presto ({elapsed:.0f} min dall'ultimo giro, serve {w['every_minutes']})", w


def jitter(sched):
    lo, hi = sched.get("jitter_seconds", [2, 9])
    return random.uniform(lo, hi)
