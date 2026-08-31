"""
Searches only pages 1-456 (before the giant Course Description section
starts) for real major requirement language, to find where actual
requirement write-ups for Arts & Science/Engineering/Blair majors live.
"""

import json
import re
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())
early_pages = pages[:456]  # everything before the Course Description section
full_text = "\n".join(early_pages)

# Look for real requirement-describing language near "Economics" and
# "Computer Science" specifically within this earlier range
for dept in ["Economics", "Computer Science"]:
    idx = full_text.find(f"The {dept.lower()} major")
    if idx == -1:
        idx = full_text.find(f"{dept} major")
    if idx == -1:
        print(f"'{dept} major' phrasing not found in pages 1-456\n")
        continue

    print(f"=== Found near '{dept} major' ===")
    print(full_text[max(0, idx-100):idx+600])
    print()
