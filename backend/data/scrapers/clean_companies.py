"""
backend/data/scrapers/clean_companies.py

Cleans data/companies.json: merges duplicates, removes employers that closed or were absorbed (a known list plus a
gpt-4o pass over every name), and re-checks every "startup" label. OpenAI only, no website checks. Re-run after
build_company_db.py, and every few months.
"""
import csv
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

D = Path(__file__).resolve().parent
DATA = D.parent
load_dotenv(D.parents[1] / ".env")
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
YEAR = date.today().year
# closed, liquidated, or absorbed so they no longer hire under this name (2022-2025)
CLOSED = ["InVision", "Bench Accounting", "Petal", "Credit Suisse", "Convoy", "Pear Therapeutics", "Argo AI", "Zymergen",
          "Proterra", "Canoo", "Zume", "Outdoor Voices", "Edmodo", "First Republic Bank", "Silicon Valley Bank",
          "Signature Bank", "Silvergate Bank", "Olive AI", "Cue Health", "Embark Trucks", "IronNet", "BuzzFeed News",
          "Quibi", "FTX", "BlockFi", "Celsius Network", "Babylon Health", "Lordstown Motors", "Fisker", "Fisker Inc.",
          "Nikola", "Nikola Corporation", "Party City", "Joann", "JOANN", "Bed Bath & Beyond", "Tuesday Morning",
          "Christmas Tree Shops", "Amazon Care", "Veev", "Fast Radius", "Lambda School", "Bloom Institute of Technology",
          "Rite Aid", "Forever 21"]


def norm(n):
    n = str(n).lower().replace("&", "and")
    n = re.sub(r"\b(the|inc|llc|corp|corporation|co|company|ltd|plc|group|holdings)\b\.?", " ", n)
    return re.sub(r"[^a-z0-9]+", "", n)


def ask(system, user):
    for _ in range(3):
        try:
            r = client.chat.completions.create(model="gpt-4o", temperature=0, response_format={"type": "json_object"},
                                               messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
            return json.loads(r.choices[0].message.content) or {}
        except Exception:
            pass
    return {}


def batches(xs, n):
    return [xs[i:i + n] for i in range(0, len(xs), n)]


def main():
    path = DATA / "companies.json"
    data = json.load(open(path))
    items = data["companies"] if isinstance(data, dict) else data
    start = len(items)

    by = {}
    for c in items:
        k = norm(c["name"])
        if k in by:
            keep = by[k]
            for f in ("fields", "categories", "states", "locations"):
                keep[f] = sorted(set(keep.get(f) or []) | set(c.get(f) or []))
            if not keep.get("careers_url") and c.get("careers_url"):
                keep["careers_url"] = c["careers_url"]
        else:
            by[k] = c
    items = list(by.values())
    print(f"1. duplicates merged: {start - len(items)}")

    closed_known = {norm(n) for n in CLOSED}
    gone = [c["name"] for c in items if norm(c["name"]) in closed_known]
    items = [c for c in items if norm(c["name"]) not in closed_known]
    print(f"2. removed (known closed/absorbed): {len(gone)} {gone}")

    system = ("You review a list of US employers for a student career advisor. Reply with JSON {\"closed\": [names exactly "
              "as written]} listing ONLY employers you are confident have shut down, gone out of business, or been acquired "
              "and fully absorbed so they no longer hire under that name. Do not list companies that were acquired but still "
              "operate and hire under their own name. If none, reply {\"closed\": []}.")
    names = [c["name"] for c in items]
    with ThreadPoolExecutor(6) as pool:
        results = list(pool.map(lambda b: ask(system, "\n".join(b)).get("closed") or [], batches(names, 60)))
    flagged = {norm(n) for r in results for n in r}
    gone2 = [c["name"] for c in items if norm(c["name"]) in flagged]
    items = [c for c in items if norm(c["name"]) not in flagged]
    print(f"3. removed by AI status check: {len(gone2)} e.g. {gone2[:25]}")

    startups = [c for c in items if "startup" in (c.get("categories") or [])]
    system = ("For each company, reply with JSON {\"companies\": [{\"name\": exactly as written, \"founded\": year, "
              "\"public\": true or false, \"parent_company\": name or null, \"employees\": approximate number}]}.")
    with ThreadPoolExecutor(6) as pool:
        res = list(pool.map(lambda b: ask(system, "\n".join(b)).get("companies") or [],
                            batches([c["name"] for c in startups], 40)))
    info = {norm(x.get("name", "")): x for r in res for x in r}
    unlabeled = []
    for c in startups:
        x = info.get(norm(c["name"]))
        try:
            founded = int(str((x or {}).get("founded") or 0)[:4])
            ppl = int(str((x or {}).get("employees") or 0).replace(",", "").split()[0])
        except Exception:
            founded, ppl = 0, 0
        if not x or x.get("public") or x.get("parent_company") or founded < YEAR - 15 or ppl > 3000:
            c["categories"] = [k for k in c["categories"] if k != "startup"]
            unlabeled.append(c["name"])
    print(f"4. startup label removed (public, owned by a parent, too old or too big): {len(unlabeled)} e.g. {unlabeled[:20]}")

    items.sort(key=lambda c: c["name"].lower())
    if isinstance(data, dict):
        data["companies"] = items
    else:
        data = items
    json.dump(data, open(path, "w"), indent=1, ensure_ascii=False)

    fields = json.load(open(DATA / "career_fields.json"))
    cols = ["startup", "small_business", "mid_size", "large", "fortune_500", "big_tech", "big_four", "consulting",
            "nonprofit", "government", "nashville", "tennessee"]
    with open(DATA / "companies_by_category.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["company", "careers_url", "hq", "states"] + cols + ["career_fields"])
        for c in items:
            url = c.get("careers_url") or next((v for k, v in c.items() if "url" in k.lower() and isinstance(v, str)), "") or ""
            w.writerow([c["name"], url, c.get("hq") or "", " ".join(c.get("states") or [])]
                       + ["X" if k in (c.get("categories") or []) else "" for k in cols]
                       + ["; ".join(fields[k]["label"] for k in c.get("fields", []) if k in fields)])
    print(f"5. companies.json now: {len(items)} employers; startups: "
          f"{sum(1 for c in items if 'startup' in (c.get('categories') or []))}")
    print(f"COMPANY_TOTAL={len(items)}")


if __name__ == "__main__":
    main()
