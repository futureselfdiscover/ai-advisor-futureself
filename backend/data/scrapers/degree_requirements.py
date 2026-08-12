"""
Groups consecutive "Major in X" running-header pages into merged blocks
per department, dedupes departments, and filters out obviously malformed
matches (mid-sentence text picked up by the regex).

Usage:
    python degree_requirements.py --text catalog_text.txt --out degree_requirements.json
"""

import argparse
import json
import re
from pathlib import Path

HEADER_PATTERN = re.compile(r"Major in (?P<dept>[A-Z][A-Za-z,&\s]{2,80}?)\n")

# Words that indicate we grabbed a sentence fragment, not a real department name
JUNK_WORDS = {"and are", "and is", "typically", "usually", "which"}


def is_valid_department(name: str) -> bool:
    lower = name.lower()
    return not any(junk in lower for junk in JUNK_WORDS)


def parse_degree_requirements(full_text: str) -> list:
    matches = list(HEADER_PATTERN.finditer(full_text))
    if not matches:
        return []

    raw_sections = []
    current_dept = None
    current_start = None

    for match in matches:
        dept = re.sub(r"\s+", " ", match.group("dept")).strip()
        if not is_valid_department(dept):
            continue
        if dept != current_dept:
            if current_dept is not None:
                raw_sections.append(
                    {
                        "department": current_dept,
                        "degree_type": "major",
                        "requirement_text": full_text[current_start:match.start()][:5000].strip(),
                    }
                )
            current_dept = dept
            current_start = match.start()

    if current_dept is not None:
        raw_sections.append(
            {
                "department": current_dept,
                "degree_type": "major",
                "requirement_text": full_text[current_start:current_start + 5000].strip(),
            }
        )

    best_by_dept = {}
    for section in raw_sections:
        dept = section["department"]
        if dept not in best_by_dept or len(section["requirement_text"]) > len(best_by_dept[dept]["requirement_text"]):
            best_by_dept[dept] = section

    return list(best_by_dept.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True)
    parser.add_argument("--out", default="degree_requirements.json")
    args = parser.parse_args()

    full_text = Path(args.text).read_text()
    print("Scanning for degree requirement sections...")
    sections = parse_degree_requirements(full_text)

    print(f"Found {len(sections)} distinct majors after dedupe/filter.")
    Path(args.out).write_text(json.dumps(sections, indent=2))
    print(f"Wrote {args.out}")

    print("\nDepartments found:")
    for s in sections:
        print(f"  - {s['department']}")


if __name__ == "__main__":
    main()
