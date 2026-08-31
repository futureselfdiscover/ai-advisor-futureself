"""
Pulls actual page content for each department entry, using the page
range from the TOC. Fixes cases where end_page < start_page (happens
when TOC entries are very close together) by defaulting to a
single-page pull in those cases.
"""

import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())
departments = json.loads(Path("departments.json").read_text())

results = []
for d in departments:
    start = d["page"]
    end = max(d["end_page"], start)  # fix negative/backwards ranges

    # Page numbers here are 1-indexed to match the catalog's own numbering
    section_pages = pages[start - 1:end]
    content = "\n".join(section_pages)

    results.append({
        "name": d["name"],
        "start_page": start,
        "end_page": end,
        "content": content[:4000],  # cap length per section
    })

Path("department_content.json").write_text(json.dumps(results, indent=2))
print(f"Extracted content for {len(results)} entries")

# Show real samples for majors we know exist, to judge quality
check_names = ["Computer Science", "Economics", "Biomedical Engineering"]
for name in check_names:
    matches = [r for r in results if r["name"] == name]
    if matches:
        print(f"\n{'=' * 60}")
        print(f"SAMPLE: {name} (pages {matches[0]['start_page']}-{matches[0]['end_page']})")
        print('=' * 60)
        print(matches[0]["content"][:800])
    else:
        print(f"\n'{name}' not found in department list")
