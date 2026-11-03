#!/usr/bin/env python3
"""Scarica i risultati da civicAPI e genera i JSON statici in data/.

  python scripts/fetch_results.py              giro normale (il calendario decide se è il momento)
  python scripts/fetch_results.py --force      ignora il calendario
  python scripts/fetch_results.py --rebuild    rigenera i JSON dall'ultimo dato e dalle config, senza chiamare civicAPI
  python scripts/fetch_results.py --dry-run    esegue tutto ma scrive in una cartella temporanea
  python scripts/fetch_results.py --selftest   test interni su fixture (nessuna rete)
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from radar import config as cfgmod
from radar.util import log


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--fixture", help="file JSON con risposte simulate (nessuna rete)")
    ap.add_argument("--backtest", action="store_true", help="ripercorre gli snapshot (race/{id}/history) di gare concluse")
    a = ap.parse_args(argv)
    if a.selftest:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests"))
        import selftest
        return selftest.run()
    if a.backtest:
        from radar import backtest
        return backtest.run()
    cfg, issues = cfgmod.load_all()
    from radar import pipeline
    try:
        return pipeline.run(a, cfg, issues)
    except Exception as e:  # mai un errore non gestito che lasci dati a metà: i file si scrivono in modo atomico solo alla fine
        import traceback
        traceback.print_exc()
        log("ERRORE INATTESO: i dati precedenti restano invariati (status stale).")
        print(f"::error::Errore inatteso nel giro dati: {e}")
        if not a.dry_run:
            try:
                pipeline.crash_stale(str(e))
            except Exception:
                pass
        return 0  # il job non fallisce: il sito resta pubblicato con gli ultimi dati buoni


if __name__ == "__main__":
    sys.exit(main())
