"""Lettura e validazione delle config modificabili a mano. Errori chiari, mai un'eccezione muta."""
import os
from .util import ROOT, read_json, log
import json

CONFIG_DIR = os.path.join(ROOT, "config")


class ConfigIssue:
    def __init__(self, file, msg, fatal=False):
        self.file, self.msg, self.fatal = file, msg, fatal

    def __str__(self):
        return f"config/{self.file}: {self.msg}"


def _load_strict(name):
    path = os.path.join(CONFIG_DIR, name)
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f), None
    except FileNotFoundError:
        return None, f"file mancante"
    except json.JSONDecodeError as e:
        return None, f"JSON non valido alla riga {e.lineno}, colonna {e.colno}: {e.msg}"


def load_all(config_dir=None):
    """Restituisce (cfg, issues). Per ogni file non valido si usa un valore sicuro di ripiego e si segnala l'errore."""
    global CONFIG_DIR
    if config_dir:
        CONFIG_DIR = config_dir
    cfg, issues = {}, []
    defaults = {
        "key_races.json": {"senate": [], "house": [], "governor": [], "race_ids": []},
        "calls.json": None,  # ripiego speciale: vedi sotto
        "auto_calls.json": {"enabled": False},
        "baseline.json": None,
        "branding.json": {},
        "schedule.json": None,
        "civicapi.json": None,
        "polls_close.json": {"polls_close": {}},
        "district_keys.json": {"geoids": []},
    }
    for name, default in defaults.items():
        data, err = _load_strict(name)
        key = name[:-5]
        if err:
            fatal = default is None and name not in ("calls.json",)
            issues.append(ConfigIssue(name, err, fatal))
            cfg[key] = default
            continue
        cfg[key] = data
    # validazioni di struttura
    c = cfg.get("calls")
    if c is not None:
        if not isinstance(c.get("calls", []), list) or not isinstance(c.get("hold", []), list):
            issues.append(ConfigIssue("calls.json", "'calls' e 'hold' devono essere liste"))
            cfg["calls"] = None
        else:
            for i, x in enumerate(c.get("calls", [])):
                if not isinstance(x, dict) or "race_id" not in x or "winner" not in x:
                    issues.append(ConfigIssue("calls.json", f"calls[{i}] deve avere 'race_id' e 'winner'"))
                    cfg["calls"] = None
                    break
    b = cfg.get("baseline")
    if b:
        for ch in ("house", "senate", "governors"):
            if ch not in b or "up" not in b[ch] or "not_up" not in b[ch]:
                issues.append(ConfigIssue("baseline.json", f"manca '{ch}' con 'up' e 'not_up'", True))
    s = cfg.get("schedule")
    if s and not s.get("windows"):
        issues.append(ConfigIssue("schedule.json", "manca 'windows'", True))
    return cfg, issues
