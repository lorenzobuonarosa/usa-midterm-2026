"""Client HTTP per civicAPI: carico basso, User-Agent generico, backoff su 429/5xx."""
import gzip, json, random, time, urllib.parse, urllib.request, urllib.error
from .util import log

BASE = "https://civicapi.org/api/v2"
UA = "RadarQN-midterms-2026"


class ApiError(Exception):
    def __init__(self, msg, status=None):
        super().__init__(msg)
        self.status = status


class Client:
    def __init__(self, base=BASE, timeout=180, max_retries=3, pause=0.4, fixtures=None):
        self.base, self.timeout, self.max_retries, self.pause = base, timeout, max_retries, pause
        self.fixtures = fixtures  # dict path->json per i test (nessuna rete)
        self.requests = 0
        self.gave_up = False  # dopo un errore persistente non si insiste più

    def get(self, path, params=None):
        if self.fixtures is not None:
            return self._fixture(path, params)
        if self.gave_up:
            raise ApiError("rinuncio: errore persistente nei tentativi precedenti")
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        delay = 5
        for attempt in range(self.max_retries + 1):
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", "Accept-Encoding": "gzip"})
            try:
                self.requests += 1
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    body = r.read()
                    if r.headers.get("Content-Encoding") == "gzip":
                        body = gzip.decompress(body)
                    time.sleep(self.pause)
                    return json.loads(body)
            except urllib.error.HTTPError as e:
                if e.code == 429 or e.code >= 500:
                    ra = e.headers.get("Retry-After") if e.headers else None
                    wait = min(int(ra), 120) if ra and ra.isdigit() else delay
                    log(f"HTTP {e.code} su {path}: attendo {wait}s (tentativo {attempt + 1}/{self.max_retries + 1})")
                    if attempt >= self.max_retries:
                        self.gave_up = True
                        raise ApiError(f"HTTP {e.code} persistente su {path}", e.code)
                    time.sleep(wait + random.random() * 2)
                    delay *= 3  # backoff esponenziale
                    continue
                raise ApiError(f"HTTP {e.code} su {path}", e.code)
            except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
                log(f"Errore di rete su {path}: {e} (tentativo {attempt + 1}/{self.max_retries + 1})")
                if attempt >= self.max_retries:
                    self.gave_up = True
                    raise ApiError(f"errore di rete su {path}: {e}")
                time.sleep(delay + random.random() * 2)
                delay *= 3
        raise ApiError("irraggiungibile")

    def _fixture(self, path, params):
        key = path if not params else path + "?" + urllib.parse.urlencode(sorted(params.items()))
        if key in self.fixtures:
            return self.fixtures[key]
        if path in self.fixtures:
            return self.fixtures[path]
        raise ApiError(f"fixture mancante: {key}", 404)

    def search(self, params):
        return self.get("/race/search", params)

    def race(self, race_id):
        return self.get(f"/race/{race_id}")
