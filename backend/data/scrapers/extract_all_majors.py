"""
Uses the "COURSES OFFERED: CODE" marker to extract real major description
sections for every department found in the catalog - covering Arts &
Science, Engineering, and Blair, not just Peabody's "Major in X" pattern.

Each section runs from one marker to the next.
"""

import json
import re
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())
early_pages = pages[:456]
full_text = "\n".join(early_pages)

MARKER_PATTERN = re.compile(r"COURSES OFFERED:\s*([A-Z\-,\s]{2,30})\n")

matches = list(MARKER_PATTERN.finditer(full_text))

sections = []
for i, match in enumerate(matches):
    codes = match.group(1).strip()
    start = match.end()
    end = matches[i + 1].start() if i + 1 < len(matches) else start + 3000
    description_text = full_text[start:end].strip()

    sections.append({
        "department_codes": codes,
        "requirement_text": description_text[:4000],
    })

print(f"Extracted {len(sections)} major description sections")
Path("degree_requirements.json").write_text(json.dumps(sections, indent=2))

# Sanity check a few real ones
for check_code in ["CS", "ECON"]:
    matches_for_code = [s for s in sections if check_code in s["department_codes"].split(", ")]
    if matches_for_code:
        print(f"\n{'=' * 60}")
        print(f"SAMPLE: {check_code}")
        print('=' * 60)
        print(matches_for_code[0]["requirement_text"][:600])
