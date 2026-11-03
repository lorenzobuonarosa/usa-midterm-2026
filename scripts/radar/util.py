"""Utilità: lettura/scrittura JSON atomica, tempo, log."""
import json, os, sys, tempfile, datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def iso(t):
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if t else None


def parse_iso(s):
    if not s:
        return None
    try:
        return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(dt.timezone.utc)
    except Exception:
        return None


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as e:
        log(f"ATTENZIONE: JSON non valido in {path}: {e}")
        return default


def write_json(path, obj, indent=None):
    """Scrittura atomica: file temporaneo + rename (mai un file a metà)."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":") if indent is None else None, indent=indent)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---- parsing tollerante: i dati possono arrivare come numeri, stringhe con virgole/punti, "45,5%", None, ecc.
import math, re as _re


def to_float(v, default=None):
    if v is None or isinstance(v, bool):
        return default if v is None else float(v)
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else default
    s = str(v).strip().replace("\u00a0", "").replace(" ", "").replace("%", "")
    if not s or s in ("-", "—", "–", "null", "None", "NaN", "n/a", "N/A"):
        return default
    if "," in s and "." not in s:
        s = s.replace(",", "") if _re.fullmatch(r"-?\d{1,3}(,\d{3})+", s) else s.replace(",", ".")  # 1,234 (migliaia) oppure 12,5 (decimale)
    elif "," in s and "." in s:
        s = s.replace(",", "") if s.rfind(".") > s.rfind(",") else s.replace(".", "").replace(",", ".")
    elif s.count(".") > 1:
        s = s.replace(".", "")  # 1.234.567
    try:
        x = float(s)
    except ValueError:
        return default
    return x if math.isfinite(x) else default


def to_int(v, default=0):
    x = to_float(v, None)
    return default if x is None else int(round(x))


def to_bool(v):
    """True/False tollerante: accetta true/"true"/1/"yes"; "false"/"0"/""/None sono False (bool("false") sarebbe True)."""
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes", "y", "t")
    return bool(v)
