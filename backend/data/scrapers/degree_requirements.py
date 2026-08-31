"""
Extracts real major/department description sections using the
"COURSES OFFERED: CODE" structural marker, which appears consistently
across Arts & Science, Engineering, and other colleges - not just
Peabody's "Major in X" pattern.

Usage:
    python degree_requirements.py --pages catalog_pages.json --out degree_requirements.json
"""

import argparse
import json
import re
from pathlib import Path

MARKER_PATTERN = re.compile(r"COURSES OFFERED:\s*([A-Z\-,\s]{2,30})\n")


def parse_degree_requirements(full_text: str) -> list:
    matches = list(MARKER_PATTERN.finditer(full_text))

    sections = []
    for i, match in enumerate(matches):
        codes = match.group(1).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else start + 3000
        description_text = full_text[start:end].strip()

        sections.append(
            {
                "department_codes": codes,
                "degree_type": "major",
                "requirement_text": description_text[:4000],
            }
        )

    return sections


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", required=True)
    parser.add_argument("--end-page", type=int, default=456)
    parser.add_argument("--out", default="degree_requirements.json")
    args = parser.parse_args()

    all_pages = json.loads(Path(args.pages).read_text())
    early_pages = all_pages[:args.end_page]
    full_text = "\n".join(early_pages)

    print("Scanning for degree requirement sections...")
    sections = parse_degree_requirements(full_text)

    print(f"Found {len(sections)} department sections.")
    Path(args.out).write_text(json.dumps(sections, indent=2))
    print(f"Wrote {args.out}")

    print("\nDepartment codes found:")
    for s in sections:
        print(f"  - {s['department_codes']}")


if __name__ == "__main__":
    main()
