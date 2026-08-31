"""
Parses the table of contents (pages 1-18) into department name -> page
number pairs, giving us a reliable map to pull real major content from,
instead of guessing at header patterns.
"""

import json
import re
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())
toc_text = "\n".join(pages[:18])

# TOC entries look like "Department Name 605" - name followed by a page
# number, each on effectively its own line (though PDF extraction can
# wrap them awkwardly, so we search loosely across the whole TOC text)
ENTRY_PATTERN = re.compile(r"([A-Z][A-Za-z,&'\-\s]{2,60}?)\s+(\d{1,4})\n")

entries = []
for match in ENTRY_PATTERN.finditer(toc_text):
    name = match.group(1).strip()
    page_num = int(match.group(2))
    entries.append({"name": name, "page": page_num})

print(f"Found {len(entries)} TOC entries\n")
Path("toc_entries.json").write_text(json.dumps(entries, indent=2))

print("Sample entries:")
for e in entries[:20]:
    print(f"  {e['name']}: page {e['page']}")
