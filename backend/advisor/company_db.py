"""
backend/advisor/company_db.py

Picks employers from data/companies.json (built by data/scrapers/build_company_db.py) by the student's
major or career field, company type, and location (city, state, or region, all 50 states + DC).
Falls back to live AI suggestions when the list has fewer than 4 matches.
"""
import json
import re
import zlib
from pathlib import Path

from company_types import detect_type

D = Path(__file__).resolve().parents[1] / "data"
STATES = {"alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO",
          "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
          "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
          "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
          "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
          "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
          "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
          "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
          "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
          "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC"}
REGIONS = {"pacific northwest": ["WA", "OR"], "bay area": ["CA"], "silicon valley": ["CA"], "socal": ["CA"],
           "new england": ["MA", "CT", "RI", "NH", "VT", "ME"], "midwest": ["IL", "OH", "MI", "IN", "WI", "MN", "MO", "IA"],
           "southeast": ["TN", "GA", "NC", "SC", "FL", "AL"], "south": ["TN", "GA", "TX", "NC", "FL", "AL", "LA"],
           "southwest": ["AZ", "NM", "TX", "NV"], "mountain west": ["CO", "UT", "ID", "MT", "WY"],
           "dmv": ["DC", "VA", "MD"], "washington dc": ["DC", "VA", "MD"], "dc": ["DC", "VA", "MD"],
           "tri-state": ["NY", "NJ", "CT"], "west coast": ["CA", "WA", "OR"], "east coast": ["NY", "MA", "DC", "NJ", "PA"]}
_db = {}


def _load():
    if not _db:
        data = json.loads((D / "companies.json").read_text())
        _db["items"] = data["companies"] if isinstance(data, dict) else data
        _db["fields"] = json.loads((D / "career_fields.json").read_text()) if (D / "career_fields.json").exists() else {}
        _db["majors"] = json.loads((D / "major_fields.json").read_text()) if (D / "major_fields.json").exists() else {}
    return _db


def field_keys(text):
    db, t = _load(), " " + (text or "").lower() + " "
    keys = set()
    for prog, ks in db["majors"].items():
        base = re.sub(r"\s+(major|minor)(\s*\(.*\))?$", "", prog.lower()).strip()
        if len(base) > 3 and re.search(r"\b" + re.escape(base) + r"\b", t):
            keys |= set(ks)
    for k, f in db["fields"].items():
        if any(re.search(r"\b" + re.escape(kw) + r"\b", t) for kw in f["keywords"]):
            keys.add(k)
    return keys


def _place(location):
    l = (location or "").lower().strip()
    if not l:
        return set(), ""
    codes = {ab for name, ab in STATES.items() if re.search(r"\b" + name + r"\b", l)}
    codes |= {ab for ab in STATES.values() if re.search(r",\s*" + ab.lower() + r"\b", l)}
    for reg, abs_ in REGIONS.items():
        if re.search(r"\b" + reg + r"\b", l):
            codes |= set(abs_)
    city = re.sub(r",.*$", "", l).strip()
    return codes, ("" if city in STATES or city in REGIONS else city)


def _loc_score(c, codes, city):
    locs = [str(x).lower() for x in (c.get("locations") or [])] + [str(c.get("hq") or "").lower()]
    if city and any(x.startswith(city) for x in locs):
        return 3
    if codes and (codes & set(c.get("states") or []) or
                  any(re.search(r",\s*(" + "|".join(a.lower() for a in codes) + r")\b", x) for x in locs)):
        return 2
    return 0


def match(field, location, ctype, message, limit=6):
    db = _load()
    keys = field_keys(f"{field or ''} {message or ''}")
    if not keys:
        return []
    pool = [c for c in db["items"] if keys & set(c.get("fields") or [])]
    if ctype:
        pool = [c for c in pool if ctype in (c.get("categories") or [])]
    codes, city = _place(location)
    scored = []
    for c in pool:
        ls = _loc_score(c, codes, city) if (codes or city) else 0
        if (codes or city) and not ls:
            continue
        jitter = zlib.crc32((c["name"] + (message or "")).encode()) % 1000
        scored.append((-ls, -len(keys & set(c["fields"])), jitter, c))
    scored.sort(key=lambda s: s[:3])
    out = []
    for *_, c in scored[:limit]:
        k = next((k for k in c["fields"] if k in keys), None)
        why = c.get("why")
        why = why.get(k) if isinstance(why, dict) else why
        out.append({"name": c["name"], "why": why or db["fields"].get(k, {}).get("label", ""), "ctype": ctype,
                    "from_db": True})
    return out


def wrap_db(base):
    def suggest_companies(*args, **kwargs):
        text = " ".join(str(kwargs.get(k) or "") for k in ("message", "field"))
        ctype = detect_type(text)
        if ctype in ("big_four", "big_tech"):
            return base(*args, **kwargs)
        try:
            picks = match(kwargs.get("field"), kwargs.get("location"), ctype, kwargs.get("message"), limit=12)
        except Exception:
            picks = []
        if len(picks) >= 4:
            return picks
        seen = {p["name"].lower() for p in picks}
        for m in base(*args, **kwargs) or []:
            n = m.get("name") if isinstance(m, dict) else str(m)
            if n and n.lower() not in seen:
                seen.add(n.lower())
                picks.append(m if isinstance(m, dict) else {"name": n})
        return picks[:6]
    return suggest_companies
