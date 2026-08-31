"""
"COURSES OFFERED: CODE" appears to be a literal structural marker right
before each department's real major description begins. Let's confirm
this pattern repeats consistently, then use it to extract every major's
actual description section.
"""

import json
import re
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())
early_pages = pages[:456]
full_text = "\n".join(early_pages)

MARKER_PATTERN = re.compile(r"COURSES OFFERED:\s*([A-Z\-,\s]{2,30})\n")

matches = list(MARKER_PATTERN.finditer(full_text))
print(f"Found {len(matches)} 'COURSES OFFERED:' markers\n")

for m in matches[:40]:
    print(f"  {m.group(1).strip()}")
