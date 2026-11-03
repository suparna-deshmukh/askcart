"""AskCart agentic extractor - deployed evidence + probe service (Vercel).
Reused pattern from photo_case vercel_deploy.
Routes:
  GET  /                 service info + corpus funnel
  GET  /funnel           6-stage pipeline funnel counts
  GET  /root-causes      4 root causes with evidence quotes
  GET  /bayesian         per-app Bayesian ratings (m=100)
  POST /probe            live mini-extraction probe (play|appstore|reddit)
Body for /probe: {"source": "play", "app": "com.flipkart.android"}
"""
import json
import os
from datetime import datetime, timezone

import requests

_HERE = os.path.dirname(os.path.abspath(__file__))
_DATA_CANDIDATES = [
    os.path.join(_HERE, "..", "..", "data"),          # deploy-local (Vercel)
    os.path.join(_HERE, "..", "..", "..", "data"),    # repo-local (dev machine)
]
DATA = os.path.abspath(next(c for c in _DATA_CANDIDATES
                            if os.path.isdir(os.path.abspath(c))))


def _load(name):
    p = os.path.join(DATA, name)
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return None


def _probe_play(app):
    from google_play_scraper import reviews, Sort
    res, _ = reviews(app, lang="en", country="in", count=10, sort=Sort.NEWEST)
    return [{"reviewId": r.get("reviewId"), "score": r.get("score"),
             "content": (r.get("content") or "")[:200]} for r in res]


def _probe_appstore(country="us"):
    r = requests.get(
        f"https://itunes.apple.com/{country}/rss/customerreviews/page=1/id=297606951/sortby=mostrecent/json",
        headers={"User-Agent": "askcart-extractor/0.2"}, timeout=20)
    r.raise_for_status()
    entries = r.json().get("feed", {}).get("entry", [])
    entries = entries if isinstance(entries, list) else [entries]
    out = []
    for e in entries[:10]:
        if "im:rating" not in e:
            continue
        out.append({"rating": e["im:rating"]["label"],
                    "title": e.get("title", {}).get("label", ""),
                    "body": e.get("content", {}).get("label", "")[:200]})
    return out


def _probe_reddit(sub="Amazon", query="search"):
    import xml.etree.ElementTree as ET
    import urllib.parse
    url = f"https://www.reddit.com/search.rss?q={urllib.parse.quote(query + ' sub:' + sub)}&limit=10"
    r = requests.get(url, headers={"User-Agent": "askcart-extractor/0.2"}, timeout=20)
    r.raise_for_status()
    AT = {"a": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(r.content)
    out = []
    for e in root.findall("a:entry", AT)[:10]:
        out.append({"title": e.findtext("a:title", "", AT)[:150]})
    return out


def handler(req, context):
    url = req.path if hasattr(req, "path") else "/"
    body = {}
    try:
        if req.method == "POST" and req.headers.get("Content-Length"):
            body = json.loads(req.get_body() or b"{}")
    except Exception:
        body = {}

    def send(code, payload):
        return {"statusCode": code, "headers": {"Content-Type": "application/json"},
                "body": json.dumps(payload)}

    if url == "/trends":
        return send(200, _load("out/trends_insights.json") or {"error": "run collect_trends first"})
    if url == "/sources":
        import csv
        by_src = []
        p2 = os.path.join(DATA, "out", "by_source.csv")
        if os.path.exists(p2):
            with open(p2) as f:
                by_src = list(csv.DictReader(f))
        return send(200, {"corpus_by_source": by_src,
                          "sources": ["play_store", "app_store", "reddit",
                                      "amazon_product_reviews", "trustpilot",
                                      "google_suggest", "wikipedia_pageviews"]})
    if url in ("/", ""):
        return send(200, {"service": "askcart-extractor", "version": "0.3",
                          "time": datetime.now(timezone.utc).isoformat(),
                          "routes": ["/", "/funnel", "/root-causes", "/bayesian", "/trends", "/sources", "POST /probe"],
                          "funnel": _load("out/funnel.json"),
                          "counts": _load("pipeline_counts.json")})
    if url == "/funnel":
        return send(200, _load("out/funnel.json") or {"error": "run pipeline first"})
    if url == "/root-causes":
        rc = _load("out/root_causes.json") or {"error": "run pipeline first"}
        counts = _load("pipeline_counts.json") or {}
        return send(200, {"root_causes": rc, "quotes": counts.get("sample_quotes", [])})
    if url == "/bayesian":
        import csv
        p = os.path.join(DATA, "out", "bayesian.csv")
        if not os.path.exists(p):
            return send(200, {"error": "run pipeline first"})
        with open(p) as f:
            rows = list(csv.DictReader(f))
        for r in rows:
            for k in ("n", "n_comp", "n_total"):
                if r.get(k):
                    r[k] = int(float(r[k]))
            for k in ("mean_raw", "global_mean", "bayesian_rating", "complaint_rate", "wilson_lb"):
                if r.get(k):
                    r[k] = float(r[k])
        return send(200, {"bayesian": rows, "method": "(C*m + sum)/(m+n), C=global mean, m=100"})
    if url == "/probe" and req.method == "POST":
        source = body.get("source", "play")
        try:
            if source == "play":
                data = _probe_play(body.get("app", "com.flipkart.android"))
            elif source == "appstore":
                data = _probe_appstore(body.get("country", "us"))
            elif source == "reddit":
                data = _probe_reddit(body.get("sub", "Amazon"), body.get("query", "search"))
            else:
                return send(400, {"error": "source must be play|appstore|reddit"})
            return send(200, {"source": source, "n": len(data), "sample": data,
                              "ts": datetime.now(timezone.utc).isoformat()})
        except Exception as e:
            return send(502, {"error": f"{type(e).__name__}: {str(e)[:200]}"})
    return send(404, {"error": "not found"})


# --- ASGI entrypoint for the Vercel Python runtime -------------------------
async def _read_body(receive):
    chunks = []
    while True:
        msg = await receive()
        chunks.append(msg.get("body", b""))
        if not msg.get("more_body"):
            break
    return b"".join(chunks)


async def app(scope, receive, send):
    if scope["type"] != "http":
        await send({"type": "http.response.start", "status": 404,
                    "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": b'{"error":"not http"}'})
        return
    req_body = await _read_body(receive)

    class Req:
        path = scope["path"]
        method = scope["method"]
        headers = {k.decode("latin1"): v.decode("latin1")
                   for k, v in scope.get("headers", [])}
        _body = req_body
        def get_body(self):
            return self._body

    res = handler(Req(), None)
    body = res["body"].encode("utf-8")
    await send({"type": "http.response.start", "status": res["statusCode"],
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})
