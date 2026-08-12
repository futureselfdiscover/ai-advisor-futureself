import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

# Sanity check: print a snippet from page 500 (0-indexed = 499) to confirm it's really course descriptions
print("=== Page 500 sample ===")
print(pages[499][:400])
