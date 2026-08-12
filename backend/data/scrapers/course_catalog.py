"""
Parses courses from the "Course Description" section using the real format:
"CODE - Title\nCourse Description\n[description text]"
e.g. "ASIA3633 - Self-Cultivation in Ancient China\nCourse Description\n300 BCE to 500 CE..."

Usage:
    python course_catalog.py --pages catalog_pages.json --out course_catalog.json
"""

import argparse
import json
import re
from pathlib import Path

# Matches "CODE - Title" followed by the literal "Course Description" marker
COURSE_PATTERN = re.compile(
    r"(?P<code>[A-Z]{2,6}\d{3,4}[A-Za-z]?)\s*-\s*(?P<title>[^\n]{2,100})\n"
    r"Course Description\n"
)


def parse_courses(full_text: str) -> list:
    courses = []
    matches = list(COURSE_PATTERN.finditer(full_text))

    for i, match in enumerate(matches):
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else start + 800
        description = full_text[start:end].strip()[:600]

        # Insert a space between letters and numbers for readability, e.g. "ASIA3633" -> "ASIA 3633"
        raw_code = match.group("code")
        code = re.sub(r"([A-Z]+)(\d+)", r"\1 \2", raw_code)

        courses.append(
            {
                "code": code,
                "title": match.group("title").strip(),
                "description": description,
            }
        )

    return courses


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", required=True)
    parser.add_argument("--start-page", type=int, default=457)
    parser.add_argument("--end-page", type=int, default=1008)
    parser.add_argument("--out", default="course_catalog.json")
    args = parser.parse_args()

    all_pages = json.loads(Path(args.pages).read_text())
    section_pages = all_pages[args.start_page - 1:args.end_page]
    full_text = "\n".join(section_pages)

    print(f"Parsing course entries from pages {args.start_page}-{args.end_page}...")
    courses = parse_courses(full_text)

    print(f"Found {len(courses)} course entries.")
    Path(args.out).write_text(json.dumps(courses, indent=2))
    print(f"Wrote {args.out}")

    print("\nSample entries:")
    for c in courses[:5]:
        print(json.dumps(c, indent=2))


if __name__ == "__main__":
    main()
