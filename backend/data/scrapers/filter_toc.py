"""
Filters the raw TOC entries down to real department/major sections,
based on the observation that front-matter content (calendar, policies,
ROTC info) all points to low page numbers, while actual departments
point to pages in the 400s-1000s range.
"""

import json
from pathlib import Path

entries = json.loads(Path("toc_entries.json").read_text())

# Keep only entries pointing deep into the document - that's where real
# department/major content lives, not administrative front matter
filtered = [e for e in entries if e["page"] >= 400]

print(f"Filtered from {len(entries)} down to {len(filtered)} likely department entries")

Path("toc_entries_filtered.json").write_text(json.dumps(filtered, indent=2))

print("\nSample entries:")
for e in filtered[:20]:
    print(f"  {e['name']}: page {e['page']}")
