"""
backend/data/scrapers/verify_companies.py

Checks every careers link in data/companies.json: the page must load and look like a careers
site. Broken links are replaced by a live lookup when possible. Anything still unconfirmed is
listed so a person can open it in a browser and approve it.

Usage (from backend/):
    python data/scrapers/verify_companies.py                    # check all
    python data/scrapers/verify_companies.py --approve "Tesla"  # mark one as checked by hand
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

base = Path(__file__).resolve().parents[2]
sys.path.append(str(base / "advisor"))
from careers import check_page, discover, COMPANIES_FILE


def check(c: dict) -> dict:
    final = check_page(c["careers_url"], None)
    if final:
        return dict(c, verified=True, final_url=final, checked=str(date.today()), note="ok")
    found = discover(c["name"])
    if found and found.get("url"):
        return dict(c, verified=True, careers_url=found["url"], final_url=found["url"],
                    checked=str(date.today()), note="replaced by live lookup")
    return dict(c, verified=False, checked=str(date.today()), note="could not confirm automatically")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--approve", default=None, help="company name you checked by hand in a browser")
    args = ap.parse_args()
    companies = json.loads(COMPANIES_FILE.read_text())

    if args.approve:
        for c in companies:
            if c["name"].lower() == args.approve.lower():
                c.update(verified=True, note="approved by hand", checked=str(date.today()))
                print(f"approved: {c['name']} -> {c['careers_url']}")
        COMPANIES_FILE.write_text(json.dumps(companies, indent=1))
        return

    with ThreadPoolExecutor(max_workers=8) as pool:
        companies = list(pool.map(check, companies))
    COMPANIES_FILE.write_text(json.dumps(companies, indent=1))

    for c in companies:
        mark = "OK  " if c["verified"] else "FAIL"
        print(f"{mark} {c['name']:<38} {c.get('final_url') or c['careers_url']}  ({c['note']})")
    bad = [c["name"] for c in companies if not c["verified"]]
    print(f"\n{len(companies) - len(bad)} of {len(companies)} careers links confirmed")
    if bad:
        print("Open these in a browser; if the link is right, run --approve \"Name\" for each:")
        print("  " + "; ".join(bad))


if __name__ == "__main__":
    main()
