"""
backend/data/scrapers/build_company_db.py

Builds a large employer list for every Vanderbilt major, across all 50 states and DC:
  1. maps each major/minor to career fields (data/major_fields.json)
  2. asks gpt-4o for real employers: per career field x type (large, mid-size, startup, nonprofit, government),
     per career-field group x state (all 50 states + DC), and Tennessee
  3. checks each employer's careers page live (advisor/careers_any.find_careers_link); keeps only confirmed ones
  4. writes data/companies.json (+ data/career_fields.json, data/companies_by_category.csv)
Resumable: rerun to continue. Re-run yearly to refresh (about $12-18, 1.5-2.5 hours).
"""
import csv
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

D = Path(__file__).resolve().parent
DATA = D.parent
load_dotenv(D.parents[1] / ".env")
sys.path.insert(0, str(D.parents[1] / "advisor"))
from careers_any import find_careers_link  # noqa: E402

YEAR = date.today().year
CAND, LINKS = D / "company_candidates.json", D / "company_links.json"
FIELDS = {k: {"label": l, "keywords": kw} for k, l, kw in [
    ("art_design", "Art, design & museums", ["art", "design", "museum", "gallery", "studio art", "illustration", "graphic design"]),
    ("music", "Music & the music industry", ["music", "jazz", "composition", "musicology", "recording", "orchestra", "musician"]),
    ("performing_arts", "Theatre, film & performing arts", ["theatre", "theater", "film", "cinema", "media arts", "acting", "dance", "production"]),
    ("media_journalism", "Journalism, media & publishing", ["journalism", "media", "publishing", "writing", "english", "creative writing", "editor", "literature"]),
    ("communications_pr", "Communications, PR & marketing", ["communication", "communications", "public relations", "pr", "marketing", "advertising", "brand"]),
    ("k12_education", "K-12 teaching & schools", ["teach", "teacher", "teaching", "elementary", "secondary", "education", "school", "classroom"]),
    ("special_education", "Special education & disability services", ["special education", "disability", "disabilities", "autism"]),
    ("child_family_services", "Child development, family & social services", ["child", "children", "child development", "child studies", "social work", "family", "youth"]),
    ("higher_ed_edtech", "Higher education & edtech", ["edtech", "higher education", "educational studies", "university", "curriculum", "learning"]),
    ("psychology_mental_health", "Psychology & mental health", ["psychology", "mental health", "counseling", "therapy", "behavioral"]),
    ("healthcare_systems", "Hospitals & health systems", ["hospital", "healthcare", "health care", "nurse", "nursing", "clinical", "pre-med", "physician"]),
    ("public_health", "Public health & health policy", ["public health", "health policy", "global health", "medicine health and society", "epidemiology"]),
    ("biotech_pharma", "Biotech, pharma & life sciences", ["biotech", "pharma", "pharmaceutical", "biology", "biological", "biochemistry", "molecular", "life sciences", "chemistry"]),
    ("research_labs", "Research institutes & labs", ["research", "lab", "laboratory", "scientist", "physics", "astronomy", "neuroscience"]),
    ("software_tech", "Software & tech", ["software", "computer science", "tech", "developer", "programming", "it"]),
    ("data_ai", "Data science & AI", ["data", "data science", "ai", "artificial intelligence", "machine learning", "analytics", "statistics", "quantitative"]),
    ("cybersecurity", "Cybersecurity", ["cyber", "cybersecurity", "security", "information security"]),
    ("electrical_hardware", "Electrical engineering & hardware", ["electrical", "computer engineering", "semiconductor", "hardware", "electronics"]),
    ("mechanical_aerospace", "Mechanical, aerospace & manufacturing", ["mechanical", "aerospace", "manufacturing", "automotive", "robotics"]),
    ("civil_construction", "Civil engineering, construction & infrastructure", ["civil", "construction", "infrastructure", "structural", "transportation"]),
    ("environment_climate", "Environment, climate & sustainability", ["environment", "environmental", "climate", "sustainability", "conservation", "earth", "ecology"]),
    ("energy", "Energy & utilities", ["energy", "utilities", "utility", "renewable", "nuclear", "solar", "oil", "gas"]),
    ("chemical_materials", "Chemical engineering & materials", ["chemical engineering", "materials", "materials science", "nanotechnology", "nanoscience", "polymers"]),
    ("biomedical_devices", "Biomedical engineering & medical devices", ["biomedical", "medical device", "medical devices", "bioengineering"]),
    ("finance_banking", "Banking & investment", ["finance", "financial", "banking", "bank", "investment", "investing", "wall street", "asset management", "economics"]),
    ("accounting", "Accounting, audit & tax", ["accounting", "accountant", "audit", "tax", "cpa"]),
    ("consulting", "Consulting", ["consulting", "consultant", "strategy"]),
    ("insurance_risk", "Insurance & risk", ["insurance", "actuarial", "actuary", "risk"]),
    ("real_estate_planning", "Real estate, architecture & urban planning", ["real estate", "property", "urban planning", "architecture", "built environment"]),
    ("law_legal", "Law & legal services", ["law", "legal", "paralegal", "pre-law", "attorney", "lawyer"]),
    ("government_policy", "Government & public policy", ["government", "public policy", "political science", "policy", "politics", "legislative"]),
    ("national_security", "National security & defense", ["national security", "defense", "intelligence", "military"]),
    ("international_affairs", "International affairs & NGOs", ["international", "global", "foreign affairs", "diplomacy", "ngo", "humanitarian"]),
    ("nonprofit_advocacy", "Nonprofits, advocacy & community", ["nonprofit", "non-profit", "advocacy", "community", "social justice", "civic", "diaspora", "gender", "leadership"]),
    ("religion_faith", "Faith-based organizations", ["religion", "religious", "ministry", "faith", "church", "jewish", "islamic"]),
    ("languages_culture", "Languages, translation & cultural organizations", ["spanish", "french", "german", "russian", "arabic", "chinese", "japanese", "korean", "portuguese", "italian", "translation", "language"]),
    ("speech_language", "Speech, language & hearing", ["language sciences", "speech", "linguistics", "audiology", "hearing"]),
    ("history_heritage", "History, archives & cultural heritage", ["history", "archive", "archives", "heritage", "classics", "archaeology", "historic"]),
    ("sports_recreation", "Sports & recreation", ["sports", "athletic", "athletics", "recreation", "fitness"]),
    ("hospitality_tourism", "Hospitality, events & tourism", ["hospitality", "hotel", "events", "tourism", "travel"]),
    ("consumer_retail", "Consumer brands & retail", ["retail", "consumer", "fashion", "apparel", "consumer goods"]),
    ("hr_org_development", "HR, people & organizational development", ["human resources", "hr", "organizational development", "human and organizational development", "people operations", "talent"]),
    ("business_operations", "Business operations & management", ["business", "operations", "management", "entrepreneur", "entrepreneurship", "supply chain", "logistics"]),
    ("economics_research", "Economics & policy research", ["economics", "economist", "think tank", "policy research"]),
    ("philosophy_ethics", "Ethics, philosophy & public affairs", ["philosophy", "ethics", "bioethics"]),
]}
for f in FIELDS.values():
    f["hint"] = ", ".join(f["keywords"][:6])
GROUPS = {
    "arts_media": ["art_design", "music", "performing_arts", "media_journalism", "communications_pr", "history_heritage", "languages_culture"],
    "education_social": ["k12_education", "special_education", "child_family_services", "higher_ed_edtech",
                         "psychology_mental_health", "speech_language", "religion_faith", "nonprofit_advocacy"],
    "health_science": ["healthcare_systems", "public_health", "biotech_pharma", "research_labs", "biomedical_devices"],
    "tech_data": ["software_tech", "data_ai", "cybersecurity", "electrical_hardware"],
    "engineering_energy": ["mechanical_aerospace", "civil_construction", "chemical_materials", "energy", "environment_climate"],
    "business_finance": ["finance_banking", "accounting", "consulting", "insurance_risk", "business_operations", "hr_org_development",
                         "consumer_retail", "real_estate_planning", "hospitality_tourism", "sports_recreation"],
    "law_government": ["law_legal", "government_policy", "national_security", "international_affairs", "economics_research", "philosophy_ethics"],
}
STATES = {"Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
          "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
          "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
          "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
          "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
          "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
          "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
          "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
          "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
          "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC"}
TYPES = {
    "large": "large established employers (over about 5,000 employees), including Fortune 500 companies where relevant",
    "mid_size": "mid-size employers (about 500 to 5,000 employees)",
    "startup": "venture-backed startups (privately held, founded 2012 or later, still independent)",
    "nonprofit": "nonprofit organizations",
    "government": "government agencies and public institutions",
}
SCHEMA = ('{"companies": [{"name": str, "why": "what new grads in this field do there, under 12 words", '
          '"fields": [field keys that fit, from the list given], '
          '"hq": "City, ST", "locations": ["City, ST" for up to 6 main US offices], "founded": year, '
          '"ownership": "private" | "public" | "nonprofit" | "government", "status": "active" | "acquired" | "defunct", '
          '"employees": approximate number, "fortune_500": true or false}]}')
BIG_TECH = {"apple", "microsoft", "alphabet", "google", "amazon", "meta", "nvidia"}
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def ask(model, system, user="Return the list."):
    for i in range(4):
        try:
            r = client.chat.completions.create(model=model, temperature=0.3, response_format={"type": "json_object"},
                                               messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
            return json.loads(r.choices[0].message.content) or {}
        except Exception:
            time.sleep(5 * (i + 1))
    return {}


def norm(n):
    n = str(n).lower().replace("&", "and")
    n = re.sub(r"\b(the|inc|llc|corp|corporation|co|company|ltd|plc|group|holdings)\b\.?", " ", n)
    return re.sub(r"[^a-z0-9]+", " ", n).strip()


def num(x, default):
    try:
        return int(str(x).replace(",", "").split()[0])
    except Exception:
        return default


def states_in(*places):
    found = set()
    for p in places:
        for x in (p if isinstance(p, list) else [p]):
            m = re.search(r",\s*([A-Z]{2})\b", str(x or ""))
            if m and m.group(1) in STATES.values():
                found.add(m.group(1))
    return found


def major_fields():
    out = DATA / "major_fields.json"
    progs = [p["name"] for p in json.load(open(D / "programs.json"))]
    have = json.load(open(out)) if out.exists() else {}
    todo = [p for p in progs if p not in have]
    keys = "\n".join(f"{k}: {v['label']}" for k, v in FIELDS.items())
    for i in range(0, len(todo), 40):
        chunk = todo[i:i + 40]
        res = ask("gpt-4o-mini", "Map each Vanderbilt major or minor to the 2-5 career fields its graduates most often "
                  f"enter. Use only these field keys:\n{keys}\nReply JSON {{\"map\": {{\"program name\": [field keys]}}}}",
                  "\n".join(chunk))
        for p, ks in (res.get("map") or {}).items():
            if p in chunk:
                have[p] = [k for k in ks if k in FIELDS]
    json.dump(have, open(out, "w"), indent=1)
    print(f"1. majors mapped to career fields: {len(have)} of {len(progs)}")
    return have


def candidates():
    cand = json.load(open(CAND)) if CAND.exists() else {}
    jobs = []
    for k, f in FIELDS.items():
        for t, desc in TYPES.items():
            jobs.append((f"nat|{k}|{t}", f"List 20 real US employers that are {desc} and regularly hire new college graduates "
                         f"for {f['label']} roles ({f['hint']}). Mix well-known and lesser-known employers across different "
                         f"US regions. Only real, currently operating organizations you are confident about. "
                         f"Use field key: {k}. Reply with JSON: {SCHEMA}"))
    for state, ab in STATES.items():
        for g, keys in GROUPS.items():
            labels = "; ".join(f"{FIELDS[k]['label']} [{k}]" for k in keys)
            jobs.append((f"state|{ab}|{g}", f"List 25 real employers with offices in {state} that hire new college graduates "
                         f"in these career areas: {labels}. Include a mix of large employers, mid-size and small companies, "
                         f"startups, nonprofits, and government/public institutions, in different cities across {state}. "
                         f"Cover as many of the areas as you can. For each, list which of these field keys fit: {', '.join(keys)}. "
                         f"Only real, currently operating organizations you are confident about. Reply with JSON: {SCHEMA}"))
    todo = [j for j in jobs if j[0] not in cand]
    print(f"2. employer lists to fetch: {len(todo)} of {len(jobs)} (national + all 50 states and DC)")
    with ThreadPoolExecutor(8) as pool:
        futs = {pool.submit(ask, "gpt-4o", q): key for key, q in todo}
        for n, fut in enumerate(as_completed(futs), 1):
            cand[futs[fut]] = fut.result().get("companies") or []
            if n % 25 == 0:
                json.dump(cand, open(CAND, "w"))
                print(f"   {n}/{len(todo)} lists")
    json.dump(cand, open(CAND, "w"))
    return cand


def merge(cand):
    comp = {}
    for key, items in cand.items():
        parts = key.split("|")
        if parts[0] == "nat":
            allowed, default, state = [parts[1]], parts[1], None
        elif parts[0] == "state":
            allowed, default, state = GROUPS.get(parts[2], []), GROUPS.get(parts[2], ["business_operations"])[0], parts[1]
        else:
            continue
        for c in items or []:
            name = str(c.get("name") or "").strip()
            if not name or str(c.get("status", "active")).lower() != "active":
                continue
            e = comp.setdefault(norm(name), {"name": name, "fields": [], "why": {}, "states": set(), "locations": [], "hits": 0,
                                             **{k: c.get(k) for k in ("hq", "founded", "ownership", "employees", "fortune_500")}})
            e["hits"] += 1
            fs = [f for f in (c.get("fields") or []) if f in allowed] or [default]
            for f in fs:
                if f not in e["fields"]:
                    e["fields"].append(f)
                e["why"].setdefault(f, str(c.get("why") or "")[:110])
            for loc in c.get("locations") or []:
                if loc not in e["locations"] and len(e["locations"]) < 12:
                    e["locations"].append(loc)
            e["states"] |= states_in(c.get("hq"), c.get("locations"))
            if state:
                e["states"].add(state)
    for nk, e in comp.items():
        own, founded, ppl = str(e.get("ownership") or "").lower(), num(e.get("founded"), 0), num(e.get("employees"), 0)
        cats = set()
        if e.get("fortune_500") is True and own == "public":
            cats.add("fortune_500")
        if ppl >= 5000:
            cats.add("large")
        elif ppl >= 500:
            cats.add("mid_size")
        elif ppl:
            cats.add("small_business")
        if own == "private" and founded >= YEAR - 15 and 0 < ppl <= 3000:
            cats.add("startup")
        if own in ("nonprofit", "government"):
            cats.add(own)
        if "consulting" in e["fields"]:
            cats.add("consulting")
        if nk.split()[0] in BIG_TECH:
            cats.add("big_tech")
        if "TN" in e["states"]:
            cats.add("tennessee")
        if "nashville" in " ".join([str(e.get("hq") or "")] + e["locations"]).lower():
            cats.add("nashville")
        e["categories"] = sorted(cats)
        e["states"] = sorted(e["states"])
    print(f"3. unique employers suggested: {len(comp)}")
    return comp


def links(comp, skip):
    done = json.load(open(LINKS)) if LINKS.exists() else {}
    todo = []  # careers pages are now checked on the server when a student asks (no mass checks from a laptop)
    print(f"4. careers pages to check live: {len(todo)} (already checked: {len(done)})")
    with ThreadPoolExecutor(16) as pool:
        futs = {pool.submit(find_careers_link, n): norm(n) for n in todo}
        for i, fut in enumerate(as_completed(futs), 1):
            try:
                r = fut.result()
            except Exception:
                r = {"kind": "search"}
            done[futs[fut]] = {"url": r.get("url"), "kind": r.get("kind")}
            if i % 200 == 0:
                json.dump(done, open(LINKS, "w"))
                ok = sum(1 for v in done.values() if v["kind"] != "search")
                print(f"   {i}/{len(todo)} checked, {ok} confirmed so far")
    json.dump(done, open(LINKS, "w"))
    return done


def main():
    json.dump(FIELDS, open(DATA / "career_fields.json", "w"), indent=1)
    mf = major_fields()
    comp = merge(candidates())
    path = DATA / "companies.json"
    data = json.load(open(path))
    items = data["companies"] if isinstance(data, dict) else data
    old = {norm(c["name"]): c for c in items}
    checked = links(comp, set(old))
    cat_fields = {"big_four": ["accounting", "consulting"], "consulting": ["consulting"], "big_tech": ["software_tech", "data_ai"],
                  "finance": ["finance_banking"], "healthcare": ["healthcare_systems"], "retail": ["consumer_retail", "business_operations"],
                  "consumer_brands": ["consumer_retail", "communications_pr"], "media_entertainment": ["media_journalism", "performing_arts", "music"],
                  "pharma_biotech": ["biotech_pharma"], "aerospace_defense": ["mechanical_aerospace", "national_security"],
                  "telecom": ["software_tech"], "insurance": ["insurance_risk"], "automotive": ["mechanical_aerospace"],
                  "hospitality": ["hospitality_tourism"], "tech": ["software_tech"], "nonprofit": ["nonprofit_advocacy"]}
    for c in items:
        f = set(c.get("fields") or [])
        for cat in c.get("categories") or []:
            f |= set(cat_fields.get(cat, []))
        c["fields"] = sorted(f)
        if "nashville" in (c.get("categories") or []):
            c["states"] = sorted(set(c.get("states") or []) | {"TN"})
    added = 0
    for nk, e in comp.items():
        if nk in old:
            c = old[nk]
            c["fields"] = sorted(set(c["fields"]) | set(e["fields"]))
            c["categories"] = sorted(set(c.get("categories") or []) | set(e["categories"]))
            c["states"] = sorted(set(c.get("states") or []) | set(e["states"]))
            c.setdefault("why", e["why"])
            c.setdefault("locations", e["locations"])
            c.setdefault("hq", e.get("hq"))
            continue
        link = checked.get(nk) or {}
        confirmed = link.get("kind") in ("verified", "likely", "list") and bool(link.get("url"))
        if not confirmed and (e.get("hits", 0) < 2 or link.get("kind") == "search"):
            continue
        items.append({"name": e["name"], "careers_url": link["url"] if confirmed else None,
                      "verified": link.get("kind") == "verified", "link_check": link.get("kind") if confirmed else "on_request", "categories": e["categories"], "fields": sorted(e["fields"]),
                      "states": e["states"], "why": e["why"], "hq": e.get("hq"), "locations": e["locations"],
                      "founded": e.get("founded"), "employees": e.get("employees"),
                      "source": "AI-suggested; careers page checked live"})
        added += 1
    items.sort(key=lambda c: c["name"].lower())
    json.dump(data, open(path, "w"), indent=1, ensure_ascii=False)

    cols = ["startup", "small_business", "mid_size", "large", "fortune_500", "big_tech", "big_four", "consulting",
            "nonprofit", "government", "nashville", "tennessee"]
    with open(DATA / "companies_by_category.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["company", "careers_url", "hq", "states"] + cols + ["career_fields"])
        for c in items:
            url = c.get("careers_url") or next((v for k, v in c.items() if "url" in k.lower() and isinstance(v, str)), "")
            w.writerow([c["name"], url, c.get("hq") or "", " ".join(c.get("states") or [])]
                       + ["X" if k in (c.get("categories") or []) else "" for k in cols]
                       + ["; ".join(FIELDS[k]["label"] for k in c.get("fields", []) if k in FIELDS)])

    print(f"\n5. companies.json: {len(items)} employers ({added} new, all with a careers page checked live)")
    print("   by type:", {k: sum(1 for c in items if k in (c.get("categories") or [])) for k in cols})
    per_state = {ab: sum(1 for c in items if ab in (c.get("states") or [])) for ab in STATES.values()}
    print("   states with the fewest employers:", sorted(per_state.items(), key=lambda x: x[1])[:10])
    print(f"   states with 50+ employers: {sum(1 for v in per_state.values() if v >= 50)} of {len(per_state)}")
    per_field = {k: sum(1 for c in items if k in c.get("fields", [])) for k in FIELDS}
    print("   fewest employers by career field:", sorted(per_field.items(), key=lambda x: x[1])[:8])
    per_major = {p: sum(1 for c in items if set(ks) & set(c.get("fields", []))) for p, ks in mf.items()}
    print("   majors with the fewest matches:", sorted(per_major.items(), key=lambda x: x[1])[:8])
    print(f"COMPANY_TOTAL={len(items)}")


if __name__ == "__main__":
    main()
