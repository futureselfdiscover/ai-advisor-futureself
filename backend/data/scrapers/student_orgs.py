"""
Pulls Vanderbilt student organizations from Anchor Link.

Usage:
    python student_orgs.py --out student_orgs.json --pages 20
"""

import argparse
import json
import time
from pathlib import Path

import requests

ENGAGE_SEARCH_URL = "https://vanderbilt.campuslabs.com/engage/api/discovery/search/organizations"
FALLBACK_HTML_URL = "https://anchorlink.vanderbilt.edu/organizations"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FutureSelfAdvisorBot/0.1; +https://futureself.example)"
}


def fetch_via_api(page_size=100, max_pages=20):
    orgs = []
    skip = 0

    for _ in range(max_pages):
        params = {
            "top": page_size,
            "skip": skip,
            "query": "",
            "orderBy[0]": "UpperName asc",
        }
        resp = requests.get(ENGAGE_SEARCH_URL, params=params, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            raise RuntimeError(f"API returned {resp.status_code}, falling back to HTML")

        data = resp.json()
        batch = data.get("value", [])
        if not batch:
            break

        for org in batch:
            orgs.append(
                {
                    "name": org.get("Name"),
                    "description": org.get("Summary") or org.get("Description"),
                    "category": org.get("CategoryNames"),
                    "profile_url": f"https://anchorlink.vanderbilt.edu/organization/{org.get('WebsiteKey')}"
                    if org.get("WebsiteKey")
                    else None,
                }
            )

        skip += page_size
        time.sleep(0.5)

        if len(batch) < page_size:
            break

    return orgs


def fetch_via_html_fallback():
    resp = requests.get(FALLBACK_HTML_URL, headers=HEADERS, timeout=15)
    resp.raise_for_status()

    if "campuslabs" in resp.text.lower():
        print("Got the HTML shell, not rendered org data - this page is a JS app.")
        Path("student_orgs_raw.html").write_text(resp.text)
        return []

    return []


def main():
    parser = argparse.ArgumentParser(description="Scrape Vanderbilt student orgs from Anchor Link")
    parser.add_argument("--out", default="student_orgs.json")
    parser.add_argument("--pages", type=int, default=20)
    args = parser.parse_args()

    orgs = []
    try:
        print("Trying the Engage search endpoint...")
        orgs = fetch_via_api(max_pages=args.pages)
        print(f"Pulled {len(orgs)} orgs via API.")
    except Exception as e:
        print(f"API approach failed ({e}), falling back to HTML...")
        orgs = fetch_via_html_fallback()

    Path(args.out).write_text(json.dumps(orgs, indent=2))
    print(f"Wrote {args.out} ({len(orgs)} orgs)")

    if not orgs:
        print("\nNo orgs pulled. Next step: open anchorlink.vanderbilt.edu/organizations in a browser, open dev tools > Network tab, reload, and find the actual request that loads org data.")


if __name__ == "__main__":
    main()
