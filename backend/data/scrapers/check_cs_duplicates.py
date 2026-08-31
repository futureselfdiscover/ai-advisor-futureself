"""
Checks whether the 3 'CS' sections in degree_requirements.json actually
contain duplicate/overlapping text, to confirm the root cause before
fixing it.
"""

import json
from pathlib import Path

sections = json.loads(Path("degree_requirements.json").read_text())
cs_sections = [s for s in sections if s["department_codes"] == "CS"]

print(f"Found {len(cs_sections)} sections with department_codes == 'CS'\n")

for i, s in enumerate(cs_sections):
    print(f"--- CS section {i+1} (first 150 chars) ---")
    print(s["requirement_text"][:150])
    print()
