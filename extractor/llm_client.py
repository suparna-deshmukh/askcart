"""
AskCart LLM client - Gemini (OpenAI-compatible endpoint).
Same contract as before: chat()/chat_json() return (text|obj, model); callers
must keep a zero-LLM fallback path because is_available() can be False.

Config (env, or askcart/.env): GEMINI_API_KEY (or GEMINI_API_KEYS /
LIVE_LLM_API_KEY), GEMINI_MODEL.
Note: thinking models can return null content when the whole budget is spent
on reasoning; we detect that and retry with a bigger budget once.
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env")
DAILY_CAP = int(os.environ.get("ASKCART_LLM_DAILY_CAP", "3000"))
_state = {"date": None, "calls": 0}
BASE = "https://generativelanguage.googleapis.com/v1beta/openai"


def _env(name):
    v = os.environ.get(name)
    if v:
        return v.strip()
    if os.path.exists(ENV_FILE):
        for line in open(ENV_FILE):
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v2 = line.split("=", 1)
            if k == name and v2.strip():
                return v2.strip()
    return None


def _key():
    return (_env("GEMINI_API_KEY")
            or (_env("GEMINI_API_KEYS") or "").split(",")[0].strip()
            or _env("LIVE_LLM_API_KEY")
            or None)


def _cfg():
    return (
        BASE.rstrip("/"),
        _key(),
        _env("GEMINI_MODEL") or _env("LIVE_LLM_MODEL") or "gemini-3-flash-preview",
    )


def is_available():
    _, key, _ = _cfg()
    return bool(key)


def _cap_ok():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _state["date"] != today:
        _state["date"], _state["calls"] = today, 0
    return _state["calls"] < DAILY_CAP


def _post(messages, model, temperature, max_tokens, timeout=90, thinking=None):
    base, key, _ = _cfg()
    payload = {"model": model, "messages": messages,
               "temperature": temperature, "max_tokens": max_tokens}
    if thinking is False:
        payload["reasoning_effort"] = "none"
    body = json.dumps(payload).encode()
    req = urllib.request.Request(base + "/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=timeout))
    msg = r["choices"][0]["message"]
    content = msg.get("content")
    if content is None:  # thinking model spent the whole budget on reasoning
        finish = r["choices"][0].get("finish_reason")
        if finish == "length":
            raise _NeedMoreTokens()
        raise RuntimeError(f"empty completion (finish={finish})")
    return content


class _NeedMoreTokens(RuntimeError):
    pass


def chat(messages, temperature=0.2, max_tokens=800, max_retries=4, thinking=None):
    """messages: list of {role, content}. Returns (text, model) or raises."""
    if not is_available() or not _cap_ok():
        raise RuntimeError("LLM unavailable")
    base, key, model = _cfg()
    last_err = None
    for attempt in range(max_retries):
        if not _cap_ok():
            raise RuntimeError("daily LLM cap reached")
        try:
            text = _post(messages, model, temperature, max_tokens, thinking=thinking)
            _state["calls"] += 1
            return text, model
        except _NeedMoreTokens:
            last_err = RuntimeError("thinking model exhausted max_tokens")
            max_tokens = int(max_tokens * 2.5)  # one escalation per attempt
        except urllib.error.HTTPError as e:
            msg = e.read()[:200].decode("utf-8", "replace")
            last_err = RuntimeError(f"{model}: HTTP {e.code} {msg}")
            if e.code in (404, 400, 403):
                break  # model/key problem, retrying is pointless
            time.sleep(4 * (attempt + 1))
        except Exception as e:
            last_err = e
            time.sleep(4 * (attempt + 1))
    raise last_err if last_err else RuntimeError("LLM failed")


def chat_json(messages, temperature=0.1, max_tokens=1200, max_retries=4, thinking=None):
    """Chat and parse JSON (handles fenced blocks). Returns (obj, model)."""
    text, model = chat(messages, temperature=temperature, max_tokens=max_tokens,
                       max_retries=max_retries, thinking=thinking)
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1]
        if t.startswith("json"):
            t = t[4:]
        t = t.rsplit("```", 1)[0].strip()
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end <= start:
        start, end = t.find("["), t.rfind("]")
    return json.loads(t[start:end + 1]), model
