"""
Regenerates Peabody's 7 majors using the "Major in X" pattern, since
degree_requirements.py was overwritten with the new marker-based approach
for Arts & Science / Engineering.
"""

import json
import re
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())
full_text = "\n".join(pages)

HEADER_PATTERN = re.compile(r"Major in (?P<dept>[A-Z][A-Za-z,&\s]{2,80}?)\n")
JUNK_WORDS = {"and are", "and is", "typically", "usually", "which"}


def is_valid_department(name):
    lower = name.lower()
    return not any(junk in lower for junk in JUNK_WORDS)


matches = list(HEADER_PATTERN.finditer(full_text))
raw_sections = []
current_dept = None
current_start = None

for match in matches:
    dept = re.sub(r"\s+", " ", match.group("dept")).strip()
    if not is_valid_department(dept):
        continue
    if dept != current_dept:
        if current_dept is not None:
            raw_sections.append({
                "department_codes": current_dept,
                "degree_type": "major",
                "requirement_text": full_text[current_start:match.start()][:5000].strip(),
            })
        current_dept = dept
        current_start = match.start()

if current_dept is not None:
    raw_sections.append({
        "department_codes": current_dept,
        "degree_type": "major",
        "requirement_text": full_text[current_start:current_start + 5000].strip(),
    })

best_by_dept = {}
for section in raw_sections:
    dept = section["department_codes"]
    if dept not in best_by_dept or len(section["requirement_text"]) > len(best_by_dept[dept]["requirement_text"]):
        best_by_dept[dept] = section

peabody_sections = list(best_by_dept.values())

Path("peabody_requirements.json").write_text(json.dumps(peabody_sections, indent=2))
print(f"Regenerated {len(peabody_sections)} Peabody majors")
for s in peabody_sections:
    print(f"  - {s['department_codes']}")
