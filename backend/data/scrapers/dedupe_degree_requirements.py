"""
Fixes two issues found in degree_requirements.json:
1. Exact-duplicate sections (same department_codes, identical text) -
   likely from the marker pattern matching more than once for the same
   real section.
2. Sections where the requirement_text clearly doesn't match its
   department_codes label (e.g. "CS" section containing Digital
   Fabrication content) - these get flagged for manual review rather
   than silently kept, since wrong labels are worse than no data.

Usage:
    python dedupe_degree_requirements.py
"""

import json
from pathlib import Path

sections = json.loads(Path("degree_requirements.json").read_text())
print(f"Starting with {len(sections)} sections")

# Step 1: remove exact-duplicate text within the same department_codes
seen_content = set()
deduped = []
duplicates_removed = 0

for s in sections:
    key = (s["department_codes"], s["requirement_text"][:200])  # first 200 chars as fingerprint
    if key in seen_content:
        duplicates_removed += 1
        continue
    seen_content.add(key)
    deduped.append(s)

print(f"Removed {duplicates_removed} exact duplicates -> {len(deduped)} sections remain")

# Step 2: flag sections where the text doesn't obviously relate to its
# department label - simple heuristic: does any code from the label
# (or a close variant) appear in the text itself?
flagged = []
clean = []

for s in deduped:
    codes = [c.strip() for c in s["department_codes"].split(",")]
    text_lower = s["requirement_text"].lower()

    # Very loose check: does the department name/code area show up at all
    # in a recognizable way in its own text? This won't be perfect, but
    # catches obvious mismatches like the Digital Fabrication one.
    looks_related = any(code.lower() in text_lower for code in codes) or "computer science" in text_lower

    if looks_related or s["department_codes"] not in ["CS", "ECE", "ME", "BME", "CHBE", "CE", "ENVE", "MSE", "NANO"]:
        # Only applying the strict check to a few codes we've seen issues
        # with - broader validation would need more manual spot-checking
        clean.append(s)
    else:
        flagged.append(s)

print(f"\nFlagged {len(flagged)} sections as possibly mislabeled:")
for f in flagged:
    print(f"  '{f['department_codes']}': {f['requirement_text'][:100]}")

Path("degree_requirements.json").write_text(json.dumps(clean, indent=2))
Path("degree_requirements_flagged.json").write_text(json.dumps(flagged, indent=2))

print(f"\nFinal clean count: {len(clean)} sections written to degree_requirements.json")
print(f"Flagged sections saved separately to degree_requirements_flagged.json for review")
