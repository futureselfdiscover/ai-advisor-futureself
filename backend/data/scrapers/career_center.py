"""
Crawls Vanderbilt's Career Center site (vanderbilt.edu/career/) and pulls
real page content: services, programs, resources, how things work.

Follows internal links within /career/, capped at a reasonable page count
so it doesn't run away crawling the whole university site. After crawling,
automatically strips out boilerplate text that repeats across most pages
(nav menus, footer, etc.) so what's left is the actual content.

Usage:
    python career_center.py --out career_center.json --max-pages 40
"""

import argparse
import json
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.vanderbilt.edu/career/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FutureSelfAdvisorBot/0.1; +https://futureself.example)"
}


def is_valid_career_link(href: str) -> bool:
    if not href:
        return False
    parsed = urlparse(href)
    if parsed.netloc and "vanderbilt.edu" not in parsed.netloc:
        return False  # external link
    if any(href.lower().endswith(ext) for ext in [".pdf", ".jpg", ".png", ".jpeg", ".docx", ".zip"]):
        return False
    return "/career/" in href or href.startswith("/career")


def fetch_page(url: str) -> tuple:
    """Returns (title, paragraphs_list) or (None, []) on failure."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"    failed to fetch {url}: {e}")
        return None, []

    soup = BeautifulSoup(resp.text, "html.parser")

    title_tag = soup.find("h1")
    title = title_tag.get_text(strip=True) if title_tag else url

    # Grab visible text blocks - paragraphs, list items, headers below h1
    text_elements = soup.find_all(["p", "li", "h2", "h3"])
    paragraphs = [el.get_text(strip=True) for el in text_elements if el.get_text(strip=True)]

    return title, paragraphs


def crawl(max_pages: int = 40) -> list:
    visited = set()
    to_visit = [BASE_URL]
    pages = []

    while to_visit and len(visited) < max_pages:
        url = to_visit.pop(0)
        if url in visited:
            continue
        visited.add(url)

        print(f"Fetching ({len(visited)}/{max_pages}): {url}")
        title, paragraphs = fetch_page(url)
        if title is None:
            continue

        pages.append({"url": url, "title": title, "paragraphs": paragraphs})

        # Discover more links from this page
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            soup = BeautifulSoup(resp.text, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if is_valid_career_link(href):
                    full_url = urljoin(url, href).split("#")[0]
                    if full_url not in visited and full_url not in to_visit:
                        to_visit.append(full_url)
        except Exception:
            pass

        time.sleep(0.3)  # be polite

    return pages


def strip_boilerplate(pages: list) -> list:
    """
    Finds lines that appear on more than half the pages (nav menus, footer
    text, etc.) and removes them, leaving only page-specific content.
    """
    if len(pages) < 3:
        return pages  # not enough pages to meaningfully detect boilerplate

    line_counts = Counter()
    for page in pages:
        unique_lines = set(page["paragraphs"])
        for line in unique_lines:
            line_counts[line] += 1

    threshold = len(pages) * 0.5
    boilerplate = {line for line, count in line_counts.items() if count > threshold}

    print(f"\nDetected {len(boilerplate)} boilerplate lines to strip (appear on {threshold:.0f}+ pages)")

    cleaned_pages = []
    for page in pages:
        cleaned = [p for p in page["paragraphs"] if p not in boilerplate]
        cleaned_pages.append(
            {
                "url": page["url"],
                "title": page["title"],
                "content": " ".join(cleaned),
            }
        )

    return cleaned_pages


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="career_center.json")
    parser.add_argument("--max-pages", type=int, default=40)
    args = parser.parse_args()

    print(f"Crawling {BASE_URL} (max {args.max_pages} pages)...")
    pages = crawl(max_pages=args.max_pages)

    print(f"\nCrawled {len(pages)} pages. Stripping boilerplate...")
    cleaned = strip_boilerplate(pages)

    # Drop pages that ended up with barely any real content after cleanup
    cleaned = [p for p in cleaned if len(p["content"]) > 100]

    Path(args.out).write_text(json.dumps(cleaned, indent=2))
    print(f"Wrote {len(cleaned)} pages to {args.out}")

    print("\nSample page:")
    if cleaned:
        print(json.dumps(cleaned[0], indent=2)[:800])


if __name__ == "__main__":
    main()
