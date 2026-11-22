"""
backend/advisor/careers_any.py

Official careers-page links for any US company, and company lists with links.
Order: hand-checked list (data/companies.json) -> AI guess of the official site, checked live
-> a search link (never a guessed, unchecked URL).
"""
import difflib
import html
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, wait
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus, urlparse

import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATA = Path(__file__).resolve().parents[1] / "data" / "companies.json"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"}
JOB_SITES = ("myworkdayjobs.com", "greenhouse.io", "lever.co", "icims.com", "taleo.net", "successfactors.com",
             "smartrecruiters.com", "jobvite.com", "ashbyhq.com", "workable.com", "oraclecloud.com",
             "ultipro.com", "paylocity.com", "adp.com", "bamboohr.com", "recruitee.com", "eightfold.ai",
             "avature.net", "dayforcehcm.com", "phenompeople.com")
CAREER_WORDS = re.compile(r"career|jobs?\b|opening|position|join (our|the) team|apply|hiring|work (with|at) us", re.I)
SKIP = {"the", "inc", "llc", "corp", "company", "group", "and", "of", "co", "holdings"}
_cache = {}
_client = None


def _ai():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


@lru_cache(maxsize=1)
def _curated():
    try:
        data = json.loads(DATA.read_text())
    except Exception:
        return {}
    items = data["companies"] if isinstance(data, dict) else data
    out = {}
    for c in items:
        url = next((v for k, v in c.items() if "url" in k.lower() and isinstance(v, str) and v.startswith("http")), None)
        if c.get("name") and url:
            out[c["name"]] = url
    return out


def _tokens(name):
    return [t for t in re.findall(r"[a-z0-9]+", name.lower()) if len(t) >= 3 and t not in SKIP]


def _from_list(name):
    cur, low = _curated(), name.lower().strip()
    for n, u in cur.items():
        if n.lower() == low:
            return n, u
    for n, u in cur.items():
        if len(low) >= 4 and (n.lower().startswith(low) or low.startswith(n.lower())):
            return n, u
    m = difflib.get_close_matches(low, [n.lower() for n in cur], n=1, cutoff=0.88)
    if m:
        n = next(k for k in cur if k.lower() == m[0])
        return n, cur[n]
    return None, None


def _guess(name):
    r = _ai().chat.completions.create(
        model="gpt-4o-mini", temperature=0, max_tokens=200, response_format={"type": "json_object"},
        messages=[{"role": "system", "content":
                   "You know the official websites of US employers. For the company named, reply with JSON: "
                   '{"official_name": str, "domain": "main website domain like asurion.com", '
                   '"careers_urls": [up to 3 most likely official careers page URLs, best first]}. '
                   "Only the company's own site or its hiring system (Workday, Greenhouse, Lever, iCIMS...). "
                   'If you do not know the company, reply {"official_name": null, "domain": null, "careers_urls": []}.'},
                  {"role": "user", "content": name}])
    try:
        return json.loads(r.choices[0].message.content) or {}
    except Exception:
        return {}


def _check(url, domain, name):
    """'ok' = loads on the company's site and looks like careers; 'blocked' = official domain refuses bots; else None."""
    try:
        r = requests.get(url, headers=UA, timeout=5, allow_redirects=True)
    except Exception:
        # many big sites drop connections from cloud servers; trust the company's own domain
        host = (urlparse(url).hostname or "").lower()
        on_site = bool(domain) and (host == domain or host.endswith("." + domain))
        return "blocked" if on_site and any(t in host for t in _tokens(name)) else None
    host = (urlparse(r.url).hostname or "").lower()
    on_site = bool(domain) and (host == domain or host.endswith("." + domain))
    if not (on_site or any(host.endswith(s) for s in JOB_SITES)):
        return None
    if r.status_code < 400:
        return "ok" if CAREER_WORDS.search(r.text[:200000]) else None
    if r.status_code in (401, 403, 405, 429, 503) and any(t in host for t in _tokens(name)):
        return "blocked"
    return None


def _legacy(name):
    """The original careers.py lookup, used before falling back to a search link."""
    try:
        import careers
        h = careers._legacy_careers_html(careers._legacy_careers_links([name]))
        m = re.search(r'href="([^"]+)"', h or "")
        if m and "google.com" not in m.group(1):
            return html.unescape(m.group(1))
    except Exception:
        pass
    return None


def search_link(name):
    return "https://www.google.com/search?q=" + quote_plus(f"{name} careers official site")


def find_careers_link(name):
    """{"name", "url", "kind"}: kind is list, verified, likely (official site that blocks checks), or search."""
    key = name.lower().strip()
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < 86400:
        return hit[1]
    n, u = _from_list(name)
    if u:
        res = {"name": n, "url": u, "kind": "list"}
    else:
        g = _guess(name)
        domain = (g.get("domain") or "").lower().replace("https://", "").replace("http://", "").replace("www.", "").strip("/") or None
        official = g.get("official_name") or name
        res = likely = None
        candidates = [x for x in (g.get("careers_urls") or [])[:3] if isinstance(x, str) and x.startswith("http")]
        if domain:
            candidates += [f"https://www.{domain}/careers/", f"https://www.{domain}/careers", f"https://careers.{domain}/"]
        for url in candidates:
            status = _check(url, domain, official)
            if status == "ok":
                res = {"name": official, "url": url, "kind": "verified"}
                break
            if status == "blocked" and not likely:
                likely = {"name": official, "url": url, "kind": "likely"}
        res = res or likely
        if not res:
            legacy = _legacy(name)
            res = ({"name": official, "url": legacy, "kind": "verified"} if legacy
                   else {"name": official, "url": search_link(official), "kind": "search"})
    _cache[key] = (time.time(), res)
    return res


def find_many(names, deadline=15):
    names = list(dict.fromkeys(n.strip() for n in names if n and n.strip()))[:8]
    pool = ThreadPoolExecutor(max_workers=8)
    futs = [pool.submit(find_careers_link, n) for n in names]
    done, _ = wait(futs, timeout=deadline)
    pool.shutdown(wait=False, cancel_futures=True)
    return [f.result() if f in done and not f.exception() else {"name": n, "url": search_link(n), "kind": "search"}
            for n, f in zip(names, futs)]


def _a(url, text):
    return f'<a href="{html.escape(url)}" target="_blank" rel="noopener noreferrer">{html.escape(text)}</a>'


def _link(r):
    return _a(r["url"], "search for their careers page" if r["kind"] == "search" else "careers page")


def _name(it):
    return ((it.get("name") if isinstance(it, dict) else str(it)) or "").strip()


def _note(it):
    if not isinstance(it, dict):
        return ""
    for k in ("why", "reason", "fit", "description", "summary", "note"):
        if isinstance(it.get(k), str) and it[k].strip():
            return it[k].strip()
    for v in it.values():
        if isinstance(v, list) and v and all(isinstance(x, str) for x in v):
            return ", ".join(v)
    return ""


# ---- replacements for the names router.py imports from careers.py ----

def careers_links(names):
    return find_many(names)


def careers_html(links):
    lines = ["<b>Careers pages</b>"]
    for r in links:
        lines.append(f"• <b>{html.escape(r['name'])}</b>: {_link(r)}")
    lines.append("<i>These open each company's official careers site, not a specific job posting.</i>")
    return "<br>".join(lines)


def careers_brief(links):
    return ("Careers page links for: " + ", ".join(r["name"] for r in links)
            + ". The list with links is attached after your reply.")


def explorer_html(picks, field=None, location=None):
    picks = [p for p in picks if _name(p)][:8]
    links = find_many([_name(p) for p in picks])
    ct = next((p.get("ctype") for p in picks if isinstance(p, dict) and p.get("ctype")), None)
    head = {"startup": "Startups", "fortune_500": "Fortune 500 companies", "big_tech": "Big Tech companies",
            "big_four": "Big Four firms", "consulting": "Consulting firms", "nonprofit": "Nonprofits",
            "government": "Government employers", "small_business": "Small businesses"}.get(ct, "Companies")
    extra = " Startup details change quickly, so confirm on each company's site." if ct == "startup" else ""
    title = head + " to explore" + (f" for {field}" if field else "") + (f" in {location}" if location else "")
    lines = [f"<b>{html.escape(title)}</b>"]
    for i, (p, r) in enumerate(zip(picks, links), 1):
        note = _note(p)
        lines.append(f"{i}. <b>{html.escape(_name(p))}</b>" + (f": {html.escape(note)}" if note else "") + f" · {_link(r)}")
    lines.append("<i>Links open each company's official careers site. Tell me more about what you want and I can narrow the list." + extra + "</i>")
    return "<br>".join(lines)


def explorer_brief(picks):
    return ("Companies suggested: " + ", ".join(_name(p) for p in picks if _name(p))
            + ". The list with their careers links is attached after your reply.")
