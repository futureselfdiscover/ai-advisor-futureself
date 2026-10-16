"""
backend/advisor/careers.py

Company explorer + careers-page links.

- suggest_companies(): a handful of employers for a field / industry / city
  (curated list first, then well-known employers suggested by gpt-4o-mini)
- careers_links(): the official careers page for each named company. Links come
  from data/companies.json (checked by data/scrapers/verify_companies.py) or are
  discovered live and only returned if the page actually loads and looks like a
  careers site. Never a specific job posting, never a guessed link.

Usage:
    python careers.py "Asurion" "HCA Healthcare"
"""

import html
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from openai import OpenAI

base = Path(__file__).resolve().parents[1]
load_dotenv(base / ".env")

COMPANIES_FILE = base / "data" / "companies.json"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept-Language": "en-US,en;q=0.9",
}
ATS_HOSTS = ("myworkdayjobs.com", "workday.com", "greenhouse.io", "lever.co", "icims.com", "taleo.net",
             "successfactors", "smartrecruiters.com", "jobvite.com", "avature.net", "phenompeople.com",
             "eightfold.ai", "ultipro.com", "adp.com", "oraclecloud.com", "brassring.com", "dayforcehcm.com")
CAREER_WORDS = re.compile(r"(?i)(careers?|jobs?|join (our|the) team|open (roles|positions)|search jobs|"
                          r"work with us|internships?|life at)")
CACHE_SECONDS = 24 * 3600

_client = None
_companies = None
_cache = {}


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def norm(text: str) -> str:
    n = str(text).lower().replace("&", " and ")
    n = re.sub(r"\b(inc|llc|corp|corporation|company|co|the|group|ltd)\b\.?", " ", n)
    return re.sub(r"[^a-z0-9]+", " ", n).strip()


def load_companies() -> list:
    global _companies
    if _companies is None:
        try:
            _companies = json.loads(COMPANIES_FILE.read_text())
        except Exception as e:
            print(f"careers: could not load {COMPANIES_FILE}: {e}")
            _companies = []
    return _companies


def find_company(name: str):
    want = norm(name)
    for c in load_companies():
        if want == norm(c["name"]) or want in {norm(a) for a in c.get("aliases", [])}:
            return c
    return None


def check_page(url: str, domain: str = None):
    """Final URL if the page loads and looks like a careers site (on the company's domain or a known
    job-site host), else None."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=8, allow_redirects=True)
    except Exception:
        return None
    if r.status_code >= 400:
        return None
    final = r.url
    host = urlparse(final).netloc.lower()
    on_domain = domain and (host == domain or host.endswith("." + domain))
    on_ats = any(a in host for a in ATS_HOSTS)
    if domain and not (on_domain or on_ats):
        return None
    if not (CAREER_WORDS.search(final) or CAREER_WORDS.search(r.text[:300000])):
        return None
    return final


def discover(name: str):
    """Live lookup for a company not in the verified list."""
    try:
        response = _get_client().chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=200,
            messages=[{"role": "user", "content": (
                f'Company: "{name}". Give its official website domain and up to 3 URLs of its official '
                'careers/jobs home page (not a single job posting). Only include URLs you are confident '
                'exist. JSON only: {"official_name": "...", "domain": "example.com", "careers_urls": ["https://..."]}'
            )}],
        )
        data = json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"careers: discover failed for {name}: {e}")
        return None

    domain = str(data.get("domain") or "").lower().replace("www.", "").strip("/ ")
    if not domain or "." not in domain:
        return None
    candidates = [u for u in data.get("careers_urls") or [] if isinstance(u, str) and u.startswith("http")]
    candidates += [f"https://careers.{domain}/", f"https://www.{domain}/careers", f"https://{domain}/careers",
                   f"https://jobs.{domain}/"]
    seen = []
    for u in candidates:
        if u not in seen:
            seen.append(u)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda u: check_page(u, domain), seen[:6]))
    url = next((r for r in results if r), None)
    return {"name": data.get("official_name") or name, "url": url} if url else None


def careers_link(name: str) -> dict:
    """{'name', 'url' or None, 'source'} for one company."""
    key = norm(name)
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]

    known = find_company(name)
    if known and known.get("verified") and known.get("careers_url"):
        result = {"name": known["name"], "url": known.get("final_url") or known["careers_url"], "source": "list"}
    else:
        found = None
        if known and known.get("careers_url"):
            url = check_page(known["careers_url"], None)
            found = {"name": known["name"], "url": url} if url else None
        found = found or discover(known["name"] if known else name)
        result = {"name": (found or {}).get("name") or (known or {}).get("name") or name,
                  "url": (found or {}).get("url"), "source": "live"}
    _cache[key] = (time.time(), result)
    return result


def careers_links(names: list) -> list:
    names = [n for n in dict.fromkeys(str(n).strip() for n in names or []) if n][:8]
    if not names:
        return []
    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(careers_link, names))


def careers_html(links: list) -> str:
    esc = html.escape
    found = [l for l in links if l.get("url")]
    missing = [l["name"] for l in links if not l.get("url")]
    lines = ["<b>Careers pages</b>"]
    for l in found:
        lines.append(f'• <a href="{esc(l["url"], quote=True)}" target="_blank" rel="noopener noreferrer">'
                     f'{esc(l["name"])} careers</a>')
    for name in missing:
        lines.append(f"• {esc(name)}: I couldn't confirm its official careers page. "
                     f"Try searching \u201c{esc(name)} careers\u201d.")
    lines.append("<i>These open each company's official careers site (not a specific job posting).</i>")
    return "<br>".join(lines)


def careers_brief(links: list) -> str:
    found = ", ".join(l["name"] for l in links if l.get("url")) or "none"
    return f"Careers page links for: {found}. The list with links is attached after your reply."


def suggest_companies(field: str = None, location: str = None, message: str = "", limit: int = 6) -> list:
    """[{'name', 'why'}] - curated companies that fit, then well-known employers from the model."""
    topic = " ".join(x for x in [field, message] if x).lower()
    picks = []
    for c in load_companies():
        tags = " ".join(c.get("industries", []) + c.get("roles", [])).lower()
        in_city = not location or any(norm(location) in norm(city) or norm(city) in norm(location)
                                      for city in c.get("cities", []))
        if in_city and any(w for w in re.findall(r"[a-z]{4,}", topic) if w in tags):
            picks.append({"name": c["name"], "why": c.get("blurb") or ", ".join(c.get("industries", [])[:2])})
    if len(picks) >= limit:
        return picks[:limit]

    try:
        where = f" in or near {location}" if location else ""
        response = _get_client().chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=500,
            messages=[{"role": "user", "content": (
                f"A Vanderbilt student asked: \"{message}\". Suggest {limit} real, well-known employers{where} "
                f"that hire new graduates or interns for {field or 'this interest'}. Mix company types "
                "(large, mid-size, mission-driven). Only real companies that currently exist. JSON only: "
                '{"companies": [{"name": "...", "why": "one short phrase"}]}'
            )}],
        )
        extra = json.loads(response.choices[0].message.content).get("companies") or []
    except Exception as e:
        print(f"careers: suggest failed: {e}")
        extra = []
    have = {norm(p["name"]) for p in picks}
    for e in extra:
        if isinstance(e, dict) and e.get("name") and norm(e["name"]) not in have:
            picks.append({"name": str(e["name"]), "why": str(e.get("why") or "")})
            have.add(norm(e["name"]))
    return picks[:limit]


def explorer_html(picks: list, field: str = None, location: str = None) -> str:
    esc = html.escape
    about = " ".join(x for x in [field, f"in {location}" if location else None] if x)
    lines = [f"<b>Companies to explore{(' for ' + esc(about)) if about else ''}</b>"]
    for i, p in enumerate(picks, 1):
        lines.append(f"{i}. <b>{esc(p['name'])}</b>" + (f": {esc(p['why'])}" if p.get("why") else ""))
    lines.append("Want me to pull up their careers pages? Say which ones, or \"all of them\".")
    return "<br>".join(lines)


def explorer_brief(picks: list) -> str:
    names = ", ".join(p["name"] for p in picks)
    return (f"Companies suggested: {names}. The list is attached after your reply. One of your suggested "
            f"replies must be \"Show their careers pages\".")


if __name__ == "__main__":
    for item in careers_links(sys.argv[1:] or ["Asurion"]):
        print(f"{item['name']}: {item['url'] or 'NOT FOUND'}  ({item['source']})")


# --- Clean suggested company lists: employers only, current names, no duplicates ---
import re as _re
_NOT_EMPLOYER = _re.compile(r"\b(school of|college of)\b", _re.I)
_CURRENT_NAME = {
    "saint thomas health": "Ascension Saint Thomas",
    "st. thomas health": "Ascension Saint Thomas",
    "st thomas health": "Ascension Saint Thomas",
}
_suggest_raw = suggest_companies


def suggest_companies(*args, **kwargs):
    items = _suggest_raw(*args, **kwargs)
    if not isinstance(items, list):
        return items
    out, seen = [], set()
    for it in items:
        name = (it.get("name") if isinstance(it, dict) else str(it)) or ""
        if not name or _NOT_EMPLOYER.search(name):
            continue
        fixed = _CURRENT_NAME.get(name.strip().lower(), name)
        if fixed.lower() in seen:
            continue
        seen.add(fixed.lower())
        out.append({**it, "name": fixed} if isinstance(it, dict) else fixed)
    return out
