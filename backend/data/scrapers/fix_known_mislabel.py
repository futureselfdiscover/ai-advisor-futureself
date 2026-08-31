"""
Directly removes the specific mislabeled entry we found (Digital
Fabrication content incorrectly tagged as CS), rather than relying on
an unreliable substring-matching heuristic.
"""

import json
from pathlib import Path

sections = json.loads(Path("degree_requirements.json").read_text())
print(f"Starting with {len(sections)} sections")

fixed = []
removed = []

for s in sections:
    if s["department_codes"] == "CS" and s["requirement_text"].startswith("Digital Fabrication"):
        removed.append(s)
        continue
    fixed.append(s)

print(f"Removed {len(removed)} confirmed mislabeled section(s)")
for r in removed:
    print(f"  '{r['department_codes']}': {r['requirement_text'][:100]}")

Path("degree_requirements.json").write_text(json.dumps(fixed, indent=2))
print(f"\nFinal count: {len(fixed)} sections written to degree_requirements.json")
