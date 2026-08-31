"""
Separates real department-level entries from their sub-sections
(Program of Concentration, Honors Program, Minor in X, etc.), then uses
each department's page number, bounded by the next department's page
number, to define exactly which pages hold that major's full section.
"""

import json
from pathlib import Path

entries = json.loads(Path("toc_entries_filtered.json").read_text())

SUBSECTION_KEYWORDS = [
    "program of concentration", "honors program", "minor in", "minor ",
    "licensure", "required ", "related course", "comprehensive exam",
    "departmental minor", " courses", "second major", "double major",
    "teaching licensure", "elective", "core ", "capstone",
]


def is_subsection(name: str) -> bool:
    lower = name.lower()
    return any(kw in lower for kw in SUBSECTION_KEYWORDS)


departments = [e for e in entries if not is_subsection(e["name"])]

# Dedupe by name, keeping the first occurrence (earliest page)
seen = set()
unique_departments = []
for d in departments:
    if d["name"] not in seen:
        seen.add(d["name"])
        unique_departments.append(d)

# Sort by page number, then set each department's end page as the next
# department's start page (so we know exactly which pages to pull)
unique_departments.sort(key=lambda d: d["page"])
for i, d in enumerate(unique_departments):
    if i + 1 < len(unique_departments):
        d["end_page"] = unique_departments[i + 1]["page"] - 1
    else:
        d["end_page"] = d["page"] + 10  # last one, just grab a reasonable chunk

print(f"Found {len(unique_departments)} likely departments\n")
Path("departments.json").write_text(json.dumps(unique_departments, indent=2))

for d in unique_departments[:30]:
    print(f"  {d['name']}: pages {d['page']}-{d['end_page']}")
