"""
Checks if Blair School of Music uses a different structural marker than
"COURSES OFFERED: CODE", searching the entire document, not just the
first 456 pages, in case its section is positioned differently.
"""

import json
import re
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())
full_text = "\n".join(pages)

# Check for any music-related course code prefixes near "COURSES OFFERED"
music_related = re.findall(r"COURSES OFFERED:\s*([A-Z\-,\s]{2,30})\n", full_text)
print("All COURSES OFFERED markers in the ENTIRE document:")
for m in music_related:
    print(f"  {m.strip()}")

print(f"\n\nSearching for 'Blair School of Music' section boundaries...")
idx = full_text.find("Blair School of Music")
if idx != -1:
    print(full_text[idx:idx+800])
