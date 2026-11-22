"""
backend/advisor/company_types.py

Company categories for suggestions: when a student asks for a startup, Fortune 500, Big Tech, Big Four,
consulting, nonprofit, government, or small-business employer, only that type is suggested.
- Big Four / Big Tech come from fixed lists.
- Other types come from gpt-4o and must pass a check (e.g. startups: private, founded in the last ~15
  years, still independent, under ~3,000 employees). Hand-checked companies (data/companies.json,
  "categories") fill in.
"""
import json
import os
import re
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
DATA = Path(__file__).resolve().parents[1] / "data" / "companies.json"
YEAR = date.today().year

TYPES = [  # checked in this order
    ("big_four", r"\bbig\s*(four|4)\b"),
    ("big_tech", r"\bbig\s*tech\b|\bfaang\b|\bmaang\b|\btech giants?\b"),
    ("startup", r"\bstart[\s-]?ups?\b|\bearly[\s-]stage\b|\bseed[\s-]stage\b|\bseries [abc]\b"),
    ("fortune_500", r"\bfortune\s*(500|five hundred)\b|\blarge (corporation|compan)|\bbig compan"),
    ("consulting", r"\bconsulting firms?\b|\bmbb\b|\bmanagement consult"),
    ("nonprofit", r"\bnon[\s-]?profits?\b|\bngos?\b"),
    ("government", r"\bgovernment\b|\bpublic sector\b|\bfederal agenc|\bstate agenc"),
    ("small_business", r"\bsmall (business|compan|firm)"),
]
DESC = {
    "startup": "venture-backed startups: privately held, founded 2012 or later, still independent (not acquired, "
               "not public), under about 3,000 employees",
    "fortune_500": "companies on the Fortune 500 list",
    "consulting": "consulting firms",
    "nonprofit": "nonprofit organizations",
    "government": "government agencies or public-sector employers",
    "small_business": "small businesses with under about 500 employees",
}
BIG_FOUR = ["Deloitte", "PwC", "EY", "KPMG"]
BIG_TECH = ["Alphabet (Google)", "Amazon", "Apple", "Meta", "Microsoft", "NVIDIA"]
_client = None


def _ai():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def detect_type(text):
    for key, pat in TYPES:
        if re.search(pat, text or "", re.I):
            return key
    return None


def curated(ctype):
    try:
        data = json.loads(DATA.read_text())
    except Exception:
        return []
    items = data["companies"] if isinstance(data, dict) else data
    return [c for c in items if ctype in (c.get("categories") or [])]


def _ask(ctype, field, location, msg):
    where = f" with offices or hiring in {location}" if location else ""
    r = _ai().chat.completions.create(
        model="gpt-4o", temperature=0.2, response_format={"type": "json_object"},
        messages=[{"role": "system", "content":
                   f"Suggest 10 real US employers that are {DESC[ctype]} and hire for "
                   f"{field or 'the kind of role described'}{where}. Prefer ones whose work relates to the field. "
                   "Only include companies you are confident exist and match. Reply with JSON: "
                   '{"companies": [{"name": str, "why": "fit reason under 12 words", "founded": year, '
                   '"ownership": "private" | "public" | "nonprofit" | "government", '
                   '"status": "active" | "acquired" | "defunct", "employees": approximate number, '
                   '"fortune_500": true or false}]}'},
                  {"role": "user", "content": msg or ""}])
    try:
        return json.loads(r.choices[0].message.content).get("companies") or []
    except Exception:
        return []


def _num(x, default):
    try:
        return int(str(x).replace(",", "").split()[0])
    except Exception:
        return default


def _ok(c, ctype):
    own, status = str(c.get("ownership", "")).lower(), str(c.get("status", "")).lower()
    founded, people = _num(c.get("founded"), 0), _num(c.get("employees"), 10 ** 6)
    if status != "active":
        return False
    if ctype == "startup":
        return own == "private" and founded >= YEAR - 15 and people <= 3000 \
            and c.get("name", "").strip() not in BIG_FOUR + BIG_TECH
    if ctype == "fortune_500":
        return c.get("fortune_500") is True and own == "public"
    if ctype == "nonprofit":
        return own == "nonprofit"
    if ctype == "government":
        return own == "government"
    if ctype == "small_business":
        return people <= 500
    return True


def wrap_suggest(base):
    def suggest_companies(*args, **kwargs):
        text = " ".join(str(kwargs.get(k) or "") for k in ("message", "field"))
        ctype = detect_type(text)
        if not ctype:
            return base(*args, **kwargs)
        field, location = kwargs.get("field"), kwargs.get("location")
        if ctype == "big_four":
            return [{"name": n, "why": "Big Four accounting and advisory firm", "ctype": ctype} for n in BIG_FOUR]
        if ctype == "big_tech":
            names = list(dict.fromkeys(BIG_TECH + [c["name"] for c in curated("big_tech")]))
            return [{"name": n, "why": "Big Tech company", "ctype": ctype} for n in names][:8]
        picks, seen = [], set()
        for _ in range(2):
            for c in _ask(ctype, field, location, text):
                name = str(c.get("name") or "").strip()
                if name and name.lower() not in seen and _ok(c, ctype):
                    seen.add(name.lower())
                    why = str(c.get("why") or "").strip()
                    if ctype == "startup" and c.get("founded"):
                        why = f"{why} (startup, founded {c['founded']})".strip()
                    picks.append({"name": name, "why": why, "ctype": ctype})
            if len(picks) >= 4:
                break
        for c in curated(ctype):
            if len(picks) >= 6:
                break
            if c["name"].lower() not in seen:
                seen.add(c["name"].lower())
                picks.append({"name": c["name"], "why": ", ".join(c.get("categories", [])[:3]).replace("_", " "),
                              "ctype": ctype})
        return picks[:6]
    return suggest_companies
