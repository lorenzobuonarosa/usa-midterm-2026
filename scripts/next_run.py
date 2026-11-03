#!/usr/bin/env python3
"""Calcola quanti secondi aspettare prima del prossimo giro (catena di rilanci: workflow `chain`).

Stampa un numero di secondi (intero) oppure `stop`.
- dentro una finestra di config/schedule.json con cadenza < 1 giorno: il prossimo multiplo di `every_minutes` (UTC: :00 :15 :30 :45);
- prima dell'avvio degli aggiornamenti: se l'avvio è entro 31 minuti si aspetta fino a quel momento, altrimenti `stop` (resta il cron);
- dopo l'ultima finestra a cadenza breve: `stop`.
"""
import datetime as dt, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from radar.schedule import window_for
from radar.util import parse_iso, read_json, ROOT, utcnow

MIN_WAIT = 20          # secondi: mai rilanciare "subito"
MAX_WAIT = 31 * 60     # oltre i 31 minuti non si aspetta: ci pensa il cron


def seconds_to_wait(now, sched):
    start = parse_iso(sched["auto_updates_from"])
    if now < start:
        wait = (start - now).total_seconds()
        return int(wait) if wait <= MAX_WAIT else None
    w = window_for(now, sched)
    if w is None or w["every_minutes"] >= 1440:
        return None
    step = w["every_minutes"] * 60
    epoch = now.timestamp()
    nxt = (int(epoch // step) + 1) * step          # prossimo multiplo della cadenza (UTC)
    wait = nxt - epoch
    if wait < MIN_WAIT:
        wait += step
    return int(wait) if wait <= MAX_WAIT else None


if __name__ == "__main__":
    sched = read_json(os.path.join(ROOT, "config", "schedule.json"))
    now = parse_iso(sys.argv[1]) if len(sys.argv) > 1 else utcnow()
    w = seconds_to_wait(now, sched)
    print("stop" if w is None else w)
