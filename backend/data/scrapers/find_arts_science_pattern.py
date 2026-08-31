import re
from pathlib import Path
import json

pages = json.loads(Path("catalog_pages.json").read_text())
full_text = "\n".join(pages)

# Look at raw context around department names we know are Arts & Science
# majors, to see how their section headers are actually formatted
test_departments = ["Economics", "Computer Science", "Mechanical Engineering", "Composition"]

for dept in test_departments:
    print(f"\n{'=' * 60}")
    print(f"Searching for: {dept}")
    print('=' * 60)

    # Find every mention, then show ones that look like they could be headers
    # (short lines, not buried mid-sentence)
    matches = list(re.finditer(rf"\n[^\n]{{0,10}}{re.escape(dept)}[^\n]{{0,60}}\n", full_text))
    print(f"Found {len(matches)} line-level mentions\n")

    for m in matches[:8]:
        print(repr(m.group().strip()))
